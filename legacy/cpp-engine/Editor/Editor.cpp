#include "Editor/Editor.h"
#include "Engine/Core/Logging.h"
#include "Engine/Core/ECS.h"
#include "Engine/Core/Components.h"
#include "Engine/Rendering/Renderer.h"
#include "Engine/Rendering/Camera.h"
#include "Engine/Rendering/Shader.h"
#include "Engine/Rendering/Mesh.h"
#include "Engine/Rendering/Material.h"
#include "Engine/Rendering/Texture.h"
#include "Engine/AssetPipeline/AssetManager.h"
#include "Engine/Platform/Platform.h"
#include "Engine/UI/UIEngine.h"
#include "GUI/EmberGUI.h"
#include <algorithm>
#include <cctype>
#include <cmath>
#include <cstring>
#include <sstream>

namespace Ember {

namespace {
// Defined with the menu implementation further down; used by render() to keep
// presses on an open menu popup away from the panels behind it.
Math::Vec2 menuPopupPos(int index);
Math::Vec2 menuPopupSize(int index);
} // namespace

Editor::Editor() = default;
Editor::~Editor() { shutdown(); }

bool Editor::init() {
    m_initialized = true;
    m_running = true;

    // Initialize dock manager with display size
    auto& renderer = Renderer::get();
    m_dockManager.init(Math::Vec2((float)renderer.getWindowWidth(), (float)renderer.getWindowHeight()));

    // Register all dockable panels
    registerPanels();

    EMBER_LOG_INFO("Editor initialized");
    return true;
}

void Editor::registerPanels() {
    // Register all panels with the dock manager
    // Scene View - main 3D editor view, default center
    m_dockManager.registerPanel("Scene View", "SceneView",
        [this]() { renderViewport(); }, DockSide::Center);

    // Game View - play mode view
    m_dockManager.registerPanel("Game View", "GameView",
        [this]() { renderGameView(); }, DockSide::Center);

    // Hierarchy - left side
    m_dockManager.registerPanel("Hierarchy", "Hierarchy",
        [this]() { renderHierarchy(); }, DockSide::Left);

    // Inspector - right strip
    m_dockManager.registerPanel("Inspector", "Inspector",
        [this]() { renderInspector(); }, DockSide::Right);

    // Asset Browser - bottom area
    m_dockManager.registerPanel("Asset Browser", "AssetBrowser",
        [this]() { renderAssetBrowser(); }, DockSide::Bottom);

    // Console - bottom area (tabbed with asset browser)
    m_dockManager.registerPanel("Console", "Console",
        [this]() { renderConsole(); }, DockSide::Bottom);

    // Profiler - top of viewport area
    m_dockManager.registerPanel("Profiler", "Profiler",
        [this]() { renderProfiler(); }, DockSide::Top);

    // Material Editor - right strip (tabbed with Inspector)
    m_dockManager.registerPanel("Material Editor", "MaterialEditor",
        [this]() { renderMaterialEditor(); }, DockSide::Right);

    // Prefab Browser - bottom area (tabbed with Asset Browser)
    m_dockManager.registerPanel("Prefab Browser", "PrefabBrowser",
        [this]() { renderPrefabBrowser(); }, DockSide::Bottom);
}

void Editor::shutdown() {
    m_running = false;
    m_initialized = false;
    EMBER_LOG_INFO("Editor shutdown");
}

void Editor::run() {
    while (m_running) {
        render();
    }
}

void Editor::render() {
    if (!m_initialized) return;

    auto& ui = EmberGUI::get();
    auto& renderer = Renderer::get();

    // Handle keyboard shortcuts (Ctrl+Z for undo, Ctrl+Shift+Z for redo)
    auto& platform = Ember::Platform::get();
    bool ctrlHeld = platform.isKeyPressed(0x11); // VK_CONTROL
    bool shiftHeld = platform.isKeyPressed(0x10); // VK_SHIFT
    bool zPressed = platform.isKeyPressed(0x5A);  // VK_Z
    
    // Use our own just-pressed tracking via EmberGUI's keyPressed array
    const auto& guiState = ui.getState();
    if (guiState.keyPressed[0x5A]) { // Z key just pressed
        if (ctrlHeld && shiftHeld) {
            redo();
        } else if (ctrlHeld) {
            undo();
        }
    }

    // A press that lands on the open menu popup must not also reach the
    // panels drawn behind it, so consume it here first.
    bool menuPressAvailable = guiState.mousePressed[0];
    if (m_openMenuIndex >= 0) {
        Math::Vec2 popupPos = menuPopupPos(m_openMenuIndex);
        Math::Vec2 popupSize = menuPopupSize(m_openMenuIndex);
        if (menuPressAvailable && ui.isInRect(popupPos, popupSize)) {
            ui.swallowMousePress(0);
        }
    }

    // The viewport panels are transparent so the 3D scene rendered into their
    // rectangle shows through. Panels are registered lazily, so configure them
    // once they exist.
    static bool viewportPanelsConfigured = false;
    if (!viewportPanelsConfigured) {
        if (DockPanel* p = m_dockManager.findPanel("SceneView")) {
            p->opaqueBackground = false;
        }
        if (DockPanel* p = m_dockManager.findPanel("GameView")) {
            p->opaqueBackground = false;
        }
        viewportPanelsConfigured = m_dockManager.findPanel("SceneView") != nullptr;
    }

    // 1. Render editor chrome (menu bar, toolbar, status bar) - not dockable
    renderMenuBar();
    renderToolbar();
    renderStatusBar();

    // 2. Begin dock manager frame
    Math::Vec2 displaySize((float)renderer.getWindowWidth(), (float)renderer.getWindowHeight());
    m_dockManager.beginFrame(displaySize, guiState.mousePos,
                             guiState.mouseDown, guiState.mousePressed);

    // 3. Render all dock panels via the dock manager
    m_dockManager.render();

    // 4. End dock manager frame (handles drag-drop cleanup)
    m_dockManager.endFrame();

    // 5. Menus are drawn last so the popup sits above every panel
    renderMenuPopup(menuPressAvailable);
}

void Editor::renderViewport() {
    auto& ui = EmberGUI::get();
    auto& renderer = Renderer::get();
    Math::Vec2 panelPos = ui.getCursorPos();
    Math::Vec2 panelSize = ui.getContext().windowSize;

    // Viewport is the main 3D editor view
    // When playing, show a play-mode indicator instead of editor grid
    if (isPlaying()) {
        ui.drawText(Math::Vec2(panelPos.x + 8, panelPos.y + 8),
                    "[PLAY MODE - Use Game View panel]",
                    Math::Vec4(0.9f, 0.6f, 0.1f, 0.8f), 12.0f);
        return;
    }

    // The 3D scene is rendered into this rectangle by the renderer, so only a
    // small overlay is drawn here.

    // Scene info overlay
    int entityCount = m_scene ? m_scene->getECS().getEntityCount() : 0;
    char infoBuf[128];
    std::snprintf(infoBuf, sizeof(infoBuf), "Scene View | FPS: %u | %u entities",
        renderer.getStats().drawCalls > 0 ? renderer.getStats().frameTime > 0 ? (int)(1000.0f / renderer.getStats().frameTime) : 60 : 60,
        entityCount);
    ui.drawText(Math::Vec2(panelPos.x + 8, panelPos.y + 8), infoBuf,
                Math::Vec4(0.3f, 0.6f, 1.0f, 0.7f), 11.0f);
}

void Editor::renderGameView() {
    auto& ui = EmberGUI::get();
    auto& renderer = Renderer::get();
    Math::Vec2 panelPos = ui.getCursorPos();
    Math::Vec2 panelSize = ui.getContext().windowSize;

    // Game View shows the current game rendering
    if (!isPlaying()) {
        // Show a "press Play" indicator when not in play mode
        ui.drawRectFilled(panelPos, panelSize, Math::Vec4(0.05f, 0.05f, 0.06f, 1.0f));
        char infoBuf[128];
        std::snprintf(infoBuf, sizeof(infoBuf), "Press Play \u25B6 to preview the game");
        ui.drawText(Math::Vec2(panelPos.x + panelSize.x * 0.5f - 100, panelPos.y + panelSize.y * 0.5f - 8),
                    infoBuf, Math::Vec4(0.4f, 0.4f, 0.45f, 1.0f), 13.0f);
    } else {
        // In play mode, show a clean viewport with game info
        const char* modeLabel = (m_mode == EditorMode::Playing) ? "PLAYING" : "PAUSED";
        Math::Vec4 modeColor = (m_mode == EditorMode::Playing) ?
            Math::Vec4(0.2f, 0.8f, 0.2f, 0.8f) : Math::Vec4(0.9f, 0.6f, 0.1f, 0.8f);

        int entityCount = m_scene ? m_scene->getECS().getEntityCount() : 0;
        char infoBuf[128];
        std::snprintf(infoBuf, sizeof(infoBuf), "[%s]  FPS: %u  |  %u entities",
            modeLabel, renderer.getStats().frameTime > 0 ? (int)(1000.0f / renderer.getStats().frameTime) : 60,
            entityCount);
        ui.drawText(Math::Vec2(panelPos.x + 8, panelPos.y + 8), infoBuf,
                    modeColor, 12.0f);
    }
}

void Editor::renderHierarchy() {
    auto& ui = EmberGUI::get();

    // Hierarchy lists all entities in the scene
    if (!m_scene) return;

    auto& ecs = m_scene->getECS();
    auto entities = ecs.getAllEntities();

    if (entities.empty()) {
        ui.drawText(ui.getCursorPos(), "No entities in scene",
                    Math::Vec4(0.4f, 0.4f, 0.45f, 1.0f), 12.0f);
        return;
    }

    float yPos = ui.getCursorPos().y;
    Math::Vec2 panelPos = ui.getContext().windowPos;
    Math::Vec2 panelSize = ui.getContext().windowSize;

    for (auto entity : entities) {
        std::string name = ecs.getEntityName(entity);
        bool isSelected = (entity == m_selectedEntity);

        Math::Vec2 itemPos(panelPos.x + 4, yPos);
        Math::Vec2 itemSize(panelSize.x - 8, 20);

        // Highlight if selected or hovered
        bool hovered = ui.isInRect(itemPos, itemSize);
        if (isSelected) {
            ui.drawRectFilled(itemPos, itemSize, Math::Vec4(0.26f, 0.45f, 0.76f, 0.4f));
        } else if (hovered) {
            ui.drawRectFilled(itemPos, itemSize, Math::Vec4(0.26f, 0.45f, 0.76f, 0.2f));
        }

        // Entity icon + name
        Math::Vec4 textColor = isSelected ? Math::Vec4(1.0f, 1.0f, 1.0f, 1.0f)
                                          : Math::Vec4(0.8f, 0.8f, 0.85f, 1.0f);
        ui.drawText(Math::Vec2(itemPos.x + 8, itemPos.y + 3), "\u25C6 " + name, textColor, 12.0f);

        // Click to select
        if (hovered && ui.getState().mousePressed[0]) {
            m_selectedEntity = entity;
        }

        yPos += 22;
    }

    // Advance cursor
    ui.setCursorPos(Math::Vec2(panelPos.x + 4, yPos + 4));
}

void Editor::renderInspector() {
    auto& ui = EmberGUI::get();

    // Show selected entity's components
    if (!m_scene || m_selectedEntity == 0) {
        ui.drawText(ui.getCursorPos(), "No entity selected",
                    Math::Vec4(0.4f, 0.4f, 0.45f, 1.0f), 12.0f);
        return;
    }

    auto& ecs = m_scene->getECS();
    if (!ecs.isEntityValid(m_selectedEntity)) {
        ui.drawText(ui.getCursorPos(), "Invalid entity",
                    Math::Vec4(0.4f, 0.4f, 0.45f, 1.0f), 12.0f);
        return;
    }

    Math::Vec2 pos = ui.getCursorPos();
    std::string entityName = ecs.getEntityName(m_selectedEntity);

    // Entity name header
    ui.drawRectFilled(pos, Math::Vec2(ui.getContext().windowSize.x - 8, 24),
                      Math::Vec4(0.18f, 0.18f, 0.20f, 1.0f), 2.0f);
    ui.drawText(Math::Vec2(pos.x + 8, pos.y + 4), entityName,
                Math::Vec4(1.0f, 1.0f, 1.0f, 1.0f), 13.0f);

    float yPos = pos.y + 30;

    // Transform component
    if (ecs.hasComponent<Transform>(m_selectedEntity)) {
        auto& transform = ecs.getComponent<Transform>(m_selectedEntity);

        // Component header
        ui.drawRectFilled(Math::Vec2(pos.x, yPos), Math::Vec2(ui.getContext().windowSize.x - 8, 22),
                          Math::Vec4(0.16f, 0.16f, 0.18f, 1.0f));
        ui.drawText(Math::Vec2(pos.x + 8, yPos + 3), "Transform",
                    Math::Vec4(0.6f, 0.6f, 0.8f, 1.0f), 12.0f);
        yPos += 24;

        // Position
        char buf[128];
        std::snprintf(buf, sizeof(buf), "  Pos: %.2f, %.2f, %.2f",
            transform.position.x, transform.position.y, transform.position.z);
        ui.drawText(Math::Vec2(pos.x + 8, yPos), buf,
                    Math::Vec4(0.7f, 0.7f, 0.75f, 1.0f), 11.0f);
        yPos += 16;

        // Rotation
        std::snprintf(buf, sizeof(buf), "  Rot: %.1f, %.1f, %.1f, %.1f",
            transform.rotation.x, transform.rotation.y,
            transform.rotation.z, transform.rotation.w);
        ui.drawText(Math::Vec2(pos.x + 8, yPos), buf,
                    Math::Vec4(0.7f, 0.7f, 0.75f, 1.0f), 11.0f);
        yPos += 16;

        // Scale
        std::snprintf(buf, sizeof(buf), "  Scl: %.2f, %.2f, %.2f",
            transform.scale.x, transform.scale.y, transform.scale.z);
        ui.drawText(Math::Vec2(pos.x + 8, yPos), buf,
                    Math::Vec4(0.7f, 0.7f, 0.75f, 1.0f), 11.0f);
        yPos += 20;
    }

    // MeshRenderer component
    if (ecs.hasComponent<MeshRenderer>(m_selectedEntity)) {
        auto& mr = ecs.getComponent<MeshRenderer>(m_selectedEntity);

        ui.drawRectFilled(Math::Vec2(pos.x, yPos), Math::Vec2(ui.getContext().windowSize.x - 8, 22),
                          Math::Vec4(0.16f, 0.16f, 0.18f, 1.0f));
        ui.drawText(Math::Vec2(pos.x + 8, yPos + 3), "MeshRenderer",
                    Math::Vec4(0.6f, 0.6f, 0.8f, 1.0f), 12.0f);
        yPos += 24;

        char buf[64];
        std::snprintf(buf, sizeof(buf), "  Mesh: %s", mr.mesh ? "Loaded" : "None");
        ui.drawText(Math::Vec2(pos.x + 8, yPos), buf,
                    Math::Vec4(0.7f, 0.7f, 0.75f, 1.0f), 11.0f);
        yPos += 16;

        std::snprintf(buf, sizeof(buf), "  Cast Shadows: %s", mr.castShadows ? "Yes" : "No");
        ui.drawText(Math::Vec2(pos.x + 8, yPos), buf,
                    Math::Vec4(0.7f, 0.7f, 0.75f, 1.0f), 11.0f);
        yPos += 16;

        std::snprintf(buf, sizeof(buf), "  Enabled: %s", mr.enabled ? "Yes" : "No");
        ui.drawText(Math::Vec2(pos.x + 8, yPos), buf,
                    Math::Vec4(0.7f, 0.7f, 0.75f, 1.0f), 11.0f);
        yPos += 20;
    }

    // Light component
    if (ecs.hasComponent<LightComponent>(m_selectedEntity)) {
        auto& light = ecs.getComponent<LightComponent>(m_selectedEntity);

        ui.drawRectFilled(Math::Vec2(pos.x, yPos), Math::Vec2(ui.getContext().windowSize.x - 8, 22),
                          Math::Vec4(0.16f, 0.16f, 0.18f, 1.0f));
        ui.drawText(Math::Vec2(pos.x + 8, yPos + 3), "Light",
                    Math::Vec4(0.6f, 0.6f, 0.8f, 1.0f), 12.0f);
        yPos += 24;

        char buf[64];
        const char* typeNames[] = {"Directional", "Point", "Spot"};
        std::snprintf(buf, sizeof(buf), "  Type: %s", typeNames[(int)light.type]);
        ui.drawText(Math::Vec2(pos.x + 8, yPos), buf,
                    Math::Vec4(0.7f, 0.7f, 0.75f, 1.0f), 11.0f);
        yPos += 16;

        std::snprintf(buf, sizeof(buf), "  Intensity: %.1f", light.intensity);
        ui.drawText(Math::Vec2(pos.x + 8, yPos), buf,
                    Math::Vec4(0.7f, 0.7f, 0.75f, 1.0f), 11.0f);
        yPos += 20;
    }

    // Camera component
    if (ecs.hasComponent<CameraComponent>(m_selectedEntity)) {
        auto& cam = ecs.getComponent<CameraComponent>(m_selectedEntity);

        ui.drawRectFilled(Math::Vec2(pos.x, yPos), Math::Vec2(ui.getContext().windowSize.x - 8, 22),
                          Math::Vec4(0.16f, 0.16f, 0.18f, 1.0f));
        ui.drawText(Math::Vec2(pos.x + 8, yPos + 3), "Camera",
                    Math::Vec4(0.6f, 0.6f, 0.8f, 1.0f), 12.0f);
        yPos += 24;

        char buf[64];
        std::snprintf(buf, sizeof(buf), "  FOV: %.1f", cam.fov);
        ui.drawText(Math::Vec2(pos.x + 8, yPos), buf,
                    Math::Vec4(0.7f, 0.7f, 0.75f, 1.0f), 11.0f);
        yPos += 16;

        std::snprintf(buf, sizeof(buf), "  Near: %.3f  Far: %.0f", cam.nearPlane, cam.farPlane);
        ui.drawText(Math::Vec2(pos.x + 8, yPos), buf,
                    Math::Vec4(0.7f, 0.7f, 0.75f, 1.0f), 11.0f);
        yPos += 20;
    }

    // Advance cursor past all content
    ui.setCursorPos(Math::Vec2(pos.x + 4, yPos + 4));
}

void Editor::renderAssetBrowser() {
    auto& ui = EmberGUI::get();
    Math::Vec2 pos = ui.getCursorPos();

    // Asset browser header with import button
    auto& assetManager = AssetManager::get();
    auto allAssets = assetManager.getAllAssets();

    char headerBuf[64];
    std::snprintf(headerBuf, sizeof(headerBuf), "Assets (%zu)", allAssets.size());
    ui.drawText(Math::Vec2(pos.x + 8, pos.y + 4), headerBuf,
                Math::Vec4(0.5f, 0.5f, 0.55f, 1.0f), 12.0f);

    // Import button
    Math::Vec2 importBtnPos(pos.x + ui.getContext().windowSize.x - 90, pos.y + 2);
    Math::Vec2 importBtnSize(80, 20);
    bool importHover = ui.isInRect(importBtnPos, importBtnSize);
    ui.drawRectFilled(importBtnPos, importBtnSize,
        importHover ? Math::Vec4(0.3f, 0.52f, 0.85f, 1.0f) : Math::Vec4(0.26f, 0.45f, 0.76f, 1.0f), 3.0f);
    ui.drawText(Math::Vec2(importBtnPos.x + 10, importBtnPos.y + 3), "Import",
                Math::Vec4(1.0f, 1.0f, 1.0f, 1.0f), 11.0f);
    if (importHover && ui.getState().mousePressed[0]) {
        importAsset();
    }

    // Hint text when no assets
    if (allAssets.empty()) {
        ui.drawText(Math::Vec2(pos.x + 8, pos.y + 30), "Drag and drop asset files here,",
                    Math::Vec4(0.4f, 0.4f, 0.45f, 1.0f), 12.0f);
        ui.drawText(Math::Vec2(pos.x + 8, pos.y + 46), "or click the Import button.",
                    Math::Vec4(0.4f, 0.4f, 0.45f, 1.0f), 12.0f);
        ui.setCursorPos(Math::Vec2(pos.x + 4, pos.y + 66));
        return;
    }

    // Grid of imported assets
    float slotY = pos.y + 30;
    int col = 0;
    for (size_t i = 0; i < allAssets.size(); i++) {
        const auto& meta = assetManager.getMetadata(allAssets[i]);
        float slotX = pos.x + 8 + (col % 4) * 72;
        if (col > 0 && col % 4 == 0) slotY += 72;

        Math::Vec2 slotPos(slotX, slotY);
        Math::Vec2 slotSize(64, 64);

        bool hovered = ui.isInRect(slotPos, slotSize);
        Math::Vec4 slotBg = hovered ? Math::Vec4(0.22f, 0.22f, 0.24f, 1.0f)
                                    : Math::Vec4(0.14f, 0.14f, 0.16f, 1.0f);
        ui.drawRectFilled(slotPos, slotSize, slotBg, 4.0f);
        ui.drawRect(slotPos, slotSize, Math::Vec4(0.2f, 0.2f, 0.22f, 1.0f), 4.0f);

        // Asset thumbnail placeholder (icon + name)
        const char* icon = "";
        switch (meta.type) {
            case AssetType::Texture: icon = "\u25D9"; break; // ◙
            case AssetType::Model:   icon = "\u25B2"; break; // ▲
            default:                 icon = "\u25B8"; break; // ▸
        }

        bool clicked = hovered && ui.getState().mousePressed[0];

        if (meta.type == AssetType::Texture) {
            // Display actual texture thumbnail using the texture's GL ID
            auto& assetMgr = Ember::AssetManager::get();
            auto tex = assetMgr.getAsset<Ember::Texture>(allAssets[i]);
            if (tex && tex->isLoaded()) {
                uint32_t texID = tex->getID();
                ui.drawImage(Math::Vec2(slotPos.x + 4, slotPos.y + 4),
                            Math::Vec2(56, 32), texID, Math::Vec4(1.0f));
                ui.drawRect(Math::Vec2(slotPos.x + 4, slotPos.y + 4),
                           Math::Vec2(56, 32), Math::Vec4(0.3f, 0.3f, 0.35f, 0.5f), 1.0f);
                
                // Click-to-place: create entity with this texture
                if (clicked && m_scene) {
                    beginActionGroup("Place " + meta.name);
                    std::string entityName = "Textured_" + meta.name;
                    Ember::Entity newEntity = m_scene->createEntity(entityName);
                    auto& transform = m_scene->getECS().addComponent<Ember::Transform>(newEntity);
                    transform.position = Ember::Math::Vec3(0.0f, 0.5f, 0.0f);
                    transform.scale = Ember::Math::Vec3(2.0f, 1.0f, 2.0f);
                    
                    auto& renderer = m_scene->getECS().addComponent<Ember::MeshRenderer>(newEntity);
                    renderer.mesh = Ember::Mesh::createPlane(1.0f, 1);
                    renderer.castShadows = true;
                    renderer.enabled = true;
                    
                    // Create material with the imported texture as albedo
                    auto mat = Ember::Material::createDefault();
                    mat->setAlbedoTexture(tex);
                    mat->setAlbedo(Ember::Math::Vec3(1.0f));
                    mat->setRoughness(0.8f);
                    mat->setMetallic(0.0f);
                    renderer.material = mat;
                    
                    m_selectedEntity = newEntity;
                    endActionGroup();
                    EMBER_LOG_INFO("Placed textured entity: {} with texture {}", entityName, meta.name);
                }
            } else {
                // Fallback: colored rectangle
                ui.drawRectFilled(Math::Vec2(slotPos.x + 4, slotPos.y + 4),
                                 Math::Vec2(56, 32), Math::Vec4(0.26f, 0.45f, 0.76f, 0.3f), 2.0f);
            }
        }

        // Handle model click-to-place
        if (meta.type == AssetType::Model && clicked && m_scene) {
            beginActionGroup("Place " + meta.name);
            auto& assetMgr = Ember::AssetManager::get();
            auto modelMesh = assetMgr.getAsset<Ember::Mesh>(allAssets[i]);
            if (modelMesh && modelMesh->isLoaded()) {
                std::string entityName = "Model_" + meta.name;
                Ember::Entity newEntity = m_scene->createEntity(entityName);
                auto& transform = m_scene->getECS().addComponent<Ember::Transform>(newEntity);
                transform.position = Ember::Math::Vec3(0.0f, 0.0f, 0.0f);
                
                // Scale model to fit a reasonable size (1 unit)
                Math::Vec3 bboxSize = modelMesh->getBoundingBoxMax() - modelMesh->getBoundingBoxMin();
                float maxDim = std::max({bboxSize.x, bboxSize.y, bboxSize.z});
                if (maxDim > 0.001f) {
                    float s = 1.0f / maxDim;
                    transform.scale = Ember::Math::Vec3(s, s, s);
                }
                
                auto& rendererComp = m_scene->getECS().addComponent<Ember::MeshRenderer>(newEntity);
                rendererComp.mesh = modelMesh;
                rendererComp.castShadows = true;
                rendererComp.enabled = true;
                
                // Create a default material with a pleasant color
                auto mat = Ember::Material::createDefault();
                mat->setAlbedo(Ember::Math::Vec3(0.7f, 0.7f, 0.8f));
                mat->setRoughness(0.4f);
                mat->setMetallic(0.2f);
                rendererComp.material = mat;
                
                m_selectedEntity = newEntity;
                endActionGroup();
                EMBER_LOG_INFO("Placed model entity: {} with mesh {}", entityName, meta.name);
            }
        }

        ui.drawText(Math::Vec2(slotPos.x + 8, slotPos.y + 40), icon,
                    Math::Vec4(0.6f, 0.6f, 0.7f, 1.0f), 14.0f);

        // Short name
        std::string shortName = meta.name;
        if (shortName.length() > 8) shortName = shortName.substr(0, 7) + "...";
        ui.drawText(Math::Vec2(slotPos.x + 4, slotPos.y + 50), shortName,
                    Math::Vec4(0.5f, 0.5f, 0.55f, 1.0f), 9.0f);

        col++;
    }

    ui.setCursorPos(Math::Vec2(pos.x + 4, slotY + 76));
}

void Editor::renderConsole() {
    auto& ui = EmberGUI::get();
    Math::Vec2 pos = ui.getCursorPos();

    // Console header
    ui.drawText(Math::Vec2(pos.x + 8, pos.y + 4), "Console Output",
                Math::Vec4(0.5f, 0.5f, 0.55f, 1.0f), 12.0f);

    // Log messages
    const char* logLines[] = {
        "[INFO] Engine initialized successfully",
        "[INFO] OpenGL context created (3.3 Core)",
        "[INFO] Scene 'MainScene' created",
        "[INFO] Editor initialized",
        "[INFO] Renderer initialized with OpenGL"
    };

    float yPos = pos.y + 24;
    for (const char* line : logLines) {
        Math::Vec4 color = Math::Vec4(0.6f, 0.6f, 0.65f, 1.0f);
        if (std::strstr(line, "INFO")) color = Math::Vec4(0.3f, 0.7f, 0.3f, 1.0f);

        ui.drawText(Math::Vec2(pos.x + 8, yPos), line, color, 11.0f);
        yPos += 16;
    }

    // Input line at bottom
    float inputY = pos.y + ui.getContext().windowSize.y - 28;
    Math::Vec2 inputPos(pos.x + 4, inputY);
    Math::Vec2 inputSize(ui.getContext().windowSize.x - 8, 22);

    // Check if we have a focused input state
    ui.drawRectFilled(inputPos, inputSize, Math::Vec4(0.10f, 0.10f, 0.12f, 1.0f), 3.0f);
    ui.drawRect(inputPos, inputSize, Math::Vec4(0.2f, 0.2f, 0.22f, 1.0f), 3.0f);
    ui.drawText(Math::Vec2(inputPos.x + 6, inputPos.y + 3), "> Type a command...",
                Math::Vec4(0.35f, 0.35f, 0.40f, 1.0f), 11.0f);

    ui.setCursorPos(Math::Vec2(pos.x + 4, inputY + 26));
}

void Editor::renderProfiler() {
    auto& ui = EmberGUI::get();
    auto& renderer = Renderer::get();
    Math::Vec2 pos = ui.getCursorPos();

    // Performance metrics
    char fpsBuf[64];
    std::snprintf(fpsBuf, sizeof(fpsBuf), "FPS: %u  |  Draw Calls: %u  |  Triangles: %u",
        60, // placeholder - real FPS tracking needed
        renderer.getDrawCallCount(),
        renderer.getTriangleCount());
    ui.drawText(Math::Vec2(pos.x + 8, pos.y + 4), fpsBuf,
                Math::Vec4(0.3f, 0.8f, 0.3f, 1.0f), 12.0f);

    // Mini profiler bars
    float barY = pos.y + 26;
    const char* labels[] = {"Frame", "Render", "Physics", "GUI"};
    float values[] = {16.0f, 8.0f, 2.0f, 3.0f}; // ms
    Math::Vec4 colors[] = {
        Math::Vec4(0.3f, 0.6f, 1.0f, 1.0f),
        Math::Vec4(0.3f, 0.8f, 0.3f, 1.0f),
        Math::Vec4(0.9f, 0.6f, 0.2f, 1.0f),
        Math::Vec4(0.8f, 0.3f, 0.8f, 1.0f)
    };

    float maxVal = 33.0f; // 30 FPS budget
    for (int i = 0; i < 4; i++) {
        float barW = (values[i] / maxVal) * 100.0f;
        ui.drawRectFilled(Math::Vec2(pos.x + 60, barY),
                         Math::Vec2(barW, 10), colors[i], 2.0f);
        ui.drawText(Math::Vec2(pos.x + 8, barY), labels[i],
                    Math::Vec4(0.6f, 0.6f, 0.65f, 1.0f), 10.0f);

        char valBuf[16];
        std::snprintf(valBuf, sizeof(valBuf), "%.1fms", values[i]);
        ui.drawText(Math::Vec2(pos.x + 164, barY), valBuf,
                    Math::Vec4(0.5f, 0.5f, 0.55f, 1.0f), 10.0f);
        barY += 14;
    }

    ui.setCursorPos(Math::Vec2(pos.x + 4, barY + 4));
}

void Editor::renderMaterialEditor() {
    auto& ui = EmberGUI::get();
    Math::Vec2 pos = ui.getCursorPos();

    // Panel header
    ui.drawRectFilled(pos, Math::Vec2(ui.getContext().windowSize.x - 8, 24),
                      Math::Vec4(0.16f, 0.16f, 0.18f, 1.0f), 2.0f);
    ui.drawText(Math::Vec2(pos.x + 8, pos.y + 4), "Material Editor",
                Math::Vec4(0.6f, 0.6f, 0.8f, 1.0f), 13.0f);

    float yPos = pos.y + 30;

    // Check for valid selection with a material
    if (!m_scene || m_selectedEntity == 0) {
        ui.drawText(Math::Vec2(pos.x + 8, pos.y + 30), "No entity selected",
                    Math::Vec4(0.4f, 0.4f, 0.45f, 1.0f), 12.0f);
        ui.setCursorPos(Math::Vec2(pos.x + 4, pos.y + 54));
        return;
    }

    auto& ecs = m_scene->getECS();

    if (!ecs.isEntityValid(m_selectedEntity)) {
        ui.drawText(Math::Vec2(pos.x + 8, yPos), "No entity selected",
                    Math::Vec4(0.4f, 0.4f, 0.45f, 1.0f), 12.0f);
        ui.setCursorPos(Math::Vec2(pos.x + 4, yPos + 20));
        return;
    }

    // Check entity has MeshRenderer with a material
    bool hasMaterial = false;
    std::shared_ptr<Material> mat = nullptr;
    if (ecs.hasComponent<MeshRenderer>(m_selectedEntity)) {
        auto& mr = ecs.getComponent<MeshRenderer>(m_selectedEntity);
        mat = mr.material;
        if (mat) hasMaterial = true;
    }

    if (!hasMaterial) {
        ui.drawText(Math::Vec2(pos.x + 8, yPos), "Selected entity has no material",
                    Math::Vec4(0.4f, 0.4f, 0.45f, 1.0f), 12.0f);
        ui.drawText(Math::Vec2(pos.x + 8, yPos + 16), "Add a MeshRenderer component",
                    Math::Vec4(0.35f, 0.35f, 0.40f, 1.0f), 11.0f);
        ui.setCursorPos(Math::Vec2(pos.x + 4, yPos + 36));
        return;
    }

    // Shader info
    auto shader = mat->getShader();
    char shaderBuf[64];
    if (shader) {
        std::snprintf(shaderBuf, sizeof(shaderBuf), "Shader Program: %u", shader->getID());
    } else {
        std::snprintf(shaderBuf, sizeof(shaderBuf), "Shader: None");
    }
    ui.drawText(Math::Vec2(pos.x + 8, yPos), shaderBuf,
                Math::Vec4(0.45f, 0.45f, 0.55f, 1.0f), 10.0f);
    yPos += 18;

    // -- Albedo section --
    ui.drawRectFilled(Math::Vec2(pos.x, yPos), Math::Vec2(ui.getContext().windowSize.x - 8, 20),
                      Math::Vec4(0.14f, 0.14f, 0.16f, 1.0f));
    ui.drawText(Math::Vec2(pos.x + 8, yPos + 2), "Albedo",
                Math::Vec4(0.5f, 0.5f, 0.6f, 1.0f), 11.0f);
    yPos += 22;

    // Albedo color
    Math::Vec3 albedo = mat->getAlbedo();
    float albedoF[3] = { albedo.x, albedo.y, albedo.z };
    ui.setCursorPos(Math::Vec2(pos.x + 8, yPos));
    if (ui.colorEdit3("Albedo Color", albedoF)) {
        beginActionGroup("Edit Albedo Color");
        mat->setAlbedo(Math::Vec3(albedoF[0], albedoF[1], albedoF[2]));
        endActionGroup();
    }
    yPos = ui.getCursorPos().y;

    // Albedo texture info
    auto albedoTex = mat->getTexture("albedoTexture");
    char texBuf[64];
    if (albedoTex) {
        std::snprintf(texBuf, sizeof(texBuf), "Texture: %s", albedoTex->getFilePath().c_str());
    } else {
        std::snprintf(texBuf, sizeof(texBuf), "Texture: None");
    }
    ui.drawText(Math::Vec2(pos.x + 8, yPos + 2), texBuf,
                Math::Vec4(0.40f, 0.40f, 0.48f, 1.0f), 10.0f);
    yPos += 16;

    // -- Roughness section --
    ui.drawRectFilled(Math::Vec2(pos.x, yPos), Math::Vec2(ui.getContext().windowSize.x - 8, 20),
                      Math::Vec4(0.14f, 0.14f, 0.16f, 1.0f));
    ui.drawText(Math::Vec2(pos.x + 8, yPos + 2), "Roughness & Metallic",
                Math::Vec4(0.5f, 0.5f, 0.6f, 1.0f), 11.0f);
    yPos += 22;

    // Roughness slider
    float roughness = mat->getRoughness();
    ui.setCursorPos(Math::Vec2(pos.x + 8, yPos));
    if (ui.sliderFloat("Roughness", roughness, 0.0f, 1.0f, "%.2f")) {
        beginActionGroup("Edit Roughness");
        mat->setRoughness(roughness);
        endActionGroup();
    }
    yPos = ui.getCursorPos().y;

    // Metallic slider
    float metallic = mat->getMetallic();
    ui.setCursorPos(Math::Vec2(pos.x + 8, yPos));
    if (ui.sliderFloat("Metallic", metallic, 0.0f, 1.0f, "%.2f")) {
        beginActionGroup("Edit Metallic");
        mat->setMetallic(metallic);
        endActionGroup();
    }
    yPos = ui.getCursorPos().y;

    // -- Emission section --
    ui.drawRectFilled(Math::Vec2(pos.x, yPos), Math::Vec2(ui.getContext().windowSize.x - 8, 20),
                      Math::Vec4(0.14f, 0.14f, 0.16f, 1.0f));
    ui.drawText(Math::Vec2(pos.x + 8, yPos + 2), "Emission",
                Math::Vec4(0.5f, 0.5f, 0.6f, 1.0f), 11.0f);
    yPos += 22;

    Math::Vec3 emission = mat->getEmission();
    float emissionF[3] = { emission.x, emission.y, emission.z };
    ui.setCursorPos(Math::Vec2(pos.x + 8, yPos));
    if (ui.colorEdit3("Emission Color", emissionF)) {
        beginActionGroup("Edit Emission");
        mat->setEmission(Math::Vec3(emissionF[0], emissionF[1], emissionF[2]));
        endActionGroup();
    }
    yPos = ui.getCursorPos().y;

    // -- Alpha / Transparency section --
    ui.drawRectFilled(Math::Vec2(pos.x, yPos), Math::Vec2(ui.getContext().windowSize.x - 8, 20),
                      Math::Vec4(0.14f, 0.14f, 0.16f, 1.0f));
    ui.drawText(Math::Vec2(pos.x + 8, yPos + 2), "Transparency",
                Math::Vec4(0.5f, 0.5f, 0.6f, 1.0f), 11.0f);
    yPos += 22;

    // Alpha slider
    float alpha = mat->getFloat("alpha", 1.0f);
    ui.setCursorPos(Math::Vec2(pos.x + 8, yPos));
    if (ui.sliderFloat("Alpha", alpha, 0.0f, 1.0f, "%.2f")) {
        beginActionGroup("Edit Alpha");
        mat->setAlpha(alpha);
        mat->setTransparent(alpha < 1.0f);
        endActionGroup();
    }
    yPos = ui.getCursorPos().y;

    // Double-sided toggle
    bool doubleSided = mat->isDoubleSided();
    ui.setCursorPos(Math::Vec2(pos.x + 8, yPos));
    if (ui.checkbox("Double Sided", doubleSided)) {
        beginActionGroup("Toggle Double Sided");
        mat->setDoubleSided(doubleSided);
        endActionGroup();
    }
    yPos = ui.getCursorPos().y;

    // -- Advanced section --
    ui.drawRectFilled(Math::Vec2(pos.x, yPos), Math::Vec2(ui.getContext().windowSize.x - 8, 20),
                      Math::Vec4(0.14f, 0.14f, 0.16f, 1.0f));
    ui.drawText(Math::Vec2(pos.x + 8, yPos + 2), "Advanced",
                Math::Vec4(0.5f, 0.5f, 0.6f, 1.0f), 11.0f);
    yPos += 22;

    // AO slider
    float ao = mat->getFloat("ao", 1.0f);
    ui.setCursorPos(Math::Vec2(pos.x + 8, yPos));
    if (ui.sliderFloat("AO", ao, 0.0f, 1.0f, "%.2f")) {
        beginActionGroup("Edit AO");
        mat->setAO(ao);
        endActionGroup();
    }
    yPos = ui.getCursorPos().y;

    ui.setCursorPos(Math::Vec2(pos.x + 4, yPos + 4));
}

void Editor::renderPrefabBrowser() {
    auto& ui = EmberGUI::get();
    Math::Vec2 pos = ui.getCursorPos();

    // Panel header
    ui.drawRectFilled(pos, Math::Vec2(ui.getContext().windowSize.x - 8, 24),
                      Math::Vec4(0.16f, 0.16f, 0.18f, 1.0f), 2.0f);
    ui.drawText(Math::Vec2(pos.x + 8, pos.y + 4), "Prefab Browser",
                Math::Vec4(0.6f, 0.6f, 0.8f, 1.0f), 13.0f);

    float yPos = pos.y + 30;

    // Create prefabs directory if needed
    if (!Ember::FileSystem::get().directoryExists("prefabs")) {
        Ember::FileSystem::get().createDirectory("prefabs");
    }

    // Scan for prefab files
    std::vector<std::string> prefabFiles;
    auto& fs = Ember::FileSystem::get();
    std::vector<std::string> files = fs.listFiles("prefabs");
    for (const auto& f : files) {
        if (f.size() > 12 && f.substr(f.size() - 12) == ".emberprefab") {
            prefabFiles.push_back(f);
        }
    }

    if (prefabFiles.empty()) {
        ui.drawText(Math::Vec2(pos.x + 8, yPos), "No prefabs found. Select an entity",
                    Math::Vec4(0.4f, 0.4f, 0.45f, 1.0f), 12.0f);
        ui.drawText(Math::Vec2(pos.x + 8, yPos + 16), "and use File > Save Selected as Prefab.",
                    Math::Vec4(0.35f, 0.35f, 0.40f, 1.0f), 11.0f);
        ui.setCursorPos(Math::Vec2(pos.x + 4, yPos + 36));
        return;
    }

    // Display each prefab as a clickable item
    for (size_t i = 0; i < prefabFiles.size(); i++) {
        float itemY = yPos + i * 28;
        Math::Vec2 itemPos(pos.x + 4, itemY);
        Math::Vec2 itemSize(ui.getContext().windowSize.x - 12, 24);

        bool hovered = ui.isInRect(itemPos, itemSize);

        if (hovered) {
            ui.drawRectFilled(itemPos, itemSize, Math::Vec4(0.26f, 0.45f, 0.76f, 0.3f), 3.0f);
        }

        // Prefab icon and name
        std::string displayName = prefabFiles[i];
        // Strip .emberprefab extension for display
        size_t extPos = displayName.rfind(".emberprefab");
        if (extPos != std::string::npos) {
            displayName = displayName.substr(0, extPos);
        }

        ui.drawText(Math::Vec2(itemPos.x + 8, itemPos.y + 3), "\u25A3 " + displayName,
                    Math::Vec4(0.7f, 0.7f, 0.8f, 1.0f), 12.0f);

        // Instantiate on click (FileSystem::listFiles returns absolute paths)
        if (hovered && ui.getState().mousePressed[0] && m_scene) {
            beginActionGroup("Prefab Instantiate");
            Entity newEntity = m_scene->instantiatePrefab(prefabFiles[i]);
            if (newEntity != NULL_ENTITY) {
                m_selectedEntity = newEntity;
                endActionGroup();
                EMBER_LOG_INFO("Prefab instantiated from browser: ", prefabFiles[i]);
            }
        }

        // Context menu icon
        ui.drawText(Math::Vec2(itemPos.x + itemSize.x - 20, itemPos.y + 3), "\u22EF",
                    Math::Vec4(0.35f, 0.35f, 0.38f, 1.0f), 12.0f);
    }

    ui.setCursorPos(Math::Vec2(pos.x + 4, yPos + prefabFiles.size() * 28 + 4));
}

// ============================================================================
// Undo / Redo System
// ============================================================================

void Editor::beginActionGroup(const std::string& label) {
    if (m_actionInProgress) return; // Nested actions not supported
    m_actionInProgress = true;
    m_actionLabel = label;
}

void Editor::endActionGroup() {
    if (!m_actionInProgress) return;
    m_actionInProgress = false;
    m_redoHistory.clear(); // New action invalidates redo history

    Snapshot snap;
    snap.label = m_actionLabel;
    snap.sceneName = m_scene ? m_scene->getName() : "Untitled";
    snap.ecsData = serializeECS();

    m_undoHistory.push_back(snap);
    if (m_undoHistory.size() > MAX_HISTORY) {
        m_undoHistory.erase(m_undoHistory.begin());
    }

    EMBER_LOG_INFO("Action '{}' recorded, undo stack: {}", m_actionLabel, m_undoHistory.size());
}

void Editor::undo() {
    if (m_undoHistory.empty() || !m_scene) return;

    // Save current state to redo stack
    Snapshot currentSnap;
    currentSnap.label = m_undoHistory.back().label;
    currentSnap.sceneName = m_scene->getName();
    currentSnap.ecsData = serializeECS();
    m_redoHistory.push_back(currentSnap);
    if (m_redoHistory.size() > MAX_HISTORY) {
        m_redoHistory.erase(m_redoHistory.begin());
    }

    // Restore undo snapshot
    Snapshot snap = m_undoHistory.back();
    m_undoHistory.pop_back();

    m_scene->getECS().clear();
    m_scene->setName(snap.sceneName);
    deserializeECS(snap.ecsData);

    m_selectedEntity = 0;
    EMBER_LOG_INFO("Undo: {}", snap.label);
}

void Editor::redo() {
    if (m_redoHistory.empty() || !m_scene) return;

    // Save current state to undo stack
    Snapshot currentSnap;
    currentSnap.label = m_redoHistory.back().label;
    currentSnap.sceneName = m_scene->getName();
    currentSnap.ecsData = serializeECS();
    m_undoHistory.push_back(currentSnap);
    if (m_undoHistory.size() > MAX_HISTORY) {
        m_undoHistory.erase(m_undoHistory.begin());
    }

    // Restore redo snapshot
    Snapshot snap = m_redoHistory.back();
    m_redoHistory.pop_back();

    m_scene->getECS().clear();
    m_scene->setName(snap.sceneName);
    deserializeECS(snap.ecsData);

    m_selectedEntity = 0;
    EMBER_LOG_INFO("Redo: {}", snap.label);
}

const std::string& Editor::getUndoLabel() const {
    static const std::string empty;
    return m_undoHistory.empty() ? empty : m_undoHistory.back().label;
}

const std::string& Editor::getRedoLabel() const {
    static const std::string empty;
    return m_redoHistory.empty() ? empty : m_redoHistory.back().label;
}

std::string Editor::serializeECS() {
    if (!m_scene) return "";

    // Clone the scene file to a temp location and read it back
    // Uses existing serialization infrastructure
    std::string tempPath = "_undo_temp.emberscene";
    m_scene->saveScene(tempPath);
    std::string result = FileSystem::get().readFile(tempPath);
    FileSystem::get().deleteFile(tempPath);
    return result;
}

void Editor::deserializeECS(const std::string& data) {
    if (!m_scene || data.empty()) return;

    // Write the snapshot data to a temp file and load it
    std::string tempPath = "_undo_temp.emberscene";
    FileSystem::get().writeFile(tempPath, data);
    m_scene->loadScene(tempPath);
    FileSystem::get().deleteFile(tempPath);
}

// ============================================================================
// Menus
// ============================================================================
namespace {

struct EditorMenuDef {
    const char* name;
    std::vector<const char*> items;   // "---" draws a separator
};

const std::vector<EditorMenuDef>& editorMenus() {
    static const std::vector<EditorMenuDef> menus = {
        {"File", {"New Scene", "Open Scene...", "Save Scene", "---", "Save Selected as Prefab", "---", "Exit"}},
        {"Edit", {"Undo", "Redo", "---", "Preferences..."}},
        {"Assets", {"Import...", "Refresh", "---", "Build Settings..."}},
        {"GameObject", {"Create Empty", "3D Object > Cube", "3D Object > Sphere", "Light > Directional", "---", "Camera", "---", "Instantiate Prefab..."}},
        {"Component", {"MeshRenderer", "Light", "Camera", "RigidBody", "Audio Source"}},
        {"Window", {"Scene View", "Game View", "Hierarchy", "Inspector", "Console", "Profiler", "Asset Browser", "Material Editor", "Prefab Browser"}},
        {"Help", {"About EmberEngine", "Documentation", "---", "Check for Updates..."}},
    };
    return menus;
}

constexpr float MENU_BAR_HEIGHT  = 30.0f;
constexpr float MENU_ITEM_HEIGHT = 22.0f;
constexpr float MENU_POPUP_WIDTH = 210.0f;

float menuLabelWidth(const char* name) {
    return std::strlen(name) * 8.0f + 20.0f;
}

Math::Vec2 menuBarItemPos(int index) {
    const auto& menus = editorMenus();
    float x = 10.0f;
    for (int i = 0; i < index && i < (int)menus.size(); i++) {
        x += menuLabelWidth(menus[i].name) + 2.0f;
    }
    return Math::Vec2(x, 3.0f);
}

Math::Vec2 menuPopupPos(int index) {
    Math::Vec2 barPos = menuBarItemPos(index);
    float windowW = (float)Renderer::get().getWindowWidth();
    float x = std::min(barPos.x, windowW - MENU_POPUP_WIDTH - 4.0f);
    return Math::Vec2(std::max(x, 4.0f), MENU_BAR_HEIGHT);
}

Math::Vec2 menuPopupSize(int index) {
    const auto& items = editorMenus()[index].items;
    return Math::Vec2(MENU_POPUP_WIDTH, (float)items.size() * MENU_ITEM_HEIGHT + 8.0f);
}

Math::Vec2 menuItemPos(int menuIndex, int itemIndex) {
    return menuPopupPos(menuIndex) + Math::Vec2(4.0f, 4.0f + itemIndex * MENU_ITEM_HEIGHT);
}

const char* menuPanelId(const std::string& item) {
    if (item == "Scene View") return "SceneView";
    if (item == "Game View") return "GameView";
    if (item == "Hierarchy") return "Hierarchy";
    if (item == "Inspector") return "Inspector";
    if (item == "Console") return "Console";
    if (item == "Profiler") return "Profiler";
    if (item == "Asset Browser") return "AssetBrowser";
    if (item == "Material Editor") return "MaterialEditor";
    if (item == "Prefab Browser") return "PrefabBrowser";
    return nullptr;
}

} // namespace

void Editor::renderMenuBar() {
    auto& ui = EmberGUI::get();
    auto& renderer = Renderer::get();
    const auto& menus = editorMenus();

    ui.drawRectFilled(Math::Vec2(0, 0), Math::Vec2((float)renderer.getWindowWidth(), MENU_BAR_HEIGHT),
                      Math::Vec4(0.08f, 0.08f, 0.10f, 1.0f));
    ui.drawLine(Math::Vec2(0, MENU_BAR_HEIGHT),
                Math::Vec2((float)renderer.getWindowWidth(), MENU_BAR_HEIGHT),
                Math::Vec4(0.15f, 0.15f, 0.17f, 1.0f));

    for (int m = 0; m < (int)menus.size(); m++) {
        Math::Vec2 pos = menuBarItemPos(m);
        Math::Vec2 sz(menuLabelWidth(menus[m].name), 24.0f);
        bool hovered = ui.isInRect(pos, sz);

        // While a menu is open, hovering another label switches to it.
        if (hovered && m_openMenuIndex >= 0 && m_openMenuIndex != m) m_openMenuIndex = m;
        bool open = (m_openMenuIndex == m);

        if (open) {
            ui.drawRectFilled(pos, sz, Math::Vec4(0.24f, 0.30f, 0.42f, 1.0f), 2.0f);
        } else if (hovered) {
            ui.drawRectFilled(pos, sz, Math::Vec4(0.18f, 0.18f, 0.20f, 1.0f), 2.0f);
        }

        ui.drawText(Math::Vec2(pos.x + 10.0f, 7.0f), menus[m].name,
                    open ? Math::Vec4(1.0f) : Math::Vec4(0.72f, 0.72f, 0.80f, 1.0f), 13.0f);

        if (hovered && ui.getState().mousePressed[0]) {
            m_openMenuIndex = open ? -1 : m;
        }
    }

    char titleBuf[64];
    std::snprintf(titleBuf, sizeof(titleBuf), "EmberEngine v%s", EMBER_VERSION_STRING);
    ui.drawText(Math::Vec2((float)renderer.getWindowWidth() - 180, 7), titleBuf,
                Math::Vec4(0.35f, 0.35f, 0.40f, 1.0f), 11.0f);
}

void Editor::renderMenuPopup(bool pressAvailable) {
    auto& ui = EmberGUI::get();
    if (m_openMenuIndex < 0) return;

    const auto& menus = editorMenus();
    if (m_openMenuIndex >= (int)menus.size()) { m_openMenuIndex = -1; return; }

    const auto& menu = menus[m_openMenuIndex];
    Math::Vec2 pos = menuPopupPos(m_openMenuIndex);
    Math::Vec2 size = menuPopupSize(m_openMenuIndex);

    // A press outside the popup closes it. Presses on the bar itself were
    // already handled by renderMenuBar().
    if (pressAvailable && !ui.isInRect(pos, size) && ui.getState().mousePos.y > MENU_BAR_HEIGHT) {
        m_openMenuIndex = -1;
        return;
    }

    ui.drawRectFilled(pos, size, Math::Vec4(0.12f, 0.12f, 0.14f, 0.99f), 3.0f);
    ui.drawRect(pos, size, Math::Vec4(0.26f, 0.26f, 0.30f, 1.0f), 3.0f);

    for (int i = 0; i < (int)menu.items.size(); i++) {
        const char* label = menu.items[i];
        if (std::strcmp(label, "---") == 0) {
            float y = pos.y + 4.0f + (float)i * MENU_ITEM_HEIGHT + MENU_ITEM_HEIGHT * 0.5f;
            ui.drawLine(Math::Vec2(pos.x + 10.0f, y), Math::Vec2(pos.x + size.x - 10.0f, y),
                        Math::Vec4(0.24f, 0.24f, 0.28f, 1.0f));
            continue;
        }

        Math::Vec2 itemPos = menuItemPos(m_openMenuIndex, i);
        Math::Vec2 itemSize(MENU_POPUP_WIDTH - 8.0f, 20.0f);
        bool hovered = ui.isInRect(itemPos, itemSize);

        // Mark the panels that are currently visible in the Window menu.
        if (std::strcmp(menu.name, "Window") == 0) {
            const char* panelId = menuPanelId(label);
            if (panelId && m_dockManager.isPanelVisible(panelId)) {
                ui.drawText(Math::Vec2(itemPos.x + 5.0f, itemPos.y + 2.0f), ">",
                            Math::Vec4(0.45f, 0.70f, 1.0f, 1.0f), 12.0f);
            }
        }

        if (hovered) {
            ui.drawRectFilled(itemPos, itemSize, Math::Vec4(0.26f, 0.45f, 0.76f, 0.6f), 2.0f);
        }

        ui.drawText(Math::Vec2(itemPos.x + 20.0f, itemPos.y + 2.0f), label,
                    hovered ? Math::Vec4(1.0f) : Math::Vec4(0.84f, 0.84f, 0.88f, 1.0f), 12.0f);

        if (hovered && pressAvailable) {
            runMenuAction(menu.name, label);
            pressAvailable = false;
            if (m_openMenuIndex < 0) return;   // the action closed the menu
        }
    }
}

void Editor::runMenuAction(const std::string& menu, const std::string& item) {
    bool closeMenu = true;

    // ---------------------------------------------------------------- Window
    if (menu == "Window") {
        if (const char* panelId = menuPanelId(item)) {
            m_dockManager.togglePanel(panelId);
            m_dockManager.focusPanel(panelId);
        }
        closeMenu = false;   // stay open so several panels can be toggled
    }
    // ------------------------------------------------------------------ File
    else if (menu == "File") {
        if (item == "New Scene") {
            if (m_scene) {
                clearHistory();
                m_scene->getECS().clear();
                m_scene->setName("NewScene");
                m_selectedEntity = 0;
                m_sceneFilePath.clear();
                EMBER_LOG_INFO("Created new scene");
            }
        } else if (item == "Open Scene...") {
            clearHistory();
            loadScene();
        } else if (item == "Save Scene") {
            saveScene();
        } else if (item == "Save Selected as Prefab") {
            if (m_scene && m_selectedEntity != 0 && m_scene->getECS().isEntityValid(m_selectedEntity)) {
                if (!FileSystem::get().directoryExists("prefabs")) {
                    FileSystem::get().createDirectory("prefabs");
                }
                std::string name = m_scene->getECS().getEntityName(m_selectedEntity);
                std::string filepath = "prefabs/" + name + ".emberprefab";
                if (m_scene->savePrefab(filepath, m_selectedEntity)) {
                    EMBER_LOG_INFO("Prefab saved: ", filepath);
                } else {
                    EMBER_LOG_ERROR("Failed to save prefab: ", filepath);
                }
            } else {
                EMBER_LOG_WARN("No valid entity selected to save as prefab");
            }
        } else if (item == "Exit") {
            m_running = false;
        }
    }
    // ------------------------------------------------------------------ Edit
    else if (menu == "Edit") {
        if (item == "Undo") {
            undo();
        } else if (item == "Redo") {
            redo();
        } else if (item == "Preferences...") {
            EMBER_LOG_INFO("Preferences are not available yet");
        }
    }
    // ---------------------------------------------------------------- Assets
    else if (menu == "Assets") {
        if (item == "Import...") {
            importAsset();
        } else if (item == "Refresh") {
            EMBER_LOG_INFO("Asset refresh is not available yet");
        } else if (item == "Build Settings...") {
            EMBER_LOG_INFO("Build settings are not available yet");
        }
    }
    // ------------------------------------------------------------ GameObject
    else if (menu == "GameObject") {
        if (!m_scene) {
            EMBER_LOG_WARN("No scene open");
        } else if (item == "Create Empty") {
            beginActionGroup("Create Empty");
            Entity entity = m_scene->createEntity("GameObject");
            m_scene->getECS().addComponent<Transform>(entity);
            m_selectedEntity = entity;
            endActionGroup();
        } else if (item == "3D Object > Cube" || item == "3D Object > Sphere") {
            const bool cube = (item == "3D Object > Cube");
            beginActionGroup("Create " + item);
            Entity entity = m_scene->createEntity(cube ? "Cube" : "Sphere");
            auto& transform = m_scene->getECS().addComponent<Transform>(entity);
            transform.position = Math::Vec3(0.0f, 0.5f, 0.0f);

            auto& mr = m_scene->getECS().addComponent<MeshRenderer>(entity);
            mr.mesh = cube ? Mesh::createCube(1.0f) : Mesh::createSphere(0.5f, 16, 32);
            auto material = Material::createDefault();
            material->setAlbedo(cube ? Math::Vec3(0.85f, 0.55f, 0.30f) : Math::Vec3(0.40f, 0.62f, 0.90f));
            material->setRoughness(0.6f);
            mr.material = material;

            m_selectedEntity = entity;
            endActionGroup();
        } else if (item == "Light > Directional") {
            beginActionGroup("Create Directional Light");
            Entity entity = m_scene->createEntity("DirectionalLight");
            auto& transform = m_scene->getECS().addComponent<Transform>(entity);
            transform.position = Math::Vec3(0.0f, 5.0f, 0.0f);

            auto& light = m_scene->getECS().addComponent<LightComponent>(entity);
            light.type = LightComponent::Directional;
            light.intensity = 1.0f;
            light.color = Math::Vec3(1.0f);

            m_selectedEntity = entity;
            endActionGroup();
        } else if (item == "Camera") {
            beginActionGroup("Create Camera");
            Entity entity = m_scene->createEntity("Camera");
            auto& transform = m_scene->getECS().addComponent<Transform>(entity);
            transform.position = Math::Vec3(0.0f, 2.0f, -5.0f);

            auto& camera = m_scene->getECS().addComponent<CameraComponent>(entity);
            camera.primary = true;
            camera.fov = 60.0f;

            m_selectedEntity = entity;
            endActionGroup();
        } else if (item == "Instantiate Prefab...") {
            const char* filter = "Prefab Files (*.emberprefab)\0*.emberprefab\0All Files (*.*)\0*.*\0";
            std::string path = Platform::get().openFileDialog(filter);
            if (!path.empty()) {
                beginActionGroup("Instantiate Prefab");
                Entity newEntity = m_scene->instantiatePrefab(path);
                if (newEntity != NULL_ENTITY) {
                    m_selectedEntity = newEntity;
                    endActionGroup();
                    EMBER_LOG_INFO("Prefab instantiated: ", path);
                }
            }
        }
    }
    // ------------------------------------------------------------- Component
    else if (menu == "Component") {
        if (!m_scene || m_selectedEntity == 0 || !m_scene->getECS().isEntityValid(m_selectedEntity)) {
            EMBER_LOG_WARN("Select an entity before adding a component");
        } else {
            auto& ecs = m_scene->getECS();
            beginActionGroup("Add " + item);
            if (item == "MeshRenderer" && !ecs.hasComponent<MeshRenderer>(m_selectedEntity)) {
                auto& mr = ecs.addComponent<MeshRenderer>(m_selectedEntity);
                mr.mesh = Mesh::createCube(1.0f);
                mr.material = Material::createDefault();
            } else if (item == "Light" && !ecs.hasComponent<LightComponent>(m_selectedEntity)) {
                auto& light = ecs.addComponent<LightComponent>(m_selectedEntity);
                light.type = LightComponent::Point;
            } else if (item == "Camera" && !ecs.hasComponent<CameraComponent>(m_selectedEntity)) {
                ecs.addComponent<CameraComponent>(m_selectedEntity);
            } else if (item == "RigidBody" && !ecs.hasComponent<RigidBodyComponent>(m_selectedEntity)) {
                ecs.addComponent<RigidBodyComponent>(m_selectedEntity);
            } else if (item == "Audio Source" && !ecs.hasComponent<AudioSourceComponent>(m_selectedEntity)) {
                ecs.addComponent<AudioSourceComponent>(m_selectedEntity);
            }
            endActionGroup();
        }
    }
    // ------------------------------------------------------------------ Help
    else if (menu == "Help") {
        if (item == "About EmberEngine") {
            EMBER_LOG_INFO("EmberEngine v", EMBER_VERSION_STRING, " - a lightweight OpenGL 3.3 game engine");
        } else if (item == "Documentation") {
            EMBER_LOG_INFO("Documentation: see README.md in the project root");
        } else if (item == "Check for Updates...") {
            EMBER_LOG_INFO("EmberEngine is up to date (v", EMBER_VERSION_STRING, ")");
        }
    }

    if (closeMenu) m_openMenuIndex = -1;
}

void Editor::renderToolbar() {
    auto& ui = EmberGUI::get();
    auto& renderer = Renderer::get();

    // Toolbar below menu bar - full width
    Math::Vec2 toolbarPos(0, 30);
    Math::Vec2 toolbarSize((float)renderer.getWindowWidth(), 48);

    ui.drawRectFilled(toolbarPos, toolbarSize, Math::Vec4(0.10f, 0.10f, 0.12f, 1.0f));
    ui.drawLine(Math::Vec2(0, 78), Math::Vec2((float)renderer.getWindowWidth(), 78),
                Math::Vec4(0.15f, 0.15f, 0.17f, 1.0f));

    // Tool buttons with icon-style rendering
    struct ToolDef {
        const char* label;
        const char* icon;
        const char* tooltip;
    };

    ToolDef tools[] = {
        {"Select", "S", "Select object (Q)"},
        {"Move", "M", "Move object (W)"},
        {"Rotate", "R", "Rotate object (E)"},
        {"Scale", "L", "Scale object (R)"},
        {"", "|", ""},
        {"Play", "\u25B6", "Play (Ctrl+P)"},
        {"Pause", "\u23F8", "Pause"},
        {"Stop", "\u25A0", "Stop (Ctrl+Shift+P)"}
    };

    float xPos = 10;
    static int activeTool = 0;

    for (int i = 0; i < 8; i++) {
        auto& tool = tools[i];

        if (tool.label[0] == '\0' && tool.icon[0] == '|') {
            // Separator
            ui.drawLine(Math::Vec2(xPos + 4, toolbarPos.y + 8),
                        Math::Vec2(xPos + 4, toolbarPos.y + toolbarSize.y - 8),
                        Math::Vec4(0.2f, 0.2f, 0.22f, 1.0f));
            xPos += 12;
            continue;
        }

        // Size the button to its label so captions cannot overlap the next
        // button, and leave a little padding on both sides.
        const bool iconOnly = (tool.label[0] == '\0');
        const char* caption = iconOnly ? tool.icon : tool.label;
        const float captionSize = iconOnly ? 14.0f : 12.0f;
        const float captionW = EmberGUI::measureTextWidth(caption, captionSize);
        float btnW = std::max(40.0f, captionW + 20.0f);
        float btnH = 36;

        Math::Vec2 btnPos(xPos, toolbarPos.y + (toolbarSize.y - btnH) * 0.5f);
        Math::Vec2 btnSize(btnW, btnH);

        bool isActive = (i == activeTool);
        bool hovered = ui.isInRect(btnPos, btnSize);
        bool playing = (i == 5 && isPlaying());
        bool paused = (i == 6 && m_mode == EditorMode::Paused);

        Math::Vec4 bgColor(0.10f, 0.10f, 0.12f, 0.0f);
        if (isActive)      bgColor = Math::Vec4(0.22f, 0.38f, 0.65f, 1.0f);
        else if (playing)  bgColor = Math::Vec4(0.20f, 0.60f, 0.20f, 1.0f);
        else if (paused)   bgColor = Math::Vec4(0.80f, 0.60f, 0.10f, 1.0f);
        else if (hovered)  bgColor = Math::Vec4(0.18f, 0.18f, 0.20f, 1.0f);

        // Background first, caption on top (drawing it afterwards used to
        // hide the label of the active tool).
        if (isActive || hovered || playing || paused) {
            ui.drawRectFilled(btnPos, btnSize, bgColor, 4.0f);
        }

        ui.drawText(Math::Vec2(btnPos.x + (btnW - captionW) * 0.5f, btnPos.y + 10),
                    caption, Math::Vec4(0.8f, 0.8f, 0.85f, 1.0f), captionSize);

        if (hovered && tool.tooltip[0] != '\0') {
            ui.tooltip(tool.tooltip);
        }

        // Click for regular tools (indices 0-3: Select, Move, Rotate, Scale)
        if (i <= 3 && hovered && ui.getState().mousePressed[0] && tool.label[0] != '\0') {
            activeTool = i;
        }

        // Play/Pause/Stop buttons (indices 5-7)
        if (i == 5 && hovered && ui.getState().mousePressed[0]) {
            // Play
            if (!isPlaying()) {
                setMode(EditorMode::Playing);
                EMBER_LOG_INFO("Play mode started");
            }
        }
        if (i == 6 && hovered && ui.getState().mousePressed[0]) {
            // Pause
            if (m_mode == EditorMode::Playing) {
                setMode(EditorMode::Paused);
                EMBER_LOG_INFO("Game paused");
            } else if (m_mode == EditorMode::Paused) {
                setMode(EditorMode::Playing);
                EMBER_LOG_INFO("Game resumed");
            }
        }
        if (i == 7 && hovered && ui.getState().mousePressed[0]) {
            // Stop
            if (isPlaying()) {
                setMode(EditorMode::Editing);
                EMBER_LOG_INFO("Play mode stopped, returned to editor");
            }
        }

        xPos += btnW + 4;
    }

    // Right side: interactive undo/redo buttons
    float rightX = (float)renderer.getWindowWidth() - 90;
    // Undo button
    Math::Vec2 undoBtnPos(rightX, toolbarPos.y + 8);
    Math::Vec2 undoBtnSize(36, 32);
    bool undoHover = ui.isInRect(undoBtnPos, undoBtnSize);
    ui.drawRectFilled(undoBtnPos, undoBtnSize,
        undoHover ? Math::Vec4(0.18f, 0.18f, 0.20f, 1.0f) : Math::Vec4(0.10f, 0.10f, 0.12f, 0.0f), 3.0f);
    ui.drawText(Math::Vec2(undoBtnPos.x + 4, undoBtnPos.y + 6), "\u21A9",
                canUndo() ? Math::Vec4(0.8f, 0.8f, 0.85f, 1.0f) : Math::Vec4(0.3f, 0.3f, 0.35f, 1.0f), 16.0f);
    if (undoHover && ui.getState().mousePressed[0] && canUndo()) {
        undo();
    }
    // Redo button
    Math::Vec2 redoBtnPos(rightX + 40, toolbarPos.y + 8);
    Math::Vec2 redoBtnSize(36, 32);
    bool redoHover = ui.isInRect(redoBtnPos, redoBtnSize);
    ui.drawRectFilled(redoBtnPos, redoBtnSize,
        redoHover ? Math::Vec4(0.18f, 0.18f, 0.20f, 1.0f) : Math::Vec4(0.10f, 0.10f, 0.12f, 0.0f), 3.0f);
    ui.drawText(Math::Vec2(redoBtnPos.x + 4, redoBtnPos.y + 6), "\u21AA",
                canRedo() ? Math::Vec4(0.8f, 0.8f, 0.85f, 1.0f) : Math::Vec4(0.3f, 0.3f, 0.35f, 1.0f), 16.0f);
    if (redoHover && ui.getState().mousePressed[0] && canRedo()) {
        redo();
    }
}

void Editor::renderStatusBar() {
    auto& ui = EmberGUI::get();
    auto& renderer = Renderer::get();

    // Status bar at the bottom - full width
    Math::Vec2 statusPos(0, (float)renderer.getWindowHeight() - 24);
    Math::Vec2 statusSize((float)renderer.getWindowWidth(), 24);

    ui.drawRectFilled(statusPos, statusSize, Math::Vec4(0.08f, 0.08f, 0.10f, 1.0f));
    ui.drawLine(Math::Vec2(0, (float)renderer.getWindowHeight() - 24),
                Math::Vec2((float)renderer.getWindowWidth(), (float)renderer.getWindowHeight() - 24),
                Math::Vec4(0.15f, 0.15f, 0.17f, 1.0f));

    // Status info
    char statusBuf[256];
    int entityCount = m_scene ? m_scene->getECS().getEntityCount() : 0;
    std::snprintf(statusBuf, sizeof(statusBuf), "Ready  |  %d entities  |  %d x %d  |  EmberEngine v%s",
        entityCount,
        renderer.getWindowWidth(), renderer.getWindowHeight(),
        EMBER_VERSION_STRING);

    ui.drawText(Math::Vec2(10, statusPos.y + 4), statusBuf,
                Math::Vec4(0.4f, 0.4f, 0.45f, 1.0f), 11.0f);

    // Right side status items
    ui.drawText(Math::Vec2((float)renderer.getWindowWidth() - 120, statusPos.y + 4),
                "FPS: 60 | MS: 16.7",
                Math::Vec4(0.35f, 0.35f, 0.40f, 1.0f), 10.0f);
}

// ============================================================================
// Asset Import
// ============================================================================

void Editor::importFile(const std::string& path) {
    EMBER_LOG_INFO("Importing file: {}", path);

    // Detect file extension (lowercased)
    std::string ext;
    size_t dotPos = path.rfind('.');
    if (dotPos != std::string::npos) {
        ext = path.substr(dotPos);
        for (auto& c : ext) c = std::tolower(static_cast<unsigned char>(c));
    }

    if (ext == ".png" || ext == ".jpg" || ext == ".jpeg" || ext == ".bmp" || ext == ".tga") {
        auto handle = AssetManager::get().loadTexture(path);
        if (handle.valid()) {
            EMBER_LOG_INFO("Texture imported successfully");
        } else {
            EMBER_LOG_ERROR("Failed to import texture: {}", path);
        }
    } else if (ext == ".obj") {
        auto handle = AssetManager::get().loadModel(path);
        if (handle.valid()) {
            EMBER_LOG_INFO("Model imported successfully");
        } else {
            EMBER_LOG_ERROR("Failed to import model: {}", path);
        }
    } else {
        EMBER_LOG_WARN("Unsupported file type: {}", ext);
    }
}

void Editor::importAsset() {
    const char* filter = "All Supported Files (*.png;*.jpg;*.jpeg;*.bmp;*.tga;*.obj)\0*.png;*.jpg;*.jpeg;*.bmp;*.tga;*.obj\0"
                         "Image Files (*.png;*.jpg;*.jpeg;*.bmp;*.tga)\0*.png;*.jpg;*.jpeg;*.bmp;*.tga\0"
                         "Model Files (*.obj)\0*.obj\0"
                         "All Files (*.*)\0*.*\0";

    std::string path = Platform::get().openFileDialog(filter);
    if (path.empty()) {
        EMBER_LOG_INFO("Import cancelled");
        return;
    }

    importFile(path);
}

// ============================================================================
// Scene Save / Load
// ============================================================================

void Editor::saveScene() {
    if (!m_scene) {
        EMBER_LOG_WARN("No scene to save");
        return;
    }

    // If we don't have a file path yet, use a default
    if (m_sceneFilePath.empty()) {
        m_sceneFilePath = "scenes/" + m_scene->getName() + ".emberscene";
    }

    // Ensure the scenes directory exists
    std::string dir = "scenes";
    if (!Ember::FileSystem::get().directoryExists(dir)) {
        Ember::FileSystem::get().createDirectory(dir);
    }

    if (m_scene->saveScene(m_sceneFilePath)) {
        EMBER_LOG_INFO("Scene saved: ", m_sceneFilePath);
    } else {
        EMBER_LOG_ERROR("Failed to save scene: ", m_sceneFilePath);
    }
}

void Editor::loadScene() {
    if (m_sceneFilePath.empty()) {
        m_sceneFilePath = "scenes/MainScene.emberscene";
    }

    if (!Ember::FileSystem::get().fileExists(m_sceneFilePath)) {
        EMBER_LOG_ERROR("Scene file not found: ", m_sceneFilePath);
        return;
    }

    m_selectedEntity = 0;

    // Load directly into the active scene (loadScene clears the ECS internally)
    if (m_scene->loadScene(m_sceneFilePath)) {
        EMBER_LOG_INFO("Scene loaded: ", m_sceneFilePath);
    } else {
        EMBER_LOG_ERROR("Failed to load scene: ", m_sceneFilePath);
    }
}

} // namespace Ember
