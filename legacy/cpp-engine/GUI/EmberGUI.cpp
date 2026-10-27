#include "GUI/EmberGUI.h"
#include "Engine/Core/Logging.h"
#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <sstream>

namespace Ember {

EmberGUI& EmberGUI::get() { static EmberGUI instance; return instance; }

bool EmberGUI::init() {
    m_initialized = true;
    m_idStack.clear();
    m_colorStack.clear();
    m_drawCommands.clear();
    EMBER_LOG_INFO("EmberGUI initialized");
    return true;
}

void EmberGUI::shutdown() {
    m_initialized = false;
    EMBER_LOG_INFO("EmberGUI shutdown");
}

void EmberGUI::newFrame(float deltaTime) {
    EMBER_LOG_DEBUG("GUI newFrame: dt=", deltaTime, " mouse=(", m_state.mousePos.x, ",", m_state.mousePos.y, ") scroll=", m_state.scrollDelta);
    auto& platform = Platform::get();
    m_state.deltaTime = deltaTime;
    m_state.displaySize = Math::Vec2((float)platform.getWidth(), (float)platform.getHeight());
    {
        int mx, my;
        platform.getMousePosition(mx, my);
        m_state.mousePos.x = (float)mx;
        m_state.mousePos.y = (float)my;
    }
    int dx, dy;
    platform.getMouseDelta(dx, dy);
    m_state.mouseDelta = Math::Vec2((float)dx, (float)dy);
    m_state.scrollDelta = platform.getMouseScroll();
    for (int i = 0; i < 3; i++) {
        bool wasDown = m_state.mouseDown[i];
        m_state.mouseDown[i] = platform.isMouseButtonPressed(i);
        m_state.mousePressed[i] = m_state.mouseDown[i] && !wasDown;
        m_state.mouseReleased[i] = !m_state.mouseDown[i] && wasDown;
        if (m_state.mousePressed[i]) EMBER_LOG_DEBUG("Mouse button ", i, " pressed at (", m_state.mousePos.x, ",", m_state.mousePos.y, ")");
        if (m_state.mouseReleased[i]) EMBER_LOG_DEBUG("Mouse button ", i, " released");
    }
    for (int i = 0; i < 256; i++) {
        bool wasDown = m_state.keyDown[i];
        m_state.keyDown[i] = platform.isKeyPressed(i);
        m_state.keyPressed[i] = m_state.keyDown[i] && !wasDown;
        if (m_state.keyPressed[i] && i < 128) EMBER_LOG_DEBUG("Key pressed: ", i, " ('", (char)i, "')");
    }
    m_state.inputChar = platform.getInputChar();
    if (m_state.inputChar) EMBER_LOG_DEBUG("Input char: '", m_state.inputChar, "' (", (int)(unsigned char)m_state.inputChar, ")");
    platform.resetInputChar();
    m_ctx.cursorPos = Math::Vec2(8.0f, 8.0f);
    m_hotItem = 0;
    m_itemHovered = false;
    m_itemClicked = false;
    m_itemActive = false;
    m_idStack.clear();
    // A clip or scroll area left open by a panel must not leak into the
    // next frame, otherwise every panel behind it is clipped away.
    m_clipStack.clear();
    m_scroll = ScrollAreaState{};
}

void EmberGUI::render() {
    // OpenGL rendering of draw commands will be handled by the Renderer
    EMBER_LOG_DEBUG("GUI render: ", m_drawCommands.size(), " draw commands to process");
}

void EmberGUI::endFrame() {
    EMBER_LOG_DEBUG("GUI endFrame: clearing ", m_drawCommands.size(), " draw commands");
    m_drawCommands.clear();
    Platform::get().resetMouseScroll();
}

// ============ Drawing Primitives ============

void EmberGUI::applyClip(DrawCmd& cmd) const {
    if (m_clipStack.empty()) return;
    cmd.clipEnabled = true;
    cmd.clipMin = m_clipStack.back().min;
    cmd.clipMax = m_clipStack.back().max;
}

void EmberGUI::pushClipRect(const Math::Vec2& pos, const Math::Vec2& size) {
    GUIClipRect rect;
    rect.min = pos;
    rect.max = pos + size;
    if (!m_clipStack.empty()) {
        // Nested clips intersect with their parent.
        rect.min.x = std::max(rect.min.x, m_clipStack.back().min.x);
        rect.min.y = std::max(rect.min.y, m_clipStack.back().min.y);
        rect.max.x = std::min(rect.max.x, m_clipStack.back().max.x);
        rect.max.y = std::min(rect.max.y, m_clipStack.back().max.y);
    }
    m_clipStack.push_back(rect);
}

void EmberGUI::popClipRect() {
    if (!m_clipStack.empty()) m_clipStack.pop_back();
}

void EmberGUI::drawRect(const Math::Vec2& pos, const Math::Vec2& size, const Math::Vec4& color, float rounding) {
    DrawCmd cmd;
    cmd.type = DrawCmdType::Rect;
    cmd.pos = pos;
    cmd.size = size;
    cmd.color = color;
    cmd.cornerRadius = rounding;
    applyClip(cmd);
    m_drawCommands.push_back(cmd);
}

void EmberGUI::drawRectFilled(const Math::Vec2& pos, const Math::Vec2& size, const Math::Vec4& color, float rounding) {
    DrawCmd cmd;
    cmd.type = DrawCmdType::RectFilled;
    cmd.pos = pos;
    cmd.size = size;
    cmd.color = color;
    cmd.cornerRadius = rounding;
    applyClip(cmd);
    m_drawCommands.push_back(cmd);
}

void EmberGUI::drawText(const Math::Vec2& pos, const std::string& text, const Math::Vec4& color, float size) {
    DrawCmd cmd;
    cmd.type = DrawCmdType::Text;
    cmd.pos = pos;
    cmd.text = text;
    cmd.color = color;
    if (size > 0) cmd.thickness = size;
    applyClip(cmd);
    m_drawCommands.push_back(cmd);
}

void EmberGUI::drawLine(const Math::Vec2& from, const Math::Vec2& to, const Math::Vec4& color, float thickness) {
    DrawCmd cmd;
    cmd.type = DrawCmdType::Line;
    cmd.pos = from;
    cmd.size = to - from;
    cmd.color = color;
    cmd.thickness = thickness;
    applyClip(cmd);
    m_drawCommands.push_back(cmd);
}

void EmberGUI::drawCircle(const Math::Vec2& center, float radius, const Math::Vec4& color, int segments) {
    DrawCmd cmd;
    cmd.type = DrawCmdType::Circle;
    cmd.pos = center;
    cmd.size = Math::Vec2(radius, (float)segments);
    cmd.color = color;
    applyClip(cmd);
    m_drawCommands.push_back(cmd);
}

void EmberGUI::drawCircleFilled(const Math::Vec2& center, float radius, const Math::Vec4& color, int segments) {
    DrawCmd cmd;
    cmd.type = DrawCmdType::Circle;
    cmd.pos = center;
    cmd.size = Math::Vec2(radius, (float)segments);
    cmd.color = color;
    applyClip(cmd);
    m_drawCommands.push_back(cmd);
}

void EmberGUI::drawTriangle(const Math::Vec2& p1, const Math::Vec2& p2, const Math::Vec2& p3, const Math::Vec4& color) {
    DrawCmd cmd;
    cmd.type = DrawCmdType::Triangle;
    cmd.pos = p1;
    cmd.size = p2;
    cmd.color = color;
    applyClip(cmd);
    m_drawCommands.push_back(cmd);
}

void EmberGUI::drawImage(const Math::Vec2& pos, const Math::Vec2& size, uint32_t textureID, const Math::Vec4& tint) {
    DrawCmd cmd;
    cmd.type = DrawCmdType::Image;
    cmd.pos = pos;
    cmd.size = size;
    cmd.color = tint;
    cmd.textureID = textureID;
    applyClip(cmd);
    m_drawCommands.push_back(cmd);
}

// ============ Layout ============

void EmberGUI::newline() {
    m_ctx.cursorPos.x = m_ctx.windowPos.x + 8.0f + m_ctx.indentLevel * m_ctx.indentWidth;
    m_ctx.cursorPos.y += m_ctx.fontSize + m_ctx.itemSpacing * 2.0f;
}

void EmberGUI::indent() { m_ctx.indentLevel++; }
void EmberGUI::unindent() { if (m_ctx.indentLevel > 0) m_ctx.indentLevel--; }

void EmberGUI::sameLine(float spacing) {
    m_ctx.cursorPos.x += m_ctx.itemSize.x + spacing;
    m_ctx.cursorPos.y -= m_ctx.fontSize + m_ctx.itemSpacing * 2.0f;
}

void EmberGUI::separator(float thickness) {
    Math::Vec2 pos = m_ctx.cursorPos;
    float width = m_ctx.windowSize.x - 16.0f;
    drawLine(pos, Math::Vec2(pos.x + width, pos.y), m_colors.separator, thickness);
    m_ctx.cursorPos.y += thickness + m_ctx.itemSpacing * 2.0f;
}

void EmberGUI::spacing(float amount) { m_ctx.cursorPos.y += amount; }
void EmberGUI::dummy(const Math::Vec2& size) { m_ctx.cursorPos += size; }

// ============ ID Helpers ============

GUIID EmberGUI::getItemID(const std::string& label) {
    GUIID id = 0;
    if (!m_idStack.empty()) id = m_idStack.back();
    // Simple hash
    for (char c : label) id = id * 31 + (GUIID)c;
    return id;
}

void EmberGUI::pushID(const std::string& id) { m_idStack.push_back(getItemID(id)); }
void EmberGUI::pushID(int id) { m_idStack.push_back((GUIID)id); }
void EmberGUI::popID() { if (!m_idStack.empty()) m_idStack.pop_back(); }

float EmberGUI::measureTextWidth(const std::string& text, float size) {
    // Matches the glyph metrics in Renderer::renderGUI: a 5x7 glyph inside a
    // 6x8 atlas cell, drawn with height = size * 0.85.
    constexpr float CELL_ADVANCE = 0.85f * 6.0f / 7.0f;
    return (float)text.size() * size * CELL_ADVANCE;
}

bool EmberGUI::isInRect(const Math::Vec2& pos, const Math::Vec2& size) const {
    return m_state.mousePos.x >= pos.x && m_state.mousePos.x <= pos.x + size.x &&
           m_state.mousePos.y >= pos.y && m_state.mousePos.y <= pos.y + size.y;
}

bool EmberGUI::wasMouseClicked(int button) const { return m_state.mousePressed[button]; }
bool EmberGUI::isMouseDragging(int button) const { return m_state.mouseDown[button]; }
bool EmberGUI::isItemHovered() const { return m_itemHovered; }
bool EmberGUI::isItemClicked(int) const { return m_itemClicked; }
bool EmberGUI::isItemActive() const { return m_itemActive; }
bool EmberGUI::isWindowFocused() const { return m_focusItem != 0; }
void EmberGUI::pushStyleColor(const Math::Vec4& color) { m_colorStack.push_back(color); }
void EmberGUI::popStyleColor() { if (!m_colorStack.empty()) m_colorStack.pop_back(); }

Math::Vec2 EmberGUI::calculateItemSize(const std::string& label, float width) {
    float w = width > 0 ? width : m_ctx.windowSize.x - 16.0f;
    float h = m_ctx.fontSize + m_ctx.itemSpacing * 2.0f;
    return Math::Vec2(w, h);
}

// ============ Widgets ============

void EmberGUI::text(const std::string& t, const Math::Vec4& color) {
    Math::Vec2 pos = m_ctx.cursorPos;
    drawText(pos, t, color);
    m_ctx.cursorPos.y += m_ctx.fontSize + m_ctx.itemSpacing;
    m_ctx.itemSize = Math::Vec2(measureTextWidth(t, m_ctx.fontSize), m_ctx.fontSize);
}

void EmberGUI::textColored(const std::string& t, const Math::Vec4& color) {
    text(t, color);
}

void EmberGUI::textWrapped(const std::string& t, float wrapWidth) {
    text(t, m_colors.text);
}

void EmberGUI::textUnformatted(const std::string& t) {
    text(t, m_colors.text);
}

bool EmberGUI::button(const std::string& label, const Math::Vec2& size, float rounding) {
    GUIID id = getItemID(label);
    Math::Vec2 pos = m_ctx.cursorPos;
    Math::Vec2 sz = size.x > 0 ? size : Math::Vec2(m_ctx.windowSize.x - 16.0f, m_ctx.fontSize + m_ctx.itemSpacing * 2.0f + 6.0f);

    bool hovered = isInRect(pos, sz);
    bool clicked = hovered && m_state.mousePressed[0];
    bool active = hovered && m_state.mouseDown[0];

    Math::Vec4 bgColor = active ? m_colors.buttonActive : (hovered ? m_colors.buttonHover : m_colors.button);
    drawRectFilled(pos, sz, bgColor, rounding);
    drawRect(pos, sz, Math::Vec4(bgColor.x * 0.8f, bgColor.y * 0.8f, bgColor.z * 0.8f, 1.0f), rounding);

    Math::Vec2 textSize = Math::Vec2((float)label.size() * m_ctx.fontSize * 0.6f, m_ctx.fontSize);
    Math::Vec2 textPos = pos + (sz - textSize) * 0.5f;
    drawText(textPos, label, m_colors.text);

    m_ctx.cursorPos.y += sz.y + m_ctx.itemSpacing;
    m_ctx.itemSize = sz;
    m_itemHovered = hovered;
    m_itemClicked = clicked;
    m_lastItem = id;
    return clicked;
}

bool EmberGUI::smallButton(const std::string& label) {
    GUIID id = getItemID(label);
    Math::Vec2 pos = m_ctx.cursorPos;
    Math::Vec2 sz = Math::Vec2(m_ctx.fontSize + m_ctx.itemSpacing, m_ctx.fontSize + m_ctx.itemSpacing);

    bool hovered = isInRect(pos, sz);
    bool clicked = hovered && m_state.mousePressed[0];
    Math::Vec4 bg = hovered ? m_colors.headerButtonHover : m_colors.headerButton;
    drawRectFilled(pos, sz, bg, 3.0f);
    drawText(pos + Math::Vec2(2, 2), label, m_colors.text, m_ctx.fontSize - 2);

    m_ctx.itemSize = sz;
    m_itemHovered = hovered;
    m_itemClicked = clicked;
    return clicked;
}

bool EmberGUI::invisibleButton(const std::string& idStr, const Math::Vec2& size) {
    Math::Vec2 pos = m_ctx.cursorPos;
    bool hovered = isInRect(pos, size);
    bool clicked = hovered && m_state.mousePressed[0];
    m_ctx.cursorPos.y += size.y + m_ctx.itemSpacing;
    m_itemHovered = hovered;
    m_itemClicked = clicked;
    return clicked;
}

bool EmberGUI::arrowButton(const std::string& idStr, bool collapsed, float size) {
    GUIID id = getItemID(idStr);
    Math::Vec2 pos = m_ctx.cursorPos;
    Math::Vec2 sz = Math::Vec2(size, size);

    bool hovered = isInRect(pos, sz);
    bool clicked = hovered && m_state.mousePressed[0];

    Math::Vec4 bg = hovered ? m_colors.headerButtonHover : Math::Vec4(0, 0, 0, 0);
    drawRectFilled(pos, sz, bg, 2.0f);

    // Draw arrow triangle
    float cx = pos.x + sz.x * 0.5f;
    float cy = pos.y + sz.y * 0.5f;
    float hs = sz.x * 0.25f;
    if (collapsed) {
        drawTriangle(Math::Vec2(cx - hs * 0.5f, cy - hs), Math::Vec2(cx - hs * 0.5f, cy + hs), Math::Vec2(cx + hs, cy), m_colors.text);
    } else {
        drawTriangle(Math::Vec2(cx - hs, cy - hs * 0.5f), Math::Vec2(cx + hs, cy - hs * 0.5f), Math::Vec2(cx, cy + hs), m_colors.text);
    }

    m_ctx.itemSize = sz;
    m_itemHovered = hovered;
    m_itemClicked = clicked;
    return clicked;
}

bool EmberGUI::checkbox(const std::string& label, bool& value) {
    GUIID id = getItemID(label);
    float boxSize = m_ctx.fontSize + 4.0f;
    Math::Vec2 pos = m_ctx.cursorPos;
    Math::Vec2 sz = Math::Vec2(m_ctx.windowSize.x - 16.0f, boxSize + m_ctx.itemSpacing);

    Math::Vec2 boxPos = pos;
    bool hovered = isInRect(boxPos, Math::Vec2(boxSize, boxSize));
    bool clicked = hovered && m_state.mousePressed[0];

    if (clicked) value = !value;

    Math::Vec4 bg = value ? m_colors.accent : m_colors.inputBg;
    drawRectFilled(boxPos, Math::Vec2(boxSize, boxSize), bg, 3.0f);
    if (value) {
        drawText(boxPos + Math::Vec2(boxSize * 0.25f, boxSize * 0.15f), "X", m_colors.textBright, boxSize - 4);
    }
    drawText(Math::Vec2(boxPos.x + boxSize + 8.0f, boxPos.y + 2.0f), label, m_colors.text);

    m_ctx.cursorPos.y += sz.y;
    m_ctx.itemSize = sz;
    m_itemHovered = hovered;
    m_itemClicked = clicked;
    return clicked;
}

bool EmberGUI::toggle(const std::string& label, bool& value) { return checkbox(label, value); }

bool EmberGUI::sliderFloat(const std::string& label, float& value, float min, float max, const char* format) {
    GUIID id = getItemID(label);
    Math::Vec2 pos = m_ctx.cursorPos;
    float widgetWidth = m_ctx.windowSize.x - 16.0f;
    float labelWidth = widgetWidth * 0.35f;
    float sliderWidth = widgetWidth - labelWidth - 8.0f;
    float h = m_ctx.fontSize + m_ctx.itemSpacing * 2.0f;

    drawText(pos, label, m_colors.textDim);
    Math::Vec2 sliderPos = Math::Vec2(pos.x + labelWidth, pos.y);
    Math::Vec2 sliderSz = Math::Vec2(sliderWidth, h);

    // Slider background
    drawRectFilled(sliderPos, sliderSz, m_colors.sliderBg, 4.0f);

    // Slider grab
    float t = (max > min) ? (value - min) / (max - min) : 0.0f;
    t = std::max(0.0f, std::min(1.0f, t));
    float grabW = 8.0f;
    float grabX = sliderPos.x + t * (sliderSz.x - grabW);
    drawRectFilled(Math::Vec2(grabX, sliderPos.y), Math::Vec2(grabW, sliderSz.y), m_colors.sliderGrab, 4.0f);

    // Interaction
    bool hovered = isInRect(sliderPos, sliderSz);
    bool changed = false;
    if (hovered && m_state.mouseDown[0]) {
        float mx = m_state.mousePos.x - sliderPos.x;
        float newT = mx / (sliderSz.x - grabW);
        newT = std::max(0.0f, std::min(1.0f, newT));
        value = min + newT * (max - min);
        changed = true;
    }

    // Value text
    char buf[32];
    snprintf(buf, sizeof(buf), format, value);
    drawText(Math::Vec2(sliderPos.x + sliderSz.x + 8.0f, sliderPos.y + 2.0f), buf, m_colors.text);

    m_ctx.cursorPos.y += h + m_ctx.itemSpacing;
    m_ctx.itemSize = Math::Vec2(widgetWidth, h);
    m_itemHovered = hovered;
    m_itemClicked = hovered && m_state.mousePressed[0];
    return changed;
}

bool EmberGUI::sliderFloat2(const std::string& label, float* values, float min, float max) {
    bool changed = false;
    text(label, m_colors.textDim);
    indent();
    sameLine();
    changed |= sliderFloat("X", values[0], min, max);
    indent();
    sameLine();
    changed |= sliderFloat("Y", values[1], min, max);
    unindent();
    unindent();
    return changed;
}

bool EmberGUI::sliderFloat3(const std::string& label, float* values, float min, float max) {
    bool changed = false;
    text(label, m_colors.textDim);
    indent();
    sameLine();
    changed |= sliderFloat("X", values[0], min, max);
    indent();
    sameLine();
    changed |= sliderFloat("Y", values[1], min, max);
    indent();
    sameLine();
    changed |= sliderFloat("Z", values[2], min, max);
    unindent(); unindent(); unindent();
    return changed;
}

bool EmberGUI::sliderFloat4(const std::string& label, float* values, float min, float max) {
    bool changed = false;
    text(label, m_colors.textDim);
    indent();
    sameLine();
    changed |= sliderFloat("X", values[0], min, max);
    indent();
    sameLine();
    changed |= sliderFloat("Y", values[1], min, max);
    indent();
    sameLine();
    changed |= sliderFloat("Z", values[2], min, max);
    indent();
    sameLine();
    changed |= sliderFloat("W", values[3], min, max);
    unindent(); unindent(); unindent(); unindent();
    return changed;
}

bool EmberGUI::sliderInt(const std::string& label, int& value, int min, int max) {
    float fv = (float)value;
    bool changed = sliderFloat(label, fv, (float)min, (float)max, "%.0f");
    if (changed) value = (int)fv;
    return changed;
}

bool EmberGUI::sliderAngle(const std::string& label, float& angle, float minDeg, float maxDeg) {
    return sliderFloat(label, angle, minDeg, maxDeg, "%.1f°");
}

bool EmberGUI::inputText(const std::string& label, std::string& value, const std::string& hint, float width) {
    GUIID id = getItemID(label);
    Math::Vec2 pos = m_ctx.cursorPos;
    float widgetWidth = width > 0 ? width : m_ctx.windowSize.x - 16.0f;
    float h = m_ctx.fontSize + m_ctx.itemSpacing * 2.0f;

    drawText(pos, label, m_colors.textDim);
    Math::Vec2 inputPos = Math::Vec2(pos.x + widgetWidth * 0.35f, pos.y);
    Math::Vec2 inputSz = Math::Vec2(widgetWidth * 0.65f, h);

    bool hovered = isInRect(inputPos, inputSz);
    bool focused = m_focusItem == id;
    Math::Vec4 border = focused ? m_colors.inputFocus : (hovered ? m_colors.inputBorder : m_colors.inputBg);

    drawRectFilled(inputPos, inputSz, m_colors.inputBg, 3.0f);
    drawRect(inputPos, inputSz, border, 3.0f);

    if (hovered && m_state.mousePressed[0]) {
        m_focusItem = id;
    }
    // Click elsewhere to unfocus
    if (focused && m_state.mousePressed[0] && !hovered) {
        if (m_focusItem == id) m_focusItem = 0;
    }

    std::string displayText = value.empty() ? hint : value;
    Math::Vec4 textColor = value.empty() ? m_colors.textDim : m_colors.text;
    drawText(Math::Vec2(inputPos.x + 6.0f, inputPos.y + 2.0f), displayText, textColor);

    // Process keyboard input when focused
    bool changed = false;
    if (focused) {
        // Draw blinking cursor
        float cursorX = inputPos.x + 6.0f + (float)value.size() * m_ctx.fontSize * 0.6f;
        if ((int)(m_state.deltaTime * 4.0f) % 2 == 0) {
            drawLine(Math::Vec2(cursorX, inputPos.y + 2.0f), Math::Vec2(cursorX, inputPos.y + h - 2.0f), m_colors.accent, 1.0f);
        }

        // Handle character input
        if (m_state.inputChar >= 32 && m_state.inputChar < 127) {
            value += (char)m_state.inputChar;
            changed = true;
            m_state.inputChar = 0; // Consume the char
        }
        // Handle backspace
        if (m_state.keyPressed[8] && !value.empty()) { // VK_BACK = 8
            value.pop_back();
            changed = true;
        }
        // Handle Enter - unfocus
        if (m_state.keyPressed[13]) { // VK_RETURN = 13
            m_focusItem = 0;
        }
        // Handle Escape - unfocus
        if (m_state.keyPressed[27]) { // VK_ESCAPE = 27
            m_focusItem = 0;
        }
    }

    m_ctx.cursorPos.y += h + m_ctx.itemSpacing;
    m_ctx.itemSize = Math::Vec2(widgetWidth, h);
    m_itemHovered = hovered;
    return changed;
}

bool EmberGUI::inputFloat(const std::string& label, float& value, float, float, const char* format) {
    char buf[32];
    snprintf(buf, sizeof(buf), format, value);
    std::string str = buf;
    bool changed = inputText(label, str);
    if (changed) value = (float)atof(str.c_str());
    return changed;
}

bool EmberGUI::inputFloat2(const std::string& label, float* values, const char* format) {
    bool c = false;
    text(label, m_colors.textDim);
    indent();
    c |= inputFloat("X", values[0], 0, 0, format);
    indent();
    sameLine();
    c |= inputFloat("Y", values[1], 0, 0, format);
    unindent(); unindent();
    return c;
}

bool EmberGUI::inputFloat3(const std::string& label, float* values, const char* format) {
    bool c = false;
    text(label, m_colors.textDim);
    indent();
    c |= inputFloat("X", values[0], 0, 0, format);
    indent();
    sameLine();
    c |= inputFloat("Y", values[1], 0, 0, format);
    indent();
    sameLine();
    c |= inputFloat("Z", values[2], 0, 0, format);
    unindent(); unindent(); unindent();
    return c;
}

bool EmberGUI::inputFloat4(const std::string& label, float* values, const char* format) {
    bool c = false;
    text(label, m_colors.textDim);
    indent();
    c |= inputFloat("X", values[0], 0, 0, format);
    indent();
    sameLine();
    c |= inputFloat("Y", values[1], 0, 0, format);
    indent();
    sameLine();
    c |= inputFloat("Z", values[2], 0, 0, format);
    indent();
    sameLine();
    c |= inputFloat("W", values[3], 0, 0, format);
    unindent(); unindent(); unindent(); unindent();
    return c;
}

bool EmberGUI::inputInt(const std::string& label, int& value) {
    float fv = (float)value;
    bool c = inputFloat(label, fv, 0, 0, "%.0f");
    if (c) value = (int)fv;
    return c;
}

bool EmberGUI::inputColor3(const std::string& label, float* values) {
    GUIID id = getItemID(label);
    Math::Vec2 pos = m_ctx.cursorPos;
    float widgetWidth = m_ctx.windowSize.x - 16.0f;
    float h = m_ctx.fontSize + m_ctx.itemSpacing * 2.0f;
    bool changed = false;

    drawText(pos, label, m_colors.textDim);

    float sw = (widgetWidth * 0.65f - 8.0f) / 3.0f;
    for (int i = 0; i < 3; i++) {
        Math::Vec2 cpos = Math::Vec2(pos.x + widgetWidth * 0.35f + i * (sw + 4.0f), pos.y);
        Math::Vec2 csize(sw, h);
        bool hovered = isInRect(cpos, csize);

        // Press on a channel and drag horizontally to change its value.
        if (hovered && m_state.mousePressed[0]) {
            m_colorDragID = id;
            m_colorDragChannel = i;
        }
        bool draggingThis = m_state.mouseDown[0] && m_colorDragID == id &&
                            m_colorDragChannel == i;
        if (draggingThis && m_state.mouseDelta.x != 0.0f) {
            float next = std::clamp(values[i] + m_state.mouseDelta.x * 0.005f, 0.0f, 1.0f);
            if (next != values[i]) {
                values[i] = next;
                changed = true;
            }
        }

        Math::Vec4 channelColor;
        if (i == 0)      channelColor = Math::Vec4(values[0], 0.0f, 0.0f, 1.0f);
        else if (i == 1) channelColor = Math::Vec4(0.0f, values[1], 0.0f, 1.0f);
        else             channelColor = Math::Vec4(0.0f, 0.0f, values[2], 1.0f);

        drawRectFilled(cpos, csize, channelColor, 2.0f);
        drawRect(cpos, csize, (hovered || draggingThis) ? m_colors.accent : m_colors.inputBorder, 2.0f);

        char buf[16];
        std::snprintf(buf, sizeof(buf), "%.2f", values[i]);
        drawText(Math::Vec2(cpos.x + 4.0f, cpos.y + 2.0f), buf,
                 Math::Vec4(0.92f, 0.92f, 0.95f, 1.0f), 10.0f);
    }

    if (!m_state.mouseDown[0]) {
        m_colorDragID = 0;
        m_colorDragChannel = -1;
    }

    m_ctx.cursorPos.y += h + m_ctx.itemSpacing;
    m_ctx.itemSize = Math::Vec2(widgetWidth, h);
    return changed;
}

bool EmberGUI::inputColor4(const std::string& label, float* values) { return inputColor3(label, values); }

bool EmberGUI::combo(const std::string& label, int& currentItem, const char* itemsSeparatedByZeros, float width) {
    GUIID id = getItemID(label);
    Math::Vec2 pos = m_ctx.cursorPos;
    float widgetWidth = width > 0 ? width : m_ctx.windowSize.x - 16.0f;
    float h = m_ctx.fontSize + m_ctx.itemSpacing * 2.0f;

    drawText(pos, label, m_colors.textDim);
    Math::Vec2 comboPos = Math::Vec2(pos.x + widgetWidth * 0.35f, pos.y);
    Math::Vec2 comboSz = Math::Vec2(widgetWidth * 0.65f, h);

    bool hovered = isInRect(comboPos, comboSz);
    bool clicked = hovered && m_state.mousePressed[0];

    drawRectFilled(comboPos, comboSz, m_colors.inputBg, 3.0f);
    drawRect(comboPos, comboSz, hovered ? m_colors.inputBorder : m_colors.inputBg, 3.0f);

    // Get current item text
    const char* p = itemsSeparatedByZeros;
    for (int i = 0; i < currentItem && *p; i++) { p += strlen(p) + 1; }
    drawText(Math::Vec2(comboPos.x + 6.0f, comboPos.y + 2.0f), p, m_colors.text);

    // Dropdown arrow
    drawTriangle(Math::Vec2(comboPos.x + comboSz.x - 14.0f, comboPos.y + h * 0.3f),
                 Math::Vec2(comboPos.x + comboSz.x - 6.0f, comboPos.y + h * 0.3f),
                 Math::Vec2(comboPos.x + comboSz.x - 10.0f, comboPos.y + h * 0.7f), m_colors.textDim);

    if (clicked) {
        const char* pItem = itemsSeparatedByZeros;
        int count = 0;
        while (*pItem) {
            if (count == currentItem + 1) { currentItem = count; break; }
            pItem += strlen(pItem) + 1;
            count++;
        }
    }

    m_ctx.cursorPos.y += h + m_ctx.itemSpacing;
    m_ctx.itemSize = Math::Vec2(widgetWidth, h);
    m_itemHovered = hovered;
    m_itemClicked = clicked;
    return clicked;
}

bool EmberGUI::combo(const std::string& label, int& currentItem, const std::vector<std::string>& items, float width) {
    std::string joined;
    for (auto& s : items) { joined += s; joined += '\0'; }
    joined += '\0';
    return combo(label, currentItem, joined.c_str(), width);
}

bool EmberGUI::treeNode(const std::string& label, bool defaultOpen) {
    return treeNodeEx(label, false, defaultOpen);
}

bool EmberGUI::treeNodeEx(const std::string& label, bool leaf, bool defaultOpen) {
    GUIID id = getItemID(label);
    Math::Vec2 pos = m_ctx.cursorPos;
    float w = m_ctx.windowSize.x - 16.0f;
    float h = m_ctx.fontSize + m_ctx.itemSpacing;

    pos.x += m_ctx.indentLevel * m_ctx.indentWidth;

    bool hovered = isInRect(pos, Math::Vec2(w, h));
    bool clicked = hovered && m_state.mousePressed[0];

    if (hovered) drawRectFilled(pos, Math::Vec2(w, h), m_colors.selection);

    if (!leaf) {
        // Draw arrow
        float cx = pos.x + 8.0f;
        float cy = pos.y + h * 0.5f;
        float hs = 4.0f;
        drawTriangle(Math::Vec2(cx - hs * 0.5f, cy - hs), Math::Vec2(cx - hs * 0.5f, cy + hs), Math::Vec2(cx + hs, cy), m_colors.textDim);
    }

    drawText(Math::Vec2(pos.x + 20.0f, pos.y + 1.0f), label, hovered ? m_colors.textBright : m_colors.text);

    m_ctx.cursorPos.y += h;
    if (!leaf) m_ctx.indentLevel++;
    m_ctx.itemSize = Math::Vec2(w, h);
    m_itemHovered = hovered;
    m_itemClicked = clicked;
    return clicked;
}

void EmberGUI::treePop() {
    if (m_ctx.indentLevel > 0) m_ctx.indentLevel--;
}

bool EmberGUI::treeNodeExHeader(const std::string& label, bool& visible, bool defaultOpen) {
    bool open = treeNodeEx(label, false, defaultOpen);
    if (open) treePop();
    return open;
}

bool EmberGUI::collapsingHeader(const std::string& label, bool defaultOpen) {
    GUIID id = getItemID(label);
    Math::Vec2 pos = m_ctx.cursorPos;
    float w = m_ctx.windowSize.x - 16.0f;
    float h = m_ctx.fontSize + m_ctx.itemSpacing * 2.0f;

    bool hovered = isInRect(pos, Math::Vec2(w, h));
    bool clicked = hovered && m_state.mousePressed[0];

    Math::Vec4 bg = hovered ? m_colors.headerButtonHover : m_colors.headerBg;
    drawRectFilled(pos, Math::Vec2(w, h), bg, 2.0f);
    drawText(Math::Vec2(pos.x + 24.0f, pos.y + 3.0f), label, m_colors.text);

    // Arrow
    float cx = pos.x + 12.0f;
    float cy = pos.y + h * 0.5f;
    float hs = 4.0f;
    drawTriangle(Math::Vec2(cx - hs * 0.5f, cy - hs), Math::Vec2(cx - hs * 0.5f, cy + hs), Math::Vec2(cx + hs, cy), m_colors.textDim);

    m_ctx.cursorPos.y += h + m_ctx.itemSpacing;
    m_ctx.itemSize = Math::Vec2(w, h);
    m_itemHovered = hovered;
    m_itemClicked = clicked;
    return clicked;
}

bool EmberGUI::selectable(const std::string& label, bool selected, const Math::Vec2& size) {
    GUIID id = getItemID(label);
    Math::Vec2 pos = m_ctx.cursorPos;
    Math::Vec2 sz = size.x > 0 ? size : Math::Vec2(m_ctx.windowSize.x - 16.0f, m_ctx.fontSize + m_ctx.itemSpacing * 2.0f);

    bool hovered = isInRect(pos, sz);
    bool clicked = hovered && m_state.mousePressed[0];

    if (selected) drawRectFilled(pos, sz, m_colors.selection);
    else if (hovered) drawRectFilled(pos, sz, m_colors.selection, 2.0f);

    drawText(Math::Vec2(pos.x + 6.0f, pos.y + 2.0f), label, hovered ? m_colors.textBright : m_colors.text);

    m_ctx.cursorPos.y += sz.y + m_ctx.itemSpacing;
    m_ctx.itemSize = sz;
    m_itemHovered = hovered;
    m_itemClicked = clicked;
    return clicked;
}

bool EmberGUI::selectableEx(const std::string& label, bool& selected, const Math::Vec2& size) {
    bool clicked = selectable(label, selected, size);
    if (clicked) selected = !selected;
    return clicked;
}

bool EmberGUI::colorEdit3(const std::string& label, float* values) { return inputColor3(label, values); }
bool EmberGUI::colorEdit4(const std::string& label, float* values) { return inputColor4(label, values); }

void EmberGUI::tooltip(const std::string& t) {
    Math::Vec2 pos = Math::Vec2(m_state.mousePos.x + 12.0f, m_state.mousePos.y + 12.0f);
    Math::Vec2 sz = Math::Vec2(measureTextWidth(t, m_ctx.fontSize) + 12.0f, m_ctx.fontSize + 12.0f);
    drawRectFilled(pos, sz, Math::Vec4(0.1f, 0.1f, 0.12f, 0.95f), 4.0f);
    drawRect(pos, sz, m_colors.accent, 4.0f);
    drawText(Math::Vec2(pos.x + 6.0f, pos.y + 3.0f), t, m_colors.text);
}

void EmberGUI::beginTooltip() {}
void EmberGUI::endTooltip() {}

bool EmberGUI::beginMainMenuBar() {
    Math::Vec2 pos = Math::Vec2(0, 0);
    Math::Vec2 sz = Math::Vec2(m_state.displaySize.x, 28.0f);
    drawRectFilled(pos, sz, m_colors.titleBar);
    m_ctx.windowPos = pos;
    m_ctx.windowSize = sz;
    m_ctx.cursorPos = Math::Vec2(8.0f, 4.0f);
    return true;
}

void EmberGUI::endMainMenuBar() {
    m_ctx.cursorPos.y = 32.0f;
}

bool EmberGUI::beginMenuBar() { return beginMainMenuBar(); }
void EmberGUI::endMenuBar() { endMainMenuBar(); }

bool EmberGUI::beginMenu(const std::string& label, bool enabled) {
    GUIID id = getItemID(label);
    Math::Vec2 pos = m_ctx.cursorPos;
    Math::Vec2 sz = Math::Vec2((float)label.size() * m_ctx.fontSize * 0.6f + 16.0f, 24.0f);

    bool hovered = isInRect(pos, sz);
    bool clicked = hovered && m_state.mousePressed[0];

    if (hovered) drawRectFilled(pos, sz, m_colors.headerButtonHover);
    drawText(Math::Vec2(pos.x + 6.0f, pos.y + 4.0f), label, enabled ? m_colors.text : m_colors.textDim);

    m_ctx.cursorPos.x += sz.x + 2.0f;
    m_itemHovered = hovered;
    m_itemClicked = clicked;
    return clicked;
}

void EmberGUI::endMenu() {}

bool EmberGUI::menuItem(const std::string& label, bool selected, bool enabled) {
    GUIID id = getItemID(label);
    Math::Vec2 pos = m_ctx.cursorPos;
    Math::Vec2 sz = Math::Vec2(200.0f, 22.0f);

    bool hovered = isInRect(pos, sz);
    bool clicked = hovered && m_state.mousePressed[0];

    if (hovered) drawRectFilled(pos, sz, m_colors.selection);
    if (selected) drawText(Math::Vec2(pos.x + sz.x - 16.0f, pos.y + 2.0f), "X", m_colors.accent);
    drawText(Math::Vec2(pos.x + 6.0f, pos.y + 2.0f), label, enabled ? m_colors.text : m_colors.textDim);

    m_ctx.cursorPos.y += sz.y;
    m_itemHovered = hovered;
    m_itemClicked = clicked;
    return clicked;
}

int EmberGUI::tabBar(const std::string& id, const std::vector<std::string>& tabs, int& selected) {
    Math::Vec2 pos = m_ctx.cursorPos;
    float x = pos.x;
    for (int i = 0; i < (int)tabs.size(); i++) {
        bool isActive = (i == selected);
        Math::Vec2 tabSz = Math::Vec2((float)tabs[i].size() * m_ctx.fontSize * 0.6f + 20.0f, 26.0f);
        Math::Vec4 bg = isActive ? m_colors.tabActive : (isInRect(Math::Vec2(x, pos.y), tabSz) ? m_colors.tabHover : m_colors.tab);
        drawRectFilled(Math::Vec2(x, pos.y), tabSz, bg, 2.0f);
        if (isActive) drawLine(Math::Vec2(x, pos.y + tabSz.y - 2.0f), Math::Vec2(x + tabSz.x, pos.y + tabSz.y - 2.0f), m_colors.accent, 2.0f);
        drawText(Math::Vec2(x + 10.0f, pos.y + 5.0f), tabs[i], isActive ? m_colors.textBright : m_colors.text);

        if (isInRect(Math::Vec2(x, pos.y), tabSz) && m_state.mousePressed[0]) selected = i;
        x += tabSz.x + 2.0f;
    }
    m_ctx.cursorPos.y += 28.0f;
    return selected;
}

bool EmberGUI::tabItem(const std::string&) { return false; }

void EmberGUI::progressBar(float fraction, const Math::Vec2& size, const std::string& overlay) {
    Math::Vec2 pos = m_ctx.cursorPos;
    Math::Vec2 sz = size.x > 0 ? size : Math::Vec2(m_ctx.windowSize.x - 16.0f, 18.0f);
    fraction = std::max(0.0f, std::min(1.0f, fraction));

    drawRectFilled(pos, sz, m_colors.sliderBg, 4.0f);
    drawRectFilled(pos, Math::Vec2(sz.x * fraction, sz.y), m_colors.accent, 4.0f);

    if (!overlay.empty()) {
        drawText(pos + Math::Vec2(sz.x * 0.5f - (float)overlay.size() * 3.0f, 2.0f), overlay, m_colors.text);
    }

    m_ctx.cursorPos.y += sz.y + m_ctx.itemSpacing;
}

void EmberGUI::separatorText(const std::string& text) {
    Math::Vec2 pos = m_ctx.cursorPos;
    float w = m_ctx.windowSize.x - 16.0f;
    float h = m_ctx.fontSize + m_ctx.itemSpacing * 2.0f;
    drawLine(pos, Math::Vec2(pos.x + w, pos.y + h * 0.5f), m_colors.separator);
    if (!text.empty()) {
        drawText(Math::Vec2(pos.x + w * 0.5f - (float)text.size() * 3.0f, pos.y + 2.0f), text, m_colors.textDim);
    }
    m_ctx.cursorPos.y += h;
}

bool EmberGUI::beginPanel(const std::string& title, PanelState& state) {
    if (!state.visible) return false;
    Math::Vec2 pos = state.position;
    Math::Vec2 sz = state.size;

    drawRectFilled(pos, sz, m_colors.panelBg, 0.0f);
    drawRect(pos, sz, m_colors.separator, 0.0f);

    // Title bar
    float titleH = 24.0f;
    drawRectFilled(pos, Math::Vec2(sz.x, titleH), m_colors.titleBar);
    drawText(Math::Vec2(pos.x + 8.0f, pos.y + 4.0f), title, m_colors.text);

    if (smallButton("-")) state.collapsed = !state.collapsed;

    m_ctx.windowPos = pos;
    m_ctx.windowSize = sz;
    m_ctx.cursorPos = Math::Vec2(pos.x + 4.0f, pos.y + titleH + 4.0f);

    return true;
}

void EmberGUI::endPanel() {}

bool EmberGUI::beginScrollArea(PanelState& state, const Math::Vec2& size) {
    return beginScrollArea(state.scrollOffset, size);
}

bool EmberGUI::beginScrollArea(Math::Vec2& scrollOffset, const Math::Vec2& size) {
    // The caller has already positioned the cursor at the top-left of the
    // visible area. Content drawn from here on is offset by the scroll value
    // and clipped to the area.
    m_scroll.active = true;
    m_scroll.rectMin = m_ctx.cursorPos;
    m_scroll.rectMax = m_ctx.cursorPos + size;
    m_scroll.startY = m_ctx.cursorPos.y;
    m_scroll.offset = &scrollOffset;

    if (isInRect(m_scroll.rectMin, size) && m_state.scrollDelta != 0.0f) {
        scrollOffset.y -= m_state.scrollDelta * 40.0f;
    }
    if (scrollOffset.y < 0.0f) scrollOffset.y = 0.0f;

    m_ctx.cursorPos.y -= scrollOffset.y;
    pushClipRect(m_scroll.rectMin, size);
    return true;
}

void EmberGUI::endScrollArea() {
    if (!m_scroll.active) return;

    const float viewHeight = m_scroll.rectMax.y - m_scroll.rectMin.y;
    const float contentHeight = (m_ctx.cursorPos.y + m_scroll.offset->y) - m_scroll.startY;
    const float maxScroll = std::max(0.0f, contentHeight - viewHeight);

    // Clamp after the content height is known; this runs before the next
    // frame's wheel input, so overshoot only ever lasts a single frame.
    if (m_scroll.offset->y > maxScroll) m_scroll.offset->y = maxScroll;
    if (m_scroll.offset->y < 0.0f) m_scroll.offset->y = 0.0f;

    popClipRect();

    // Scrollbar
    if (maxScroll > 0.5f) {
        const float trackW = 6.0f;
        const float trackX = m_scroll.rectMax.x - trackW - 2.0f;
        const float trackY = m_scroll.rectMin.y + 2.0f;
        const float trackH = viewHeight - 4.0f;
        const float thumbH = std::max(24.0f, trackH * (viewHeight / std::max(contentHeight, 1.0f)));
        const float t = m_scroll.offset->y / maxScroll;
        const float thumbY = trackY + t * (trackH - thumbH);

        drawRectFilled(Math::Vec2(trackX, trackY), Math::Vec2(trackW, trackH),
                       Math::Vec4(0.10f, 0.10f, 0.12f, 0.8f), 3.0f);
        drawRectFilled(Math::Vec2(trackX, thumbY), Math::Vec2(trackW, thumbH),
                       Math::Vec4(0.40f, 0.42f, 0.48f, 0.9f), 3.0f);
    }

    m_ctx.cursorPos = Math::Vec2(m_scroll.rectMin.x, m_scroll.rectMax.y);
    m_ctx.itemSize = Math::Vec2(m_scroll.rectMax.x - m_scroll.rectMin.x, viewHeight);
    m_scroll = ScrollAreaState{};
}

void EmberGUI::image(uint32_t textureID, const Math::Vec2& size, const Math::Vec4& tint) {
    drawImage(m_ctx.cursorPos, size, textureID, tint);
    m_ctx.cursorPos.y += size.y + m_ctx.itemSpacing;
}

bool EmberGUI::imageButton(const std::string& id, uint32_t textureID, const Math::Vec2& size, const Math::Vec4& tint) {
    bool hovered = isInRect(m_ctx.cursorPos, size);
    bool clicked = hovered && m_state.mousePressed[0];
    if (hovered) drawRect(m_ctx.cursorPos, size, m_colors.accent, 2.0f);
    drawImage(m_ctx.cursorPos, size, textureID, tint);
    m_ctx.cursorPos.y += size.y + m_ctx.itemSpacing;
    return clicked;
}

void EmberGUI::columns(int, const std::string&, bool) {}
void EmberGUI::nextColumn() {}
void EmberGUI::separatorVertical() {}

} // namespace Ember
