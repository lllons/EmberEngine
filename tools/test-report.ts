/**
 * tools/test-report.ts — per-suite test counts and the 1000-test gate.
 *
 * Owner: this file owns "are we at the required test count, per suite, and is every suite
 * green?". It runs each suite directory in its own `deno test` process (so one suite's
 * crash cannot hide another's counts) and prints the runner's own pass/fail tally.
 *
 * The counter is `deno test`'s accounting — nothing here scores or weights tests.
 *
 *   deno task test:report
 */

export interface Suite {
  /** Directory passed to `deno test`. */
  directory: string;
  /** From `docs/test-plan.md`; 0 means "no separate quota". */
  target: number;
}

/** Quotas sum to the 1480 target in docs/test-plan.md; the gate itself is 1000. */
export const SUITES: readonly Suite[] = [
  { directory: "tests/unit", target: 1090 },
  { directory: "tests/game", target: 120 },
  { directory: "tests/integration", target: 120 },
  { directory: "tests/export", target: 70 },
];

export const GATE = 1000;

export interface SuiteResult {
  directory: string;
  target: number;
  passed: number;
  failed: number;
  ignored: number;
  /** Set when the suite could not be measured at all (type error, crash, missing dir). */
  error: string | null;
  seconds: number;
  /** Diagnostics: the last lines of the suite's own output, for the failure table. */
  detail: string[];
}

// Built from char codes so linters do not flag a literal control character.
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

/** Deno test colourises its summary; strip escapes before matching. */
export function stripAnsi(text: string): string {
  return text.replace(ANSI, "");
}

/**
 * Parses the runner's summary line, e.g.
 *   ok | 123 passed | 2 failed (1s)
 *   FAILED | 123 passed | 0 failed | 3 ignored (1s)
 * Returns null when the output contains no summary (the suite died before reporting).
 */
export function parseSummary(
  output: string,
): { passed: number; failed: number; ignored: number } | null {
  const matches = [
    ...stripAnsi(output).matchAll(
      /(?<status>ok|FAILED)\s*\|\s*(?<passed>\d+)\s+passed\s*\|\s*(?<failed>\d+)\s+failed(?:\s*\|\s*(?<ignored>\d+)\s+ignored)?/g,
    ),
  ];
  const last = matches.at(-1);
  if (!last?.groups) return null;
  return {
    passed: Number(last.groups.passed),
    failed: Number(last.groups.failed),
    ignored: Number(last.groups.ignored ?? 0),
  };
}

/** Human-readable reason a suite produced no summary line. */
export function explainFailure(output: string): string {
  if (/no test modules found/i.test(output)) return "no test modules found";
  if (/Type checking failed|TS\d{4} \[ERROR\]/.test(output)) {
    const error = /TS\d{4} \[ERROR\]:[^\n]*/.exec(output)?.[0];
    return error ? `type check failed: ${error.trim()}` : "type check failed";
  }
  if (/error: Test failed/.test(output)) return "test failed";
  const line = output.split(/\r?\n/).filter((l) => l.trim().startsWith("error")).at(-1);
  return line ? line.trim().slice(0, 160) : "no summary line in output";
}

export async function runSuite(suite: Suite): Promise<SuiteResult> {
  const started = performance.now();
  const command = new Deno.Command(Deno.execPath(), {
    args: ["test", "-A", `${suite.directory}/`],
    stdout: "piped",
    stderr: "piped",
  });
  const { code, stdout, stderr } = await command.output();
  const text = stripAnsi(new TextDecoder().decode(stdout) + new TextDecoder().decode(stderr));
  const seconds = (performance.now() - started) / 1000;
  const summary = parseSummary(text);
  const detail = text.split(/\r?\n/).filter((line) =>
    line.startsWith("error") || line.includes("=>")
  )
    .slice(0, 12);

  if (!summary) {
    return {
      ...suite,
      passed: 0,
      failed: 0,
      ignored: 0,
      error: explainFailure(text),
      seconds,
      detail,
    };
  }
  return {
    ...suite,
    ...summary,
    error: code === 0 ? null : `runner exit ${code}`,
    seconds,
    detail,
  };
}

function pad(text: string, width: number): string {
  return text.length >= width ? text : text + " ".repeat(width - text.length);
}

function padStart(text: string, width: number): string {
  return text.length >= width ? text : " ".repeat(width - text.length) + text;
}

export function formatReport(results: readonly SuiteResult[]): string {
  const lines: string[] = [
    `${pad("suite", 24)}${padStart("passed", 8)}${padStart("failed", 8)}${padStart("ignored", 9)}${
      padStart("target", 8)
    }${padStart("time", 8)}  status`,
    "-".repeat(76),
  ];
  for (const result of results) {
    const status = result.error ? `ERROR: ${result.error}` : result.failed > 0 ? "FAIL" : "ok";
    lines.push(
      `${pad(result.directory, 24)}${padStart(String(result.passed), 8)}${
        padStart(String(result.failed), 8)
      }${padStart(String(result.ignored), 9)}${padStart(String(result.target), 8)}${
        padStart(`${result.seconds.toFixed(1)}s`, 8)
      }  ${status}`,
    );
  }
  lines.push("-".repeat(76));
  const passed = results.reduce((total, r) => total + r.passed, 0);
  const failed = results.reduce((total, r) => total + r.failed, 0);
  const broken = results.filter((r) => r.error !== null);
  lines.push(
    `${pad("total", 24)}${padStart(String(passed), 8)}${padStart(String(failed), 8)}` +
      `${padStart("", 9)}${padStart("", 8)}`,
  );
  lines.push("");
  lines.push(
    failed === 0 && broken.length === 0
      ? `gate ${GATE}: ${passed} passing tests (${passed - GATE >= 0 ? "+" : ""}${
        passed - GATE
      } vs gate)`
      : `gate ${GATE}: NOT MET — ${failed} failing, ${broken.length} suite(s) unmeasurable`,
  );
  return lines.join("\n");
}

export function failingSuites(results: readonly SuiteResult[]): SuiteResult[] {
  return results.filter((result) => result.error !== null || result.failed > 0);
}

async function main(): Promise<void> {
  const suites: Suite[] = [];
  for (const suite of SUITES) {
    try {
      const stat = await Deno.stat(suite.directory);
      if (stat.isDirectory) suites.push(suite);
    } catch {
      // Suite directory does not exist yet; reported below as unmeasurable.
      suites.push(suite);
    }
  }

  const results: SuiteResult[] = [];
  for (const suite of suites) {
    try {
      await Deno.stat(suite.directory);
      results.push(await runSuite(suite));
    } catch {
      results.push({
        ...suite,
        passed: 0,
        failed: 0,
        ignored: 0,
        error: `missing directory ${suite.directory}`,
        seconds: 0,
        detail: [],
      });
    }
  }

  console.log(formatReport(results));

  const failing = failingSuites(results);
  if (failing.length > 0) {
    console.log("\nfailures:");
    for (const result of failing) {
      console.log(`  ${result.directory}: ${result.error ?? `${result.failed} failing`}`);
      for (const line of result.detail) console.log(`      ${line}`);
    }
  }

  const passed = results.reduce((total, r) => total + r.passed, 0);
  if (failing.length > 0 || passed < GATE) Deno.exit(1);
}

if (import.meta.main) await main();
