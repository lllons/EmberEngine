#include "Engine/UI/DockManager.h"
#include "GUI/EmberGUI.h"
#include "Engine/Core/Logging.h"
#include "Engine/Rendering/Renderer.h"
#include "Engine/Rendering/GL.h"
#include <algorithm>
#include <cmath>
#include <cstring>
#include <sstream>
#include <string>

namespace Ember {

// ============================================================================
// Construction
// ============================================================================

DockManager::DockManager() = default;
DockManager::~DockManager() = default;

void DockManager::init(const Math::Vec2& displaySize) {
    m_displaySize = displaySize;
    buildDefaultLayout();
    EMBER_LOG_INFO("DockManager initialized");
}

// ============================================================================
// Panel Registration
// ============================================================================

void DockManager::registerPanel(const std::string& title, const std::string& id,
                                 std::function<void()> renderFn,
                                 DockSide defaultSide) {
    for (auto& p : m_pendingPanels) {
        if (p.id == id) return;
    }
    m_pendingPanels.push_back({title, id, renderFn, defaultSide});
}

void DockManager::applyPendingPanels() {
    if (m_pendingPanels.empty() || !m_root) return;

    for (auto& pp : m_pendingPanels) {
        DockPanel panel;
        panel.title = pp.title;
        panel.id = pp.id;
        panel.renderFn = pp.renderFn;

        // Find the appropriate leaf node to add this panel to.
        // Layout structure:
        //   root (bottom split): mainArea (up to 75%) | bottomNode (~25%)
        //     mainArea (left split): leftNode (22%) | centerArea (78%)
        //       centerArea (right split): centerNode (82%) | rightStrip (18%)
        DockNode* target = nullptr;
        switch (pp.defaultSide) {
            case DockSide::Left:
                // Left panel: go to left leaf of mainArea
                if (m_root->childA && m_root->childA->childA) {
                    target = m_root->childA->childA.get();  // leftNode
                }
                break;
            case DockSide::Right:
                // Right panel: right-most leaf = centerArea->childB
                if (m_root->childA && m_root->childA->childB) {
                    auto& ca = m_root->childA->childB;
                    if (ca->childB) {
                        target = ca->childB.get();  // rightStrip
                    }
                }
                break;
            case DockSide::Bottom:
                // Bottom panel: go to bottom leaf (root->childB)
                if (m_root->childB) {
                    target = m_root->childB.get();  // bottomNode
                }
                break;
            case DockSide::Top:
                // Top panel: goes to center area (centerNode)
                if (m_root->childA && m_root->childA->childB) {
                    auto& ca = m_root->childA->childB;
                    if (ca->childA) {
                        target = ca->childA.get();  // centerNode
                    }
                }
                break;
            case DockSide::Center:
            default:
                // Center area: centerNode
                if (m_root->childA && m_root->childA->childB) {
                    auto& ca = m_root->childA->childB;
                    if (ca->childA) {
                        target = ca->childA.get();  // centerNode
                    }
                }
                break;
        }

        if (target) {
            target->panels.push_back(panel);
            target->activePanel = (int)target->panels.size() - 1;
        } else {
            // Fallback: add to root
            m_root->panels.push_back(panel);
            m_root->activePanel = (int)m_root->panels.size() - 1;
        }
    }
    m_pendingPanels.clear();
}

// ============================================================================
// Default Layout
// ============================================================================

void DockManager::buildDefaultLayout() {
    m_root = std::make_unique<DockNode>();
    m_root->position = Math::Vec2(0, 80);
    m_root->size = m_displaySize - Math::Vec2(0, 104);

    // Split root: Main content | Bottom strip (console, asset browser)
    auto mainArea = std::make_unique<DockNode>();
    auto bottomNode = std::make_unique<DockNode>();

    // Split mainArea: Left (hierarchy) | Center + Right
    auto leftNode = std::make_unique<DockNode>();
    auto centerArea = std::make_unique<DockNode>();

    // Split centerArea: Center (viewport) | Right strip (inspector)
    auto centerNode = std::make_unique<DockNode>();
    auto rightStrip = std::make_unique<DockNode>();

    // Build tree
    // Right strip split from center
    centerArea->splitDir = DockSide::Right;
    centerArea->splitRatio = 0.82f;
    centerArea->childA = std::move(centerNode);
    centerArea->childB = std::move(rightStrip);

    // Left split from center area
    mainArea->splitDir = DockSide::Left;
    mainArea->splitRatio = 0.22f;
    mainArea->childA = std::move(leftNode);
    mainArea->childB = std::move(centerArea);

    // Bottom split from main content
    m_root->splitDir = DockSide::Bottom;
    m_root->splitRatio = 0.75f;
    m_root->childA = std::move(mainArea);
    m_root->childB = std::move(bottomNode);
}

// ============================================================================
// Frame
// ============================================================================

void DockManager::beginFrame(const Math::Vec2& displaySize, const Math::Vec2& mousePos,
                              const bool* mouseDown, const bool* mousePressed) {
    m_displaySize = displaySize;
    (void)mousePos;
    (void)mouseDown;
    (void)mousePressed;
}

void DockManager::endFrame() {
    auto& ui = EmberGUI::get();
    const auto& state = ui.getState();

    // Handle panel drop on drag end
    if (m_dragState.dragging && !state.mouseDown[0]) {
        // Drop the panel - find target zone
        if (m_dragState.hoverZone != DockSide::None) {
            DockNode* target = findNodeAt(m_root.get(), state.mousePos);
            if (target && target->isLeaf()) {
                DockPanel* sourcePanel = findPanel(m_dragState.panelId);
                DockNode* sourceNode = findNodeContaining(m_root.get(), m_dragState.panelId);

                if (sourcePanel && sourceNode && sourceNode != target) {
                    // Move panel to target
                    target->panels.push_back(*sourcePanel);
                    target->activePanel = (int)target->panels.size() - 1;

                    // Remove from source
                    auto& srcPanels = sourceNode->panels;
                    for (auto it = srcPanels.begin(); it != srcPanels.end(); ++it) {
                        if (it->id == sourcePanel->id) {
                            srcPanels.erase(it);
                            break;
                        }
                    }
                    if (sourceNode->activePanel >= (int)sourceNode->panels.size()) {
                        sourceNode->activePanel = std::max(0, (int)sourceNode->panels.size() - 1);
                    }
                }
            }
        }
        m_dragState.dragging = false;
        m_dragState.hoverZone = DockSide::None;
        m_splitterDrag.dragging = false;
    }

    // Apply pending panels
    if (!m_pendingPanels.empty()) {
        applyPendingPanels();
    }
}

// ============================================================================
// Layout
// ============================================================================

void DockManager::layoutNode(DockNode* node, const Math::Vec2& pos, const Math::Vec2& size) {
    if (!node) return;

    node->position = pos;
    node->size = size;

    if (node->isLeaf()) return;

    // Layout children based on split direction
    if (node->childA && node->childB) {
        float split = node->splitRatio;
        const float splitterW = 4.0f;

        switch (node->splitDir) {
            case DockSide::Left:
            case DockSide::Right: {
                float splitW = size.x * split;
                if (splitW < 50.0f) splitW = 50.0f;
                if (splitW > size.x - 50.0f - splitterW) splitW = size.x - 50.0f - splitterW;
                layoutNode(node->childA.get(), pos, Math::Vec2(splitW, size.y));
                layoutNode(node->childB.get(),
                          Math::Vec2(pos.x + splitW + splitterW, pos.y),
                          Math::Vec2(size.x - splitW - splitterW, size.y));
                break;
            }
            case DockSide::Top:
            case DockSide::Bottom: {
                float splitH = size.y * split;
                if (splitH < 50.0f) splitH = 50.0f;
                if (splitH > size.y - 50.0f - splitterW) splitH = size.y - 50.0f - splitterW;
                layoutNode(node->childA.get(), pos, Math::Vec2(size.x, splitH));
                layoutNode(node->childB.get(),
                          Math::Vec2(pos.x, pos.y + splitH + splitterW),
                          Math::Vec2(size.x, size.y - splitH - splitterW));
                break;
            }
            default:
                break;
        }
    }
}

// ============================================================================
// Rendering
// ============================================================================

void DockManager::render() {
    if (!m_root) return;
    auto& ui = EmberGUI::get();

    // Layout the dock tree
    Math::Vec2 dockAreaPos(0, 80);
    Math::Vec2 dockAreaSize = m_displaySize - Math::Vec2(0, 104);
    layoutNode(m_root.get(), dockAreaPos, dockAreaSize);

    // Handle splitter dragging
    handleSplitterDrag(m_root.get());

    // Render dock preview zones when dragging
    if (m_dragState.dragging) {
        renderDockPreviewZones();
    }

    // Render the dock tree
    renderNode(m_root.get());

    // Render floating panels
    for (auto& fp : m_floatingPanels) {
        if (!fp.panel.visible) continue;

        float titleH = 24.0f;
        Math::Vec2 titleBarPos = fp.position;
        Math::Vec2 titleBarSize(fp.size.x, titleH);

        // Drag handling
        bool titleHover = ui.isInRect(titleBarPos, titleBarSize);
        if (titleHover && ui.getState().mousePressed[0]) {
            fp.dragging = true;
            fp.dragOffset = ui.getState().mousePos - fp.position;
        }
        if (!ui.getState().mouseDown[0]) {
            fp.dragging = false;
        }
        if (fp.dragging) {
            fp.position = ui.getState().mousePos - fp.dragOffset;
        }

        // Draw floating panel
        ui.drawRectFilled(fp.position, fp.size, Math::Vec4(0.14f, 0.14f, 0.16f, 0.95f), 4.0f);
        ui.drawRect(fp.position, fp.size, Math::Vec4(0.3f, 0.3f, 0.35f, 1.0f), 4.0f);

        // Title bar
        ui.drawRectFilled(titleBarPos, titleBarSize, Math::Vec4(0.10f, 0.10f, 0.12f, 1.0f), 4.0f);
        ui.drawText(Math::Vec2(fp.position.x + 8, fp.position.y + 4), fp.panel.title,
                    Math::Vec4(0.8f, 0.8f, 0.85f, 1.0f), 12.0f);

        // Close button
        Math::Vec2 closeBtnPos(fp.position.x + fp.size.x - 20, fp.position.y + 4);
        bool closeHover = ui.isInRect(closeBtnPos, Math::Vec2(16, 16));
        if (closeHover && ui.getState().mousePressed[0]) {
            fp.panel.visible = false;
        }
        ui.drawText(closeBtnPos, "X", Math::Vec4(0.8f, 0.3f, 0.3f, 1.0f), 11.0f);

        // Render panel content with proper context
        if (fp.panel.renderFn) {
            // Set the window context for this panel
            ui.getContext().windowPos = fp.position;
            ui.getContext().windowSize = Math::Vec2(fp.size.x - 8, fp.size.y - titleH - 8);
            ui.setCursorPos(Math::Vec2(fp.position.x + 4, fp.position.y + titleH + 4));

            fp.panel.renderFn();
        }
    }
}

void DockManager::renderNode(DockNode* node) {
    if (!node) return;

    if (node->isLeaf()) {
        // Filter out invisible panels
        std::vector<int> visibleIndices;
        for (int i = 0; i < (int)node->panels.size(); i++) {
            if (node->panels[i].visible) {
                visibleIndices.push_back(i);
            }
        }

        if (visibleIndices.empty()) return;

        Math::Vec2 pos = node->position;
        Math::Vec2 sz = node->size;
        auto& ui = EmberGUI::get();

        // Everything this node draws - tab strip included - stays inside its
        // rectangle, so wide tab titles cannot spill into the neighbour panel.
        ui.pushClipRect(pos, sz);

        // Panel background. Transparent panels (Scene View) let the 3D scene
        // rendered behind the GUI show through.
        const bool opaque = node->activePanel >= 0 &&
                            node->activePanel < (int)node->panels.size() &&
                            node->panels[node->activePanel].opaqueBackground;
        if (opaque) {
            ui.drawRectFilled(pos, sz, Math::Vec4(0.14f, 0.14f, 0.16f, 1.0f));
        }
        ui.drawRect(pos, sz, Math::Vec4(0.2f, 0.2f, 0.22f, 1.0f));

        // Tab bar at top
        float tabH = 26.0f;
        Math::Vec2 tabBarPos = pos;
        Math::Vec2 tabBarSize(sz.x, tabH);

        ui.drawRectFilled(tabBarPos, tabBarSize, Math::Vec4(0.10f, 0.10f, 0.12f, 1.0f));

        // Draw tabs for visible panels
        float tabX = tabBarPos.x + 2;
        // Find the active panel index within visible panels
        int activeVisibleIdx = 0;
        for (int i = 0; i < (int)visibleIndices.size(); i++) {
            if (visibleIndices[i] == node->activePanel) {
                activeVisibleIdx = i;
                break;
            }
        }
        // If the current active panel is hidden, adjust
        if (node->activePanel >= (int)node->panels.size() || !node->panels[node->activePanel].visible) {
            node->activePanel = visibleIndices.empty() ? 0 : visibleIndices[0];
            activeVisibleIdx = 0;
        }

        for (int vi = 0; vi < (int)visibleIndices.size(); vi++) {
            int i = visibleIndices[vi];
            auto& panel = node->panels[i];
            bool isActive = (i == node->activePanel);
            float tabW = (float)panel.title.size() * 7.5f + 24.0f;

            Math::Vec2 tabPos(tabX, tabBarPos.y + 2);
            Math::Vec2 tabSize(tabW, tabH - 2);

            bool tabHovered = ui.isInRect(tabPos, tabSize);
            Math::Vec4 tabColor = isActive ? Math::Vec4(0.18f, 0.18f, 0.20f, 1.0f)
                              : (tabHovered ? Math::Vec4(0.15f, 0.15f, 0.17f, 1.0f)
                              : Math::Vec4(0.10f, 0.10f, 0.12f, 1.0f));

            ui.drawRectFilled(tabPos, tabSize, tabColor, 2.0f);

            if (isActive) {
                ui.drawRectFilled(Math::Vec2(tabPos.x, tabPos.y + tabSize.y - 2),
                                 Math::Vec2(tabSize.x, 2), Math::Vec4(0.3f, 0.6f, 1.0f, 1.0f));
            }

            ui.drawText(Math::Vec2(tabPos.x + 6, tabPos.y + 5), panel.title,
                        isActive ? Math::Vec4(1.0f, 1.0f, 1.0f, 1.0f)
                        : Math::Vec4(0.6f, 0.6f, 0.65f, 1.0f), 12.0f);

            // Tab interaction
            if (tabHovered && ui.getState().mousePressed[0]) {
                node->activePanel = i;
            }

            // Drag tab to undock
            if (tabHovered && ui.getState().mouseDown[0] && isActive && node->panels.size() > 1) {
                // Check if mouse has moved enough to start a drag
                Math::Vec2 dragDelta = ui.getState().mousePos - ui.getCursorPos();
                if (std::abs(dragDelta.x) > 5.0f || std::abs(dragDelta.y) > 5.0f) {
                    m_dragState.dragging = true;
                    m_dragState.panelId = panel.id;
                    m_dragState.dragStartPos = ui.getState().mousePos;
                }
            }

            tabX += tabW + 1;
        }

        // Render active panel content with proper window context
        if (node->activePanel >= 0 && node->activePanel < (int)node->panels.size()) {
            auto& activePanel = node->panels[node->activePanel];
            if (activePanel.visible && activePanel.renderFn) {
                // Set window context so widgets can calculate their sizes correctly
                Math::Vec2 contentPos(pos.x + 4, pos.y + tabH + 4);
                Math::Vec2 contentSize(sz.x - 8, sz.y - tabH - 8);

                ui.getContext().windowPos = contentPos;
                ui.getContext().windowSize = contentSize;
                ui.setCursorPos(contentPos);

                // Clip the panel's content to its own rectangle (recorded into
                // each draw command and applied by the renderer, since the
                // commands are executed after the whole frame is recorded) and
                // let long content scroll with the mouse wheel.
                ui.beginScrollArea(activePanel.scrollOffset, contentSize);
                activePanel.renderFn();
                ui.endScrollArea();
            }
        }

        ui.popClipRect();
    } else {
        // Render children
        renderNode(node->childA.get());
        renderNode(node->childB.get());

        // Render splitter between children
        if (node->childA && node->childB && !node->collapsed) {
            Math::Vec2 aEnd = node->childA->position + node->childA->size;
            bool hor = (node->splitDir == DockSide::Left || node->splitDir == DockSide::Right);
            if (hor) {
                renderSplitter(Math::Vec2(aEnd.x, node->childA->position.y),
                              node->childA->size.y, true);
            } else {
                renderSplitter(Math::Vec2(node->childA->position.x, aEnd.y),
                              node->childA->size.x, false);
            }
        }
    }
}

void DockManager::renderSplitter(const Math::Vec2& pos, float length, bool horizontal) {
    auto& ui = EmberGUI::get();
    float splitterThickness = 4.0f;

    Math::Vec2 splitterPos, splitterSize;
    if (horizontal) {
        splitterPos = Math::Vec2(pos.x - splitterThickness * 0.5f, pos.y);
        splitterSize = Math::Vec2(splitterThickness, length);
    } else {
        splitterPos = Math::Vec2(pos.x, pos.y - splitterThickness * 0.5f);
        splitterSize = Math::Vec2(length, splitterThickness);
    }

    bool hovered = ui.isInRect(splitterPos, splitterSize);
    Math::Vec4 color = hovered ? Math::Vec4(0.3f, 0.6f, 1.0f, 0.5f)
                               : Math::Vec4(0.2f, 0.2f, 0.22f, 1.0f);
    ui.drawRectFilled(splitterPos, splitterSize, color);
}

void DockManager::renderDockPreviewZones() {
    auto& ui = EmberGUI::get();
    float edgeThreshold = 0.15f;
    float previewAlpha = 0.2f;
    Math::Vec4 zoneColor(0.3f, 0.6f, 1.0f, previewAlpha);
    Math::Vec4 zoneBorder(0.3f, 0.6f, 1.0f, 0.5f);

    auto drawZone = [&](const Math::Vec2& p, const Math::Vec2& s) {
        ui.drawRectFilled(p, s, zoneColor);
        ui.drawRect(p, s, zoneBorder, 2.0f);
    };

    // Edge zones
    float edgeW = m_displaySize.x * edgeThreshold;
    float edgeH = m_displaySize.y * edgeThreshold;

    // Left zone
    drawZone(Math::Vec2(0, 80), Math::Vec2(edgeW, m_displaySize.y - 180));

    // Right zone
    drawZone(Math::Vec2(m_displaySize.x - edgeW, 80),
             Math::Vec2(edgeW, m_displaySize.y - 180));

    // Determine hovered zone
    Math::Vec2 mousePos = ui.getState().mousePos;
    float mx = mousePos.x / m_displaySize.x;
    float my = (mousePos.y - 80) / (m_displaySize.y - 180);

    if (mx < edgeThreshold) m_dragState.hoverZone = DockSide::Left;
    else if (mx > 1.0f - edgeThreshold) m_dragState.hoverZone = DockSide::Right;
    else if (my < edgeThreshold) m_dragState.hoverZone = DockSide::Top;
    else if (my > 1.0f - edgeThreshold) m_dragState.hoverZone = DockSide::Bottom;
    else m_dragState.hoverZone = DockSide::Center;
}

// ============================================================================
// Hit Testing
// ============================================================================

DockNode* DockManager::hitTestNode(DockNode* node, const Math::Vec2& pos) {
    if (!node) return nullptr;

    if (pos.x >= node->position.x && pos.x <= node->position.x + node->size.x &&
        pos.y >= node->position.y && pos.y <= node->position.y + node->size.y) {
        if (node->isLeaf()) return node;
        DockNode* found = hitTestNode(node->childA.get(), pos);
        if (found) return found;
        return hitTestNode(node->childB.get(), pos);
    }
    return nullptr;
}

DockNode* DockManager::findNodeAt(DockNode* node, const Math::Vec2& pos) {
    return hitTestNode(node, pos);
}

DockNode* DockManager::findNodeContaining(DockNode* node, const std::string& panelId) {
    if (!node) return nullptr;
    if (node->isLeaf()) {
        for (auto& p : node->panels) {
            if (p.id == panelId) return node;
        }
    }
    DockNode* found = findNodeContaining(node->childA.get(), panelId);
    if (found) return found;
    return findNodeContaining(node->childB.get(), panelId);
}

bool DockManager::isInSplitter(DockNode* parent, const Math::Vec2& pos, float& outRatio) {
    if (!parent || parent->isLeaf() || !parent->childA || !parent->childB) return false;

    float splitterThickness = 6.0f;
    bool hor = (parent->splitDir == DockSide::Left || parent->splitDir == DockSide::Right);
    Math::Vec2 aEnd = parent->childA->position + parent->childA->size;

    if (hor) {
        float sx = aEnd.x;
        if (pos.x >= sx - splitterThickness * 0.5f && pos.x <= sx + splitterThickness * 0.5f &&
            pos.y >= parent->childA->position.y &&
            pos.y <= parent->childA->position.y + parent->childA->size.y) {
            outRatio = parent->splitRatio;
            return true;
        }
    } else {
        float sy = aEnd.y;
        if (pos.y >= sy - splitterThickness * 0.5f && pos.y <= sy + splitterThickness * 0.5f &&
            pos.x >= parent->childA->position.x &&
            pos.x <= parent->childA->position.x + parent->childA->size.x) {
            outRatio = parent->splitRatio;
            return true;
        }
    }
    return false;
}

// ============================================================================
// Drag Handling
// ============================================================================

void DockManager::handleSplitterDrag(DockNode* node) {
    if (!node || node->isLeaf()) return;

    auto& ui = EmberGUI::get();
    Math::Vec2 mousePos = ui.getState().mousePos;

    // Check if we're hovering or dragging a splitter
    float ratio = 0.5f;
    if (isInSplitter(node, mousePos, ratio)) {
        if (ui.getState().mousePressed[0]) {
            m_splitterDrag.node = node;
            m_splitterDrag.dragging = true;
        }
    }

    if (m_splitterDrag.dragging && m_splitterDrag.node == node) {
        if (ui.getState().mouseDown[0]) {
            bool hor = (node->splitDir == DockSide::Left || node->splitDir == DockSide::Right);
            if (hor) {
                float totalW = node->size.x;
                if (totalW > 0) {
                    float mouseRel = mousePos.x - node->position.x;
                    node->splitRatio = std::max(0.15f, std::min(0.85f, mouseRel / totalW));
                }
            } else {
                float totalH = node->size.y;
                if (totalH > 0) {
                    float mouseRel = mousePos.y - node->position.y;
                    node->splitRatio = std::max(0.15f, std::min(0.85f, mouseRel / totalH));
                }
            }
        } else {
            m_splitterDrag.dragging = false;
            m_splitterDrag.node = nullptr;
        }
    }

    handleSplitterDrag(node->childA.get());
    handleSplitterDrag(node->childB.get());
}

// ============================================================================
// Panel Access
// ============================================================================

bool DockManager::getPanelContentRect(const std::string& id, Math::Vec2& outPos,
                                      Math::Vec2& outSize) const {
    // Depth-first search over the dock tree for a visible panel with that id.
    struct Search {
        static const DockNode* find(const DockNode* node, const std::string& id) {
            if (!node) return nullptr;
            if (node->isLeaf()) {
                for (const auto& panel : node->panels) {
                    if (panel.id == id && panel.visible) return node;
                }
                return nullptr;
            }
            if (const DockNode* found = find(node->childA.get(), id)) return found;
            return find(node->childB.get(), id);
        }
    };

    const DockNode* node = Search::find(m_root.get(), id);
    if (!node || node->size.x <= 0.0f || node->size.y <= 0.0f) return false;

    const float tabH = 26.0f;
    outPos = Math::Vec2(node->position.x + 4.0f, node->position.y + tabH + 4.0f);
    outSize = Math::Vec2(node->size.x - 8.0f, node->size.y - tabH - 8.0f);
    return outSize.x > 0.0f && outSize.y > 0.0f;
}

DockPanel* DockManager::findPanel(const std::string& id) {
    std::function<DockPanel*(DockNode*)> search = [&](DockNode* node) -> DockPanel* {
        if (!node) return nullptr;
        if (node->isLeaf()) {
            for (auto& p : node->panels) {
                if (p.id == id) return &p;
            }
        }
        DockPanel* found = search(node->childA.get());
        if (found) return found;
        return search(node->childB.get());
    };
    return search(m_root.get());
}

bool DockManager::isPanelVisible(const std::string& id) const {
    std::function<bool(const DockNode*)> search = [&](const DockNode* node) -> bool {
        if (!node) return false;
        if (node->isLeaf()) {
            for (auto& p : node->panels) {
                if (p.id == id) return p.visible;
            }
        }
        bool found = search(node->childA.get());
        if (found) return true;
        return search(node->childB.get());
    };
    return search(m_root.get());
}

void DockManager::setPanelVisible(const std::string& id, bool visible) {
    DockPanel* panel = findPanel(id);
    if (panel) panel->visible = visible;
}

void DockManager::togglePanel(const std::string& id) {
    DockPanel* panel = findPanel(id);
    if (panel) panel->visible = !panel->visible;
}

void DockManager::focusPanel(const std::string& id) {
    std::function<void(DockNode*)> search = [&](DockNode* node) {
        if (!node) return;
        if (node->isLeaf()) {
            for (int i = 0; i < (int)node->panels.size(); i++) {
                if (node->panels[i].id == id) {
                    node->activePanel = i;
                    return;
                }
            }
        }
        search(node->childA.get());
        search(node->childB.get());
    };
    search(m_root.get());
}

DockSide DockManager::getDockZoneAt(const Math::Vec2& pos, const Math::Vec2& panelSize) const {
    (void)panelSize;
    float edgeThreshold = 0.15f;
    float mx = pos.x / m_displaySize.x;
    float my = pos.y / m_displaySize.y;

    if (mx < edgeThreshold) return DockSide::Left;
    if (mx > 1.0f - edgeThreshold) return DockSide::Right;
    if (my < edgeThreshold) return DockSide::Top;
    if (my > 1.0f - edgeThreshold) return DockSide::Bottom;
    return DockSide::Center;
}

// ============================================================================
// Layout Helpers
// ============================================================================

DockNode* DockManager::addPanelToNode(DockNode* node, const DockPanel& panel) {
    if (!node) return nullptr;
    if (!node->isLeaf()) {
        return addPanelToNode(node->childA.get(), panel);
    }
    node->panels.push_back(panel);
    node->activePanel = (int)node->panels.size() - 1;
    return node;
}

// ============================================================================
// Serialization
// ============================================================================

std::string DockManager::serializeLayout() const {
    // Basic serialization - saves panel positions and active states
    std::string result;
    result += "EmberDockLayout v1\n";

    std::function<void(const DockNode*)> serialize = [&](const DockNode* node) {
        if (!node) return;
        result += "NODE ";
        result += std::to_string((int)node->splitDir);
        result += " " + std::to_string(node->splitRatio);
        result += " " + std::to_string(node->activePanel);
        result += " " + std::to_string(node->panels.size()) + "\n";

        for (auto& p : node->panels) {
            result += "PANEL " + p.id + " " + std::to_string(p.visible) + "\n";
        }

        if (node->childA) serialize(node->childA.get());
        if (node->childB) serialize(node->childB.get());
    };

    serialize(m_root.get());
    return result;
}

bool DockManager::deserializeLayout(const std::string& data) {
    // Simple deserialization
    if (data.empty() || data.substr(0, 17) != "EmberDockLayout v1") return false;

    // Parse line by line to restore panel visibility and active states
    std::vector<DockNode*> nodeStack;
    nodeStack.push_back(m_root.get());

    std::istringstream stream(data);
    std::string line;
    std::getline(stream, line); // Skip header

    // Apply visibility settings
    while (std::getline(stream, line)) {
        if (line.substr(0, 6) == "PANEL ") {
            auto rest = line.substr(6);
            auto space = rest.find(' ');
            if (space != std::string::npos) {
                std::string id = rest.substr(0, space);
                bool visible = rest.substr(space + 1) == "1";
                DockPanel* panel = findPanel(id);
                if (panel) panel->visible = visible;
            }
        }
    }

    return true;
}

// ============================================================================
// Color Helpers
// ============================================================================

Math::Vec4 DockManager::darken(const Math::Vec4& c, float factor) const {
    return Math::Vec4(c.x * factor, c.y * factor, c.z * factor, c.w);
}

Math::Vec4 DockManager::lighten(const Math::Vec4& c, float factor) const {
    return Math::Vec4(
        std::min(1.0f, c.x + (1.0f - c.x) * factor),
        std::min(1.0f, c.y + (1.0f - c.y) * factor),
        std::min(1.0f, c.z + (1.0f - c.z) * factor),
        c.w
    );
}

} // namespace Ember
