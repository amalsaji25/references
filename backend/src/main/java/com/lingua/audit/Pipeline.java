package com.lingua.audit;

import static com.lingua.audit.Domain.*;

import java.math.BigDecimal;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

@Service
public class Pipeline {
  private final Store store;
  private final Json json;
  private final ModelClient model;
  private final Checks checks;
  private final boolean seed;
  private volatile boolean ready;

  public Pipeline(
      Store store,
      Json json,
      ModelClient model,
      Checks checks,
      @Value("${app.seed-demo}") boolean seed) {
    this.store = store;
    this.json = json;
    this.model = model;
    this.checks = checks;
    this.seed = seed;
  }

  @EventListener(ApplicationReadyEvent.class)
  public void recover() {
    // Never replay an ambiguous paid operation automatically after a crash.
    store
        .jdbc()
        .update(
            "UPDATE calls SET status='UNKNOWN',error='Server restarted before usage was committed.'"
                + " WHERE status='PENDING'");
    store
        .jdbc()
        .update(
            "UPDATE runs SET status='INTERRUPTED',message='Server restarted. Completed items and"
                + " call reservations retained; inspect before creating a new run.',finished_at=?"
                + " WHERE status='RUNNING'",
            Store.now());
    ready = true;
    if (seed && model.provider().equals("demo") && store.runs().isEmpty())
      create(
          new CreateRun(
              "Customer experience · release 2.4",
              DemoFixtures.SOURCES,
              DemoFixtures.LOCALES,
              Mode.FULL,
              20,
              new BigDecimal("5"),
              List.of(),
              "Product messages for a customer portal. Professional, friendly register."));
  }

  private void capacity() {
    if (store
            .jdbc()
            .queryForObject(
                "SELECT COUNT(*) FROM runs WHERE status IN ('QUEUED','RUNNING')", Integer.class)
        >= 5)
      throw new IllegalArgumentException(
          "Five runs are already queued or running. Wait or cancel one.");
  }

  private void languages(Collection<String> langs) {
    if (!LANGUAGES.keySet().containsAll(langs))
      throw new IllegalArgumentException("Unsupported target language");
  }

  public synchronized String create(CreateRun request) {
    languages(request.languages());
    capacity();
    if (new HashSet<>(request.languages()).size() != request.languages().size())
      throw new IllegalArgumentException("Target languages must be unique");
    if (request.mode() == Mode.SELECTIVE && request.auditPercent() == 0)
      throw new IllegalArgumentException(
          "Selective validation requires a nonzero random audit percentage");
    for (var g : request.glossary())
      if (!request.languages().contains(g.language()))
        throw new IllegalArgumentException("Glossary language must be one of the targets");
    return store.create(
        request.name(),
        "TRANSLATION",
        request.mode().name(),
        model.provider(),
        request,
        request.sentences().size() * request.languages().size());
  }

  public synchronized String benchmark(CreateBenchmark request) {
    languages(request.pairs().stream().map(BenchmarkPair::language).toList());
    capacity();
    return store.create(
        request.name(), "BENCHMARK", "FULL", model.provider(), request, request.pairs().size());
  }

  @Scheduled(
      fixedDelayString = "${app.worker-delay:500}",
      initialDelayString = "${app.worker-initial-delay:1500}")
  public void tick() {
    if (!ready) return;
    var next = store.query("SELECT id FROM runs WHERE status='QUEUED' ORDER BY created_at LIMIT 1");
    if (next.isEmpty()) return;
    String id = (String) next.get(0).get("id");
    if (store.jdbc().update("UPDATE runs SET status='RUNNING' WHERE id=? AND status='QUEUED'", id)
        == 0) return;
    process(id);
  }

  void process(String id) {
    try {
      var run = store.run(id);
      if (!model.provider().equals(run.get("provider")))
        throw new IllegalStateException(
            "Queued run uses a different provider. Create a new run under the current"
                + " configuration.");
      if (run.get("kind").equals("BENCHMARK"))
        runBenchmark(id, json.read((String) run.get("configJson"), CreateBenchmark.class));
      else translate(id, json.read((String) run.get("configJson"), CreateRun.class));
      checkpoint(id);
      store.state(
          id,
          "COMPLETED",
          "Run completed. ACCEPT means no material error detected; self-checked items are not"
              + " independently validated.");
    } catch (Cancelled e) {
      store.state(
          id,
          "CANCELLED",
          "Cancelled between provider calls. Any in-flight call was accounted for.");
    } catch (ModelClient.BudgetExceeded e) {
      store.state(id, "BUDGET_STOPPED", e.getMessage());
    } catch (Exception e) {
      store.state(
          id,
          "FAILED",
          e instanceof IllegalStateException
              ? e.getMessage()
              : "Processing failed. Inspect the call ledger and retained items.");
    } finally {
      store.progress(id);
    }
  }

  private static final class Cancelled extends RuntimeException {}

  private void checkpoint(String id) {
    if (store.cancelled(id)) throw new Cancelled();
  }

  private void translate(String run, CreateRun config) {
    for (int index = 0; index < config.sentences().size(); index++) {
      String source = config.sentences().get(index);
      // Bounded multilingual batches avoid a single oversized response.
      for (int start = 0; start < config.languages().size(); start += 5) {
        checkpoint(run);
        List<WorkItem> request = new ArrayList<>();
        for (var language :
            config.languages().subList(start, Math.min(start + 5, config.languages().size())))
          request.add(new WorkItem(Store.id(), source, language, ""));
        var generated =
            model.call(
                run, "TRANSLATE", request, config.glossary(), config.context(), config.budgetUsd());
        List<WorkItem> judges = new ArrayList<>();
        Map<String, List<Finding>> findings = new HashMap<>();
        Map<String, Boolean> audits = new HashMap<>();
        for (var c : generated) {
          String item =
              store.insertItem(run, index, source, c.language(), c.text(), c.decision(), null);
          List<Finding> rules = checks.inspect(source, c.text(), c.language(), config.glossary());
          boolean audit = Checks.sample(run, index, c.language(), config.auditPercent());
          boolean needsJudge =
              config.mode() == Mode.FULL
                  || !c.decision().equals("ACCEPT")
                  || !rules.isEmpty()
                  || !c.findings().isEmpty()
                  || audit;
          findings.put(item, rules);
          audits.put(item, audit);
          if (needsJudge) judges.add(new WorkItem(item, source, c.language(), c.text()));
          else store.finishItem(item, "SELF_CHECKED", List.of(), false, false);
        }
        store.progress(run);
        if (!judges.isEmpty()) {
          checkpoint(run);
          // Judge gets source and candidate only: no self-score, findings, or generation history.
          var judged =
              model.call(
                  run, "VALIDATE", judges, config.glossary(), config.context(), config.budgetUsd());
          for (var c : judged) {
            var all = new ArrayList<>(findings.get(c.id()));
            all.addAll(c.findings());
            store.finishItem(
                c.id(), Checks.decision(c.decision(), all), all, audits.get(c.id()), true);
          }
          store.progress(run);
        }
      }
    }
  }

  private void runBenchmark(String run, CreateBenchmark config) {
    for (int start = 0; start < config.pairs().size(); start += 5) {
      checkpoint(run);
      List<WorkItem> work = new ArrayList<>();
      Map<String, List<Finding>> rules = new HashMap<>();
      for (int i = start; i < Math.min(start + 5, config.pairs().size()); i++) {
        var p = config.pairs().get(i);
        String id =
            store.insertItem(run, i, p.source(), p.language(), p.translation(), null, p.expected());
        work.add(new WorkItem(id, p.source(), p.language(), p.translation()));
        rules.put(id, checks.inspect(p.source(), p.translation(), p.language(), List.of()));
      }
      var results = model.call(run, "VALIDATE", work, List.of(), "", config.budgetUsd());
      for (var c : results) {
        var all = new ArrayList<>(rules.get(c.id()));
        all.addAll(c.findings());
        store.finishItem(c.id(), Checks.decision(c.decision(), all), all, false, true);
      }
      store.progress(run);
    }
  }
}
