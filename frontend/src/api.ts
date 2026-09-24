let accessToken = "";
export function setToken(token: string) {
  accessToken = token;
}
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...options.headers,
    },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new ApiError(
      response.status,
      data.message || data.detail || `Request failed (${response.status})`,
    );
  }
  return response.json();
}
export async function download(runId: string) {
  const response = await fetch(`/api/runs/${runId}/export`, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  });
  if (!response.ok) throw new Error("Export failed. Reconnect and try again.");
  const url = URL.createObjectURL(await response.blob()),
    a = document.createElement("a");
  a.href = url;
  a.download = `lingua-${runId}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
export const number = (n: number | null | undefined) =>
  n == null ? "Unknown" : new Intl.NumberFormat("en-US").format(n);
export const money = (n: number | null | undefined) =>
  n == null
    ? "Unknown"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 4,
        maximumFractionDigits: 6,
      }).format(n);
export const active = (status: string) =>
  ["QUEUED", "RUNNING"].includes(status);
export function benchmarkMetrics(
  rows: { expectedLabel: string; decision: string; count: number }[],
) {
  const done = rows.filter((r) => r.decision !== "PENDING");
  const bad = done
    .filter((r) => r.expectedLabel === "BAD")
    .reduce((n, r) => n + r.count, 0);
  const good = done
    .filter((r) => r.expectedLabel === "GOOD")
    .reduce((n, r) => n + r.count, 0);
  const falseAccepts = done
    .filter((r) => r.expectedLabel === "BAD" && r.decision === "ACCEPT")
    .reduce((n, r) => n + r.count, 0);
  const falseRejects = done
    .filter((r) => r.expectedLabel === "GOOD" && r.decision === "REJECT")
    .reduce((n, r) => n + r.count, 0);
  const flaggedGood = done
    .filter(
      (r) =>
        r.expectedLabel === "GOOD" && ["REVIEW", "REJECT"].includes(r.decision),
    )
    .reduce((n, r) => n + r.count, 0);
  return {
    bad,
    good,
    falseAccepts,
    falseRejects,
    flaggedGood,
    falseAcceptRate: bad ? falseAccepts / bad : null,
  };
}
