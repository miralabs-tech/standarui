export interface CliContext {
  readonly cwd: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly fetch: typeof fetch;
  readonly out: (line: string) => void;
  readonly err: (line: string) => void;
}
