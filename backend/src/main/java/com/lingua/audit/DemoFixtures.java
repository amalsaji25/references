package com.lingua.audit;

import static com.lingua.audit.Domain.*;

import java.util.*;

public final class DemoFixtures {
  private DemoFixtures() {}

  public static final List<String> SOURCES =
      List.of(
          "Welcome back, {name}.",
          "Your invoice total is 125 USD.",
          "The customer must submit the documents before Friday.");
  public static final List<String> LOCALES = List.of("fr", "de", "es", "it", "pt", "ja");
  private static final String[][] TEXT = {
    {
      "Bon retour, {name}.",
      "Willkommen zurück, {name}.",
      "Bienvenido de nuevo, {name}.",
      "Bentornato, {name}.",
      "Bem-vindo de volta, {name}.",
      "おかえりなさい、{name}。"
    },
    {
      "Le total de votre facture est de 125 USD.",
      "Der Rechnungsbetrag beträgt 125 USD.",
      "El total de su factura es de 125 USD.",
      "Il totale della fattura è di 125 USD.",
      "O total da sua fatura é de 125 USD.",
      "請求書の合計は125 USDです。"
    },
    {
      "Le client doit soumettre les documents avant vendredi.",
      "Der Kunde muss die Dokumente vor Freitag einreichen.",
      "El cliente debe presentar los documentos antes del viernes.",
      "Il cliente deve presentare i documenti prima di venerdì.",
      "O cliente deve enviar os documentos antes de sexta-feira.",
      "顧客は金曜日より前に書類を提出しなければなりません。"
    }
  };

  public static Candidate generate(WorkItem w) {
    int s = SOURCES.indexOf(w.source()), l = LOCALES.indexOf(w.language());
    if (s < 0 || l < 0)
      return new Candidate(
          w.id(),
          w.language(),
          "",
          "REVIEW",
          List.of(
              new Finding(
                  "DEMO_LIMIT",
                  "MINOR",
                  "",
                  "",
                  "Demo fixtures cover only the three sample sentences and six languages. Enable"
                      + " live mode for other content.",
                  "DEMO")));
    String text = TEXT[s][l];
    // Intentional defects exercise independent judging, placeholder and numeric rules.
    if (s == 2 && l == 0) text = text.replace("doit", "peut");
    if (s == 0 && l == 3) text = text.replace("{name}", "nome");
    if (s == 1 && l == 2) text = text.replace("125", "150");
    return new Candidate(w.id(), w.language(), text, "ACCEPT", List.of());
  }

  public static Candidate validate(WorkItem w) {
    List<Finding> f = new ArrayList<>();
    int s = SOURCES.indexOf(w.source()), l = LOCALES.indexOf(w.language());
    if (s < 0 || l < 0)
      f.add(
          new Finding(
              "DEMO_LIMIT",
              "MINOR",
              "",
              "",
              "No validation fixture exists for this input.",
              "DEMO"));
    else if (!TEXT[s][l].equals(w.translation())) {
      if (s == 2 && l == 0 && w.translation().contains("peut"))
        f.add(
            new Finding(
                "MODALITY",
                "MAJOR",
                "must submit",
                "peut soumettre",
                "Obligation changed to permission. Deliberately injected demo error.",
                "DEMO"));
      else
        f.add(
            new Finding(
                "ACCURACY",
                "MAJOR",
                w.source(),
                w.translation(),
                "Candidate differs from this demo's fixed reference; this is not a real linguistic"
                    + " assessment.",
                "DEMO"));
    }
    return new Candidate(w.id(), w.language(), w.translation(), Checks.decision("ACCEPT", f), f);
  }

  public static List<BenchmarkPair> benchmark() {
    return List.of(
        new BenchmarkPair(SOURCES.get(2), "fr", TEXT[2][0], "GOOD"),
        new BenchmarkPair(SOURCES.get(2), "fr", TEXT[2][0].replace("doit", "peut"), "BAD"),
        new BenchmarkPair(SOURCES.get(1), "de", TEXT[1][1], "GOOD"),
        new BenchmarkPair(SOURCES.get(1), "de", TEXT[1][1].replace("125", "150"), "BAD"),
        new BenchmarkPair(SOURCES.get(0), "es", TEXT[0][2], "GOOD"),
        new BenchmarkPair(SOURCES.get(0), "es", TEXT[0][2].replace("{name}", "nombre"), "BAD"));
  }
}
