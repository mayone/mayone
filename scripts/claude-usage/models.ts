export type ModelFamily = "fable" | "opus" | "sonnet" | "haiku" | "other";

export type ModelIdentity = { family: ModelFamily; version: string | null };

const knownFamilies: readonly ModelFamily[] = ["fable", "opus", "sonnet", "haiku"];

const isVersionPart = (part: string): boolean => /^\d{1,2}$/.test(part);

export const describeModel = (modelId: string): ModelIdentity => {
  const parts = modelId.toLowerCase().split("-");
  const family = knownFamilies.find((known) => parts.includes(known));
  if (!family) return { family: "other", version: null };

  const versionParts = parts.filter(isVersionPart);
  return { family, version: versionParts.length > 0 ? versionParts.join(".") : null };
};
