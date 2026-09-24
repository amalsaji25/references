package com.lingua.audit;

import static com.lingua.audit.Domain.*;
import static org.assertj.core.api.Assertions.*;

import java.util.*;
import org.junit.jupiter.api.Test;

class CoreTest {
  @Test
  void cachedAndReasoningTokensAreNotDoubleCounted() {
    var rate = Pricing.rate("gpt-4.1-2025-04-14");
    // 800*2 + 200*.5 + 100*8 = 2500 per million. Reasoning is included in 100 output.
    assertThat(Pricing.cost(new Usage(1000, 200, 100, 40), rate))
        .isEqualByComparingTo("0.0025000000");
    assertThatThrownBy(() -> new Usage(10, 11, 10, 0)).isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> new Usage(10, 0, 10, 11)).isInstanceOf(IllegalArgumentException.class);
  }

  @Test
  void unknownModelsCannotSilentlyUseWrongPrices() {
    assertThatThrownBy(() -> Pricing.rate("unknown")).isInstanceOf(IllegalArgumentException.class);
  }

  @Test
  void placeholdersPreserveMultiplicity() {
    var checks = new Checks();
    var findings =
        checks.inspect("Hello {name}, confirm {name}", "Bonjour {name}", "fr", List.of());
    assertThat(findings).anyMatch(f -> f.category().equals("PLACEHOLDER"));
    assertThat(Checks.decision("ACCEPT", findings)).isEqualTo("REJECT");
  }

  @Test
  void localizedNumbersAndInflectedGlossaryAreReviewSignals() {
    var findings =
        new Checks()
            .inspect(
                "invoice: 1,000.50",
                "factures : 1.000,50",
                "fr",
                List.of(new GlossaryEntry("invoice", "fr", "facture")));
    assertThat(Checks.decision("ACCEPT", findings)).isEqualTo("REVIEW");
  }

  @Test
  void samplingIsStableAndApproximatelyUniform() {
    assertThat(Checks.sample("run", 3, "fr", 0)).isFalse();
    assertThat(Checks.sample("run", 3, "fr", 100)).isTrue();
    long sampled =
        java.util.stream.IntStream.range(0, 10000)
            .filter(i -> Checks.sample("run", i, "fr", 20))
            .count();
    assertThat(sampled).isBetween(1800L, 2200L);
    assertThat(Checks.sample("run", 1, "de", 20)).isEqualTo(Checks.sample("run", 1, "de", 20));
  }

  @Test
  void spreadsheetFormulaInjectionIsEscaped() {
    assertThat(Api.csv("=HYPERLINK(\"bad\")")).startsWith("\"'=");
    assertThat(Api.csv(" +cmd")).startsWith("\"' +");
    assertThat(Api.csv("a,\"b\"")).isEqualTo("\"a,\"\"b\"\"\"");
  }

  @Test
  void selectiveFixtureActuallyContainsAdversarialError() {
    var c = DemoFixtures.generate(new WorkItem("1", DemoFixtures.SOURCES.get(2), "fr", ""));
    assertThat(c.decision()).isEqualTo("ACCEPT");
    assertThat(
            DemoFixtures.validate(new WorkItem("1", DemoFixtures.SOURCES.get(2), "fr", c.text()))
                .decision())
        .isEqualTo("REJECT");
  }
}
