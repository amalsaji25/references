package com.lingua.audit;

import static com.lingua.audit.Domain.*;

import java.math.BigDecimal;
import java.math.RoundingMode;

public final class Pricing {
  private Pricing() {}

  public static Rate rate(String model) {
    return switch (model) {
      case "gpt-4.1-2025-04-14" ->
          new Rate(
              new BigDecimal("2.00"),
              new BigDecimal("0.50"),
              new BigDecimal("8.00"),
              "2026-09-23-standard");
      case "gpt-4.1-mini-2025-04-14" ->
          new Rate(
              new BigDecimal("0.40"),
              new BigDecimal("0.10"),
              new BigDecimal("1.60"),
              "2026-09-23-standard");
      default -> throw new IllegalArgumentException("Model has no configured price: " + model);
    };
  }

  public static BigDecimal cost(Usage u, Rate r) {
    return r.input()
        .multiply(BigDecimal.valueOf(u.input() - u.cached()))
        .add(r.cached().multiply(BigDecimal.valueOf(u.cached())))
        .add(r.output().multiply(BigDecimal.valueOf(u.output())))
        .divide(BigDecimal.valueOf(1_000_000), 10, RoundingMode.HALF_UP);
  }
}
