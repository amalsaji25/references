package com.lingua.audit;

import static com.lingua.audit.Domain.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
public class Store {
  private final JdbcTemplate db;
  final Json json;

  public Store(JdbcTemplate db, Json json) {
    this.db = db;
    this.json = json;
  }

  public JdbcTemplate jdbc() {
    return db;
  }

  static String now() {
    return Instant.now().toString();
  }

  static String id() {
    return UUID.randomUUID().toString();
  }

  public List<Map<String, Object>> query(String sql, Object... args) {
    return db.query(
        sql,
        (rs, n) -> {
          Map<String, Object> m = new LinkedHashMap<>();
          for (int i = 1; i <= rs.getMetaData().getColumnCount(); i++) {
            String key = rs.getMetaData().getColumnLabel(i).toLowerCase(Locale.ROOT);
            StringBuilder out = new StringBuilder();
            boolean upper = false;
            for (char c : key.toCharArray()) {
              if (c == '_') upper = true;
              else {
                out.append(upper ? Character.toUpperCase(c) : c);
                upper = false;
              }
            }
            m.put(out.toString(), rs.getObject(i));
          }
          return m;
        },
        args);
  }

  public Map<String, Object> run(String id) {
    return query("SELECT * FROM runs WHERE id=?", id).stream()
        .findFirst()
        .orElseThrow(() -> new NoSuchElementException("Run not found"));
  }

  public List<Map<String, Object>> runs() {
    return query(
        "SELECT id,name,kind,mode,provider,status,created_at,total_items,processed,message FROM"
            + " runs ORDER BY created_at DESC LIMIT 100");
  }

  public String create(
      String name, String kind, String mode, String provider, Object config, int total) {
    String id = id();
    db.update(
        "INSERT INTO runs(id,name,kind,mode,provider,status,created_at,config_json,total_items)"
            + " VALUES(?,?,?,?,?,'QUEUED',?,?,?)",
        id,
        name,
        kind,
        mode,
        provider,
        now(),
        json.write(config),
        total);
    return id;
  }

  public void state(String id, String state, String message) {
    db.update(
        "UPDATE runs SET status=?,message=?,finished_at=? WHERE id=?",
        state,
        message,
        Set.of("RUNNING", "QUEUED").contains(state) ? null : now(),
        id);
  }

  public boolean cancelled(String id) {
    return Boolean.TRUE.equals(run(id).get("cancelRequested"));
  }

  public void cancel(String id) {
    run(id);
    db.update(
        "UPDATE runs SET cancel_requested=TRUE WHERE id=? AND status IN ('QUEUED','RUNNING')", id);
  }

  public String insertItem(
      String run,
      int index,
      String source,
      String language,
      String translation,
      String self,
      String expected) {
    String id = id();
    db.update(
        "INSERT INTO"
            + " items(id,run_id,source_index,source_text,language,translation,decision,self_decision,findings_json,expected_label)"
            + " VALUES(?,?,?,?,?,?,'PENDING',?,'[]',?)",
        id,
        run,
        index,
        source,
        language,
        translation,
        self,
        expected);
    return id;
  }

  public void finishItem(
      String id, String decision, List<Finding> findings, boolean audit, boolean independent) {
    db.update(
        "UPDATE items SET decision=?,findings_json=?,audit_sample=?,independent_check=? WHERE id=?",
        decision,
        json.write(findings),
        audit,
        independent,
        id);
  }

  public void progress(String run) {
    db.update(
        "UPDATE runs SET processed=(SELECT COUNT(*) FROM items WHERE run_id=? AND"
            + " decision<>'PENDING') WHERE id=?",
        run,
        run);
  }

  public List<Map<String, Object>> items(
      String run, String decision, String search, int page, int size) {
    String d = decision == null ? "" : decision,
        q = search == null ? "" : search.toLowerCase(Locale.ROOT);
    var rows =
        query(
            "SELECT i.* FROM items i WHERE run_id=? AND (?='' OR decision=? OR (?='FLAGGED' AND"
                + " decision IN ('REVIEW','REJECT'))) AND (?='' OR LOWER(source_text) LIKE ? ESCAPE"
                + " '!' OR LOWER(translation) LIKE ? ESCAPE '!') ORDER BY source_index,language"
                + " LIMIT ? OFFSET ?",
            run,
            d,
            d,
            d,
            q,
            "%" + escapeLike(q) + "%",
            "%" + escapeLike(q) + "%",
            size,
            page * size);
    for (var row : rows) {
      row.put("findings", json.read((String) row.remove("findingsJson")));
      row.put(
          "reviews",
          query(
              "SELECT reviewer,verdict,note,created_at FROM reviews WHERE item_id=? ORDER BY"
                  + " created_at DESC",
              row.get("id")));
    }
    return rows;
  }

  private static String escapeLike(String q) {
    return q.replace("!", "!!").replace("%", "!%").replace("_", "!_");
  }

  public long itemCount(String run, String decision, String search) {
    String d = decision == null ? "" : decision,
        q = search == null ? "" : search.toLowerCase(Locale.ROOT);
    return db.queryForObject(
        "SELECT COUNT(*) FROM items WHERE run_id=? AND (?='' OR decision=? OR (?='FLAGGED' AND"
            + " decision IN ('REVIEW','REJECT'))) AND (?='' OR LOWER(source_text) LIKE ? ESCAPE '!'"
            + " OR LOWER(translation) LIKE ? ESCAPE '!')",
        Long.class,
        run,
        d,
        d,
        d,
        q,
        "%" + escapeLike(q) + "%",
        "%" + escapeLike(q) + "%");
  }

  @Transactional
  public void review(String item, Review review) {
    if (db.queryForObject(
            "SELECT COUNT(*) FROM items WHERE id=? AND decision<>'PENDING'", Integer.class, item)
        == 0) throw new IllegalArgumentException("Completed item not found");
    db.update(
        "INSERT INTO reviews(id,item_id,reviewer,verdict,note,created_at) VALUES(?,?,?,?,?,?)",
        id(),
        item,
        review.reviewer(),
        review.verdict(),
        review.note(),
        now());
  }

  public BigDecimal committed(String run) {
    return db.queryForObject(
        "SELECT COALESCE(SUM(COALESCE(cost_usd,reserved_usd)),0) FROM calls WHERE run_id=?",
        BigDecimal.class,
        run);
  }

  public String reserve(
      String run, String stage, String model, String provider, Rate rate, BigDecimal reserve) {
    String id = id();
    db.update(
        "INSERT INTO"
            + " calls(id,run_id,stage,model,provider,status,created_at,reserved_usd,input_rate,cached_rate,output_rate,price_version)"
            + " VALUES(?,?,?,?,?,'PENDING',?,?,?,?,?,?)",
        id,
        run,
        stage,
        model,
        provider,
        now(),
        reserve,
        rate.input(),
        rate.cached(),
        rate.output(),
        rate.version());
    return id;
  }

  public void usage(
      String id, Usage u, Rate r, String status, long ms, String response, String request) {
    db.update(
        "UPDATE calls SET"
            + " input_tokens=?,cached_tokens=?,output_tokens=?,reasoning_tokens=?,cost_usd=?,status=?,duration_ms=?,response_id=?,request_id=?"
            + " WHERE id=?",
        u.input(),
        u.cached(),
        u.output(),
        u.reasoning(),
        Pricing.cost(u, r),
        status,
        ms,
        response,
        request,
        id);
  }

  public void callError(String id, String error, long ms) {
    db.update(
        "UPDATE calls SET status=CASE WHEN input_tokens IS NULL THEN 'UNKNOWN' ELSE 'INVALID'"
            + " END,error=?,duration_ms=? WHERE id=?",
        error,
        ms,
        id);
  }

  public Map<String, Object> summary(String run) {
    Map<String, Object> m =
        new LinkedHashMap<>(
            query(
                    "SELECT COALESCE(SUM(input_tokens),0)"
                        + " input_tokens,COALESCE(SUM(cached_tokens),0)"
                        + " cached_tokens,COALESCE(SUM(output_tokens),0)"
                        + " output_tokens,COALESCE(SUM(reasoning_tokens),0)"
                        + " reasoning_tokens,COALESCE(SUM(cost_usd),0) cost_usd,COALESCE(SUM(CASE"
                        + " WHEN cost_usd IS NULL THEN reserved_usd ELSE 0 END),0)"
                        + " unresolved_reserve_usd,COUNT(*) call_count,COALESCE(SUM(CASE WHEN"
                        + " status='UNKNOWN' THEN 1 ELSE 0 END),0)"
                        + " unknown_calls,COALESCE(SUM(duration_ms),0) duration_ms FROM calls WHERE"
                        + " run_id=?",
                    run)
                .get(0));
    m.put(
        "decisions",
        query("SELECT decision,COUNT(*) count FROM items WHERE run_id=? GROUP BY decision", run));
    m.put(
        "stages",
        query(
            "SELECT stage,COALESCE(SUM(input_tokens),0) input_tokens,COALESCE(SUM(output_tokens),0)"
                + " output_tokens,COALESCE(SUM(cost_usd),0) cost_usd,COUNT(*) call_count FROM calls"
                + " WHERE run_id=? GROUP BY stage",
            run));
    m.put(
        "languages",
        query(
            "SELECT language,COUNT(*) count,SUM(CASE WHEN decision='ACCEPT' THEN 1 ELSE 0 END)"
                + " accepted,SUM(CASE WHEN decision IN ('REVIEW','REJECT') THEN 1 ELSE 0 END)"
                + " flagged FROM items WHERE run_id=? GROUP BY language ORDER BY language",
            run));
    m.put(
        "benchmark",
        query(
            "SELECT language,expected_label,decision,COUNT(*) count FROM items WHERE run_id=? AND"
                + " expected_label IS NOT NULL GROUP BY language,expected_label,decision",
            run));
    m.put(
        "humanAudit",
        query(
            "SELECT i.language,i.decision,r.verdict,COUNT(*) count FROM items i JOIN reviews r ON"
                + " r.item_id=i.id WHERE i.run_id=? AND NOT EXISTS(SELECT 1 FROM reviews newer"
                + " WHERE newer.item_id=r.item_id AND (newer.created_at>r.created_at OR"
                + " (newer.created_at=r.created_at AND newer.id>r.id))) GROUP BY"
                + " i.language,i.decision,r.verdict",
            run));
    return m;
  }

  public List<Map<String, Object>> calls(String run, int page, int size) {
    return query(
        "SELECT * FROM calls WHERE run_id=? ORDER BY created_at DESC,id LIMIT ? OFFSET ?",
        run,
        size,
        page * size);
  }
}
