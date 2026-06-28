// Provider type identifiers shared across CLI, server, and library API.
export const CODEX_PROVIDER = 'codex' as const;
export const CODEX_CLI_PROVIDER = 'codex-cli' as const;
export const AUTO_PROVIDER = 'auto' as const;

export type ProviderId =
  | typeof CODEX_PROVIDER
  | typeof CODEX_CLI_PROVIDER
  | typeof AUTO_PROVIDER;

export const SUPPORTED_PROVIDERS: readonly ProviderId[] = [
  CODEX_PROVIDER,
  CODEX_CLI_PROVIDER,
  AUTO_PROVIDER
];
