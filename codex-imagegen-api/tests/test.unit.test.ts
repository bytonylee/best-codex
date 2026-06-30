import { test, expect } from 'vitest';
import { resolveAspectRatio, ASPECT_RATIO_TO_SIZE } from '../src/config.js';
import { CodedError } from '../src/errors.js';
import { buildRequest } from '../src/request.js';
import { createSseParser, extractImage } from '../src/sse.js';

test('resolveAspectRatio maps common ratios to sizes', () => {
  expect(resolveAspectRatio('1:1')).toBe('1024x1024');
  expect(resolveAspectRatio('16:9')).toBe('2048x1152');
  expect(resolveAspectRatio('9:16')).toBe('1152x2048');
  expect(resolveAspectRatio('auto')).toBe('auto');
  expect(resolveAspectRatio(undefined)).toBe('auto');
});

test('resolveAspectRatio passes through raw sizes', () => {
  expect(resolveAspectRatio('1536x1024')).toBe('1536x1024');
});

test('resolveAspectRatio rejects unsupported ratios', () => {
  expect(() => resolveAspectRatio('5:4')).toThrow(/Unsupported aspect_ratio/);
});

test('buildRequest creates correct request shape', () => {
  const req = buildRequest({
    baseUrl: 'https://chatgpt.com/backend-api/codex',
    session: { authMode: 'chatgpt', accessToken: 'tok', accountId: 'acc', installationId: 'inst' },
    prompt: 'a blue square',
    model: 'gpt-5.4',
    originator: 'codex_cli_rs',
    size: '1024x1024'
  });
  expect(req.headers.Authorization).toBe('Bearer tok');
  expect(req.headers['ChatGPT-Account-ID']).toBe('acc');
  expect(req.body.tools[0]?.type).toBe('image_generation');
  expect(req.body.tools[0]?.size).toBe('1024x1024');
  expect(req.body.stream).toBe(true);
});

test('buildRequest omits size when auto', () => {
  const req = buildRequest({
    baseUrl: 'https://chatgpt.com/backend-api/codex',
    session: { authMode: 'chatgpt', accessToken: 'tok', accountId: 'acc', installationId: null },
    prompt: 'test',
    model: 'gpt-5.4',
    originator: 'codex_cli_rs',
    size: 'auto'
  });
  expect(req.body.tools[0]?.size).toBeUndefined();
});

test('buildRequest includes reference images as input_image', () => {
  const req = buildRequest({
    baseUrl: 'https://chatgpt.com/backend-api/codex',
    session: { authMode: 'chatgpt', accessToken: 'tok', accountId: 'acc', installationId: null },
    prompt: 'edit this',
    model: 'gpt-5.4',
    originator: 'codex_cli_rs',
    images: ['data:image/png;base64,abc']
  });
  expect(req.body.input[0]?.content[1]?.type).toBe('input_image');
  expect(req.body.input[0]?.content[1]?.image_url).toBe('data:image/png;base64,abc');
});

test('SSE parser processes streamed chunks incrementally', () => {
  const parser = createSseParser();
  const chunk1 = 'event: response.created\ndata: {"type":"response.created","response":{"id":"resp_123"}}\n\n';
  const chunk2 = 'event: response.output_item.done\ndata: {"type":"response.output_item.done","item":{"type":"image_generation_call","id":"call_1","result":"iVBORw0KG"}}\n\n';
  parser.processChunk(chunk1);
  parser.processChunk(chunk2);
  expect(parser.responseId).toBe('resp_123');
  expect(parser.items.length).toBe(1);
  expect(parser.items[0]?.type).toBe('image_generation_call');
});

test('extractImage finds image_generation_call result', () => {
  const result = extractImage({
    items: [{ type: 'image_generation_call', id: 'c1', result: 'abc', revised_prompt: 'rp' }],
    events: []
  });
  expect(result.resultBase64).toBe('abc');
  expect(result.revisedPrompt).toBe('rp');
});

test('extractImage falls back to partial_image event', () => {
  const result = extractImage({
    items: [],
    events: [{ event: 'message', data: { type: 'response.image_generation_call.partial_image', item_id: 'c1', partial_image_b64: 'def' } }]
  });
  expect(result.resultBase64).toBe('def');
});

test('extractImage throws when no image found', () => {
  try {
    extractImage({ items: [], events: [] });
    expect.unreachable('should have thrown');
  } catch (e) {
    expect(e).toBeInstanceOf(CodedError);
    expect((e as CodedError).code).toBe('NO_IMAGE_OUTPUT');
  }
});
