import assert from "node:assert/strict";
import { test } from "node:test";
import { describeModel } from "./models.ts";

// Equivalence Class: family followed by a two-part version — family and dotted version
test("reads the family and version from a current model id", () => {
  assert.deepEqual(describeModel("claude-opus-5-5"), { family: "opus", version: "5.5" });
});

// Equivalence Class: one-part version followed by a release date — date is not part of the version
test("ignores the release date after a one-part version", () => {
  assert.deepEqual(describeModel("claude-sonnet-4-20250514"), { family: "sonnet", version: "4" });
});

// Equivalence Class: two-part version followed by a release date — date is not part of the version
test("ignores the release date after a two-part version", () => {
  assert.deepEqual(describeModel("claude-haiku-4-5-20251001"), { family: "haiku", version: "4.5" });
});

// Equivalence Class: version placed before the family — same family and version
test("reads a version that comes before the family name", () => {
  assert.deepEqual(describeModel("claude-3-5-sonnet-20241022"), { family: "sonnet", version: "3.5" });
});

// Equivalence Class: known family without any version — version is null
test("reports no version when the id carries none", () => {
  assert.deepEqual(describeModel("claude-fable"), { family: "fable", version: null });
});

// Equivalence Class: Claude model outside the four known families — other
test("classifies an unknown Claude family as other", () => {
  assert.deepEqual(describeModel("claude-mythos-5-2"), { family: "other", version: null });
});

// Equivalence Class: id from another vendor — other
test("classifies a non-Claude model as other", () => {
  assert.deepEqual(describeModel("gpt-4o"), { family: "other", version: null });
});
