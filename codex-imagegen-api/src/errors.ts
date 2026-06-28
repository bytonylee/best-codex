// CodedError: the single error type used across the codebase.
// Replaces the ad-hoc `new Error() as Error & { code: string }` pattern.
// Every throw site creates a CodedError; every catch site checks
// `e instanceof CodedError` and reads `e.code` — no casts needed.

export class CodedError extends Error {
  readonly code: string;
  override readonly cause?: unknown;
  readonly warnings?: string[];

  constructor(
    message: string,
    code: string,
    opts?: { cause?: unknown; warnings?: string[] }
  ) {
    super(message);
    this.name = 'CodedError';
    this.code = code;
    if (opts?.cause !== undefined) this.cause = opts.cause;
    if (opts?.warnings) this.warnings = opts.warnings;
  }
}
