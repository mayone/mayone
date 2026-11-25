export type TranscriptLineOptions = {
  messageId?: string | null;
  requestId?: string | null;
  model?: string;
  timestamp?: string | null;
  usage?: Record<string, unknown> | null;
  type?: string;
};

export const transcriptLine = (options: TranscriptLineOptions = {}): string => {
  const messageId = options.messageId === undefined ? "msg_1" : options.messageId;
  const requestId = options.requestId === undefined ? "req_1" : options.requestId;
  const usage =
    options.usage === undefined
      ? { input_tokens: 2, output_tokens: 489, cache_read_input_tokens: 29481, cache_creation_input_tokens: 21147 }
      : options.usage;
  const timestamp = options.timestamp === undefined ? "2026-11-24T09:19:09.255Z" : options.timestamp;
  return JSON.stringify({
    type: options.type ?? "assistant",
    ...(timestamp === null ? {} : { timestamp }),
    ...(requestId === null ? {} : { requestId }),
    message: {
      ...(messageId === null ? {} : { id: messageId }),
      model: options.model ?? "claude-opus-5-5",
      role: "assistant",
      ...(usage === null ? {} : { usage }),
    },
  });
};
