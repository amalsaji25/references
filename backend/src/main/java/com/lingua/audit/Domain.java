package com.lingua.audit;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

public final class Domain {
  private Domain() {}

  public record CreateRun(
      @NotBlank @Size(max = 120) String name,
      @NotEmpty @Size(max = 10000) List<@NotBlank @Size(max = 2000) String> sentences,
      @NotEmpty @Size(max = 30) List<@NotBlank String> languages,
      @NotNull Mode mode,
      @Min(0) @Max(100) int auditPercent,
      @NotNull @DecimalMin("0.01") @DecimalMax("1000") BigDecimal budgetUsd,
      @NotNull @Size(max = 100) List<@Valid GlossaryEntry> glossary,
      @NotNull @Size(max = 2000) String context) {}

  public enum Mode {
    FULL,
    SELECTIVE
  }

  public record GlossaryEntry(
      @NotBlank @Size(max = 100) String source,
      @NotBlank String language,
      @NotBlank @Size(max = 200) String target) {}

  public record BenchmarkPair(
      @NotBlank @Size(max = 2000) String source,
      @NotBlank String language,
      @NotBlank @Size(max = 4000) String translation,
      @Pattern(regexp = "GOOD|BAD") @NotNull String expected) {}

  public record CreateBenchmark(
      @NotBlank @Size(max = 120) String name,
      @NotEmpty @Size(max = 1000) List<@Valid BenchmarkPair> pairs,
      @NotNull @DecimalMin("0.01") @DecimalMax("1000") BigDecimal budgetUsd) {}

  public record Review(
      @NotBlank @Size(max = 100) String reviewer,
      @NotNull @Pattern(regexp = "CORRECT|INCORRECT|UNCERTAIN") String verdict,
      @NotNull @Size(max = 2000) String note) {}

  public record Finding(
      String category,
      String severity,
      String sourceSpan,
      String targetSpan,
      String explanation,
      String origin) {}

  public record Candidate(
      String id, String language, String text, String decision, List<Finding> findings) {}

  public record Rate(BigDecimal input, BigDecimal cached, BigDecimal output, String version) {}

  public record Usage(long input, long cached, long output, long reasoning) {
    public Usage {
      if (input < 0
          || cached < 0
          || output < 0
          || reasoning < 0
          || cached > input
          || reasoning > output)
        throw new IllegalArgumentException("Invalid provider usage counters");
    }
  }

  public record WorkItem(String id, String source, String language, String translation) {}

  public static final Map<String, String> LANGUAGES =
      Map.ofEntries(
          Map.entry("fr", "French"),
          Map.entry("de", "German"),
          Map.entry("es", "Spanish"),
          Map.entry("it", "Italian"),
          Map.entry("pt", "Portuguese"),
          Map.entry("ja", "Japanese"),
          Map.entry("ar", "Arabic"),
          Map.entry("zh-CN", "Chinese (Simplified)"),
          Map.entry("zh-TW", "Chinese (Traditional)"),
          Map.entry("ko", "Korean"),
          Map.entry("hi", "Hindi"),
          Map.entry("bn", "Bengali"),
          Map.entry("ta", "Tamil"),
          Map.entry("te", "Telugu"),
          Map.entry("mr", "Marathi"),
          Map.entry("ur", "Urdu"),
          Map.entry("ru", "Russian"),
          Map.entry("uk", "Ukrainian"),
          Map.entry("pl", "Polish"),
          Map.entry("nl", "Dutch"),
          Map.entry("sv", "Swedish"),
          Map.entry("da", "Danish"),
          Map.entry("no", "Norwegian"),
          Map.entry("fi", "Finnish"),
          Map.entry("el", "Greek"),
          Map.entry("tr", "Turkish"),
          Map.entry("he", "Hebrew"),
          Map.entry("id", "Indonesian"),
          Map.entry("vi", "Vietnamese"),
          Map.entry("th", "Thai"));
}
