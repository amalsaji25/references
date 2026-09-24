package com.lingua.audit;

import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class AccessFilter extends OncePerRequestFilter {
  private final String token;

  public AccessFilter(
      @Value("${app.access-token}") String token, @Value("${app.provider}") String provider) {
    this.token = token;
    if (provider.equals("openai") && token.length() < 24)
      throw new IllegalArgumentException(
          "Live mode requires APP_ACCESS_TOKEN of at least 24 characters");
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest req, HttpServletResponse res, FilterChain chain)
      throws ServletException, IOException {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "same-origin");
    if (req.getRequestURI().startsWith("/api/")) {
      res.setHeader("Cache-Control", "no-store");
      if (req.getContentLengthLong() > 20_000_000) {
        res.sendError(413, "Request is too large");
        return;
      }
      if (!token.isBlank()) {
        String supplied = req.getHeader("Authorization");
        if (supplied == null
            || !MessageDigest.isEqual(
                ("Bearer " + token).getBytes(StandardCharsets.UTF_8),
                supplied.getBytes(StandardCharsets.UTF_8))) {
          res.setStatus(401);
          res.setContentType("application/json");
          res.getWriter().write("{\"message\":\"Enter the application access token to connect.\"}");
          return;
        }
      }
    }
    chain.doFilter(req, res);
  }
}
