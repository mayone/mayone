import type { UsageRecord } from "./transcripts.ts";

export type TokenTotals = {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
};

export type WeeklyUsage = Record<string, Record<string, TokenTotals>>;

export type Ledger = { version: 1; sources: Record<string, WeeklyUsage> };

export const weekStart = (timestamp: string): string => {
  const instant = new Date(timestamp);
  const daysSinceMonday = (instant.getUTCDay() + 6) % 7;
  const monday = new Date(Date.UTC(instant.getUTCFullYear(), instant.getUTCMonth(), instant.getUTCDate() - daysSinceMonday));
  return monday.toISOString().slice(0, 10);
};

const noUsage = (): TokenTotals => ({ requests: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 });

export const summarizeByWeek = (records: readonly UsageRecord[]): WeeklyUsage => {
  const usage: WeeklyUsage = {};

  for (const record of records) {
    const week = (usage[weekStart(record.timestamp)] ??= {});
    const totals = (week[record.model] ??= noUsage());
    totals.requests += 1;
    totals.inputTokens += record.inputTokens;
    totals.outputTokens += record.outputTokens;
    totals.cacheReadTokens += record.cacheReadTokens;
    totals.cacheCreationTokens += record.cacheCreationTokens;
  }

  return usage;
};

const higherOfEach = (stored: TokenTotals | undefined, recomputed: TokenTotals): TokenTotals => {
  if (!stored) return { ...recomputed };

  return {
    requests: Math.max(stored.requests, recomputed.requests),
    inputTokens: Math.max(stored.inputTokens, recomputed.inputTokens),
    outputTokens: Math.max(stored.outputTokens, recomputed.outputTokens),
    cacheReadTokens: Math.max(stored.cacheReadTokens, recomputed.cacheReadTokens),
    cacheCreationTokens: Math.max(stored.cacheCreationTokens, recomputed.cacheCreationTokens),
  };
};

export const mergeUsage = (ledger: Ledger, source: string, usage: WeeklyUsage): Ledger => {
  const weeks: WeeklyUsage = structuredClone(ledger.sources[source] ?? {});

  for (const [week, models] of Object.entries(usage)) {
    const storedModels = (weeks[week] ??= {});
    for (const [model, recomputed] of Object.entries(models)) {
      storedModels[model] = higherOfEach(storedModels[model], recomputed);
    }
  }

  return { version: 1, sources: { ...ledger.sources, [source]: weeks } };
};

const withSortedKeys = <Value, Result>(record: Record<string, Value>, mapValue: (value: Value) => Result): Record<string, Result> =>
  Object.fromEntries(
    Object.keys(record)
      .sort()
      .map((key) => [key, mapValue(record[key])]),
  );

export const serializeLedger = (ledger: Ledger): string => {
  const sources = withSortedKeys(ledger.sources, (weeks) => withSortedKeys(weeks, (models) => withSortedKeys(models, (totals) => totals)));
  return `${JSON.stringify({ version: ledger.version, sources }, null, 2)}\n`;
};

export const parseLedger = (text: string): Ledger => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("The usage ledger is not valid JSON.");
  }

  const candidate = (typeof parsed === "object" && parsed !== null ? parsed : {}) as { version?: unknown; sources?: unknown };
  if (candidate.version !== 1) {
    throw new Error(`The usage ledger has version ${String(candidate.version)}, and this script reads version 1.`);
  }
  if (typeof candidate.sources !== "object" || candidate.sources === null) {
    throw new Error("The usage ledger has no sources.");
  }

  return { version: 1, sources: candidate.sources as Record<string, WeeklyUsage> };
};
