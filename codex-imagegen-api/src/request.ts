// Build the private Codex /responses request for image generation.
import crypto from 'node:crypto';

import type { Session } from './auth.js';

interface InputContentItem {
  type: 'input_text' | 'input_image';
  text?: string;
  image_url?: string;
}

interface RequestBody {
  model: string;
  instructions: string;
  input: Array<{ type: 'message'; role: 'user'; content: InputContentItem[] }>;
  tools: Array<{
    type: 'image_generation';
    output_format: 'png';
    size?: string;
  }>;
  tool_choice: 'auto';
  parallel_tool_calls: boolean;
  reasoning: null;
  store: boolean;
  stream: boolean;
  include: string[];
  client_metadata?: Record<string, string>;
}

export interface BuildRequestArgs {
  baseUrl: string;
  session: Session;
  prompt: string;
  model: string;
  originator: string;
  images?: string[];
  size?: string;
}

export interface BuiltRequest {
  url: string;
  sessionId: string;
  headers: Record<string, string>;
  body: RequestBody;
}

export function buildRequest({
  baseUrl,
  session,
  prompt,
  model,
  originator,
  images,
  size
}: BuildRequestArgs): BuiltRequest {
  if (!prompt?.trim()) throw new Error('prompt is required.');

  const url = new URL('responses', baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`).toString();
  const sessionId = crypto.randomUUID();

  const headers: Record<string, string> = {
    Authorization: `Bearer ${session.accessToken}`,
    'ChatGPT-Account-ID': session.accountId ?? '',
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
    originator,
    session_id: sessionId
  };

  const content: InputContentItem[] = [{ type: 'input_text', text: prompt }];
  if (images?.length && images.length > 0) {
    for (const img of images) {
      content.push({ type: 'input_image', image_url: img });
    }
  }

  const body: RequestBody = {
    model,
    instructions: '',
    input: [{ type: 'message', role: 'user', content }],
    tools: [{
      type: 'image_generation',
      output_format: 'png',
      ...(size && size !== 'auto' ? { size } : {})
    }],
    tool_choice: 'auto',
    parallel_tool_calls: false,
    reasoning: null,
    store: false,
    stream: true,
    include: ['reasoning.encrypted_content'],
    ...(session.installationId
      ? { client_metadata: { 'x-codex-installation-id': session.installationId } }
      : {})
  };

  return { url, sessionId, headers, body };
}
