import type { AccountSyncEvent } from "./plan-account-sync";

/**
 * Reads a streaming sync route's newline-delimited JSON, one event at a time:
 * /api/account-sync by default, or /api/library-refresh with its own type.
 *
 * Lines can arrive split across chunks, so text is buffered up to each
 * newline rather than parsed per chunk.
 */
export async function readSyncEvents<Event = AccountSyncEvent>(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: Event) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });

    let newline: number;
    while ((newline = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) onEvent(JSON.parse(line) as Event);
    }

    if (done) break;
  }

  if (buffer.trim()) onEvent(JSON.parse(buffer) as Event);
}
