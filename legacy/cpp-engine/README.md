# EmberEngine

A lightweight C++17 game engine and editor built on OpenGL 3.3. It ships with a
docking editor, an ECS scene model, OBJ mesh import, undo/redo, prefabs, and a
built-in bitmap-font UI renderer — no external UI or asset libraries required.

## Requirements

| | |
|---|---|
| OS | Windows 10/11 (MSYS2 / MinGW-w64 `ucrt64` toolchain) |
| Compiler | `g++` 11 or newer (tested with GCC 16) |
| GPU | Anything with OpenGL 3.3 Core Profile |
| Linker | `lld` (ships with the MSYS2 toolchain) |

Linux builds are close but not yet supported: the platform layer currently
targets Win32 only.

## Build

```bash
# from the repository root, in an MSYS2 MinGW shell
./build.sh
```

On `cmd.exe` use `build.bat`. Both compile every source file into `build/` and
link `bin/EmberEngine.exe` with `lld` (GNU `ld` hits its section limit on this
project).

There is also a `Makefile` for incremental builds:

```bash
make -j8
```

## Run

```bash
./bin/EmberEngine.exe
```

The engine writes `ember.log` and `font_atlas_debug.ppm` next to the executable.

## First five minutes

1. **Menus** — click `File`, `GameObject`, `Component`, `Window`. A menu stays
   open until you pick an item or click away; hovering the bar switches menus.
2. **Create a cube** — `GameObject > 3D Object > Cube`. It appears in the
   Hierarchy and is selected automatically.
3. **Edit it** — the Inspector shows Position/Rotation/Scale. Drag a colour
   swatch in the Material Editor to change R/G/B interactively.
4. **Import a mesh** — `Assets > Import...` and pick a `.obj` file. It shows up
   in the Asset Browser; click its tile to place it in the scene.
5. **Save your work** — `File > Save Scene` writes an `.emberscene` file next to
   the executable; `File > Open Scene...` loads it back. `File > Save Selected
   as Prefab` captures an entity into `prefabs/`.
6. **Arrange the workspace** — drag panel tabs, drag splitters to resize, scroll
   long lists with the mouse wheel, and use `Window` to show/hide panels.

Keyboard: `Ctrl+Z` undo, `Ctrl+Shift+Z` redo. The toolbar has Select/Move/
Rotate/Scale modes plus Play/Pause/Stop.

## Project layout

```
Engine/Core          application loop, ECS, logging, config, file system, events
Engine/Math          vectors, matrices, quaternions
Engine/Rendering     renderer, meshes, materials, shaders, framebuffers, font atlas
Engine/AssetPipeline OBJ/model/texture loaders and the asset registry
Engine/Physics       AABB/sphere physics world and rigid bodies
Engine/Audio         WAV playback
Engine/UI            docking layout manager
GUI                  immediate-mode widget toolkit
Editor               editor panels, menus, toolbar, undo/redo, serialization
Assets               Models / Textures / Scenes / Shaders / Scripts / Audio
bin                  built executable, log, prefabs
```

## Known limitations

- Audio decodes WAV only; OGG is not implemented.
- `Assets > Refresh` and `Build Settings...` are placeholders.
- Physics is a simple AABB solver, not a full rigid-body engine.
- Rendering is forward-only with one shadow-casting directional light.
- The editor never hot-reloads assets; re-import to pick up changes on disk.
- No standalone game export yet — the editor binary is the product.

## Troubleshooting

**Shader compile errors on launch** — your GPU/driver does not expose OpenGL
3.3 Core. Update the driver or run on a machine with one.

**`collect2: ld returned 5`** — GNU `ld` ran out of sections. Link with `lld`
(`-fuse-ld=lld`), which `build.sh` and `build.bat` already do.

**Black viewport** — check `ember.log` for shader or framebuffer errors; the
Scene View only draws once a camera exists in the scene.

## License

See `LICENSE` if present; otherwise treat this as an internal project.
