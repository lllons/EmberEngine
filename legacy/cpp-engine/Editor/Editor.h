#pragma once

#include "Engine/Engine.h"
#include "Engine/UI/DockManager.h"
#include <memory>
#include <vector>
#include <string>

namespace Ember {

class Scene;

class Editor {
public:
    enum class EditorMode { Editing, Playing, Paused };

    Editor();
    ~Editor();

    bool init();
    void shutdown();
    void run();
    void render();

    // Scene
    void setScene(Scene* scene) { m_scene = scene; }
    Scene* getScene() const { return m_scene; }

    // Panels
    void renderViewport();
    void renderGameView();
    void renderHierarchy();
    void renderInspector();
    void renderAssetBrowser();
    void renderConsole();
    void renderProfiler();
    void renderMaterialEditor();
    void renderPrefabBrowser();

    // Editor chrome
    void renderMenuBar();
    void renderMenuPopup(bool pressAvailable);
    void renderToolbar();
    void renderStatusBar();

    // Editor state
    bool isRunning() const { return m_running; }
    bool isInitialized() const { return m_initialized; }
    EditorMode getMode() const { return m_mode; }
    bool isPlaying() const { return m_mode == EditorMode::Playing || m_mode == EditorMode::Paused; }
    void setMode(EditorMode mode) { m_mode = mode; }

    // Dock manager access
    DockManager& getDockManager() { return m_dockManager; }

    // Asset import
    void importAsset();
    static void importFile(const std::string& path);

    // ============ Undo / Redo ============
    void beginActionGroup(const std::string& label);
    void endActionGroup();
    void undo();
    void redo();
    bool canUndo() const { return !m_undoHistory.empty(); }
    bool canRedo() const { return !m_redoHistory.empty(); }
    const std::string& getUndoLabel() const;
    const std::string& getRedoLabel() const;
    void clearHistory() { m_undoHistory.clear(); m_redoHistory.clear(); }

private:
    bool m_running = false;
    bool m_initialized = false;
    Scene* m_scene = nullptr;
    
    // Editor state
    Ember::Entity m_selectedEntity = 0;
    std::string m_sceneFilePath;
    EditorMode m_mode = EditorMode::Editing;

    // Docking system
    DockManager m_dockManager;

    // Panel registration
    void registerPanels();
    void saveScene();
    void loadScene();

    // Menus
    void runMenuAction(const std::string& menu, const std::string& item);
    int m_openMenuIndex = -1;

    // ============ Undo / Redo State ============
    struct Snapshot {
        std::string label;
        std::string sceneName;
        std::string ecsData; // Serialized ECS state
    };

    static const size_t MAX_HISTORY = 100;
    std::vector<Snapshot> m_undoHistory;
    std::vector<Snapshot> m_redoHistory;
    bool m_actionInProgress = false;
    std::string m_actionLabel;

    std::string serializeECS();
    void deserializeECS(const std::string& data);
};

} // namespace Ember
