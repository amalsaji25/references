export type Decision =
  | "ACCEPT"
  | "SELF_CHECKED"
  | "REVIEW"
  | "REJECT"
  | "PENDING";
export type Finding = {
  category: string;
  severity: string;
  sourceSpan: string;
  targetSpan: string;
  explanation: string;
  origin: string;
};
export type Review = {
  reviewer: string;
  verdict: "CORRECT" | "INCORRECT" | "UNCERTAIN";
  note: string;
  createdAt: string;
};
export type Item = {
  id: string;
  sourceIndex: number;
  sourceText: string;
  language: string;
  translation: string;
  decision: Decision;
  selfDecision: string;
  findings: Finding[];
  auditSample: boolean;
  independentCheck: boolean;
  expectedLabel: string | null;
  reviews: Review[];
};
export type Call = {
  id: string;
  stage: string;
  model: string;
  provider: string;
  status: string;
  createdAt: string;
  durationMs: number;
  inputTokens: number | null;
  cachedTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  costUsd: number | null;
  reservedUsd: number;
  inputRate: number;
  cachedRate: number;
  outputRate: number;
  priceVersion: string;
  responseId: string | null;
  requestId: string | null;
  error: string | null;
};
export type Summary = {
  inputTokens: number;
  cachedTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  costUsd: number;
  unresolvedReserveUsd: number;
  callCount: number;
  unknownCalls: number;
  durationMs: number;
  decisions: { decision: Decision; count: number }[];
  stages: {
    stage: string;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    callCount: number;
  }[];
  languages: {
    language: string;
    count: number;
    accepted: number;
    flagged: number;
  }[];
  benchmark: {
    language: string;
    expectedLabel: "GOOD" | "BAD";
    decision: Decision;
    count: number;
  }[];
  humanAudit: {
    language: string;
    decision: Decision;
    verdict: string;
    count: number;
  }[];
};
export type Run = {
  id: string;
  name: string;
  kind: "TRANSLATION" | "BENCHMARK";
  mode: "FULL" | "SELECTIVE";
  provider: string;
  status: string;
  createdAt: string;
  finishedAt: string | null;
  totalItems: number;
  processed: number;
  message: string | null;
  cancelRequested: boolean;
  config: {
    budgetUsd: number;
    auditPercent?: number;
    sentences?: string[];
    languages?: string[];
  };
  summary: Summary;
};
export type Pair = {
  source: string;
  language: string;
  translation: string;
  expected: "GOOD" | "BAD";
};
export type Config = {
  provider: string;
  generator: string;
  validator: string;
  languages: Record<string, string>;
  sampleSentences: string[];
  sampleLanguages: string[];
  sampleBenchmark: Pair[];
  prices: Record<
    string,
    { input: number; cached: number; output: number; version: string }
  >;
  limits: { sentences: number; languages: number; batchLanguages: number };
};
