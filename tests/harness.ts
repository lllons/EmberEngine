/**
 * Shared test helpers.
 *
 * Rules this file exists to enforce (see `docs/test-plan.md`):
 * - every case asserts a real invariant, computed independently of the implementation;
 * - failure messages name the case and both values;
 * - a table row becomes its own `Deno.test`, so `deno test`'s count reflects real cases.
 */

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function assertEqual<T>(actual: T, expected: T, label = "value"): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label}: expected ${e}, got ${a}`);
}

export function near(actual: number, expected: number, epsilon = 1e-9, label = "value"): void {
  if (!(Math.abs(actual - expected) <= epsilon)) {
    throw new Error(`${label}: expected ${expected} (±${epsilon}), got ${actual}`);
  }
}

export function vecNear(
  actual: { x: number; y: number },
  expected: { x: number; y: number },
  epsilon = 1e-9,
  label = "vec",
): void {
  near(actual.x, expected.x, epsilon, `${label}.x`);
  near(actual.y, expected.y, epsilon, `${label}.y`);
}

export function assertThrows(
  fn: () => unknown,
  /** Either a class the error must be an instance of, or a pattern its message must match. */
  match?: RegExp | (new (...args: never[]) => Error),
  label = "call",
): void {
  let threw = false;
  try {
    fn();
  } catch (error) {
    threw = true;
    const message = error instanceof Error ? error.message : String(error);
    if (match instanceof RegExp) {
      if (!match.test(message)) {
        throw new Error(`${label}: threw "${message}", which does not match ${match}`);
      }
    } else if (match && !(error instanceof match)) {
      throw new Error(
        `${label}: threw ${(error as Error)?.name ?? typeof error} "${message}", expected ${
          match.name
        }`,
      );
    }
  }
  if (!threw) throw new Error(`${label}: expected a throw, got none`);
}

export interface TableRow {
  label: string;
}

/**
 * Registers one test per table row. `suite` prefixes the name so a failure points at the
 * behaviour; `run` must contain at least one assertion.
 */
export function table<T extends TableRow>(
  suite: string,
  rows: readonly T[],
  run: (row: T) => void,
): void {
  for (const row of rows) {
    Deno.test(`${suite} · ${row.label}`, () => run(row));
  }
}

/** Runs `body` with a fresh temporary directory that is always removed afterwards. */
export async function inTempDir(body: (directory: string) => Promise<void>): Promise<void> {
  const directory = await Deno.makeTempDir({ prefix: "ember-test-" });
  try {
    await body(directory);
  } finally {
    await Deno.remove(directory, { recursive: true }).catch(() => {});
  }
}

/** Joins path segments without pulling node:path into tests. */
export function joinPath(...parts: string[]): string {
  return parts.join("/").replace(/\/+/g, "/");
}

/** Deterministic sample of integers, for order/shuffle assertions. */
export function range(count: number, start = 0): number[] {
  return Array.from({ length: count }, (_, index) => start + index);
}
