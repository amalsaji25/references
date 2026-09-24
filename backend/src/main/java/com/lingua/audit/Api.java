package com.lingua.audit;

import static com.lingua.audit.Domain.*;

import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.io.IOException;
import java.util.*;
import org.springframework.http.*;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
@Validated
public class Api {
  private final Store store;
  private final Pipeline pipeline;
  private final ModelClient model;
  private final Json json;

  public Api(Store store, Pipeline pipeline, ModelClient model, Json json) {
    this.store = store;
    this.pipeline = pipeline;
    this.model = model;
    this.json = json;
  }

  @GetMapping("/config")
  public Object config() {
    return Map.of(
        "provider",
        model.provider(),
        "generator",
        model.generator(),
        "validator",
        model.validator(),
        "languages",
        LANGUAGES,
        "sampleSentences",
        DemoFixtures.SOURCES,
        "sampleLanguages",
        DemoFixtures.LOCALES,
        "sampleBenchmark",
        DemoFixtures.benchmark(),
        "prices",
        Map.of(
            model.generator(),
            Pricing.rate(model.generator()),
            model.validator(),
            Pricing.rate(model.validator())),
        "limits",
        Map.of("sentences", 10000, "languages", 30, "batchLanguages", 5));
  }

  @GetMapping("/runs")
  public Object runs() {
    return store.runs();
  }

  @PostMapping("/runs")
  public ResponseEntity<?> create(@RequestBody @Valid CreateRun request) {
    return ResponseEntity.status(202).body(Map.of("id", pipeline.create(request)));
  }

  @PostMapping("/benchmarks")
  public ResponseEntity<?> benchmark(@RequestBody @Valid CreateBenchmark request) {
    return ResponseEntity.status(202).body(Map.of("id", pipeline.benchmark(request)));
  }

  @GetMapping("/runs/{id}")
  public Object run(@PathVariable String id) {
    var r = store.run(id);
    r.put("config", json.read((String) r.remove("configJson")));
    r.put("summary", store.summary(id));
    return r;
  }

  @PostMapping("/runs/{id}/cancel")
  public Object cancel(@PathVariable String id) {
    store.cancel(id);
    return Map.of(
        "message", "Cancellation requested. The current provider call will finish first.");
  }

  @GetMapping("/runs/{id}/items")
  public Object items(
      @PathVariable String id,
      @RequestParam(defaultValue = "") @Size(max = 30) String decision,
      @RequestParam(defaultValue = "") @Size(max = 200) String search,
      @RequestParam(defaultValue = "0") @Min(0) @Max(100000) int page,
      @RequestParam(defaultValue = "20") @Min(1) @Max(200) int size) {
    store.run(id);
    return Map.of(
        "items",
        store.items(id, decision, search, page, size),
        "total",
        store.itemCount(id, decision, search),
        "page",
        page,
        "size",
        size);
  }

  @GetMapping("/runs/{id}/calls")
  public Object calls(
      @PathVariable String id,
      @RequestParam(defaultValue = "0") @Min(0) @Max(100000) int page,
      @RequestParam(defaultValue = "50") @Min(1) @Max(200) int size) {
    store.run(id);
    return Map.of(
        "calls",
        store.calls(id, page, size),
        "total",
        store.jdbc().queryForObject("SELECT COUNT(*) FROM calls WHERE run_id=?", Long.class, id));
  }

  @PostMapping("/items/{id}/reviews")
  public Object review(@PathVariable String id, @RequestBody @Valid Review review) {
    store.review(id, review);
    return Map.of("message", "Human review saved. Automated decision is preserved.");
  }

  @GetMapping("/runs/{id}/export")
  public void export(@PathVariable String id, HttpServletResponse response) throws IOException {
    store.run(id);
    response.setContentType("text/csv; charset=utf-8");
    response.setHeader("Content-Disposition", "attachment; filename=lingua-" + id + ".csv");
    var w = response.getWriter();
    w.println(
        "source_index,language,source,translation,decision,independent_check,audit_sample,findings,human_verdict,human_reviewer,human_note");
    store
        .jdbc()
        .query(
            "SELECT i.*, (SELECT r.verdict FROM reviews r WHERE r.item_id=i.id ORDER BY created_at"
                + " DESC,id DESC LIMIT 1) human_verdict,(SELECT r.reviewer FROM reviews r WHERE"
                + " r.item_id=i.id ORDER BY created_at DESC,id DESC LIMIT 1) human_reviewer,(SELECT"
                + " r.note FROM reviews r WHERE r.item_id=i.id ORDER BY created_at DESC,id DESC"
                + " LIMIT 1) human_note FROM items i WHERE run_id=? ORDER BY source_index,language",
            rs -> {
              w.println(
                  String.join(
                      ",",
                      csv(rs.getString("source_index")),
                      csv(rs.getString("language")),
                      csv(rs.getString("source_text")),
                      csv(rs.getString("translation")),
                      csv(rs.getString("decision")),
                      csv(rs.getString("independent_check")),
                      csv(rs.getString("audit_sample")),
                      csv(rs.getString("findings_json")),
                      csv(rs.getString("human_verdict")),
                      csv(rs.getString("human_reviewer")),
                      csv(rs.getString("human_note"))));
            },
            id);
  }

  static String csv(String value) {
    if (value == null) value = "";
    if (value.stripLeading().matches("(?s)^[=+@\\-].*")
        || value.startsWith("\t")
        || value.startsWith("\r")) value = "'" + value;
    return "\"" + value.replace("\"", "\"\"") + "\"";
  }
}

@RestControllerAdvice
class ApiErrors {
  @ExceptionHandler(NoSuchElementException.class)
  ResponseEntity<?> missing(NoSuchElementException e) {
    return ResponseEntity.status(404).body(Map.of("message", e.getMessage()));
  }

  @ExceptionHandler({
    IllegalArgumentException.class,
    jakarta.validation.ConstraintViolationException.class
  })
  ResponseEntity<?> invalid(Exception e) {
    return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
  }

  @ExceptionHandler(MethodArgumentNotValidException.class)
  ResponseEntity<?> invalidBody(MethodArgumentNotValidException e) {
    return ResponseEntity.badRequest()
        .body(
            Map.of(
                "message",
                e.getBindingResult().getFieldErrors().stream()
                    .map(f -> f.getField() + ": " + f.getDefaultMessage())
                    .findFirst()
                    .orElse("Invalid request")));
  }
}
