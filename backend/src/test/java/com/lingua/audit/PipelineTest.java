package com.lingua.audit;

import static com.lingua.audit.Domain.*;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.math.BigDecimal;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(
    properties = {
      "spring.datasource.url=jdbc:h2:mem:pipeline;DB_CLOSE_DELAY=-1",
      "app.seed-demo=false",
      "app.worker-initial-delay=3600000",
      "app.provider=demo",
      "app.access-token="
    })
@AutoConfigureMockMvc
class PipelineTest {
  @Autowired Pipeline pipeline;
  @Autowired Store store;
  @Autowired Json json;
  @Autowired MockMvc mvc;

  CreateRun request(String name, Mode mode, int audit, String budget) {
    return new CreateRun(
        name,
        DemoFixtures.SOURCES,
        DemoFixtures.LOCALES,
        mode,
        audit,
        new BigDecimal(budget),
        List.of(),
        "");
  }

  void process(String id) {
    store.state(id, "RUNNING", null);
    pipeline.process(id);
  }

  @Test
  void fullRunDetectsKnownDefectsAndPersistsEveryCall() {
    String id = pipeline.create(request("Full", Mode.FULL, 20, "10"));
    process(id);
    assertThat(store.run(id).get("status")).isEqualTo("COMPLETED");
    assertThat(store.items(id, "REJECT", "", 0, 100)).hasSize(3);
    assertThat(store.items(id, "FLAGGED", "", 0, 100)).hasSize(3);
    assertThat(store.itemCount(id, "FLAGGED", "")).isEqualTo(3);
    assertThat(store.items(id, "ACCEPT", "", 0, 100)).hasSize(15);
    assertThat(store.calls(id, 0, 100))
        .hasSize(12)
        .allMatch(c -> c.get("status").equals("SIMULATED"));
    assertThat(store.committed(id)).isGreaterThan(BigDecimal.ZERO);
  }

  @Test
  void selectiveNeverLabelsAnUncheckedCandidateAccepted() {
    String id = pipeline.create(request("Selective", Mode.SELECTIVE, 1, "10"));
    process(id);
    for (var item : store.items(id, "", "", 0, 100)) {
      if (Boolean.FALSE.equals(item.get("independentCheck")))
        assertThat(item.get("decision")).isEqualTo("SELF_CHECKED");
    }
    assertThatThrownBy(() -> pipeline.create(request("No audit", Mode.SELECTIVE, 0, "10")))
        .hasMessageContaining("nonzero");
  }

  @Test
  void budgetStopsBeforeMakingTheCall() {
    String id = pipeline.create(request("Tiny budget", Mode.FULL, 20, "0.01"));
    process(id);
    assertThat(store.run(id).get("status")).isEqualTo("BUDGET_STOPPED");
    assertThat(store.calls(id, 0, 100)).isEmpty();
  }

  @Test
  void cancelRetainsStateWithoutMakingAnotherCall() {
    String id = pipeline.create(request("Cancel", Mode.FULL, 20, "10"));
    store.cancel(id);
    process(id);
    assertThat(store.run(id).get("status")).isEqualTo("CANCELLED");
    assertThat(store.calls(id, 0, 100)).isEmpty();
  }

  @Test
  void benchmarkAndHumanAssessmentsKeepOriginalDecisions() throws Exception {
    String id =
        pipeline.benchmark(
            new CreateBenchmark("Known labels", DemoFixtures.benchmark(), new BigDecimal("5")));
    process(id);
    assertThat(store.items(id, "REJECT", "", 0, 100)).hasSize(3);
    assertThat(store.items(id, "ACCEPT", "", 0, 100)).hasSize(3);
    var item = store.items(id, "REJECT", "", 0, 100).get(0);
    mvc.perform(
            post("/api/items/" + item.get("id") + "/reviews")
                .contentType("application/json")
                .content(json.write(new Review("Tester", "CORRECT", "Reviewed exception"))))
        .andExpect(status().isOk());
    assertThat(store.items(id, "REJECT", "", 0, 100)).hasSize(3);
    assertThat((List<?>) store.summary(id).get("humanAudit")).hasSize(1);
    mvc.perform(get("/api/runs/" + id + "/export"))
        .andExpect(status().isOk())
        .andExpect(content().string(org.hamcrest.Matchers.containsString("human_verdict")));
  }

  @Test
  void serverRejectsInvalidAndOversizedRequests() throws Exception {
    mvc.perform(post("/api/runs").contentType("application/json").content("{}"))
        .andExpect(status().isBadRequest());
    mvc.perform(get("/api/runs/missing")).andExpect(status().isNotFound());
    String id = pipeline.create(request("Paging", Mode.FULL, 20, "10"));
    process(id);
    mvc.perform(get("/api/runs/" + id + "/items?size=9999")).andExpect(status().isBadRequest());
    assertThatThrownBy(
            () ->
                pipeline.create(
                    new CreateRun(
                        "duplicate",
                        List.of("test"),
                        List.of("fr", "fr"),
                        Mode.FULL,
                        10,
                        BigDecimal.ONE,
                        List.of(),
                        "")))
        .hasMessageContaining("unique");
  }

  @Test
  void recoveryDoesNotReplayAmbiguousPaidCalls() {
    String id = pipeline.create(request("Restart", Mode.FULL, 20, "10"));
    store.state(id, "RUNNING", null);
    store.reserve(
        id,
        "TRANSLATE",
        "gpt-4.1-2025-04-14",
        "openai",
        Pricing.rate("gpt-4.1-2025-04-14"),
        new BigDecimal("0.1"));
    pipeline.recover();
    assertThat(store.run(id).get("status")).isEqualTo("INTERRUPTED");
    assertThat(store.calls(id, 0, 10).get(0).get("status")).isEqualTo("UNKNOWN");
    assertThat(store.committed(id)).isEqualByComparingTo("0.1");
  }
}
