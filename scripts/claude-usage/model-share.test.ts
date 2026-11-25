import assert from "node:assert/strict";
import { test } from "node:test";
import type { Ledger, TokenTotals, WeeklyUsage } from "./ledger.ts";
import { summarizeModels } from "./model-share.ts";

const tuesday = new Date("2026-11-24T12:00:00.000Z");

const output = (outputTokens: number): TokenTotals => ({
  requests: 1,
  inputTokens: 0,
  outputTokens,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
});

const ledgerOf = (sources: Record<string, WeeklyUsage>): Ledger => ({ version: 1, sources });

// Equivalence Class: ledger without any usage — no models and zero output
test("reports nothing for an empty ledger", () => {
  assert.deepEqual(summarizeModels(ledgerOf({}), { now: tuesday, weeks: 4 }), { weeks: 4, outputTokens: 0, models: [] });
});

// Equivalence Class: one model in the current week — the whole share
test("gives a single model the whole share", () => {
  const ledger = ledgerOf({ laptop: { "2026-11-23": { "claude-opus-5-5": output(600) } } });

  assert.deepEqual(summarizeModels(ledger, { now: tuesday, weeks: 4 }), {
    weeks: 4,
    outputTokens: 600,
    models: [{ family: "opus", label: "Opus 5.5", outputTokens: 600, share: 1 }],
  });
});

// Equivalence Class: same model across the weeks of the window and across sources — output added up
test("adds up a model across weeks and sources", () => {
  const ledger = ledgerOf({
    laptop: { "2026-11-23": { "claude-opus-5-5": output(100) }, "2026-11-02": { "claude-opus-5-5": output(50) } },
    desktop: { "2026-11-16": { "claude-opus-5-5": output(25) } },
  });

  assert.equal(summarizeModels(ledger, { now: tuesday, weeks: 4 }).outputTokens, 175);
});

// Equivalence Class: week that began just before the window — left out
test("leaves out the week before the window", () => {
  const ledger = ledgerOf({
    laptop: { "2026-11-02": { "claude-opus-5-5": output(50) }, "2026-10-26": { "claude-opus-5-5": output(999) } },
  });

  assert.equal(summarizeModels(ledger, { now: tuesday, weeks: 4 }).outputTokens, 50);
});

// Equivalence Class: week that begins after the current one — left out
test("leaves out weeks that have not started", () => {
  const ledger = ledgerOf({
    laptop: { "2026-11-23": { "claude-opus-5-5": output(10) }, "2026-11-30": { "claude-opus-5-5": output(999) } },
  });

  assert.equal(summarizeModels(ledger, { now: tuesday, weeks: 4 }).outputTokens, 10);
});

// Equivalence Class: window of one week — only the current week counted
test("narrows the window to the requested number of weeks", () => {
  const ledger = ledgerOf({
    laptop: { "2026-11-23": { "claude-opus-5-5": output(10) }, "2026-11-16": { "claude-opus-5-5": output(999) } },
  });

  assert.equal(summarizeModels(ledger, { now: tuesday, weeks: 1 }).outputTokens, 10);
});

// Equivalence Class: several families — each share is its part of the total output
test("splits the share by output tokens", () => {
  const ledger = ledgerOf({
    laptop: {
      "2026-11-23": { "claude-opus-5-5": output(600), "claude-fable-5-2": output(300), "claude-haiku-5-5": output(100) },
    },
  });

  const { models } = summarizeModels(ledger, { now: tuesday, weeks: 4 });

  assert.deepEqual(
    models.map(({ label, share }) => [label, share]),
    [
      ["Opus 5.5", 0.6],
      ["Fable 5.2", 0.3],
      ["Haiku 5.5", 0.1],
    ],
  );
});

// Equivalence Class: families stored in ascending order of output — listed largest first
test("lists the most used family first", () => {
  const ledger = ledgerOf({
    laptop: {
      "2026-11-23": { "claude-haiku-5-5": output(1), "claude-sonnet-5-5": output(20), "claude-opus-5-5": output(300) },
    },
  });

  const { models } = summarizeModels(ledger, { now: tuesday, weeks: 4 });

  assert.deepEqual(models.map(({ family }) => family), ["opus", "sonnet", "haiku"]);
});

// Equivalence Class: two versions of one family in the window — merged under the family name alone
test("merges versions of a family and drops the version from the label", () => {
  const ledger = ledgerOf({
    laptop: { "2026-11-23": { "claude-opus-5-5": output(70) }, "2026-11-09": { "claude-opus-5": output(30) } },
  });

  assert.deepEqual(summarizeModels(ledger, { now: tuesday, weeks: 4 }).models, [
    { family: "opus", label: "Opus", outputTokens: 100, share: 1 },
  ]);
});

// Equivalence Class: model id without a version — labelled with the family name alone
test("labels a model without a version by its family", () => {
  const ledger = ledgerOf({ laptop: { "2026-11-23": { "claude-fable": output(5) } } });

  assert.equal(summarizeModels(ledger, { now: tuesday, weeks: 4 }).models[0].label, "Fable");
});

// Equivalence Class: models outside the known families, larger than a known one — merged as Other and listed last
test("merges unknown models into Other and lists it last", () => {
  const ledger = ledgerOf({
    laptop: {
      "2026-11-23": { "claude-mythos-5-2": output(500), "gpt-4o": output(400), "claude-opus-5-5": output(100) },
    },
  });

  assert.deepEqual(summarizeModels(ledger, { now: tuesday, weeks: 4 }).models, [
    { family: "opus", label: "Opus 5.5", outputTokens: 100, share: 0.1 },
    { family: "other", label: "Other", outputTokens: 900, share: 0.9 },
  ]);
});

// Equivalence Class: model with requests but no output tokens — left out
test("leaves out a model that produced no output", () => {
  const ledger = ledgerOf({
    laptop: { "2026-11-23": { "claude-opus-5-5": output(40), "claude-haiku-5-5": output(0) } },
  });

  assert.deepEqual(
    summarizeModels(ledger, { now: tuesday, weeks: 4 }).models.map(({ family }) => family),
    ["opus"],
  );
});
