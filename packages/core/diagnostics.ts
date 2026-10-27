/**
 * @ember/core/diagnostics — log records, counters and frame metrics.
 *
 * Owner: this file owns diagnostics. The editor console, the CLI and the tests
 * all read these records; nothing else defines what a "log line" is.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogRecord {
  level: LogLevel;
  message: string;
  /** Monotonic sequence number, starting at 1. */
  sequence: number;
  /** Simulated time in seconds at which the record was made. */
  time: number;
  data?: Record<string, unknown>;
}

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface DiagnosticsOptions {
  /** Records below this level are dropped. Defaults to "info". */
  minLevel?: LogLevel;
  /** Ring buffer size. Defaults to 500. */
  capacity?: number;
  /** Optional sink, e.g. `console.log` in the CLI. */
  sink?: (record: LogRecord) => void;
}

export class Diagnostics {
  readonly records: LogRecord[] = [];
  readonly counters = new Map<string, number>();
  minLevel: LogLevel;
  capacity: number;
  private sequenceCounter = 0;
  private sink?: (record: LogRecord) => void;
  private listeners = new Set<(record: LogRecord) => void>();

  constructor(options: DiagnosticsOptions = {}) {
    this.minLevel = options.minLevel ?? "info";
    this.capacity = Math.max(1, options.capacity ?? 500);
    this.sink = options.sink;
  }

  setSink(sink: ((record: LogRecord) => void) | undefined): void {
    this.sink = sink;
  }

  onRecord(listener: (record: LogRecord) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  log(
    level: LogLevel,
    message: string,
    data?: Record<string, unknown>,
    time = 0,
  ): LogRecord | null {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.minLevel]) return null;
    const record: LogRecord = { level, message, sequence: ++this.sequenceCounter, time, data };
    this.records.push(record);
    if (this.records.length > this.capacity) {
      this.records.splice(0, this.records.length - this.capacity);
    }
    for (const listener of [...this.listeners]) listener(record);
    this.sink?.(record);
    return record;
  }

  debug(message: string, data?: Record<string, unknown>): LogRecord | null {
    return this.log("debug", message, data);
  }

  info(message: string, data?: Record<string, unknown>): LogRecord | null {
    return this.log("info", message, data);
  }

  warn(message: string, data?: Record<string, unknown>): LogRecord | null {
    return this.log("warn", message, data);
  }

  error(message: string, data?: Record<string, unknown>): LogRecord | null {
    return this.log("error", message, data);
  }

  /** Counters are used for cheap metrics (draw calls, collisions, despawns). */
  increment(name: string, amount = 1): number {
    const next = (this.counters.get(name) ?? 0) + amount;
    this.counters.set(name, next);
    return next;
  }

  getCounter(name: string): number {
    return this.counters.get(name) ?? 0;
  }

  resetCounters(): void {
    this.counters.clear();
  }

  count(level: LogLevel): number {
    return this.records.filter((record) => record.level === level).length;
  }

  byLevel(level: LogLevel): LogRecord[] {
    return this.records.filter((record) => record.level === level);
  }

  lastMessage(): string | undefined {
    return this.records.at(-1)?.message;
  }

  /** Human-readable lines, oldest first. */
  toLines(): string[] {
    return this.records.map((record) => {
      const suffix = record.data ? ` ${JSON.stringify(record.data)}` : "";
      return `[${record.level}] ${record.message}${suffix}`;
    });
  }

  clear(): void {
    this.records.length = 0;
    this.counters.clear();
  }

  get sequence(): number {
    return this.sequenceCounter;
  }
}

export interface FrameStats {
  /** Frames simulated since the session started. */
  frame: number;
  /** Simulated seconds since the session started (fixed steps only). */
  time: number;
  /** Number of fixed steps in the last host frame. */
  lastSteps: number;
  /** Entities alive at the end of the last step. */
  entityCount: number;
  /** Draw commands produced by the last build. */
  drawCommands: number;
  /** Host deltas per second, from `FpsMeter`. */
  fps: number;
}

export function formatFrameStats(stats: FrameStats): string {
  return `frame=${stats.frame} t=${stats.time.toFixed(2)}s steps=${stats.lastSteps} ` +
    `entities=${stats.entityCount} draws=${stats.drawCommands} fps=${stats.fps.toFixed(0)}`;
}
