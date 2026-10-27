#pragma once

#include "Engine/Math/Math.h"
#include "Engine/Platform/Platform.h"
#include <string>
#include <vector>
#include <functional>
#include <unordered_map>
#include <cstdint>

namespace Ember {

// Forward declarations
class Shader;

// ============ Theme / Styling ============
struct GUIColors {
    // Background
    Math::Vec4 windowBg = Math::Vec4(0.12f, 0.12f, 0.14f, 1.0f);
    Math::Vec4 panelBg = Math::Vec4(0.16f, 0.16f, 0.18f, 1.0f);
    Math::Vec4 headerBg = Math::Vec4(0.20f, 0.20f, 0.23f, 1.0f);
    Math::Vec4 childBg = Math::Vec4(0.14f, 0.14f, 0.16f, 1.0f);

    // Interactive
    Math::Vec4 button = Math::Vec4(0.26f, 0.45f, 0.76f, 1.0f);
    Math::Vec4 buttonHover = Math::Vec4(0.30f, 0.52f, 0.85f, 1.0f);
    Math::Vec4 buttonActive = Math::Vec4(0.22f, 0.38f, 0.65f, 1.0f);
    Math::Vec4 headerButton = Math::Vec4(0.22f, 0.22f, 0.25f, 1.0f);
    Math::Vec4 headerButtonHover = Math::Vec4(0.30f, 0.30f, 0.34f, 1.0f);

    // Input fields
    Math::Vec4 inputBg = Math::Vec4(0.10f, 0.10f, 0.12f, 1.0f);
    Math::Vec4 inputBorder = Math::Vec4(0.30f, 0.30f, 0.34f, 1.0f);
    Math::Vec4 inputFocus = Math::Vec4(0.35f, 0.55f, 0.85f, 1.0f);

    // Slider
    Math::Vec4 sliderBg = Math::Vec4(0.18f, 0.18f, 0.20f, 1.0f);
    Math::Vec4 sliderGrab = Math::Vec4(0.35f, 0.55f, 0.85f, 1.0f);

    // Text
    Math::Vec4 text = Math::Vec4(0.90f, 0.90f, 0.92f, 1.0f);
    Math::Vec4 textDim = Math::Vec4(0.55f, 0.55f, 0.58f, 1.0f);
    Math::Vec4 textBright = Math::Vec4(1.0f, 1.0f, 1.0f, 1.0f);

    // Accent
    Math::Vec4 accent = Math::Vec4(0.26f, 0.52f, 0.96f, 1.0f);
    Math::Vec4 accentHover = Math::Vec4(0.30f, 0.58f, 1.0f, 1.0f);
    Math::Vec4 success = Math::Vec4(0.20f, 0.75f, 0.35f, 1.0f);
    Math::Vec4 warning = Math::Vec4(0.90f, 0.65f, 0.15f, 1.0f);
    Math::Vec4 error = Math::Vec4(0.85f, 0.25f, 0.25f, 1.0f);
    Math::Vec4 info = Math::Vec4(0.30f, 0.60f, 0.90f, 1.0f);

    // Separator
    Math::Vec4 separator = Math::Vec4(0.25f, 0.25f, 0.28f, 1.0f);

    // Selection
    Math::Vec4 selection = Math::Vec4(0.26f, 0.45f, 0.76f, 0.4f);
    Math::Vec4 selectionActive = Math::Vec4(0.26f, 0.45f, 0.76f, 0.7f);

    // Title bar
    Math::Vec4 titleBar = Math::Vec4(0.14f, 0.14f, 0.16f, 1.0f);

    // Dock / tab
    Math::Vec4 tab = Math::Vec4(0.18f, 0.18f, 0.20f, 1.0f);
    Math::Vec4 tabActive = Math::Vec4(0.14f, 0.14f, 0.16f, 1.0f);
    Math::Vec4 tabHover = Math::Vec4(0.22f, 0.22f, 0.25f, 1.0f);

    // Resize grip
    Math::Vec4 resizeGrip = Math::Vec4(0.35f, 0.55f, 0.85f, 0.2f);
    Math::Vec4 resizeGripHover = Math::Vec4(0.35f, 0.55f, 0.85f, 0.5f);
};

// ============ Widget State ============
enum class GUIAlign { Left, Center, Right };

struct GUIState {
    Math::Vec2 mousePos = Math::Vec2::zero();
    Math::Vec2 mouseDelta = Math::Vec2::zero();
    Math::Vec2 displaySize = Math::Vec2::zero();
    float deltaTime = 0.0f;
    bool mouseDown[3] = {};
    bool mousePressed[3] = {};
    bool mouseReleased[3] = {};
    bool keyDown[256] = {};
    bool keyPressed[256] = {};
    char inputChar = 0;
    float scrollDelta = 0.0f;
};

struct GUIContext {
    Math::Vec2 cursorPos = Math::Vec2::zero();
    Math::Vec2 contentRegionAvail = Math::Vec2::zero();
    Math::Vec2 windowPos = Math::Vec2::zero();
    Math::Vec2 windowSize = Math::Vec2::zero();
    Math::Vec2 itemSize = Math::Vec2::zero();
    float itemSpacing = 4.0f;
    float indentWidth = 16.0f;
    int indentLevel = 0;
    float fontSize = 14.0f;
};

// ============ Drawing Commands ============
enum class DrawCmdType {
    Rect, RectFilled, Text, Line, Circle, Triangle, Image
};

struct DrawCmd {
    DrawCmdType type;
    Math::Vec2 pos;
    Math::Vec2 size;
    Math::Vec4 color;
    std::string text;
    float cornerRadius = 0.0f;
    float thickness = 1.0f;
    uint32_t textureID = 0;
    Math::Vec2 uvMin = Math::Vec2::zero();
    Math::Vec2 uvMax = Math::Vec2::one();
    // Optional clip rectangle (screen space, top-left origin). When enabled
    // the renderer scissors this command so panel content cannot spill out
    // of its dock node.
    bool clipEnabled = false;
    Math::Vec2 clipMin = Math::Vec2::zero();
    Math::Vec2 clipMax = Math::Vec2::zero();
};

struct GUIClipRect {
    Math::Vec2 min = Math::Vec2::zero();
    Math::Vec2 max = Math::Vec2::zero();
};

// ============ GUIID ============
using GUIID = uint32_t;
static GUIID s_nextID = 1;
inline GUIID generateID() { return s_nextID++; }

struct GUIIDState {
    GUIID hot = 0;
    GUIID active = 0;
    GUIID focus = 0;
    GUIID lastItem = 0;
};

// ============ Panel State ============
struct PanelState {
    bool visible = true;
    bool collapsed = false;
    Math::Vec2 position;
    Math::Vec2 size;
    Math::Vec2 scrollOffset = Math::Vec2::zero();
    bool resizing = false;
    bool dragging = false;
    bool autoResize = false;
};

// ============ Main GUI Class ============
class EmberGUI {
public:
    static EmberGUI& get();

    bool init();
    void shutdown();
    void newFrame(float deltaTime);
    void render();
    void endFrame();

    // State
    bool isInitialized() const { return m_initialized; }
    const GUIState& getState() const { return m_state; }
    const GUIColors& getColors() const { return m_colors; }
    GUIColors& getColors() { return m_colors; }

    // Drawing primitives (rendered by OpenGL backend)
    void drawRect(const Math::Vec2& pos, const Math::Vec2& size, const Math::Vec4& color, float rounding = 0.0f);
    void drawRectFilled(const Math::Vec2& pos, const Math::Vec2& size, const Math::Vec4& color, float rounding = 0.0f);
    void drawText(const Math::Vec2& pos, const std::string& text, const Math::Vec4& color, float size = 0.0f);

    // Width of `text` in pixels at the given font size. Matches the metrics
    // used by the renderer (5x7 glyph in a 6x8 cell).
    static float measureTextWidth(const std::string& text, float size = 14.0f);
    void drawLine(const Math::Vec2& from, const Math::Vec2& to, const Math::Vec4& color, float thickness = 1.0f);
    void drawCircle(const Math::Vec2& center, float radius, const Math::Vec4& color, int segments = 32);
    void drawCircleFilled(const Math::Vec2& center, float radius, const Math::Vec4& color, int segments = 32);
    void drawTriangle(const Math::Vec2& p1, const Math::Vec2& p2, const Math::Vec2& p3, const Math::Vec4& color);
    void drawImage(const Math::Vec2& pos, const Math::Vec2& size, uint32_t textureID, const Math::Vec4& tint = Math::Vec4(1.0f));

    // Cursor
    void setCursorPos(const Math::Vec2& pos) { m_ctx.cursorPos = pos; }
    Math::Vec2 getCursorPos() const { return m_ctx.cursorPos; }
    void advanceCursor(const Math::Vec2& offset) { m_ctx.cursorPos = m_ctx.cursorPos + offset; }
    void newline();
    void indent();
    void unindent();

    // Layout
    void sameLine(float spacing = 8.0f);
    void separator(float thickness = 1.0f);
    void spacing(float amount = 4.0f);
    void dummy(const Math::Vec2& size);
    Math::Vec2 getItemSize() const { return m_ctx.itemSize; }

    // ===== Widgets =====

    // Text
    void text(const std::string& text, const Math::Vec4& color = Math::Vec4(1.0f));
    void textColored(const std::string& text, const Math::Vec4& color);
    void textWrapped(const std::string& text, float wrapWidth = 0.0f);
    void textUnformatted(const std::string& text);

    // Button
    bool button(const std::string& label, const Math::Vec2& size = Math::Vec2(0, 0), float rounding = 4.0f);
    bool smallButton(const std::string& label);
    bool invisibleButton(const std::string& id, const Math::Vec2& size);
    bool arrowButton(const std::string& id, bool collapsed, float size = 14.0f);

    // Checkbox / Toggle
    bool checkbox(const std::string& label, bool& value);
    bool toggle(const std::string& label, bool& value);

    // Sliders
    bool sliderFloat(const std::string& label, float& value, float min = 0.0f, float max = 1.0f, const char* format = "%.3f");
    bool sliderFloat2(const std::string& label, float* values, float min = 0.0f, float max = 1.0f);
    bool sliderFloat3(const std::string& label, float* values, float min = 0.0f, float max = 1.0f);
    bool sliderFloat4(const std::string& label, float* values, float min = 0.0f, float max = 1.0f);
    bool sliderInt(const std::string& label, int& value, int min = 0, int max = 100);
    bool sliderAngle(const std::string& label, float& angle, float minDeg = -180.0f, float maxDeg = 180.0f);

    // Input
    bool inputText(const std::string& label, std::string& value, const std::string& hint = "", float width = 0.0f);
    bool inputFloat(const std::string& label, float& value, float step = 0.0f, float stepFast = 0.0f, const char* format = "%.3f");
    bool inputFloat2(const std::string& label, float* values, const char* format = "%.3f");
    bool inputFloat3(const std::string& label, float* values, const char* format = "%.3f");
    bool inputFloat4(const std::string& label, float* values, const char* format = "%.3f");
    bool inputInt(const std::string& label, int& value);
    bool inputColor3(const std::string& label, float* values);
    bool inputColor4(const std::string& label, float* values);

    // Combo / Dropdown
    bool combo(const std::string& label, int& currentItem, const char* itemsSeparatedByZeros, float width = 0.0f);
    bool combo(const std::string& label, int& currentItem, const std::vector<std::string>& items, float width = 0.0f);

    // Tree
    bool treeNode(const std::string& label, bool defaultOpen = false);
    bool treeNodeEx(const std::string& label, bool leaf = false, bool defaultOpen = false);
    void treePop();
    bool treeNodeExHeader(const std::string& label, bool& visible, bool defaultOpen = false);

    // Collapsing header
    bool collapsingHeader(const std::string& label, bool defaultOpen = false);

    // Selectable
    bool selectable(const std::string& label, bool selected = false, const Math::Vec2& size = Math::Vec2(0, 0));
    bool selectableEx(const std::string& label, bool& selected, const Math::Vec2& size = Math::Vec2(0, 0));

    // Color picker
    bool colorEdit3(const std::string& label, float* values);
    bool colorEdit4(const std::string& label, float* values);

    // Tooltip
    void tooltip(const std::string& text);
    void beginTooltip();
    void endTooltip();

    // Menu
    bool beginMainMenuBar();
    void endMainMenuBar();
    bool beginMenuBar();
    void endMenuBar();
    bool beginMenu(const std::string& label, bool enabled = true);
    void endMenu();
    bool menuItem(const std::string& label, bool selected = false, bool enabled = true);

    // Tabs
    int tabBar(const std::string& id, const std::vector<std::string>& tabs, int& selected);
    bool tabItem(const std::string& label);

    // Progress bar
    void progressBar(float fraction, const Math::Vec2& size = Math::Vec2(-1, 0), const std::string& overlay = "");

    // Separator with text
    void separatorText(const std::string& text);

    // Panel / Window
    bool beginPanel(const std::string& title, PanelState& state);
    void endPanel();

    // Scroll area
    bool beginScrollArea(PanelState& state, const Math::Vec2& size);
    bool beginScrollArea(Math::Vec2& scrollOffset, const Math::Vec2& size);
    void endScrollArea();

    // Clipping (nestable). Primitives record the current clip rect and the
    // renderer scissors them, so children cannot draw outside their parent.
    void pushClipRect(const Math::Vec2& pos, const Math::Vec2& size);
    void popClipRect();

    // Consume the current mouse press so widgets drawn later this frame
    // (panels behind a popup, for example) do not react to it.
    void swallowMousePress(int button = 0) { m_state.mousePressed[button] = false; }

    // Image
    void image(uint32_t textureID, const Math::Vec2& size, const Math::Vec4& tint = Math::Vec4(1.0f));
    bool imageButton(const std::string& id, uint32_t textureID, const Math::Vec2& size, const Math::Vec4& tint = Math::Vec4(1.0f));

    // Columns
    void columns(int count, const std::string& id = "", bool border = true);
    void nextColumn();
    void separatorVertical();

    // Get draw data for OpenGL rendering
    const std::vector<DrawCmd>& getDrawCommands() const { return m_drawCommands; }
    void clearDrawCommands() { m_drawCommands.clear(); }

    // Access to context for dock system
    GUIContext& getContext() { return m_ctx; }
    const GUIContext& getContext() const { return m_ctx; }

    // Style push/pop
    void pushStyleColor(const Math::Vec4& color);
    void popStyleColor();

    // ID stack
    void pushID(const std::string& id);
    void pushID(int id);
    void popID();

    // Hit testing
    bool isItemHovered() const;
    bool isItemClicked(int button = 0) const;
    bool isItemActive() const;
    bool isWindowFocused() const;
    bool isInRect(const Math::Vec2& pos, const Math::Vec2& size) const;

private:
    EmberGUI() = default;
    ~EmberGUI() = default;

    // Helpers
    GUIID getItemID(const std::string& label = "");
    bool wasMouseClicked(int button = 0) const;
    bool isMouseDragging(int button = 0) const;
    bool isMouseDoubleClicked(int button = 0) const;
    Math::Vec2 calculateItemSize(const std::string& label, float width = 0.0f);

    // State
    bool m_initialized = false;
    GUIState m_state;
    GUIContext m_ctx;
    GUIIDState m_idState;
    GUIColors m_colors;
    std::vector<DrawCmd> m_drawCommands;
    std::vector<GUIID> m_idStack;
    std::vector<Math::Vec4> m_colorStack;
    GUIID m_hotItem = 0;
    GUIID m_activeItem = 0;
    GUIID m_focusItem = 0;
    GUIID m_hoverItem = 0;
    GUIID m_lastItem = 0;
    bool m_itemHovered = false;
    bool m_itemClicked = false;
    bool m_itemActive = false;

    // Clipping
    std::vector<GUIClipRect> m_clipStack;
    void applyClip(DrawCmd& cmd) const;

    // Scroll area state
    struct ScrollAreaState {
        bool active = false;
        Math::Vec2 rectMin = Math::Vec2::zero();
        Math::Vec2 rectMax = Math::Vec2::zero();
        float startY = 0.0f;
        Math::Vec2* offset = nullptr;
    };
    ScrollAreaState m_scroll;

    // Colour swatch dragging
    GUIID m_colorDragID = 0;
    int m_colorDragChannel = -1;
};

} // namespace Ember
