# EmberEngine Test Plan

Requirement: **at least 1000 passing tests.** This document says how they are organized,
counted, run, and kept honest.

## Organization

Tests live in `tests/`, split by what they exercise, and mirror the ownership table in
`docs/architecture.md` (one suite per owner, so a failure points at a module).

| Suite directory | Exercises | Type |
|---|---|---|
| `tests/unit/math` | vectors, rects, transforms, interpolation | pure |
| `tests/unit/ecs` | entity lifecycle, component stores, queries | pure |
| `tests/unit/serialization` | scene save/load, round-trips, version + migration | pure |
| `tests/unit/core-runtime` | time/fixed-step, RNG determinism, input model, events, diagnostics | pure |
| `tests/unit/render2d` | draw-list building, sorting, culling, text layout | pure |
| `tests/unit/camera` | world/screen transforms, follow, clamp, zoom | pure |
| `tests/unit/backend` | canvas2d command execution against a recording fake canvas | pure |
| `tests/unit/render3d` | 3D math, mesh winding, camera projection, culling/shading, mixed 2D+3D order | pure |
| `tests/unit/runtime` | loop scheduling, pause/step, session lifecycle | pure |
| `tests/unit/systems` | gravity, movement, AABB collision, platformer control, collect, lifetime | pure |
| `tests/game` | the shipped game: rules, progression, determinism, input-driven playthroughs | headless simulation |
| `tests/integration/editor` | native editor scene loading, save/reload and project discovery | real I/O, in-process |
| `tests/integration/cli` | CLI argument routing and exit codes | subprocess |
| `tests/export` | export bundle generation, inlined scene validity, manifest contents | pure + real compile |
| `tests/export/e2e` | compiles a real `.exe`, launches it, fetches the served scene | slow, real |

Slow suites (anything invoking `deno compile`) are tagged and excluded from the default
`deno task test:unit`; they run in `deno task test` and in released builds.

## Counting

- The counter is **`deno test`'s own per-test accounting** — each `Deno.test(...)` that
  passes adds 1. No custom scoring, no weighting, nothing that can be inflated in prose.
- `deno task test` prints the runner summary (`ok | N passed | M failed`).
- `deno task test:report` runs each suite separately and prints a table plus the grand
  total, so the per-suite quota below stays visible in every report.

### Quotas (target counts by suite)

| Suite | Target | Suite | Target |
|---|---|---|---|
| unit/math | 200 | unit/runtime | 80 |
| unit/ecs | 150 | unit/systems | 120 |
| unit/serialization | 120 | game | 120 |
| unit/core-runtime | 120 | integration/editor | 80 |
| unit/render2d | 150 | integration/cli | 40 |
| unit/camera | 80 | export | 70 |
| unit/backend | 60 | export/e2e | 10 |
| unit/render3d | 80 | | |
| **Total target** | | | **1480** |

Headroom above 1000 is intentional: it absorbs future feature churn without dropping below
the requirement.

## Rules that keep the count honest

1. **Every test asserts a real invariant.** Table-driven cases must derive their expected
   value independently of the implementation (a formula, a hand-computed constant, or a
   symmetry/property relation such as `deserialize(serialize(x)) === x`).
2. **No vacuous cases.** A loop may not generate cases that all assert the same constant.
   `assertEquals(x, x)`-style tests are a defect, not a test.
3. **Determinism is asserted, not assumed.** RNG and simulation suites run the same input
   twice and compare full state, then run with a different seed and assert divergence.
4. **Property tests print the failing seed** so any counterexample is reproducible.
5. **Suites fail loudly on setup errors**: a suite that cannot start its fixture reports a
   failure rather than skipping silently.
6. **Deleting a feature deletes its tests** — the count tracks the product, not the plan.

## Commands

```bash
deno task test           # full suite (pure + integration; e2e excluded)
deno task test:unit      # pure-logic suites only, fastest feedback
deno task test:game      # headless gameplay tests for games/ember-runner
deno task test:integration
deno task test:report    # per-suite counts + grand total
deno task test:export    # export/packaging; e2e compiles a real .exe
```

CI contract: `deno task test` must be green and the reported total must be >= 1000 before
a release is cut.

## Current status

- Foundation pass (vertical slice): suites above exist and run; per-suite counts are printed
  by `deno task test:report`. Quotas are filled incrementally as modules land, in the order
  listed in `docs/architecture.md`.
- `tests/unit/render3d` is in place: 3D math, built-in mesh winding, Camera3D projection,
  backface/near-plane handling, flat shading, depth order and mixed 2D+3D frame ordering.
