#pragma once

#include "Engine/Math/Math.h"
#include <string>
#include <vector>
#include <functional>
#include <memory>
#include <cstdint>

namespace Ember {

// ============ Dock Side ============
enum class DockSide {
    None,
    Left,
    Right,
    Top,
    Bottom,
    Center,
    Float
};

// ============ Dock Panel ============
struct DockPanel {
    std::string title;
    std::string id;
    std::function<void()> renderFn;
    bool visible = true;
    bool closable = true;
    bool pinned = true;
    // When false the panel does not paint a background, letting the 3D scene
    // rendered underneath show through (Scene View / Game View).
    bool opaqueBackground = true;
    // Scroll position of the panel's content, driven by the mouse wheel.
    Math::Vec2 scrollOffset = Math::Vec2::zero();
};

// ============ Dock Node ============
// A node in the dock layout tree.
// Leaf nodes hold panels (tabs). Split nodes have two children arranged horizontally or vertically.
struct DockNode {
    // Split direction (None = leaf node with panels)
    DockSide splitDir = DockSide::None;
    // Split ratio (0.0 - 1.0) between childA and childB
    float splitRatio = 0.5f;
    // Child nodes (nullptr for leaf nodes)
    std::unique_ptr<DockNode> childA;
    std::unique_ptr<DockNode> childB;
    // Panels in this leaf node (tabs)
    std::vector<DockPanel> panels;
    // Active tab index
    int activePanel = 0;
    // Computed position and size (set during layout)
    Math::Vec2 position;
    Math::Vec2 size;
    // Whether this node is minimized/collapsed
    bool collapsed = false;

    bool isLeaf() const { return !childA && !childB; }
};

// ============ Drag State ============
struct DockDragState {
    bool dragging = false;
    std::string panelId;
    Math::Vec2 dragStartPos;
    DockSide hoverZone = DockSide::None;
};

// ============ Floating Panel ============
struct FloatingPanel {
    DockPanel panel;
    Math::Vec2 position;
    Math::Vec2 size;
    bool dragging = false;
    Math::Vec2 dragOffset;
};

// ============ Dock Manager ============
class DockManager {
public:
    DockManager();
    ~DockManager();

    // Initialize with display size
    void init(const Math::Vec2& displaySize);

    // Register a dockable panel
    void registerPanel(const std::string& title, const std::string& id,
                       std::function<void()> renderFn,
                       DockSide defaultSide = DockSide::Center);

    // Begin a new frame (call before layout)
    void beginFrame(const Math::Vec2& displaySize, const Math::Vec2& mousePos,
                    const bool* mouseDown, const bool* mousePressed);

    // Run layout and render all panels
    void render();

    // End frame (cleanup)
    void endFrame();

    // Access panels
    DockPanel* findPanel(const std::string& id);

    // Screen-space rectangle of a panel's content area (below its tab strip),
    // using the layout computed by the last render(). Returns false if the
    // panel is not currently docked or visible.
    bool getPanelContentRect(const std::string& id, Math::Vec2& outPos, Math::Vec2& outSize) const;
    bool isPanelVisible(const std::string& id) const;
    void setPanelVisible(const std::string& id, bool visible);
    void togglePanel(const std::string& id);

    // Focus a panel (bring tab to front)
    void focusPanel(const std::string& id);

    // Get dock zone at position (for drag preview)
    DockSide getDockZoneAt(const Math::Vec2& pos, const Math::Vec2& panelSize) const;

    // Save/restore layout strings
    std::string serializeLayout() const;
    bool deserializeLayout(const std::string& data);

    // Access floating panels
    std::vector<FloatingPanel>& getFloatingPanels() { return m_floatingPanels; }

    // Check if any floating panel is being dragged
    bool isDraggingFloating() const { return m_dragState.dragging; }

private:
    // Root dock node
    std::unique_ptr<DockNode> m_root;

    // Floating panels
    std::vector<FloatingPanel> m_floatingPanels;

    // Registered panels (not yet placed)
    struct PendingPanel {
        std::string title;
        std::string id;
        std::function<void()> renderFn;
        DockSide defaultSide;
    };
    std::vector<PendingPanel> m_pendingPanels;

    // Drag state
    DockDragState m_dragState;

    // Display size
    Math::Vec2 m_displaySize;

    // Node ID counter for hover tracking
    uint64_t m_nextNodeId = 1;

    // Layout functions
    void layoutNode(DockNode* node, const Math::Vec2& pos, const Math::Vec2& size);
    void renderNode(DockNode* node);
    void renderTitleBar(DockNode* node, const Math::Vec2& pos, const Math::Vec2& size,
                        const std::string& title, bool isActive);
    void renderSplitter(const Math::Vec2& pos, float length, bool horizontal);
    void renderDockPreviewZones();

    // Hit testing
    DockNode* hitTestNode(DockNode* node, const Math::Vec2& pos);
    DockNode* findNodeAt(DockNode* node, const Math::Vec2& pos);
    DockNode* findNodeContaining(DockNode* node, const std::string& panelId);
    bool isInSplitter(DockNode* parent, const Math::Vec2& pos, float& outRatio);

    // Drag handling
    void handleSplitterDrag(DockNode* node);

    // Splitters being dragged
    struct SplitterDrag {
        DockNode* node = nullptr;
        bool dragging = false;
    };
    SplitterDrag m_splitterDrag;

    // Helper
    void buildDefaultLayout();
    void applyPendingPanels();
    DockNode* addPanelToNode(DockNode* node, const DockPanel& panel);

    // Color helpers
    Math::Vec4 darken(const Math::Vec4& c, float factor) const;
    Math::Vec4 lighten(const Math::Vec4& c, float factor) const;
};

} // namespace Ember
