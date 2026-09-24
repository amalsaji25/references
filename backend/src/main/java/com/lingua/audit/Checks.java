package com.lingua.audit;

import static com.lingua.audit.Domain.*;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;

@Component
public class Checks {
  // Exact protected placeholders; visible digits are conservative review signals, not semantic
  // proofs.
  private static final Pattern PLACEHOLDER =
      Pattern.compile(
          "\\{\\{[^{}]+}}|\\$\\{[^{}]+}|\\{[A-Za-z_][A-Za-z0-9_]*}|%(?:\\d+\\$)?[sdif]");
  private static final Pattern NUMBER = Pattern.compile("[0-9]+(?:[.,][0-9]+)*");

  private static Map<String, Integer> tokens(Pattern pattern, String text) {
    Map<String, Integer> out = new TreeMap<>();
    var m = pattern.matcher(text);
    while (m.find()) out.merge(m.group(), 1, Integer::sum);
    return out;
  }

  public List<Finding> inspect(
      String source, String target, String language, List<GlossaryEntry> glossary) {
    List<Finding> out = new ArrayList<>();
    if (target.isBlank())
      out.add(
          new Finding("MISSING_TRANSLATION", "MAJOR", source, "", "Translation is empty.", "RULE"));
    if (!tokens(PLACEHOLDER, source).equals(tokens(PLACEHOLDER, target)))
      out.add(
          new Finding(
              "PLACEHOLDER",
              "MAJOR",
              tokens(PLACEHOLDER, source).toString(),
              tokens(PLACEHOLDER, target).toString(),
              "Protected placeholders must match exactly, including occurrences.",
              "RULE"));
    String s = PLACEHOLDER.matcher(source).replaceAll(""),
        t = PLACEHOLDER.matcher(target).replaceAll("");
    if (!tokens(NUMBER, s).equals(tokens(NUMBER, t)))
      out.add(
          new Finding(
              "NUMBER",
              "MINOR",
              tokens(NUMBER, s).toString(),
              tokens(NUMBER, t).toString(),
              "Numeric forms differ. Check amounts, dates and valid locale formatting.",
              "RULE"));
    for (var g : glossary)
      if (g.language().equals(language)
          && source.toLowerCase(Locale.ROOT).contains(g.source().toLowerCase(Locale.ROOT))
          && !target.toLowerCase(Locale.ROOT).contains(g.target().toLowerCase(Locale.ROOT)))
        out.add(
            new Finding(
                "TERMINOLOGY",
                "MINOR",
                g.source(),
                g.target(),
                "Approved term not found verbatim; inspect morphology and meaning.",
                "RULE"));
    return out;
  }

  public static String decision(String proposed, List<Finding> findings) {
    if (findings.stream().anyMatch(f -> Set.of("MAJOR", "CRITICAL").contains(f.severity())))
      return "REJECT";
    if (!findings.isEmpty()
        || !Set.of("ACCEPT", "REVIEW", "REJECT", "SELF_CHECKED").contains(proposed))
      return "REVIEW";
    return proposed;
  }

  public static boolean sample(String run, int sourceIndex, String language, int percent) {
    if (percent <= 0) return false;
    if (percent >= 100) return true;
    try {
      byte[] bytes =
          MessageDigest.getInstance("SHA-256")
              .digest((run + ":" + sourceIndex + ":" + language).getBytes(StandardCharsets.UTF_8));
      long n =
          ((bytes[0] & 255L) << 24)
              | ((bytes[1] & 255L) << 16)
              | ((bytes[2] & 255L) << 8)
              | (bytes[3] & 255L);
      return n / 4294967296.0 < percent / 100.0;
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
  }
}
