import assert from "node:assert/strict";
import { test } from "node:test";
import { formatCompact, renderCard } from "./card.ts";
import type { ModelShare, UsageSummary } from "./model-share.ts";

const share = (family: ModelShare["family"], label: string, outputTokens: number, fraction: number): ModelShare => ({
  family,
  label,
  outputTokens,
  share: fraction,
});

const summaryOf = (models: ModelShare[], weeks = 4): UsageSummary => ({
  weeks,
  outputTokens: models.reduce((sum, model) => sum + model.outputTokens, 0),
  models,
});

type Segment = { x: number; width: number; fill: string };

const segmentsOf = (svg: string): Segment[] =>
  [...svg.matchAll(/<rect class="segment"[^>]*>/g)].map(([tag]) => ({
    x: Number(/ x="([^"]+)"/.exec(tag)?.[1]),
    width: Number(/ width="([^"]+)"/.exec(tag)?.[1]),
    fill: String(/ fill="([^"]+)"/.exec(tag)?.[1]),
  }));

const textsOf = (svg: string): string[] => [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(([, content]) => content.trim());

const baselinesOf = (svg: string): number[] => [...svg.matchAll(/<text[^>]* y="([^"]+)"/g)].map(([, y]) => Number(y));

// Equivalence Class: below one thousand — written in full
test("writes small counts in full", () => {
  assert.equal(formatCompact(950), "950");
});

// Equivalence Class: thousands — one decimal with K
test("abbreviates thousands", () => {
  assert.equal(formatCompact(12_900), "12.9K");
});

// Equivalence Class: millions — one decimal with M
test("abbreviates millions", () => {
  assert.equal(formatCompact(5_586_718), "5.6M");
});

// Equivalence Class: billions — one decimal with B
test("abbreviates billions", () => {
  assert.equal(formatCompact(2_500_000_000), "2.5B");
});

// Equivalence Class: exact multiple of a unit — no trailing zero decimal
test("drops a zero decimal", () => {
  assert.equal(formatCompact(1_000_000), "1M");
});

// Equivalence Class: value that rounds up to the next unit — written in the next unit
test("moves to the next unit when rounding reaches it", () => {
  assert.equal(formatCompact(999_950), "1M");
});

// Equivalence Class: two models — segment widths proportional to share with a 2 px gap between them
test("sizes two segments by share and separates them by a gap", () => {
  const svg = renderCard(summaryOf([share("opus", "Opus 5.5", 750, 0.75), share("fable", "Fable 5.2", 250, 0.25)]));

  assert.deepEqual(
    segmentsOf(svg).map(({ x, width }) => [x, width]),
    [
      [25, 186],
      [213, 62],
    ],
  );
});

// Equivalence Class: three models — every gap taken out of the bar before it is divided
test("takes every gap out of the bar before dividing it", () => {
  const svg = renderCard(
    summaryOf([share("opus", "Opus 5.5", 600, 0.6), share("fable", "Fable 5.2", 300, 0.3), share("haiku", "Haiku 5.5", 100, 0.1)]),
  );

  assert.deepEqual(
    segmentsOf(svg).map(({ x, width }) => [x, width]),
    [
      [25, 147.6],
      [174.6, 73.8],
      [250.4, 24.6],
    ],
  );
});

// Equivalence Class: one model — a single segment across the whole bar
test("fills the whole bar with a single model", () => {
  const svg = renderCard(summaryOf([share("opus", "Opus 5.5", 600, 1)]));

  assert.deepEqual(
    segmentsOf(svg).map(({ x, width }) => [x, width]),
    [[25, 250]],
  );
});

// Equivalence Class: same family at a different rank — same colour, distinct from the other family
test("colours a family the same wherever it ranks", () => {
  const opusFirst = segmentsOf(renderCard(summaryOf([share("opus", "Opus 5.5", 750, 0.75), share("fable", "Fable 5.2", 250, 0.25)])));
  const opusSecond = segmentsOf(renderCard(summaryOf([share("fable", "Fable 5.2", 750, 0.75), share("opus", "Opus 5.5", 250, 0.25)])));

  assert.equal(opusFirst[0].fill, opusSecond[1].fill);
  assert.notEqual(opusFirst[0].fill, opusFirst[1].fill);
});

// Equivalence Class: every family present — five distinct colours
test("gives each family its own colour", () => {
  const svg = renderCard(
    summaryOf([
      share("opus", "Opus 5.5", 400, 0.4),
      share("fable", "Fable 5.2", 300, 0.3),
      share("sonnet", "Sonnet 5.5", 150, 0.15),
      share("haiku", "Haiku 5.5", 100, 0.1),
      share("other", "Other", 50, 0.05),
    ]),
  );

  assert.equal(new Set(segmentsOf(svg).map(({ fill }) => fill)).size, 5);
});

// Equivalence Class: models with shares that need rounding — legend names each with a two-decimal percentage
test("lists each model with its share to two decimals", () => {
  const texts = textsOf(renderCard(summaryOf([share("opus", "Opus 5.5", 2, 2 / 3), share("fable", "Fable 5.2", 1, 1 / 3)])));

  assert.ok(texts.includes("Opus 5.5 66.67%"));
  assert.ok(texts.includes("Fable 5.2 33.33%"));
});

// Equivalence Class: usage present over several weeks — header states the output total and the window
test("states the output total and the window", () => {
  const texts = textsOf(renderCard(summaryOf([share("opus", "Opus 5.5", 5_586_718, 1)])));

  assert.ok(texts.includes("5.6M output tokens · last 4 weeks"));
});

// Equivalence Class: window of a single week — header says last week
test("names a one-week window without a count", () => {
  const texts = textsOf(renderCard(summaryOf([share("opus", "Opus 5.5", 950, 1)], 1)));

  assert.ok(texts.includes("950 output tokens · last week"));
});

// Equivalence Class: five legend entries — every line of text stays inside the card
test("keeps five legend entries inside the card", () => {
  const svg = renderCard(
    summaryOf([
      share("opus", "Opus 5.5", 400, 0.4),
      share("fable", "Fable 5.2", 300, 0.3),
      share("sonnet", "Sonnet 5.5", 150, 0.15),
      share("haiku", "Haiku 5.5", 100, 0.1),
      share("other", "Other", 50, 0.05),
    ]),
  );
  const cardHeight = Number(/viewBox="0 0 \d+ (\d+)"/.exec(svg)?.[1]);

  assert.equal(textsOf(svg).filter((text) => text.endsWith("%")).length, 5);
  assert.ok(Math.max(...baselinesOf(svg)) <= cardHeight - 12);
});

// Equivalence Class: no usage in the window — no segments and a line saying so
test("says so when there is no usage in the window", () => {
  const svg = renderCard(summaryOf([]));

  assert.deepEqual(segmentsOf(svg), []);
  assert.ok(textsOf(svg).includes("No usage in the last 4 weeks"));
});

// Equivalence Class: card opened on its own — description carries the figures in words
test("describes the figures for readers who cannot see the chart", () => {
  const svg = renderCard(summaryOf([share("opus", "Opus 5.5", 750, 0.75), share("fable", "Fable 5.2", 250, 0.25)]));
  const description = /<desc[^>]*>([^<]*)<\/desc>/.exec(svg)?.[1] ?? "";

  assert.match(description, /Opus 5\.5 75\.00%/);
  assert.match(description, /Fable 5\.2 25\.00%/);
  assert.match(description, /1K output tokens/);
});
