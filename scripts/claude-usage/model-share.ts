import { weekStart } from "./ledger.ts";
import type { Ledger } from "./ledger.ts";
import { describeModel } from "./models.ts";
import type { ModelFamily } from "./models.ts";

export type ModelShare = { family: ModelFamily; label: string; outputTokens: number; share: number };

export type UsageSummary = { weeks: number; outputTokens: number; models: ModelShare[] };

type FamilyUsage = { outputTokens: number; versions: Set<string | null> };

const weekMilliseconds = 7 * 24 * 60 * 60 * 1000;

const familyNames: Record<ModelFamily, string> = {
  fable: "Fable",
  opus: "Opus",
  sonnet: "Sonnet",
  haiku: "Haiku",
  other: "Other",
};

const weeksBefore = (week: string, count: number): string =>
  new Date(Date.parse(`${week}T00:00:00.000Z`) - count * weekMilliseconds).toISOString().slice(0, 10);

const labelOf = (family: ModelFamily, versions: Set<string | null>): string => {
  const [onlyVersion] = versions;
  return versions.size === 1 && onlyVersion !== null ? `${familyNames[family]} ${onlyVersion}` : familyNames[family];
};

const otherLast = (left: ModelShare, right: ModelShare): number =>
  Number(left.family === "other") - Number(right.family === "other") || right.outputTokens - left.outputTokens;

export const summarizeModels = (ledger: Ledger, window: { now: Date; weeks: number }): UsageSummary => {
  const currentWeek = weekStart(window.now.toISOString());
  const firstWeek = weeksBefore(currentWeek, window.weeks - 1);
  const families = new Map<ModelFamily, FamilyUsage>();

  for (const weeklyUsage of Object.values(ledger.sources)) {
    for (const [week, models] of Object.entries(weeklyUsage)) {
      if (week < firstWeek || week > currentWeek) continue;

      for (const [modelId, totals] of Object.entries(models)) {
        if (totals.outputTokens <= 0) continue;

        const { family, version } = describeModel(modelId);
        const usage = families.get(family) ?? { outputTokens: 0, versions: new Set() };
        usage.outputTokens += totals.outputTokens;
        usage.versions.add(version);
        families.set(family, usage);
      }
    }
  }

  const outputTokens = [...families.values()].reduce((sum, usage) => sum + usage.outputTokens, 0);
  const models = [...families]
    .map(([family, usage]) => ({
      family,
      label: labelOf(family, usage.versions),
      outputTokens: usage.outputTokens,
      share: usage.outputTokens / outputTokens,
    }))
    .sort(otherLast);

  return { weeks: window.weeks, outputTokens, models };
};
