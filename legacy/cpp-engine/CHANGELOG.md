# EmberEngine Changelog

All notable changes to EmberEngine will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0-alpha] - 2026-07-15

### Added

#### Core Engine
- Application lifecycle management with main loop
- Logging system with file and console output
- Event system with type-dispatched events and callbacks
- Memory manager with pool and linear allocators
- Timer system with delta time and FPS calculation
- Configuration system with INI-style loading
- File system with path resolution and directory operations
- Thread pool with task submission and futures
- Math library (Vec2/3/4, Mat3/4, Quaternion)
- Entity Component System (ECS) with component pools and queries
- Scene management with entity hierarchy

#### Components
- Transform component (position, rotation, scale)
- Camera component (perspective/orthographic projection)
- Light component (directional, point, spot)
- RigidBody component with physics integration
- Collider components (box, sphere, capsule)
- Audio component
- Particle component
- Script component

#### Physics
- Physics world with rigid body simulation
- Collision detection and response
- Raycasting
- Rigid body integration with forces

#### Audio
- Audio system with sound management
- 3D audio support
- Sound loading and playback

#### Animation
- Animator with skeletal animation
- Animation blending

#### Scripting
- Script engine with console commands

#### Asset Pipeline
- Asset manager with loading and caching
- Asset lifecycle management

#### GUI
- EmberGUI immediate-mode GUI system
- Buttons, sliders, inputs, trees, menus, tabs

#### Rendering
- Renderer with OpenGL support
- Shader compilation and linking
- Mesh system with VAO/VBO/EBO
- Material system with PBR properties
- Texture loading and management
- Camera system (perspective/orthographic)
- Light system (directional, point, spot)
- FrameBuffer for offscreen rendering

#### Platform
- Win32 window creation
- OpenGL context creation (3.3 Core Profile)
- Input handling (keyboard, mouse)
- Window management

#### Testing
- Unit tests for ECS
- Unit tests for Math library

### Changed
- N/A (initial release)

### Fixed
- N/A (initial release)

### Removed
- N/A (initial release)

---

## [1.0.2-alpha] - 2026-07-16

### Added

#### Rendering
- Built-in debug shader for debug visualization
- Built-in UI shader for 2D overlay rendering
- Built-in skybox shader foundation
- GUI rendering pass in main render loop using orthographic projection
- Editor overlay system with 9 panels (Menu Bar, Toolbar, Viewport, Hierarchy, Inspector, Console, Asset Browser, Profiler, Status Bar)

#### Editor
- Functional editor layout with menu bar, toolbar, and status bar
- Hierarchy panel showing scene entities with selection
- Inspector panel showing selected entity's components (Transform, MeshRenderer)
- Viewport panel showing 3D scene with debug grid
- Console and Asset Browser panel placeholders
- Profiler panel showing FPS and draw call stats

#### Materials
- Material factory methods now properly assign built-in shaders
- `createDefault()` and `createPBR()` use the PBR default shader
- `createUnlit()` and `createWireframe()` use the basic shader

#### ECS
- `addComponent()` now returns a reference to the added component (`T&` instead of `void`)

#### Demos
- main.cpp now creates a test scene with ground plane, rotating cube, and orbiting sphere
- Scene rendering with camera, directional lighting, and debug grid
- Editor integration with scene display

### Fixed
- GL resource leak: GUI VAO/VBO and shader are now cleaned up on renderer shutdown

### Changed
- Core engine now calls `renderGUI()` each frame to render the editor overlay

---

## [1.0.3-alpha] - 2026-07-16

### Added

#### Shadow Mapping
- Built-in depth-only shader (`createDepthShader()`) for shadow map rendering
- Updated default PBR shader with shadow sampling support:
  - `uLightSpaceMatrix` uniform for light-space coordinate transformation
  - `uShadowMap` sampler for depth texture
  - `uShadowEnabled` toggle uniform
  - `uShadowBias` for self-shadowing prevention
  - PCF (Percentage Closer Filtering) with 3x3 kernel for soft shadows
- Shadow pass in `Renderer::renderScene()`:
  - Iterates shadow-casting light components
  - Reusable depth FBO cache per light (not re-allocated per frame)
  - Renders scene from light's perspective to depth buffer
  - Binds shadow map during main render pass
  - Viewport restoration after shadow pass

#### FrameBuffer
- Depth-only FBOs now properly set `glDrawBuffer(GL_NONE)` / `glReadBuffer(GL_NONE)`
- FBO completeness is checked after adding depth attachments

### Fixed
- Shadow depth shader and FBO cache cleaned up on renderer shutdown

---

## [1.0.4-alpha] - 2026-07-16

### Added

#### Font Rendering
- Bitmap font system with 95 printable ASCII glyphs (5x7 pixel font)
- Built-in font atlas texture generated procedurally from glyph bit patterns
- Font rendering via `Engine/Rendering/Font.h` header-only font module
- Text now renders as textured glyph quads instead of colored rectangles
- Proper UV coordinate mapping for each character in the font atlas
- Font texture cleanup on renderer shutdown
- Fallback to colored rectangles when font texture is unavailable

#### GUI
- Editor panels now display readable text (menu items, hierarchy, inspector, toolbars)
- Text color is correctly applied from the DrawCmd color field

### Fixed
- Missing GL resource cleanup for font texture on shutdown

---

## [1.0.5-alpha] - 2026-07-16

### Added

#### Docking System
- Full dockable panel system via `Engine/UI/DockManager.h/cpp`:
  - Tree-based layout with Left/Center/Right dock zones
  - Tab bars with multiple panels per zone
  - Splitter bars between zones with drag-to-resize
  - Split dragging with minimum size limits (50px)
  - Panel focus switching via tab click
  - Window context properly set before panel content rendering
  - Basic panel drag-to-dock between zones
  - Dock preview zone highlights during drag
  - Floating panel support
  - Layout serialization (save/restore panel visibility)

#### Editor
- Editor now uses DockManager for all panel layout:
  - Scene View (center)
  - Hierarchy (left side)
  - Inspector (right strip)
  - Asset Browser (tabs with Console)
  - Console (tabs with Asset Browser)
  - Profiler (top area)
- Window menu items toggle panel visibility
- Full editor chrome (menu bar, toolbar, status bar) remains non-dockable

### Fixed
- Editor panels now have proper window context for widget sizing
- Tab bars correctly skip invisible panels
- Dead code removed from DockManager (splitNode, handlePanelDrag, unused struct fields)
- Missing `#include <cstdint>` in Components.h
- NOMINMAX redefinition warnings suppressed with `#ifndef` guards

---

---

## [1.1.0-alpha] - 2026-07-16

### Added

#### Scene Serialization
- `Scene::saveScene(filepath)` - Full scene serialization to `.emberscene` format
- `Scene::loadScene(filepath)` - Full scene deserialization with entity ID remapping
- All 13 component types serialized/deserialized:
  - Transform, MeshRenderer, CameraComponent, LightComponent, RigidBodyComponent
  - BoxColliderComponent, SphereColliderComponent, CapsuleColliderComponent
  - AudioSourceComponent, ParticleEmitterComponent, ScriptComponent, NameComponent, Tag
- Entity hierarchy preservation (parent/child relationships) across save/load
- Material properties serialization (albedo, roughness, metallic)
- String fields properly separated from numeric fields in serialization format

#### Editor
- File menu actions for Scene management:
  - File > New Scene - clears the current scene
  - File > Save Scene - saves to `scenes/` directory with auto-created path
  - File > Open Scene - loads from `scenes/` directory

### Fixed
- Scene copy-assignment crash risk replaced with explicit `clear()` + `setName()` for New Scene
- Parent hierarchy restoration on scene load (was broken due to unused struct field)
- String field corruption in AudioSource/Script/Tag deserialization
- Dead code removed from `Scene::loadScene()` (unused first-pass entity creation, unused struct field)
- Duplicate `#include <algorithm>` removed from ECS.cpp

---

---

## [1.2.0-alpha] - 2026-07-16

### Added

#### Cascaded Shadow Maps (CSM)
- 4-cascade shadow mapping for directional lights with practical frustum splitting
- `Camera::getFrustumCorners(near, far)` - extracts 8 frustum corners for cascade calculation
- `Camera::calculateCascadeSplits()` - weighted logarithmic/uniform split distribution
- `Renderer::renderCascadeShadowPass()` - renders 4 depth maps per directional light
- `Renderer::calculateCascadeMatrices()` - tight light-space orthographic projections per cascade
- Persistent cascade FBO cache (`m_cascadeFboCache` keyed by `lightEntity * 4 + cascadeIndex`)
- Per-cascade PCF 3x3 shadow sampling with 4 separate sampler uniforms (`uShadowMap0-3`)
- Cascade blending near boundaries to reduce visible seams (cascade pair interpolation)
- Near/far plane padding in cascade frustum to prevent shadow clipping
- Backward-compatible single-cascade fallback

#### Shader
- Default PBR shader updated with CSM support:
  - View-space fragment position output for cascade selection
  - Per-cascade light-space coordinates (`CascadePos[4]`)
  - Automatic cascade index selection based on view-space depth
  - Blend region transition between adjacent cascades

#### Camera
- `getFrustumCorners()` - extracts 8 world-space frustum corners for a given near/far slice
- `calculateCascadeSplits()` - static method for practical split calculation (blend parameter lambda=0.85)

### Fixed
- Double shadow pass eliminated: CSM pass replaces single-cascade pass when directional light is active
- Portability: `tanf()` replaced with `std::tan()` for C++17 compliance
- Cascade near-plane clipping: added 10-unit padding to orthographic near plane
- Cascade far-plane extension increased to 150 units for better distant shadow coverage

---

## [1.3.0-alpha] - 2026-07-16

### Added

#### Spot Light Shadows
- Spot light depth pass with perspective projection matching the light's cone angle (`outerCutoff * 2.0`)
- Reusable spot shadow FBO cache (`m_spotShadowFboCache` keyed by entity)
- Spot shadow maps bind to texture unit 1 via `uShadowMap` (sampler2D), using existing PCF shadow calculation

#### Point Light Shadows
- Cubemap-based omni-directional shadow maps for point lights
- 6-face rendering loop with face-specific view matrices (+X,-X,+Y,-Y,+Z,-Z with correct up vectors)
- Each face uses 90-degree FOV perspective projection (cube map face standard)
- Reusable point shadow FBO cache (`m_pointShadowFboCache` with depth cubemap attachment)
- Separate `samplerCube uPointShadowMap` uniform in PBR shader (bound to texture unit 8)
- Cubemap PCF with 4 offset direction samples for shadow softening
- Depth comparison: `length(fragToLight)` vs `texture(cubemap, direction).r * farPlane`

#### Shader Improvements
- PBR fragment shader now handles 3 light types with correct shadow sampling:
  - `uLightType == 0`: Directional light with CSM (4 cascades on units 2-5)
  - `uLightType == 1`: Spot light with perspective shadow map (unit 1)
  - `uLightType == 2`: Point light with cubemap shadow map (unit 8)
- Added `uniform samplerCube uPointShadowMap` for cubemap shadow sampling

#### Texture & FrameBuffer
- `Texture::createCubemap(width, height)` - creates a cubemap texture with 6 GL_TEXTURE_CUBE_MAP faces
- `Texture::createDepthCubemap(width, height)` - creates a cubemap depth texture for point light shadows
- `FrameBuffer::createCubemapShadowMap(size)` - creates an FBO with depth cubemap attachment
- `FrameBuffer::getDepthAttachment()` - returns the FBO's depth texture
- `FrameBuffer::getID()` - returns the underlying GL FBO ID

#### GL Constants
- Added cubemap constants to GL.h: `GL_TEXTURE_CUBE_MAP`, `GL_TEXTURE_CUBE_MAP_POSITIVE_X` through `GL_TEXTURE_CUBE_MAP_NEGATIVE_Z`, `GL_TEXTURE_WRAP_R`, `GL_CLAMP_TO_EDGE`

### Fixed
- **Critical**: Point light cubemap was being sampled as `sampler2D` with `vec3` coordinates — invalid GLSL. Fixed by adding dedicated `uniform samplerCube uPointShadowMap` and binding to separate texture unit 8.
- Spot/point shadow FBO caches properly cleaned up in Renderer::shutdown()
- Texture unit conflicts resolved: cascades=units 2-5, spot=unit 1, point=unit 8, font=unit 0, materials=units 0+

---

## [1.4.0-alpha] - 2026-07-16

### Added

#### Drag-and-Drop Asset Importing
- `DragAcceptFiles(TRUE)` enabled in `Platform::createWindow()` so the window accepts file drops
- Wired platform drop callback (`WM_DROPFILES` handler) through `Application::run()` → virtual `onFileDrop(path)`
- `EmberApp::onFileDrop()` delegates to `Editor::importFile()` for unified import handling
- Supported formats: `.png`, `.jpg`, `.jpeg`, `.bmp`, `.tga` (textures via `AssetManager::loadTexture()`)
- `.obj` files accepted as models (stub via `AssetManager::loadModel()`)

#### File Dialog Asset Import
- `Editor::importAsset()` opens `Platform::openFileDialog()` with multi-format filter
- `Editor::importFile()` is a `static` utility method, callable from both menu and drag-and-drop
- Assets > Import... menu item triggers file dialog

#### Asset Browser
- Updated `Editor::renderAssetBrowser()` to show imported assets from `AssetManager`
- Grid layout with asset type icons (◙ = texture, ▲ = model)
- Import button in panel header
- Asset count and short name labels
- "Drag and drop" hint when no assets imported

#### Application Callbacks
- Added virtual `Application::onFileDrop(const std::string& filePath)` for derived app classes

### Fixed
- **Code duplication**: Import logic extracted into `Editor::importFile()` static method, eliminating duplicate code between drag-drop (`EmberApp::importFile()`) and menu (`Editor::importAsset()`)
- **Portability**: `std::tolower` calls now include proper `static_cast<unsigned char>` to avoid undefined behavior on negative char values
- **Includes**: Added explicit `#include <cctype>` to Editor.cpp and main.cpp for portable `std::tolower` usage

---

## [1.5.0-alpha] - 2026-07-16

### Added

#### Texture Thumbnail Rendering in Asset Browser
- `DrawCmdType::Image` handler in `Renderer::renderGUI()` — renders textured quads from GUI draw commands:
  - Binds texture via `glBindTexture(GL_TEXTURE_2D, cmd.textureID)` with explicit `glActiveTexture(GL_TEXTURE0)`
  - Sets `uUseTexture=1` and `uTexture` uniform for textured rendering
  - Uses UV coordinates from `cmd.uvMin`/`cmd.uvMax` for sub-texture regions
  - Unbinds texture after draw to avoid affecting subsequent commands
  - Falls back to untextured colored quad if textureID is 0
- Updated `Editor::renderAssetBrowser()` to display actual texture thumbnails for imported texture assets:
  - Retrieves `Texture` from `AssetManager` via `getAsset<Texture>()`
  - Calls `ui.drawImage()` with the texture's OpenGL ID and proper thumbnail sizing (56×32)
  - Falls back to colored rectangle if texture cannot be retrieved

#### AssetManager Template Fix
- `getAsset<T>()` template method now defined inline in the header with `std::static_pointer_cast<T>` implementation, resolving linker errors when instantiated with any type

### Fixed
- **Linker error**: `AssetManager::getAsset<Texture>()` was declared as a template in the header without a visible body, causing an unresolved symbol at link time. Fixed by defining the template inline.
- **Texture unit robustness**: Added explicit `glActiveTexture(GL_TEXTURE0)` before `glBindTexture` in the Image draw command handler to ensure correct texture unit binding regardless of prior state

---

## [1.6.0-alpha] - 2026-07-16

### Added

#### Click-to-Place Imported Textures
- Asset Browser texture thumbnails are now clickable — clicking a texture creates a new entity in the scene
- New entity includes:
  - Transform: positioned at (0, 0.5, 0), scaled 2×1×2
  - MeshRenderer: plane mesh with shadows enabled
  - Material: `Material::createDefault()` with the imported texture set as albedo
- New entity is auto-selected in the Hierarchy panel
- Console log on placement for feedback

#### PBR Shader Albedo Texture Support
- Added `uniform sampler2D uAlbedoMap` and `uniform bool uUseAlbedoMap` to the default PBR fragment shader
- Fragment shader samples the albedo texture using `TexCoord` and multiplies with `uAlbedo` color when `uUseAlbedoMap` is true
- `setShaderUniforms()` in `Renderer::renderScene()` checks for `albedoTexture` property on the material and sets the uniforms accordingly
- The texture is bound to unit 0 by `Material::applyProperties()`, and the renderer points `uAlbedoMap` to unit 0
- Fully backward compatible: existing scenes without albedo textures render identically

### Fixed
- N/A

---

## [1.7.0-alpha] - 2026-07-16

### Added

#### Game View Panel
- New dockable "Game View" panel showing the scene from the game camera perspective
- Registered alongside Scene View in the DockManager (DockSide::Center, tabbed with Scene View)
- Shows "Press Play ▶ to preview the game" prompt when in editor mode
- Displays PLAYING/PAUSED status with FPS and entity count when in play mode

#### Play Mode System
- Added `Editor::EditorMode` enum with three states: `Editing`, `Playing`, `Paused`
- `Editor::isPlaying()` returns true for both Playing and Paused modes
- `Editor::getMode()` / `Editor::setMode()` for state management
- Play/Pause/Stop toolbar buttons (indices 5-7) now wired to mode switching:
  - Play ▶: enters Playing mode (green highlight)
  - Pause ⏸: toggles between Playing and Paused (amber highlight when paused)
  - Stop ■: returns to Editing mode
- Scene updates (physics, animation, rotation) only run when `EditorMode == Playing`
- Scene View panel shows "[PLAY MODE - Use Game View panel]" indicator when in play mode

#### Window Menu
- Added "Game View" to the Window menu panel list with proper panel ID mapping (`"GameView"`)
- Menu arrays increased from 6 to 8 capacity (`MAX_MENU_ITEMS`) to accommodate future panels

### Fixed
- **Dead code**: Removed unused `prevActiveTool` variable from `renderToolbar()`
- **Draw efficiency**: Play/Pause button backgrounds now set before the draw call, eliminating redundant second draw
- **Play state check**: Simplified `onUpdate` guard to a single clean expression

---

## [1.8.0-alpha] - 2026-07-16

### Added

#### Material Editor Panel
- New dockable "Material Editor" panel showing PBR material properties of the selected entity
- Registered alongside Inspector at DockSide::Right for easy access
- Shows "No entity selected" when nothing is selected (panel header still visible)
- Shows "No material" with guidance when selected entity has no MeshRenderer or material

#### Live Material Editing
- **Albedo color** — editable via `colorEdit3` RGB picker, applies in real-time
- **Roughness slider** — 0-1 range, updates PBR roughness property
- **Metallic slider** — 0-1 range, updates PBR metallic property
- **Emission color** — editable via `colorEdit3`
- **Alpha slider** — 0-1 range, auto-toggles transparency when < 1.0
- **Double-sided toggle** — checkbox for double-sided rendering
- **AO slider** — ambient occlusion intensity (0-1)
- **Texture info** — displays albedo texture file path when present
- **Shader info** — displays shader program ID
- All changes propagate immediately because `Material::bind()` → `applyProperties()` runs each frame

#### Window Menu
- Added "Material Editor" entry to the Window menu for panel visibility toggle

### Fixed
- **Null pointer dereference**: `m_scene->getECS()` was called before the null check in `renderMaterialEditor()`. Fixed by moving the ecs reference after the guard clause.
- **Dead code**: Removed no-op `if (mat->isDirty()) mat->setDirty(true)` block from renderMaterialEditor().
- **API alignment**: Used `shader->getID()` instead of non-existent `getName()`, and `texture->getFilePath()` instead of non-existent `getPath()`.
- **Linker error**: Added missing `build/Engine/UI/DockManager.o` to the linker command.

---

## [1.9.0-alpha] - 2026-07-16

### Added

#### Prefab System
- **PrefabComponent** — new component storing prefab metadata (path, name, ID, instantiation state, break-link flag)
- `Scene::savePrefab(filepath, entity)` — serializes any entity to a `.emberprefab` file using existing serialization helpers
- `Scene::instantiatePrefab(filepath)` — creates a new entity with all components from a `.emberprefab` file, preserving data via existing deserialization helpers
- Prefab files use the same text-based format as scene files, containing a single entity block
- PrefabComponent explicitly excluded from prefab template files (templates don't carry instance metadata)
- Scene save/load now properly round-trips PrefabComponent data via `serializePrefab()`/`deserializePrefab()`
- Space-safe serialization: string fields stored on separate newline-delimited lines (`PrefabPath`, `PrefabName`) matching the existing `Tag`/`TagName` pattern

#### Prefab Browser Panel
- New dockable "Prefab Browser" panel at DockSide::Bottom (tabbed with Asset Browser and Console)
- Scans the `prefabs/` directory for `.emberprefab` files
- Displays prefab names with click-to-instantiate functionality
- Shows helpful guidance when no prefabs exist
- Context menu indicator icon (placeholder for future menu actions)

#### Editor Menu Integration
- **File > Save Selected as Prefab** — saves the currently selected entity as a prefab template
- **GameObject > Instantiate Prefab...** — opens file dialog to load and instantiate a `.emberprefab` file
- **Window > Prefab Browser** — toggles the Prefab Browser panel visibility

### Fixed
- **Browser instantiation path bug**: `FileSystem::listFiles()` returns absolute paths, so prepending `"prefabs/"` created invalid paths. Fixed to use the full path directly.
- **Missing PrefabComponent deserialization**: Scene load now calls `deserializePrefab()` in the third pass, preserving prefab link data across save/load cycles.
- **Space-unsafe serialization**: `prefabPath` and `prefabName` (which can contain spaces) were written as space-delimited tokens. Fixed by using newline-delimited format.
- **MAX_MENU_ITEMS**: Increased from 8 to 10 to accommodate 9-item Window menu.
- **Forward declaration**: Added `parseFloats` forward declaration to resolve ordering dependency in ECS.cpp.

---

## [1.10.0-alpha] - 2026-07-16

### Added

#### Undo/Redo System
- **Snapshot-based undo/redo** using the existing scene serialization infrastructure
  - `beginActionGroup(label)` / `endActionGroup()` — guard any scene-modifying action to make it undoable
  - `undo()` — saves current state to redo stack, restores previous snapshot from undo stack
  - `redo()` — saves current state to undo stack, restores next snapshot from redo stack
  - Undo history capped at 100 entries, redo stack cleared on new actions
  - Snapshot data stored as serialized `.emberscene` text via a temp file
  - `serializeECS()` / `deserializeECS()` — serialize/restore full ECS state through `saveScene`/`loadScene`

#### Actions With Undo Support
- **Click-to-place textures** — wrapping entity creation with material assignment
- **Instantiate Prefab** (File menu and Prefab Browser) — wrapping entity creation with component deserialization
- **New Scene** — wrapping scene clear with history reset
- **Load Scene** — history cleared before loading

#### Keyboard Shortcuts
- **Ctrl+Z** — undo (detected in `Editor::render()` via Platform + EmberGUI input state)
- **Ctrl+Shift+Z** — redo

#### Menu & Toolbar Integration
- **Edit > Undo** and **Edit > Redo** menu items wired to undo/redo methods
- **Toolbar** undo/redo buttons rendered on the right side (text-based, click not yet wired)

### Fixed
- **const_cast removal**: `serializeECS()` was declared `const` but called non-const `saveScene()`. Fixed by removing the `const` qualifier.
- **History clearing**: New Scene and Load Scene now properly clear the undo/redo history to prevent stale snapshots.
- **Missing snapshot calls**: click-to-place texture, instantiate prefab (menu + browser), and new scene now use `beginActionGroup`/`endActionGroup`.

---

## [1.10.1-alpha] - 2026-07-16

### Fixed

#### New Scene Undo Wrapping
- Removed contradictory `beginActionGroup("New Scene")`/`clearHistory()`/`endActionGroup()` sequence from the File > New Scene handler. Now calls `clearHistory()` directly without creating a useless empty-scene snapshot in the undo stack.

#### Material Editor Undo Tracking
- Added `beginActionGroup()`/`endActionGroup()` guards around each interactive change in `renderMaterialEditor()`:
  - Albedo color (colorEdit3)
  - Roughness slider
  - Metallic slider
  - Emission color (colorEdit3)
  - Alpha slider
  - Double-sided toggle
  - AO slider
- Each property change is now individually undoable via Ctrl+Z.

#### Interactive Toolbar Undo/Redo Buttons
- Replaced static text-only undo/redo indicators with interactive clickable buttons
- Hover highlighting via `drawRectFilled`
- Visual dimming when `canUndo()`/`canRedo()` returns false
- Click handlers calling `undo()`/`redo()` directly

#### Status Bar Fix
- Fixed duplicate `entityCount` argument in `renderStatusBar()` snprintf — the second `%d` placeholder was receiving `entityCount` instead of `renderer.getWindowWidth()`, causing the window resolution display to show entity count instead of width.

---

## [1.11.0-alpha] - 2026-07-16

### Fixed (Critical Editor Overhaul)

#### GUI Lifecycle - Root Cause of All Editor Issues
- **CRITICAL**: `EmberGUI::newFrame()` was NEVER called — input state (mouse position, buttons, keys) was never updated, cursor never positioned, per-frame state never reset
- **CRITICAL**: `EmberGUI::endFrame()` was NEVER called — draw commands accumulated infinitely across frames
- **CRITICAL**: `EmberGUI::init()` was NEVER called — GUI system never formally initialized
- Added all three lifecycle calls to `Application::mainLoop()` and `Application::run()`
- Editor now reads input, processes widgets, renders, and clears each frame correctly

#### Mouse Input
- Fixed undefined behavior in `EmberGUI::newFrame()` — mouse position was read via `(int&)m_state.mousePos.x` reinterpret cast, causing UB. Changed to use temporary `int` variables with proper float conversion.

#### Keyboard Input
- Fixed `WM_CHAR` handler in `Platform::windowProc()` — was a no-op that received character codes but stored nothing. Now writes to `InputState::inputChar`.
- Added `getInputChar()` / `resetInputChar()` to Platform API
- Fixed `EmberGUI::inputText()` — was drawing the text field but never processing keyboard input
  - Now handles character input via `m_state.inputChar`
  - Handles backspace (keyPressed[8])
  - Handles Enter/Escape to unfocus
  - Draws blinking cursor when focused
  - Proper focus management: click to focus, click elsewhere to unfocus

#### Docking System
- Restructured `buildDefaultLayout()` — now creates a proper vertical split (main content + bottom strip) instead of only horizontal splits
- Bottom panels (Console, Asset Browser, Prefab Browser) now render in their own bottom strip instead of the viewport center
- Top panels (Profiler) routed to center area (sufficient for current usage)
- Added scissor testing (OpenGL `GL_SCISSOR_TEST`) in `renderNode()` to clip panel content within panel boundaries
  - Saves/restores previous scissor state
  - Properly handles Y-flip for OpenGL's bottom-left origin vs GUI's top-left origin
  - Prevents widget drawing from bleeding outside panel boundaries

#### Detailed Logging
- Added detailed logging to EmberGUI subsystems:
  - Mouse button press/release events
  - Key press events
  - Character input events
  - Draw command count per frame
- All logging at DEBUG level for non-intrusive operation

### Fixed
- Removed unnecessary `#include "Engine/Rendering/Renderer.h"` and `#include "Engine/Rendering/GL.h"` from EmberGUI.cpp (were added accidentally)
- Removed dead `topNode` allocation in `buildDefaultLayout()` that was created but never attached to the dock tree---

## [1.12.0-alpha] - 2026-07-16

### Fixed (Shader Compilation - Critical)

#### GLSL Sampler Assignment Bug
- **CRITICAL**: Fixed `cascadeShadowCalculation()` in the default PBR shader — assigned `sampler2D` to a local variable (`sampler2D shadowMap; if (cascadeIndex == 0) shadowMap = uShadowMap0;`), which is illegal in GLSL 330 core. GLSL requires all samplers to be `uniform` and forbids assignment to sampler variables.
- Changed function signature to accept `sampler2D shadowMap` as a parameter (valid in GLSL 330)
- Updated all call sites to pass the correct uniform sampler (`uShadowMap0`–`uShadowMap3`)
- Removed unused `int cascadeIndex` variable and assignments

#### Shader Compile Logging
- Increased error log buffer from 512 to 2048 characters for more detailed error messages
- Added shader source snippet printing (first 500 chars) on compilation failure for faster debugging
- Added `name` parameter to `Shader::compile()` — all 6 factory shaders now log identifiable names:
  - "Default Compiling shader..." / "Default Compiled successfully"
  - "UI Compiling shader..." / "UI Compiled successfully"  
  - "Basic Compiling shader..." / "Basic Compiled successfully"
  - "Debug Compiling shader..." / "Debug Compiled successfully"
  - "Depth Compiling shader..." / "Depth Compiled successfully"
  - "Skybox Compiling shader..." / "Skybox Compiled successfully"

### Shader Audit
- All 6 built-in shaders inspected for sampler violations:
  - `createDefaultShader()` — ✅ Fixed (was the only one with the bug)
  - `createUIShader()` — ✅ Correct (`uniform sampler2D uTexture;`)
  - `createSkyboxShader()` — ✅ Correct (`uniform samplerCube uSkybox;`)
  - `createBasicShader()` — ✅ No samplers
  - `createDebugShader()` — ✅ No samplers
  - `createDepthShader()` — ✅ No samplers---

## [1.13.0-alpha] - 2026-07-16

### Fixed (Text Rendering - Glyph Flipping)

#### CRITICAL: V Coordinates Flipped for OpenGL
- **Root cause**: `getGlyphUVs()` in Font.h computed V coordinates from the top of the font atlas pixel data, but OpenGL's V=0 is at the bottom of the texture. This caused text to render upside-down and from the wrong atlas region.
- **Fix**: V coordinates are now flipped: `vMin = 1.0 - top_of_glyph_ratio` (used for top vertices → higher V = top of texture), `vMax = 1.0 - bottom_of_glyph_ratio` (used for bottom vertices → lower V).
- Added detailed comment documenting the OpenGL UV convention and the pixel-to-UV mapping.

---

## [1.14.0-alpha] - 2026-07-16

### Fixed (Text Orientation - Critical)

#### WRONG V Flip Removed
- **Root cause**: The previous fix added a V flip (`vMin = 1.0 - ratio`) which was WRONG. `glTexImage2D` stores the first pixel row at the texture BOTTOM (V=0). The font atlas generates data with row 0 at the image TOP. The correct mapping is `V = (row * FONT_GLYPH_H) / FONT_TEX_H` — no flip needed.
- The V flip caused text to sample from wrong atlas rows (row 32+ instead of row 16-23 for 'A'), producing:
  - Upside-down text (wrong atlas region sampled)
  - Random/garbled characters (sampling from between glyph boundaries)
  - Characters in wrong apparent order (different glyphs at each position)
- **Fix**: Restored original `vMin = (row * FONT_GLYPH_H) / FONT_TEX_H` and `vMax = (row * FONT_GLYPH_H + (FONT_GLYPH_H - 1)) / FONT_TEX_H`.
- Detailed comment added explaining the OpenGL pixel storage convention.

#### Build Fixes
- Fixed missing semicolon in DockManager.cpp line 148 (`m_root->childB = std::move(bottomNode)` lacked `;`)
- Added DockManager.cpp to ENGINE_UI_SRC in Makefile
- Added DockManager compilation/link to build.bat

#### Debug Logging
- Added comprehensive debug logging to text rendering:
  - Font texture ID and dimensions logged once
  - Text strings with position and glyph count logged per text draw command
  - UV coordinates logged for first 5 glyphs (resets periodically)

---

## [1.15.0-alpha] - 2026-07-16

### Fixed (Uniform Warnings)

#### CRITICAL: Material PBR Uniform Name Mismatch
- **Root cause**: `Material::setAlbedo()/setMetallic()/setRoughness()` stored properties under unprefixed names (`"albedo"`, `"metallic"`, `"roughness"`), but the Default PBR shader declares them with 'u' prefix (`uAlbedo`, `uMetallic`, `uRoughness`). When `Material::applyProperties()` called `shader->setVec3("albedo", ...)`, `glGetUniformLocation("albedo")` returned -1, generating `Uniform 'albedo' not found` warnings.
- **Fix**: Changed all PBR property accessors to use the 'u' prefix consistently:
  - `Material.cpp` setters: `"albedo"`→`"uAlbedo"`, `"metallic"`→`"uMetallic"`, `"roughness"`→`"uRoughness"`
  - `Material.h` getters: `"albedo"`→`"uAlbedo"`, `"metallic"`→`"uMetallic"`, `"roughness"`→`"uRoughness"`
- `Renderer.cpp` already used the prefixed names consistently — no change needed.
- Eliminates 3 warnings per rendered entity per frame.

---

*Generated by EmberEngine development team*
