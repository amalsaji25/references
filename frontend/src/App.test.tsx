import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { benchmarkMetrics, money, number } from "./api";
import NewRun from "./NewRun";
import ReviewItem from "./ReviewItem";
import type { Config, Item } from "./types";
const config: Config = {
  provider: "demo",
  generator: "test-generator",
  validator: "test-validator",
  languages: { fr: "French", de: "German" },
  sampleSentences: ["Hello."],
  sampleLanguages: ["fr"],
  sampleBenchmark: [],
  prices: {},
  limits: { sentences: 10000, languages: 30, batchLanguages: 5 },
};
describe("accounting presentation", () => {
  it("distinguishes unknown usage from zero", () => {
    expect(number(null)).toBe("Unknown");
    expect(money(null)).toBe("Unknown");
    expect(number(0)).toBe("0");
    expect(money(0.0004)).toContain("0.0004");
  });
  it("does not count pending benchmark rows or use the wrong denominator", () => {
    const m = benchmarkMetrics([
      { expectedLabel: "BAD", decision: "ACCEPT", count: 2 },
      { expectedLabel: "BAD", decision: "REJECT", count: 8 },
      { expectedLabel: "GOOD", decision: "ACCEPT", count: 90 },
      { expectedLabel: "BAD", decision: "PENDING", count: 100 },
    ]);
    expect(m.falseAcceptRate).toBe(0.2);
    expect(m.bad).toBe(10);
    expect(benchmarkMetrics([]).falseAcceptRate).toBeNull();
  });
});
describe("run creation", () => {
  it("submits actual source text and selected policy to the backend", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ id: "new-id" }), { status: 202 }),
      );
    vi.stubGlobal("fetch", fetch);
    const created = vi.fn();
    const user = userEvent.setup();
    render(<NewRun config={config} onClose={() => {}} onCreated={created} />);
    await user.click(screen.getByText("Selective validation"));
    await user.click(screen.getByRole("button", { name: "Start translation" }));
    await waitFor(() => expect(created).toHaveBeenCalledWith("new-id"));
    const payload = JSON.parse(fetch.mock.calls[0][1].body);
    expect(payload.sentences).toEqual(["Hello."]);
    expect(payload.mode).toBe("SELECTIVE");
    expect(payload.auditPercent).toBeGreaterThan(0);
    expect(payload.languages).toEqual(["fr"]);
  });
  it("blocks malformed glossary JSON without sending a request", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const user = userEvent.setup();
    render(<NewRun config={config} onClose={() => {}} onCreated={() => {}} />);
    await user.click(screen.getByText("Context & approved terminology"));
    await user.clear(screen.getByLabelText(/Glossary · JSON array/));
    await user.type(screen.getByLabelText(/Glossary · JSON array/), "not json");
    await user.click(screen.getByRole("button", { name: "Start translation" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "JSON is invalid",
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});
describe("human review", () => {
  it("records a distinct human verdict without rewriting the automatic decision", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetch);
    const user = userEvent.setup();
    const saved = vi.fn();
    const item: Item = {
      id: "item-1",
      sourceIndex: 0,
      sourceText: "Hello",
      language: "fr",
      translation: "Bonjour",
      decision: "REJECT",
      selfDecision: "ACCEPT",
      findings: [],
      auditSample: true,
      independentCheck: true,
      expectedLabel: null,
      reviews: [],
    };
    render(
      <ReviewItem
        item={item}
        config={config}
        onClose={() => {}}
        onSaved={saved}
      />,
    );
    await user.type(screen.getByLabelText("Reviewer name"), "Reviewer A");
    await user.selectOptions(screen.getByLabelText("Assessment"), "CORRECT");
    await user.click(screen.getByRole("button", { name: "Save assessment" }));
    await waitFor(() => expect(saved).toHaveBeenCalled());
    expect(fetch.mock.calls[0][0]).toBe("/api/items/item-1/reviews");
    expect(JSON.parse(fetch.mock.calls[0][1].body).verdict).toBe("CORRECT");
    expect(screen.getByText("Rejected")).toBeInTheDocument();
  });
});
