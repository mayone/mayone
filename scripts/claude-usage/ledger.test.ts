import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeUsage, parseLedger, serializeLedger, summarizeByWeek, weekStart } from "./ledger.ts";
import type { Ledger, TokenTotals } from "./ledger.ts";
import type { UsageRecord } from "./transcripts.ts";

const record = (overrides: Partial<UsageRecord> = {}): UsageRecord => ({
  model: "claude-opus-5-5",
  timestamp: "2026-11-24T09:00:00.000Z",
  inputTokens: 1,
  outputTokens: 100,
  cacheReadTokens: 1000,
  cacheCreationTokens: 10,
  ...overrides,
});

const totals = (overrides: Partial<TokenTotals> = {}): TokenTotals => ({
  requests: 1,
  inputTokens: 1,
  outputTokens: 100,
  cacheReadTokens: 1000,
  cacheCreationTokens: 10,
  ...overrides,
});

// Equivalence Class: first instant of a Monday in UTC — that Monday
test("starts a week at Monday midnight UTC", () => {
  assert.equal(weekStart("2026-11-23T00:00:00.000Z"), "2026-11-23");
});

// Equivalence Class: last instant of a Sunday in UTC — the Monday six days earlier
test("keeps Sunday in the week that began the Monday before", () => {
  assert.equal(weekStart("2026-11-22T23:59:59.999Z"), "2026-11-16");
});

// Equivalence Class: mid-week instant — the Monday of that week
test("maps a mid-week instant to its Monday", () => {
  assert.equal(weekStart("2026-11-26T12:00:00.000Z"), "2026-11-23");
});

// Equivalence Class: week spanning a year boundary — the Monday in the earlier year
test("maps New Year's Day to the Monday of the previous year", () => {
  assert.equal(weekStart("2027-01-01T08:00:00.000Z"), "2026-12-28");
});

// Equivalence Class: timestamp with a UTC offset that crosses midnight — bucketed by its UTC day
test("buckets by UTC rather than by the offset in the timestamp", () => {
  assert.equal(weekStart("2026-11-23T03:00:00.000+08:00"), "2026-11-16");
});

// Equivalence Class: no records — empty summary
test("summarizes no records as no weeks", () => {
  assert.deepEqual(summarizeByWeek([]), {});
});

// Equivalence Class: several records of one model in one week — token counts and requests added up
test("adds up the records of one model within a week", () => {
  const usage = summarizeByWeek([
    record({ timestamp: "2026-11-23T01:00:00.000Z", inputTokens: 1, outputTokens: 100, cacheReadTokens: 1000, cacheCreationTokens: 10 }),
    record({ timestamp: "2026-11-27T22:00:00.000Z", inputTokens: 2, outputTokens: 250, cacheReadTokens: 3000, cacheCreationTokens: 40 }),
  ]);

  assert.deepEqual(usage, {
    "2026-11-23": {
      "claude-opus-5-5": { requests: 2, inputTokens: 3, outputTokens: 350, cacheReadTokens: 4000, cacheCreationTokens: 50 },
    },
  });
});

// Equivalence Class: two models in one week — one entry per model
test("keeps models apart within a week", () => {
  const usage = summarizeByWeek([record({ model: "claude-opus-5-5" }), record({ model: "claude-fable-5-2", outputTokens: 7 })]);

  assert.equal(usage["2026-11-23"]["claude-opus-5-5"].outputTokens, 100);
  assert.equal(usage["2026-11-23"]["claude-fable-5-2"].outputTokens, 7);
});

// Equivalence Class: one model in two weeks — one entry per week
test("keeps weeks apart", () => {
  const usage = summarizeByWeek([
    record({ timestamp: "2026-11-22T23:00:00.000Z", outputTokens: 5 }),
    record({ timestamp: "2026-11-23T01:00:00.000Z", outputTokens: 9 }),
  ]);

  assert.equal(usage["2026-11-16"]["claude-opus-5-5"].outputTokens, 5);
  assert.equal(usage["2026-11-23"]["claude-opus-5-5"].outputTokens, 9);
});

const ledgerWith = (source: string, week: string, model: string, stored: TokenTotals): Ledger => ({
  version: 1,
  sources: { [source]: { [week]: { [model]: stored } } },
});

// Equivalence Class: source not yet in the ledger — usage stored as is
test("stores the usage of a new source", () => {
  const merged = mergeUsage({ version: 1, sources: {} }, "laptop", { "2026-11-23": { "claude-opus-5-5": totals() } });

  assert.deepEqual(merged, ledgerWith("laptop", "2026-11-23", "claude-opus-5-5", totals()));
});

// Equivalence Class: recomputed totals above the stored ones — stored totals raised
test("raises stored totals when the transcripts now show more", () => {
  const stored = ledgerWith("laptop", "2026-11-23", "claude-opus-5-5", totals({ requests: 4, outputTokens: 400 }));

  const merged = mergeUsage(stored, "laptop", { "2026-11-23": { "claude-opus-5-5": totals({ requests: 9, outputTokens: 900 }) } });

  assert.equal(merged.sources.laptop["2026-11-23"]["claude-opus-5-5"].requests, 9);
  assert.equal(merged.sources.laptop["2026-11-23"]["claude-opus-5-5"].outputTokens, 900);
});

// Equivalence Class: recomputed totals below the stored ones — stored totals kept
test("keeps stored totals when cleaned-up transcripts now show less", () => {
  const stored = ledgerWith("laptop", "2026-11-23", "claude-opus-5-5", totals({ requests: 9, outputTokens: 900 }));

  const merged = mergeUsage(stored, "laptop", { "2026-11-23": { "claude-opus-5-5": totals({ requests: 4, outputTokens: 400 }) } });

  assert.equal(merged.sources.laptop["2026-11-23"]["claude-opus-5-5"].requests, 9);
  assert.equal(merged.sources.laptop["2026-11-23"]["claude-opus-5-5"].outputTokens, 900);
});

// Equivalence Class: recomputed totals higher in one field and lower in another — each field keeps its own maximum
test("takes the maximum of each field on its own", () => {
  const stored = ledgerWith("laptop", "2026-11-23", "claude-opus-5-5", totals({ inputTokens: 50, cacheReadTokens: 10 }));

  const merged = mergeUsage(stored, "laptop", { "2026-11-23": { "claude-opus-5-5": totals({ inputTokens: 20, cacheReadTokens: 70 }) } });

  assert.equal(merged.sources.laptop["2026-11-23"]["claude-opus-5-5"].inputTokens, 50);
  assert.equal(merged.sources.laptop["2026-11-23"]["claude-opus-5-5"].cacheReadTokens, 70);
});

// Equivalence Class: stored week that the transcripts no longer cover — week kept
test("keeps a stored week that the new usage does not mention", () => {
  const stored = ledgerWith("laptop", "2026-10-05", "claude-opus-5-5", totals({ outputTokens: 321 }));

  const merged = mergeUsage(stored, "laptop", { "2026-11-23": { "claude-opus-5-5": totals() } });

  assert.equal(merged.sources.laptop["2026-10-05"]["claude-opus-5-5"].outputTokens, 321);
  assert.equal(merged.sources.laptop["2026-11-23"]["claude-opus-5-5"].outputTokens, 100);
});

// Equivalence Class: stored model that the new usage of the same week does not mention — model kept
test("keeps a stored model that the new usage of that week does not mention", () => {
  const stored = ledgerWith("laptop", "2026-11-23", "claude-haiku-5-5", totals({ outputTokens: 12 }));

  const merged = mergeUsage(stored, "laptop", { "2026-11-23": { "claude-opus-5-5": totals() } });

  assert.equal(merged.sources.laptop["2026-11-23"]["claude-haiku-5-5"].outputTokens, 12);
  assert.equal(merged.sources.laptop["2026-11-23"]["claude-opus-5-5"].outputTokens, 100);
});

// Equivalence Class: usage merged for one source while another source exists — the other source is untouched
test("leaves other sources untouched", () => {
  const stored = ledgerWith("desktop", "2026-11-23", "claude-opus-5-5", totals({ outputTokens: 5000 }));

  const merged = mergeUsage(stored, "laptop", { "2026-11-23": { "claude-opus-5-5": totals({ outputTokens: 1 }) } });

  assert.equal(merged.sources.desktop["2026-11-23"]["claude-opus-5-5"].outputTokens, 5000);
  assert.equal(merged.sources.laptop["2026-11-23"]["claude-opus-5-5"].outputTokens, 1);
});

// Equivalence Class: merge into an existing ledger object — the object passed in is not modified
test("returns a new ledger instead of modifying the one passed in", () => {
  const stored = ledgerWith("laptop", "2026-11-23", "claude-opus-5-5", totals({ outputTokens: 400 }));

  mergeUsage(stored, "laptop", { "2026-11-23": { "claude-opus-5-5": totals({ outputTokens: 900 }) } });

  assert.equal(stored.sources.laptop["2026-11-23"]["claude-opus-5-5"].outputTokens, 400);
});

// Equivalence Class: ledger built in arbitrary insertion order — sources, weeks and models written in sorted order
test("writes sources, weeks and models in a stable order", () => {
  const ledger: Ledger = {
    version: 1,
    sources: {
      laptop: {
        "2026-11-23": { "claude-opus-5-5": totals(), "claude-fable-5-2": totals() },
        "2026-11-16": { "claude-opus-5-5": totals() },
      },
      desktop: { "2026-11-23": { "claude-opus-5-5": totals() } },
    },
  };

  const text = serializeLedger(ledger);

  assert.ok(text.indexOf('"desktop"') < text.indexOf('"laptop"'));
  assert.ok(text.indexOf('"2026-11-16"') < text.lastIndexOf('"2026-11-23"'));
  assert.ok(text.indexOf('"claude-fable-5-2"') < text.lastIndexOf('"claude-opus-5-5"'));
});

// Equivalence Class: any ledger — text ends with a single newline
test("ends the ledger text with a newline", () => {
  const text = serializeLedger({ version: 1, sources: {} });

  assert.ok(text.endsWith("}\n"));
});

// Equivalence Class: text produced by the serializer — parsed back to an equal ledger
test("reads back what it wrote", () => {
  const ledger = ledgerWith("laptop", "2026-11-23", "claude-opus-5-5", totals({ outputTokens: 4583189 }));

  assert.deepEqual(parseLedger(serializeLedger(ledger)), ledger);
});

// Equivalence Class: text that is not JSON — rejected
test("rejects ledger text that is not JSON", () => {
  assert.throws(() => parseLedger("{ not json"), /ledger/i);
});

// Equivalence Class: JSON of a version this code does not know — rejected
test("rejects a ledger of an unknown version", () => {
  assert.throws(() => parseLedger(JSON.stringify({ version: 2, sources: {} })), /version/i);
});

// Equivalence Class: JSON of the right version without sources — rejected
test("rejects a ledger without sources", () => {
  assert.throws(() => parseLedger(JSON.stringify({ version: 1 })), /sources/i);
});
