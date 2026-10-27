# EmberEngine Architecture

Status: authoritative. If code and this document disagree, one of them is a bug.

## What EmberEngine is

A **TypeScript game engine with a native Windows editor and standalone `.exe` games.**

- Runs on **Deno** as the single toolchain: TypeScript runtime, test runner, browser
  bundler (`deno bundle`) and standalone executable compiler (`deno compile`).
- Games are **2D and 3D**. The 2D path emits rect/circle/sprite/text commands; the 3D
  path projects meshes into triangle commands. Both share one command vocabulary and one
  canvas backend, so a single scene can mix sprites, meshes and both cameras in one frame.
- The **same simulation code** runs in three hosts: headless (tests, CI), the editor
  (native Play mode), and the exported `.exe` (browser window via loopback server).
  There is exactly one implementation of gameplay — never a "editor version" and a "game version".
- The **editor is a self-contained `EmberEngine.exe`**: a Win32 window, GDI canvas and
  native input through Deno FFI. It does not use a browser, webview, HTTP server or web UI.

### Why Deno

| Need | Deno provides | Alternative rejected |
|---|---|---|
| Run TypeScript directly | native TS execution, no build step | Node + tsc/esbuild pipeline |
| Count and run 1000+ tests | built-in `deno test` runner with per-test reporting | jest/vitest + npm install |
| Produce a standalone `.exe` | `deno compile` embeds the runtime + our code + assets | Electron (~200 MB download), pkg (deprecated) |
| Bundle TS for the browser | `deno bundle --platform browser` | webpack/rollup/esbuild install |

Zero third-party runtime dependencies: the only external import is `@std/assert` in tests.

## Repository layout

```
deno.jsonc              single toolchain config: import map + task shortcuts
packages/
  core/                 math, math3d, colour, ECS, components, scene model + file format,
                        time, RNG, input, events, diagnostics
  render2d/             world -> draw commands, camera, canvas backend
  render3d/             meshes + 3D camera -> triangle commands, 2D+3D frame composition
  runtime/              fixed-step host, session, built-in systems, scripting, Game, digest
  assets/               asset manifest, procedural textures, inlining for export
  player/               exported-game payload (bundle), loopback server, CLI, browser host
  editor/               native Win32/GDI authoring app + its executable entry
  studio/               legacy browser shell + JSON API (tests only; not the editor)
  gameloader/           game.json/project discovery and scene loading for tools
  packager/             export bundle generation + `deno compile` invocation + verify
games/
  ember-runner/         a game built in the engine: game.json, scenes, systems, scripts
tests/
  harness.ts            shared assertion/helper layer for suites
  unit/{core,math,render2d,render3d,runtime,player,studio}/   pure + in-process suites
  game/                 headless gameplay tests for games/ember-runner
  integration/          scene-file round-trips and the export -> player pipeline
tools/
  test-report.ts        per-suite test counts + totals
docs/
  architecture.md       this file
  test-plan.md          how the 1000+ suite is organized, counted and run
legacy/cpp-engine/      superseded C++/OpenGL prototype, kept for reference only
build/                  generated: browser bundles, export staging (gitignored)
dist/                   generated: compiled .exe artifacts (gitignored)
```

## Ownership: one concern, one owner

Every concern has exactly one module that owns it. Cross-cutting duplication is a defect.

| Concern | Single owner | May depend on |
|---|---|---|
| Vector/rect math, interpolation, clamping | `packages/core/math.ts` | — |
| Entity ids, component storage, queries | `packages/core/ecs.ts` | math |
| Scene graph model (scene = world + resources) | `packages/core/scene.ts` | ecs |
| **Scene file format** (`.emberscene` read/write, versioning, migration) | `packages/core/serialization.ts` | scene, ecs |
| Fixed timestep accumulator, frame scheduling | `packages/core/time.ts` | — |
| Deterministic randomness | `packages/core/rng.ts` | — |
| Input state model (held/pressed/released, mouse, replay) | `packages/core/input.ts` | math |
| Typed event bus used by systems | `packages/core/events.ts` | — |
| Diagnostics: log records, frame metrics | `packages/core/diagnostics.ts` | — |
| World -> draw command translation, sorting, culling | `packages/render2d/build.ts` | core |
| Camera2D (world<->screen, follow, clamp, zoom) | `packages/render2d/camera2d.ts` | core |
| 3D vector/matrix math (Vec3, Mat4, perspective, look-at) | `packages/core/math3d.ts` | — |
| Mesh primitives and the mesh registry | `packages/render3d/mesh.ts` | core |
| Camera3D (world->screen, depth, orbit) | `packages/render3d/camera3d.ts` | core |
| Mesh -> triangle commands: culling, flat shading, painter sort | `packages/render3d/build3d.ts` | core, render2d |
| Mixed 2D+3D frame ordering | `packages/render3d/compose.ts` | render2d, render3d |
| Draw command execution on a real canvas | `packages/render2d/backends/canvas2d.ts` | render2d |
| Simulation step: system order, pause/resume, session lifecycle | `packages/runtime/session.ts` | core |
| Variable frame clock around a session (fixed steps, fps) | `packages/runtime/host.ts` | core, runtime/session |
| Built-in gameplay systems (gravity, AABB collision, lifetime...) | `packages/runtime/systems.ts` | core |
| Script registry, script props and inline JavaScript compilation | `packages/runtime/scripting.ts` | core |
| Script stepping, restart-on-edit and error isolation | `packages/runtime/systems.ts` | core, scripting |
| What a game is (scenes, systems, scripts, services) and how every host builds one | `packages/runtime/game.ts` | core, runtime |
| Determinism digests | `packages/runtime/digest.ts` | core |
| Asset manifest, procedural textures, export inlining | `packages/assets/mod.ts` | core |
| Game rules for a specific game | `games/<game>/src/{systems,scripts,scenes}.ts` | runtime |
| Browser host: canvas sizing, keyboard mapping, RAF loop | `packages/player/browser.ts`, `packages/player/app/host.ts` | runtime, render2d |
| Exported-game payload format | `packages/player/bundle.ts` | core, assets |
| Exported-game loopback server and page | `packages/player/server.ts` | player/bundle |
| Exported-game CLI (`--json`, `--headless`, `--port`) | `packages/player/main.ts` | player, runtime |
| Editor server + JSON API (scene I/O, simulate, export) | `packages/studio/server.ts` | core, runtime, gameloader, packager |
| Browser editor UI: layout, selection, inspector, Play mode | `packages/studio/app/*` | core, render2d, runtime, player |
| Native editor application: state, layout, selection, inspector, Play mode | `packages/editor/native/app.ts` | core, render2d, render3d, runtime |
| Win32 window, messages, mouse capture, console detach | `packages/editor/native/win32.ts` | Deno FFI |
| GDI canvas: draw-command execution in the native viewport | `packages/editor/native/gdi.ts`, `packages/editor/native/gdi-backend.ts` | render2d, core |
| Editor executable entry, empty project and examples | `packages/editor/main.ts`, `packages/editor/examples.ts` | editor, gameloader, games |
| Game/project discovery on disk (`game.json`, scenes, assets) | `packages/gameloader/mod.ts` | core |
| Export bundle generation (what files an .exe contains) | `packages/packager/bundle.ts` | core, project |
| `.exe` compilation (invoking `deno compile`) | `packages/packager/compile.ts` | — |
| Argument parsing, command routing | `packages/cli/main.ts` | editor, studio, packager, player |
| Browser bundling of TS entries | `packages/packager/browser.ts` | cli/studio build steps |

Rules that keep this true:

1. **Only `core/serialization.ts` knows the scene file format.** Everything else passes
   `Scene` objects around.
2. **Only `runtime` advances simulation.** The editor, the player and tests all call the
   same `Session.step()`. Nothing else mutates component state per frame.
3. **Only the camera modules convert world coordinates to screen coordinates**
   (`render2d/camera2d.ts` for 2D, `render3d/camera3d.ts` for 3D). Systems never hold
   pixel positions; entities use world units.
4. **Only `packager` writes into `build/export/` and `dist/`.** Nothing else calls
   `deno compile`.
5. **Components are plain JSON data** (no functions, class instances or cyclic graphs).
   This keeps save/load, undo and export trivially correct and property-testable.
6. **Systems are pure functions of `(ctx, world, dt)`** in effect: all state lives in the
   world/scene, so a session can be serialized, replayed and asserted headlessly.

## Data flow

```
game.json ──► Scene (.emberscene JSON) ──► Session ──► systems mutate world
                   ▲                          │
                   │                          ▼
    native editor (read/write)     render2d.build ──► 2D commands ──┐
                   │                          │                     │
                   │                          └► render3d.build3d ─► triangle commands
                   │                                                │
                   │                                                ▼
                   │                                  render3d.compose ──► DrawCommand[]
                   │                                                │
                   │                               ┌────────────────┴────────────────┐
                   │                               ▼                                 ▼
                   │                       canvas2d backend                  test recorder
                   ▼                      (exported .exe)                  (headless)
             packager ──► build/export/<game>/{entry.exe.ts, player.bundle.js, scene_data.ts}
                              └─► deno compile ──► dist/<Game>.exe
                                                     └─► loopback server + opens browser to play

In the editor, `NativeEditor` owns the scene in memory, loads `scenes/*.emberscene`
through `@ember/gameloader`, and writes them back with `writeSceneFile`. Its viewport
calls the same `buildFrame` used by the player and executes the resulting commands with
GDI, so 2D and 3D preview exactly match the engine's draw list. Play mode uses
`RuntimeHost` and `RuntimeSession` in the same process.

An entity's `Script` component can name a registered behaviour or carry inline JavaScript.
The script system compiles inline source on first use, keeps one behaviour instance per
entity, restarts when the source changes, and reports compile/runtime errors as diagnostics
while disabling only the broken behaviour. The editor's code editor writes that source back
into the `.emberscene` file.
```

2D and 3D converge at `render3d/compose.ts`, which owns cross-pipeline order: layer first,
then 2D before 3D at an equal layer, then far-to-near depth. `buildFrame(scene)` is the
single call that produces a complete frame for a 2D, 3D or mixed scene.

The exported `.exe` is a Deno binary that contains: the player bundle (our runtime + the
game's systems, compiled for the browser), the scene data inlined as a TS module, and a
small HTTP server. Running it serves the game on `127.0.0.1` and opens the default browser
to that URL. It needs no install, no Node, no network.

## Native editor, empty start and examples

The editor is the Win32/GDI application in `packages/editor`. A fresh launch creates an
`Untitled Project` with one blank scene and the editor's small script library; it does not
open the sample game automatically. `packages/editor/examples.ts` owns the built-in
examples (Scripting Playground, 3D Showcase, Ember Runner). The Examples menu swaps the
whole project in memory, while each example's scenes are written under
`examples/<id>/scenes` so they never populate the empty project unless edited and saved.

`packages/studio` is a legacy browser shell retained for its JSON API tests. It is not the
editor, is not compiled into `EmberEngine.exe`, and `deno task editor` never starts a
browser or HTTP server.

## Deliberate decisions and non-goals

- **Native editor, browser game host**: the editor is a real Win32 window with GDI and
  no web layer (`deno task editor`, or `dist/EmberEngine.exe`). Exported games still use
  the loopback-server + browser host; a native player can replace `player/host.ts` later
  without touching engine code, because the host boundary is a single `startPlayer()` call.
- **Editor executable**: `deno task build:editor` compiles `packages/editor/main.ts` to
  `dist/EmberEngine.exe`. It embeds the examples and opens an empty project by default;
  example scenes are saved separately under `projects/untitled/examples/`. The window
  detaches the console unless launched with `--debug`.
- **Inline scripts are trusted code**: scene-authored JavaScript is compiled with
  `new Function` and receives the curated component/math API. Like any game script file it
  runs with the host's privileges; only open projects you trust.
- **No second engine**: `legacy/cpp-engine/` is frozen reference material. New engine work
  never lands there.
- **No build step for the engine**: packages are consumed as TypeScript source by Deno and
  bundled directly for the browser.
- **Software-projected 3D**: `render3d` projects meshes into screen-space triangles and
  the existing canvas backend fills them. No WebGL, no GPU context, no extra dependency;
  the same code runs headless in tests and can be mixed with 2D. A GPU backend can
  implement the same `triangle` command later without touching gameplay or scene data.
- **Not yet owned**: audio, 3D physics/collision, animation graphs, prefabs, undo/redo.
  When added, each gets exactly one owner listed in the table above.

## Verification strategy

See `docs/test-plan.md`. Every module above has a suite in `tests/`. The export path is
covered up to the compiled binary by `tests/integration` (bundle -> player payload ->
loopback server -> headless play), and the binary itself is verified by
`ember export --verify`, which runs the produced `.exe` in `--json` and `--headless` modes
and compares the scene list and determinism digest. The browser rendering of an export is
checked by opening its served URL; that step is manual and recorded in the test plan as
the known gap.
