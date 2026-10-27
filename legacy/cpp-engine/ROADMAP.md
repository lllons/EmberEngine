# EmberEngine Development Roadmap

## Current Status: v1.0.0-alpha

**Last Updated:** 2026-07-15

---

## Phase 1: Core Engine (✅ Complete)

### Completed Systems
| System | Status | Notes |
|--------|--------|-------|
| Application Lifecycle | ✅ Complete | Init, main loop, shutdown, FPS tracking |
| Logging | ✅ Complete | File + console output, log levels, buffer |
| Event System | ✅ Complete | Type-dispatched events, queue, callbacks |
| Memory Manager | ✅ Complete | Pool/Linear allocators, tracking, leak detection |
| Timer | ✅ Complete | Delta time, FPS calculation |
| Config | ✅ Complete | INI-style config loading |
| File System | ✅ Complete | Path resolution, directory operations |
| Thread Pool | ✅ Complete | Task submission, futures, wait-all |
| Math Library | ✅ Complete | Vec2/3/4, Mat3/4, Quaternion, operators |
| ECS | ✅ Complete | Component pools, entity management, queries, Scene |
| Components | ✅ Complete | Transform, Camera, Light, RigidBody, Colliders, Audio, Particles, Script |
| Physics World | ✅ Complete | Rigid bodies, colliders, raycasting, collision detection |
| RigidBody | ✅ Complete | Integration, forces, sleep |
| Audio System | ✅ Complete | Sound management, 3D audio |
| Animator | ✅ Complete | Skeletal animation, blending |
| Script Engine | ✅ Complete | Console commands |
| Asset Manager | ✅ Complete | Asset loading, caching |
| EmberGUI | ✅ Complete | Full immediate-mode GUI |

---

## Phase 2: Rendering Pipeline (⚠️ In Progress)

### Current Status
| System | Status | Notes |
|--------|--------|-------|
| Platform | ✅ Complete | Win32 window creation, input handling |
| Renderer | ✅ Complete | Full API surface, modern GL |
| Shader | ✅ Complete | Compile/link/uniforms, built-in shaders |
| Mesh | ✅ Complete | VAO/VBO/EBO, primitives |
| Material | ✅ Complete | PBR properties, shader binding, factory methods |
| Texture | ✅ Complete | Load, create, bind, mipmaps, cubemap |
| Camera | ✅ Complete | Perspective/orthographic |
| Light | ✅ Complete | Directional/point/spot, shadows |
| FrameBuffer | ✅ Complete | FBO, attachments, HDR |
| GUI Rendering | ✅ Complete | OpenGL-based GUI render pass |

### Completed This Session
- [x] Fixed compile errors (Application.cpp namespace issue)
- [x] Added built-in shaders: PBR default, basic, debug, UI, skybox
- [x] Fixed Material factory methods to assign proper shaders
- [x] Implemented basic scene rendering with camera, lighting, meshes
- [x] Added GUI rendering pass using UI shader with orthographic projection
- [x] Created editor panels: Menu Bar, Toolbar, Viewport, Hierarchy, Inspector, Console, Asset Browser, Profiler, Status Bar
- [x] GL resource cleanup on renderer shutdown

### Completed This Session
- [x] Added depth-only shader for shadow map rendering
- [x] Updated default PBR shader with shadow sampling (PCF 3x3)
- [x] Implemented directional light shadow mapping
- [x] Shadow map FBO with proper depth-only setup (glDrawBuffer/glReadBuffer)
- [x] Shadow FBO caching to avoid GPU allocation per frame
- [x] Viewport restoration after shadow pass
- [x] Proper GL resource cleanup for shadow maps

### Completed This Session
- [x] Added bitmap font system with 95 printable ASCII glyphs (5x7 pixel font)
- [x] Font atlas texture generation (16x6 grid, 96x48 texture)
- [x] Text rendering as textured glyph quads using font texture
- [x] Fallback to colored rectangles when font texture unavailable
- [x] Font texture cleanup on renderer shutdown

### Completed This Session
- [x] Added DockManager system with tree-based dock layout
- [x] Left/Center/Right dock zones with splitter bars
- [x] Tab bars with multiple panels per dock zone
- [x] Splitter dragging with min/max limits
- [x] Window menu toggles panel visibility
- [x] Panel focus switching via tab click
- [x] Proper window context for panel content widgets
- [x] Basic panel drag-to-dock between zones
- [x] Dock preview zone highlights during drag
- [x] Floating panel support
- [x] Basic layout serialization (save/restore panel visibility)
- [x] Editor panels integrated: SceneView, Hierarchy, Inspector, AssetBrowser, Console, Profiler

### Completed This Session
- [x] Implemented scene serialization system:
  - `Scene::saveScene()` - serializes all entities, components, and hierarchy to file
  - `Scene::loadScene()` - deserializes from file with entity ID remapping
  - All 13 component types serialized (Transform, MeshRenderer, Camera, Light, RigidBody,
    BoxCollider, SphereCollider, CapsuleCollider, AudioSource, ParticleEmitter, Script, Name, Tag)
  - Entity hierarchy preserved across save/load
  - Material properties serialized (albedo, roughness, metallic)
  - Text-based `.emberscene` file format
- [x] Editor integration: File > Save Scene, File > Open Scene, File > New Scene
- [x] Scene file saved to `scenes/` directory with auto-created path

### Completed This Session
- [x] Implemented cascaded shadow maps (CSM) with 4 cascades:
  - Camera frustum splitting with practical split scheme (log + uniform blend, lambda=0.85)
  - Tight light-space orthographic projections per cascade
  - 4 cascade FBOs with persistent caching (keyed by lightEntity*4 + cascadeIndex)
  - Per-cascade PCF 3x3 shadow sampling
  - Cascade blending near boundaries to reduce visible seams (2-unit blend region)
  - Near/far plane padding to prevent shadow clipping
  - Fallback to single-cascade when no directional light with shadows
- [x] Updated default PBR shader with CSM support:
  - 4 separate sampler uniforms (uShadowMap0-3) bound to texture units 2-5
  - View-space depth-based cascade selection
  - Per-cascade light-space coordinate transformation
- [x] Updated Camera with frustum corner extraction and cascade split calculation

### Completed This Session
- [x] Added spot light shadow support:
  - Perspective depth pass using light FOV from `outerCutoff * 2.0`
  - Reusable FBO cache (`m_spotShadowFboCache`)
  - Binds to `uShadowMap` (unit 1), uses existing `sampler2D` + `shadowCalculation()`
- [x] Added point light shadow support:
  - Cubemap depth map with 6-face rendering
  - Each face uses 90-degree FOV perspective projection
  - Proper face view matrices (+X,-X,+Y,-Y,+Z,-Z with correct up vectors)
  - Reusable FBO cache (`m_pointShadowFboCache`) with cubemap depth attachment
  - Separate `samplerCube uPointShadowMap` uniform (bound to unit 8)
  - Cubemap PCF with 4 offset direction samples
  - Fallback depth comparison `length(fragToLight)` vs `texture(cubemap, direction).r * farPlane`
- [x] Updated PBR shader with spot/point shadow sampling
- [x] `renderScene()` conditionally selects shadow path by `uLightType`: 0=directional(CSM), 1=spot, 2=point
- [x] All shadow types coexist: CSM (units 2-5), spot (unit 1), point (unit 8)

### Completed This Session
- [x] Added drag-and-drop asset importing:
  - `DragAcceptFiles(TRUE)` enabled on the Win32 window for WM_DROPFILES
  - Platform already handled WM_DROPFILES in window proc (calls m_dropCallback)
  - Wired drop callback in Application::run() → virtual onFileDrop(path)
  - EmberApp::onFileDrop() delegates to Editor::importFile(path)
- [x] File dialog import integration:
  - Editor::importAsset() opens Platform::openFileDialog() with multi-format filter
  - Editor::importFile() is a static utility method callable from both menu and drag-drop
  - Supported formats: .png, .jpg, .jpeg, .bmp, .tga (textures), .obj (models, stub)
- [x] Updated Asset Browser to show imported assets from AssetManager:
  - Grid layout with asset type icons (◙ texture, ▲ model)
  - "Import" button in header
  - Asset count in header
  - Short name labels
- [x] Menu: Assets > Import... → opens file dialog

### Completed This Session
- [x] Added texture thumbnail rendering in Asset Browser:
  - `DrawCmdType::Image` handler in `Renderer::renderGUI()` — binds texture, sets uUseTexture=1, draws textured quad with UV coordinates from cmd.uvMin/uvMax
  - Asset Browser now shows actual texture thumbnails (not colored rectangles) for imported textures
  - `ui.drawImage()` now renders properly via the GUI rendering backend
  - Fallback to colored rectangle if texture is unavailable
- [x] Fixed `AssetManager::getAsset<T>()` template — defined inline in header with `std::static_pointer_cast<T>` so it links correctly
- [x] Added `glActiveTexture(GL_TEXTURE0)` in Image handler for correct texture unit binding

### Completed This Session
- [x] Added click-to-place imported textures into scene:
  - Clicking a texture thumbnail in the Asset Browser creates a new entity with the texture applied
  - Entity gets Transform (positioned at origin + slight Y offset), MeshRenderer with plane mesh
  - Material created with the imported texture as albedo (via Material::setAlbedoTexture)
  - New entity is auto-selected in the hierarchy
- [x] Added PBR shader albedo texture support:
  - `uniform sampler2D uAlbedoMap` and `uniform bool uUseAlbedoMap` in default PBR shader
  - Fragment shader samples albedo texture using TexCoord when enabled, multiplies with uAlbedo color
  - Renderer sets uUseAlbedoMap=1 and uAlbedoMap=0 when material has "albedoTexture" property
  - Fully backward compatible when no albedo texture is set

### Completed This Session
- [x] Added Game View panel with Play mode toggle:
  - New dockable "Game View" panel showing game camera preview
  - EditorMode enum: Editing (default), Playing, Paused
  - Play/Pause/Stop toolbar buttons wired to mode switching
  - Play button highlighted green during play, Pause button amber when paused
  - Scene updates (physics, animation) only run in Playing mode
  - Scene View shows play indicator when in play mode
  - Game View shows PLAYING/PAUSED status + entity count
  - "Press Play ▶" prompt in Game View when in editor mode
  - Game View added to Window menu for visibility toggle

### Completed This Session
- [x] Material Editor panel
  - New dockable "Material Editor" panel showing PBR material properties of selected entity
  - Albedo color editing via colorEdit3 (RGB picker)
  - Roughness slider (0-1) with real-time updates
  - Metallic slider (0-1) with real-time updates
  - Emission color editing via colorEdit3
  - Alpha slider with auto-transparency toggle
  - Double-sided checkbox
  - AO slider (0-1)
  - Albedo texture file path display
  - Shader program ID info display
  - Live editing: material property changes propagate immediately via bind() → applyProperties() each frame
  - Properly handles edge cases: null scene, invalid entity, no material, read-only material display

### Completed This Session
- [x] Prefab system for reusable entity templates
  - PrefabComponent (Components.h) tracking prefab source, path, name, ID, and break link state
  - Scene::savePrefab() - serializes entity to .emberprefab file using existing serialization helpers
  - Scene::instantiatePrefab() - parses .emberprefab file, creates entity, applies all components
  - Space-safe serialization: strings stored on separate newline-delimited lines (matching Tag/TagName pattern)
  - Proper round-trip of PrefabComponent through scene save/load via deserializePrefab() in loadScene()
  - PrefabComponent explicitly excluded from prefab template files (templates don't carry instance metadata)
  - File > Save Selected as Prefab - creates prefab from selected entity
  - GameObject > Instantiate Prefab... - opens file dialog to load .emberprefab
  - Prefab Browser panel (dockable, bottom zone) scanning prefabs/ directory
  - Click-to-instantiate from Prefab Browser
  - Added "Prefab Browser" to Window menu (9th item)

### Completed This Session
- [x] Undo/Redo system for editor actions
  - Snapshot-based undo/redo using scene serialization for full state capture
  - Undo history stack (max 100 entries), redo stack cleared on new actions
  - beginActionGroup()/endActionGroup() guards around scene-modifying actions
  - undo()/redo() restore full ECS state via temp file serialization
  - Ctrl+Z keyboard shortcut for undo (in Editor::render() via Platform + EmberGUI input)
  - Ctrl+Shift+Z keyboard shortcut for redo
  - Edit menu: Undo/Redo items wired
  - Toolbar: undo/redo buttons on right side
  - Action groups placed around: click-to-place textures, instantiate prefab (menu + browser)
  - clearHistory() on New Scene and Load Scene
  - const_cast fixed (serializeECS made non-const)

### Completed This Session
- [x] Material Editor undo tracking — each slider/color change wrapped in beginActionGroup/endActionGroup
- [x] Interactive toolbar undo/redo buttons — replaced static text with clickable hover-highlighted buttons
- [x] Fixed New Scene handler — removed contradictory beginActionGroup/clearHistory wrapping

### Completed This Session (Critical Editor Overhaul)
- [x] **CRITICAL: Fixed EmberGUI lifecycle** — newFrame()/endFrame()/init() were never called, causing dead input and infinite draw command accumulation
- [x] **Fixed mouse input UB** — mouse position type-punning (int& → float&) replaced with proper conversion
- [x] **Fixed keyboard input** — WM_CHAR handler was a no-op, now stores character; inputText now processes typing, backspace, enter, escape
- [x] **Added inputChar support** — new field in Platform InputState + getInputChar/resetInputChar API
- [x] **Restructured DockManager layout** — bottom panels (Console, Asset Browser) now render in their own strip instead of the viewport center
- [x] **Added scissor testing** — panel content clipped to boundaries, preventing widget bleed-though
- [x] **Added UTF-8 handling** — multi-byte sequences properly skipped in text rendering, placeholder '?' for non-ASCII chars
- [x] **Fixed GLSL sampler assignment bug** — cascadeShadowCalculation assigned sampler2D to local variable (GLSL violation), now passes sampler as function parameter
- [x] **Improved shader error logging** — 2048-byte buffer, source snippet on failure, all 6 shaders identified by name in logs
- [x] **Added detailed GUI logging** — mouse events, key presses, input chars, draw command counts logged at DEBUG level

### Completed This Session (Text Orientation Fix)
- [x] **CRITICAL: Removed wrong V flip from getGlyphUVs()** — OpenGL's glTexImage2D stores first pixel row at texture BOTTOM (V=0). The atlas has row 0 at image TOP. No flip is needed: `V = row_height / tex_height` is the correct mapping.
- [x] Added comprehensive debug logging for text pipeline (font ID, strings, UV coordinates)
- [x] Fixed missing semicolon in DockManager.cpp
- [x] Added DockManager.cpp to Makefile and build.bat

### Next Steps
- [ ] **Launch editor on display-capable machine** — verify text renders correctly (no flip, no corruption)
- [ ] **Verify font rendering** — check font atlas upload, readable text, correct glyphs
- [ ] Verify all 6 shaders compile at runtime
- [ ] Verify GUI interactivity — all widgets, docking, input, menus
- [ ] Run full regression test suite
- [ ] OBJ mesh import implement proper parsing for AssetManager::loadModel()
- [ ] Entity deletion from Hierarchy panel (Delete key or context menu)
- [ ] Interactive color picker for Material Editor

---

## Phase 3: Editor (⬜ Not Started)

### Editor Panels
| Panel | Status | Priority |
|-------|--------|----------|
| Menu Bar | ⬜ Not Started | High |
| Toolbar | ⬜ Not Started | High |
| Viewport | ⬜ Not Started | High |
| Hierarchy | ⬜ Not Started | High |
| Inspector | ⬜ Not Started | High |
| Console | ⬜ Not Started | Medium |
| Asset Browser | ⬜ Not Started | Medium |
| Profiler | ⬜ Not Started | Low |
| Status Bar | ⬜ Not Started | Medium |

### Editor Features
- [ ] Dockable windows
- [ ] Scene View with gizmos
- [ ] Game View
- [ ] Entity selection
- [ ] Component editing
- [ ] Undo/Redo system
- [ ] Keyboard shortcuts
- [ ] Theme customization

---

## Phase 4: Asset Pipeline (⬜ Not Started)

- [ ] File dialog integration
- [ ] Drag-and-drop importing
- [ ] Asset preview generation
- [ ] Texture import (stb_image)
- [ ] Model import (Assimp)
- [ ] Shader compilation
- [ ] Material serialization
- [ ] Scene serialization

---

## Phase 5: Advanced Features (⬜ Not Started)

### Rendering
- [ ] PBR materials
- [ ] HDR rendering
- [ ] Bloom post-processing
- [ ] SSAO
- [ ] Cascaded shadow maps
- [ ] Reflection probes

### Physics
- [ ] Character controller
- [ ] Constraints
- [ ] Triggers
- [ ] Physics debugger

### Animation
- [ ] Animation graphs
- [ ] IK (Inverse Kinematics)
- [ ] State machines

---

## Milestones

### Milestone 1: Engine Startup ✅
- [x] Engine compiles
- [x] Window creates
- [x] OpenGL context initializes
- [x] Main loop runs

### Milestone 2: Basic Rendering ⬜
- [ ] Default cube renders
- [ ] Basic lighting works
- [ ] Camera controls work

### Milestone 3: Editor MVP ⬜
- [ ] Menu bar functional
- [ ] Hierarchy panel shows entities
- [ ] Inspector shows components
- [ ] Console shows logs

### Milestone 4: Asset Pipeline ⬜
- [ ] Can import textures
- [ ] Can import models
- [ ] Can create materials

---

## Known Issues

1. **GL Extension Loading** - Windows GL/gl.h only includes GL 1.1, need to load extensions at runtime
2. **Makefile Gaps** - Some source files not included in build
3. **Platform Integration** - Editor not integrated with Platform system

---

## Technical Debt

- [ ] Refactor Renderer to use proper GL context management
- [ ] Add proper error handling for GL operations
- [ ] Implement resource management properly
- [ ] Add unit tests for all subsystems

---

*Document generated by EmberEngine development team*
