export type UsageRecord = {
  model: string;
  timestamp: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
};

type TranscriptEntry = {
  type?: unknown;
  timestamp?: unknown;
  requestId?: unknown;
  message?: {
    id?: unknown;
    model?: unknown;
    usage?: Record<string, unknown>;
  };
};

const syntheticModel = "<synthetic>";

const parseEntry = (line: string): TranscriptEntry | null => {
  try {
    const parsed: unknown = JSON.parse(line);
    return typeof parsed === "object" && parsed !== null ? (parsed as TranscriptEntry) : null;
  } catch {
    return null;
  }
};

const tokenCount = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);

export const collectUsage = (lines: Iterable<string>): UsageRecord[] => {
  const byResponse = new Map<string, UsageRecord>();

  for (const line of lines) {
    if (!line.includes('"usage"')) continue;

    const entry = parseEntry(line);
    const message = entry?.message;
    const usage = message?.usage;
    if (entry?.type !== "assistant" || !message || !usage) continue;
    if (typeof message.id !== "string" || typeof entry.requestId !== "string") continue;
    if (typeof message.model !== "string" || message.model === syntheticModel) continue;
    if (typeof entry.timestamp !== "string" || Number.isNaN(Date.parse(entry.timestamp))) continue;

    const record: UsageRecord = {
      model: message.model,
      timestamp: entry.timestamp,
      inputTokens: tokenCount(usage.input_tokens),
      outputTokens: tokenCount(usage.output_tokens),
      cacheReadTokens: tokenCount(usage.cache_read_input_tokens),
      cacheCreationTokens: tokenCount(usage.cache_creation_input_tokens),
    };

    const responseKey = `${message.id}:${entry.requestId}`;
    const counted = byResponse.get(responseKey);
    if (!counted || record.outputTokens > counted.outputTokens) byResponse.set(responseKey, record);
  }

  return [...byResponse.values()];
};
