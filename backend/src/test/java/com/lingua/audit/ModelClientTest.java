package com.lingua.audit;

import static com.lingua.audit.Domain.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import java.math.BigDecimal;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.mock.web.*;

class ModelClientTest {
  Store store;
  Json json = new Json(new ObjectMapper());
  HttpServer server;
  ModelClient client;
  List<WorkItem> items = List.of(new WorkItem("item-1", "Hello", "fr", "Bonjour"));
  String payload;
  int httpStatus = 200;
  String capturedRequest;

  @BeforeEach
  void setup() throws Exception {
    store = mock(Store.class);
    when(store.committed("run")).thenReturn(BigDecimal.ZERO);
    when(store.reserve(anyString(), anyString(), anyString(), anyString(), any(), any()))
        .thenReturn("call-1");
    server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    server.createContext(
        "/responses",
        e -> {
          capturedRequest = new String(e.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
          byte[] data = payload.getBytes(StandardCharsets.UTF_8);
          e.getResponseHeaders().add("x-request-id", "req-1");
          e.sendResponseHeaders(httpStatus, data.length);
          e.getResponseBody().write(data);
          e.close();
        });
    server.start();
    client =
        new ModelClient(
            store,
            json,
            "openai",
            "test-key",
            "gpt-4.1-2025-04-14",
            "gpt-4.1-mini-2025-04-14",
            8192,
            "http://127.0.0.1:" + server.getAddress().getPort() + "/responses");
  }

  @AfterEach
  void stop() {
    server.stop(0);
  }

  String result(String id, String text, List<?> findings) {
    return json.write(
        Map.of(
            "results",
            List.of(
                Map.of(
                    "id",
                    id,
                    "language",
                    "fr",
                    "text",
                    text,
                    "decision",
                    "ACCEPT",
                    "findings",
                    findings))));
  }

  String response(String text, String status, boolean usage) {
    var root = new HashMap<String, Object>();
    root.put("id", "resp-1");
    root.put("status", status);
    root.put(
        "output",
        List.of(
            Map.of(
                "type",
                "message",
                "content",
                List.of(Map.of("type", "output_text", "text", text)))));
    if (usage)
      root.put(
          "usage",
          Map.of(
              "input_tokens",
              1000,
              "input_tokens_details",
              Map.of("cached_tokens", 200),
              "output_tokens",
              100,
              "output_tokens_details",
              Map.of("reasoning_tokens", 20)));
    return json.write(root);
  }

  List<Candidate> call() {
    return client.call("run", "VALIDATE", items, List.of(), "", BigDecimal.TEN);
  }

  @Test
  void validResponseUsesFreshContextAndStoresReportedUsage() {
    payload = response(result("item-1", "Bonjour", List.of()), "completed", true);
    assertThat(call()).singleElement().satisfies(c -> assertThat(c.decision()).isEqualTo("ACCEPT"));
    verify(store)
        .usage(
            eq("call-1"),
            eq(new Usage(1000, 200, 100, 20)),
            any(),
            eq("REPORTED"),
            anyLong(),
            eq("resp-1"),
            eq("req-1"));
    var body = json.read(capturedRequest);
    assertThat(body.path("store").asBoolean()).isFalse();
    assertThat(body.has("previous_response_id")).isFalse();
    assertThat(body.path("text").path("format").path("strict").asBoolean()).isTrue();
  }

  @Test
  void malformedOutputStillStoresUsageBeforeError() {
    payload = response("not json", "completed", true);
    assertThatThrownBy(this::call).isInstanceOf(IllegalStateException.class);
    var order = inOrder(store);
    order
        .verify(store)
        .usage(eq("call-1"), any(), any(), eq("REPORTED"), anyLong(), anyString(), anyString());
    order.verify(store).callError(eq("call-1"), anyString(), anyLong());
  }

  @Test
  void missingUsageIsUnknownNotZero() {
    payload = response(result("item-1", "Bonjour", List.of()), "completed", false);
    assertThatThrownBy(this::call).hasMessageContaining("usage missing");
    verify(store, never()).usage(anyString(), any(), any(), anyString(), anyLong(), any(), any());
    verify(store).callError(eq("call-1"), contains("unknown"), anyLong());
  }

  @Test
  void incompleteResponseIsNotAcceptedButTokensAreRecorded() {
    payload = response("{}", "incomplete", true);
    assertThatThrownBy(this::call).hasMessageContaining("incomplete");
    verify(store).usage(anyString(), any(), any(), anyString(), anyLong(), any(), any());
  }

  @Test
  void provider429IsNotAutomaticallyReplayed() {
    httpStatus = 429;
    payload = "{}";
    assertThatThrownBy(this::call).hasMessageContaining("429");
    verify(store, times(1))
        .reserve(anyString(), anyString(), anyString(), anyString(), any(), any());
    verify(store).callError(anyString(), contains("429"), anyLong());
  }

  @Test
  void duplicateOrUnknownIdentifiersFailClosed() {
    payload = response(result("wrong-id", "Bonjour", List.of()), "completed", true);
    assertThatThrownBy(this::call).hasMessageContaining("identifiers");
  }

  @Test
  void judgeCannotRewriteCandidate() {
    payload = response(result("item-1", "Salut", List.of()), "completed", true);
    assertThatThrownBy(this::call).hasMessageContaining("rewrote");
  }

  @Test
  void fabricatedEvidenceIsRoutedToReview() {
    payload =
        response(
            result(
                "item-1",
                "Bonjour",
                List.of(
                    Map.of(
                        "category",
                        "ACCURACY",
                        "severity",
                        "MAJOR",
                        "sourceSpan",
                        "not in source",
                        "targetSpan",
                        "Bonjour",
                        "explanation",
                        "Wrong"))),
            "completed",
            true);
    assertThat(call().get(0).decision()).isEqualTo("REVIEW");
  }

  @Test
  void liveApiRequiresAuthentication() throws Exception {
    assertThatThrownBy(() -> new AccessFilter("short", "openai")).hasMessageContaining("24");
    var filter = new AccessFilter("a-very-long-test-access-token", "openai");
    var req = new MockHttpServletRequest("GET", "/api/runs");
    var res = new MockHttpServletResponse();
    filter.doFilter(req, res, new MockFilterChain());
    assertThat(res.getStatus()).isEqualTo(401);
    req = new MockHttpServletRequest("GET", "/api/runs");
    req.addHeader("Authorization", "Bearer a-very-long-test-access-token");
    res = new MockHttpServletResponse();
    filter.doFilter(req, res, new MockFilterChain());
    assertThat(res.getStatus()).isEqualTo(200);
  }
}
