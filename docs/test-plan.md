# EmberEngine Test Plan

Requirement: **at least 1000 passing tests.** This document says how they are organized, counted,
run, and kept honest.

## Organization

Tests live in `tests/`, split by what they exercise, and mirror the ownership table in
`docs/architecture.md` (one suite per owner, so a failure points at a module).

| Suite directory       | Exercises                                                                                  | Type                       |
| --------------------- | ------------------------------------------------------------------------------------------ | -------------------------- |
| `tests/unit/math`     | vectors, rects, transforms, angles, interpolation                                          | pure                       |
| `tests/unit/core`     | ECS, components, scene model, serialization, colour, time, RNG, input, events, diagnostics | pure                       |
| `tests/unit/ecs`      | entity lifecycle, component stores, queries (table style)                                  | pure                       |
| `tests/unit/render2d` | draw-list building, sorting, culling, camera, text, canvas backend                         | pure                       |
| `tests/unit/render3d` | 3D math, mesh winding, camera projection, culling/shading, mixed 2D+3D order               | pure                       |
| `tests/unit/runtime`  | session step order, systems, scripting, host clock, Game wiring, digests                   | pure                       |
| `tests/unit/editor`   | empty project, example registry, inline-script example, 3D example frame                   | pure                       |
| `tests/unit/player`   | bundle format/validation, loopback server (routing + real socket), player CLI              | in-process + socket        |
| `tests/unit/studio`   | editor HTTP API: page, game info, scene read/create/save, simulate, reload, logs           | in-process with real files |
| `tests/unit/packager` | export install target resolution and copying (folder, file, relative, overwrite)           | real temp files            |
| `tests/unit/cli`      | argument parsing, including where an export is installed                                   | pure                       |
| `tests/export`        | asset manifest + export bundle structure                                                   | pure                       |
| `tests/game`          | the shipped game: rules, progression, determinism, input-driven playthroughs               | headless simulation        |
| `tests/integration`   | scene-file round-trips; export -> bundle -> player server -> headless play                 | real I/O, in-process       |

The suite is fast (well under a minute): `deno compile` is exercised by the export command and its
self-verification, not by the default test run, so `deno task test` stays usable on every save.
Export regressions are covered by `tests/integration` up to the compiled binary, and the binary
itself is checked by `ember export --verify`, which runs the produced `.exe` in `--json` and
`--headless` modes.

## Counting

- The counter is **`deno test`'s own per-test accounting** — each `Deno.test(...)` that passes
  adds 1. No custom scoring, no weighting, nothing that can be inflated in prose.
- `deno task test` prints the runner summary (`ok | N passed | M failed`).
- `deno task test:report` runs each suite separately and prints a table plus the grand total, so the
  per-suite quota below stays visible in every report.

### Current counts

Measured 2026-10-27 with `deno test -A tests/`:

| Suite               | Tests                       |
| ------------------- | --------------------------- |
| `tests/unit`        | 1553                        |
| `tests/export`      | 28                          |
| `tests/game`        | 81                          |
| `tests/integration` | 22                          |
| **Total**           | **1684 passing, 0 failing** |

Headroom above 1000 is intentional: it absorbs future feature churn without dropping below the
requirement. The number above is what the runner printed, not an estimate.

## Rules that keep the count honest

1. **Every test asserts a real invariant.** Table-driven cases must derive their expected value
   independently of the implementation (a formula, a hand-computed constant, or a symmetry/property
   relation such as `deserialize(serialize(x)) === x`).
2. **No vacuous cases.** A loop may not generate cases that all assert the same constant.
   `assertEquals(x, x)`-style tests are a defect, not a test.
3. **Determinism is asserted, not assumed.** RNG and simulation suites run the same input twice and
   compare full state, then run with a different seed and assert divergence.
4. **Property tests print the failing seed** so any counterexample is reproducible.
5. **Suites fail loudly on setup errors**: a suite that cannot start its fixture reports a failure
   rather than skipping silently.
6. **Deleting a feature deletes its tests** — the count tracks the product, not the plan.

## Commands

```bash
deno task test              # the whole suite (currently 1684 passing)
deno task test:unit         # pure/in-process suites only, fastest feedback
deno task test:game         # headless gameplay tests for games/ember-runner
deno task test:integration  # scene-file round-trips + export -> player pipeline
deno task test:report       # per-suite counts + grand total

# equivalent, without the task wrapper
deno test -A tests/
```

CI contract: `deno task test` must be green and the reported total must be >= 1000 before a release
is cut.

## Current status

- The suite is above the requirement: **1684 passing, 0 failing**, in about 27 seconds.
- Covered end to end: core, render2d, render3d, runtime, assets (through export), player bundle +
  real socket server, studio HTTP API, the shipped game, scene-file round-trips and the export ->
  bundle -> serve -> headless-play pipeline.
- Not covered by automated tests: the compiled `.exe`'s browser rendering (checked manually in a
  browser and by the player's `--json`/`--headless` self-check), the native Win32 editor's window
  interaction (needs a real desktop and input), and GDI rendering.
- Keep the rule: a feature that lands without tests either gets them in the same change or is listed
  here as an explicit gap.
