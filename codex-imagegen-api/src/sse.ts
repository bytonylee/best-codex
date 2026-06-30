// Memory-efficient SSE stream parser.
// Parses events incrementally from a ReadableStream (fetch response body)
// without buffering the entire response into memory.
import { CodedError } from './errors.js';

interface SseDataItem {
  type?: string;
  item?: SseItem;
  response?: { id?: string };
  item_id?: string;
  revised_prompt?: string | null;
  partial_image_b64?: string;
  [k: string]: unknown;
}

export interface SseEvent {
  event: string;
  data: SseDataItem;
}

export interface SseItem {
  type?: string;
  id?: string;
  result?: string;
  revised_prompt?: string | null;
  [k: string]: unknown;
}

export interface ExtractedImage {
  callId: string | undefined;
  revisedPrompt: string | null;
  resultBase64: string;
}

export interface SseParser {
  processChunk(text: string): void;
  readonly events: SseEvent[];
  readonly items: SseItem[];
  readonly responseId: string | null;
  readonly remaining: string;
}

export function createSseParser(): SseParser {
  let buffer = '';
  const events: SseEvent[] = [];
  const items: SseItem[] = [];
  let responseId: string | null = null;

  function processChunk(text: string): void {
    // Normalize CRLF -> LF so event separators work regardless of transport.
    buffer += text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    // SSE events are separated by double newlines.
    let idx: number;
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const parsed = parseEventBlock(block);
      if (parsed) {
        events.push(parsed);
        collectItem(parsed);
      }
    }
  }

  function collectItem(event: SseEvent): void {
    const type = event?.data?.type;
    if (type === 'response.created' || type === 'response.completed') {
      responseId = event.data?.response?.id ?? responseId;
    }
    if (type === 'response.output_item.done' && event.data?.item) {
      items.push(event.data.item);
    }
  }

  return {
    processChunk,
    get events() { return events; },
    get items() { return items; },
    get responseId() { return responseId; },
    get remaining() { return buffer; }
  };
}

function parseEventBlock(block: string): SseEvent | null {
  const lines = block.split(/\r?\n/);
  let event = 'message';
  const dataLines: string[] = [];

  for (const line of lines) {
    if (!line || line.startsWith(':')) continue;
    if (line.startsWith('event:')) {
      event = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  const dataText = dataLines.join('\n');
  if (!dataText) return null;

  try {
    return { event, data: JSON.parse(dataText) as SseDataItem };
  } catch {
    // Non-JSON data line (e.g. "[DONE]") - skip silently.
    return null;
  }
}

export function extractImage({ items, events }: { items: SseItem[]; events: SseEvent[] }): ExtractedImage {
  // Prefer the final image_generation_call result item.
  const imgItem = [...items].reverse().find(
    (i) => i?.type === 'image_generation_call' && i?.result
  );
  if (imgItem) {
    return {
      callId: imgItem.id,
      revisedPrompt: imgItem.revised_prompt ?? null,
      resultBase64: imgItem.result as string
    };
  }

  // Fallback: partial_image event (stream may end before output_item.done).
  const partial = [...events].reverse().find(
    (e) => e?.data?.type === 'response.image_generation_call.partial_image'
      && e?.data?.partial_image_b64
  );
  if (partial && partial.data.partial_image_b64) {
    return {
      callId: partial.data.item_id,
      revisedPrompt: partial.data.revised_prompt ?? null,
      resultBase64: partial.data.partial_image_b64
    };
  }

  throw new CodedError(
    'Stream completed without an image_generation_call result.',
    'NO_IMAGE_OUTPUT'
  );
}
