import assert from "node:assert/strict";
import { test } from "node:test";
import { transcriptLine } from "./transcript-fixture.ts";
import { collectUsage } from "./transcripts.ts";

// Equivalence Class: assistant line with complete usage — one record carrying every token count
test("maps an assistant line to a usage record", () => {
  assert.deepEqual(collectUsage([transcriptLine()]), [
    {
      model: "claude-opus-5-5",
      timestamp: "2026-11-24T09:19:09.255Z",
      inputTokens: 2,
      outputTokens: 489,
      cacheReadTokens: 29481,
      cacheCreationTokens: 21147,
    },
  ]);
});

// Equivalence Class: same message id and request id on several lines — counted once
test("counts a response once when its content blocks repeat the usage", () => {
  const records = collectUsage([transcriptLine(), transcriptLine(), transcriptLine()]);

  assert.equal(records.length, 1);
  assert.equal(records[0].outputTokens, 489);
});

// Equivalence Class: repeated response whose later line reports more output — the larger count wins
test("keeps the larger output count when a repeated line reports more", () => {
  const partial = transcriptLine({ usage: { input_tokens: 2, output_tokens: 40 } });
  const complete = transcriptLine({ usage: { input_tokens: 2, output_tokens: 489 } });

  assert.equal(collectUsage([partial, complete])[0].outputTokens, 489);
});

// Equivalence Class: repeated response whose later line reports less output — the larger count wins
test("keeps the larger output count when a repeated line reports less", () => {
  const complete = transcriptLine({ usage: { input_tokens: 2, output_tokens: 489 } });
  const partial = transcriptLine({ usage: { input_tokens: 2, output_tokens: 40 } });

  assert.equal(collectUsage([complete, partial])[0].outputTokens, 489);
});

// Equivalence Class: same message id under different request ids — separate records
test("treats different requests as different responses", () => {
  const records = collectUsage([transcriptLine({ requestId: "req_1" }), transcriptLine({ requestId: "req_2" })]);

  assert.equal(records.length, 2);
});

// Equivalence Class: usage object without cache fields — cache counts default to zero
test("defaults missing cache counts to zero", () => {
  const [record] = collectUsage([transcriptLine({ usage: { input_tokens: 7, output_tokens: 11 } })]);

  assert.equal(record.cacheReadTokens, 0);
  assert.equal(record.cacheCreationTokens, 0);
});

// Equivalence Class: line of another type that mentions usage — ignored
test("ignores lines that are not assistant responses", () => {
  assert.deepEqual(collectUsage([transcriptLine({ type: "api-request" })]), []);
});

// Equivalence Class: assistant line without a usage object — ignored
test("ignores assistant lines without usage", () => {
  assert.deepEqual(collectUsage([transcriptLine({ usage: null })]), []);
});

// Equivalence Class: synthetic placeholder model — ignored
test("ignores synthetic responses", () => {
  assert.deepEqual(collectUsage([transcriptLine({ model: "<synthetic>" })]), []);
});

// Equivalence Class: assistant line without a message id — ignored
test("ignores usage that cannot be attributed to a message", () => {
  assert.deepEqual(collectUsage([transcriptLine({ messageId: null })]), []);
});

// Equivalence Class: assistant line without a request id — ignored
test("ignores usage that cannot be attributed to a request", () => {
  assert.deepEqual(collectUsage([transcriptLine({ requestId: null })]), []);
});

// Equivalence Class: assistant line without a timestamp — ignored
test("ignores usage that cannot be placed in time", () => {
  assert.deepEqual(collectUsage([transcriptLine({ timestamp: null })]), []);
});

// Equivalence Class: assistant line whose timestamp is not a date — ignored
test("ignores usage whose timestamp cannot be read as a date", () => {
  assert.deepEqual(collectUsage([transcriptLine({ timestamp: "yesterday" })]), []);
});

// Equivalence Class: truncated JSON between valid lines — skipped without losing its neighbours
test("skips a truncated line and keeps the valid ones", () => {
  const truncated = transcriptLine({ messageId: "msg_2" }).slice(0, 60);
  const records = collectUsage([transcriptLine({ messageId: "msg_1" }), truncated, transcriptLine({ messageId: "msg_3" })]);

  assert.equal(records.length, 2);
});

// Equivalence Class: blank line — skipped
test("skips blank lines", () => {
  assert.deepEqual(collectUsage(["", "   "]), []);
});
