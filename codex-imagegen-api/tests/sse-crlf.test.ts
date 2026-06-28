import { test, expect } from 'vitest';
import { createSseParser } from '../src/sse.js';

test('SSE parser handles CRLF line endings', () => {
  const parser = createSseParser();
  // CRLF between events and within event blocks.
  const chunk = 'event: response.created\r\ndata: {"type":"response.created","response":{"id":"r1"}}\r\n\r\n';
  parser.processChunk(chunk);
  expect(parser.responseId).toBe('r1');
  expect(parser.events.length).toBe(1);
});

test('SSE parser handles mixed CRLF and LF across chunks', () => {
  const parser = createSseParser();
  parser.processChunk('event: response.created\r\n');
  parser.processChunk('data: {"type":"response.created","response":{"id":"r2"}}\r\n\r\n');
  expect(parser.responseId).toBe('r2');
});

test('SSE parser handles lone CR line endings', () => {
  const parser = createSseParser();
  const chunk = 'event: response.created\rdata: {"type":"response.created","response":{"id":"r3"}}\r\r';
  parser.processChunk(chunk);
  expect(parser.responseId).toBe('r3');
});
