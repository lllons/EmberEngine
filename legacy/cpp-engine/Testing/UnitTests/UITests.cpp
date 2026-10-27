// =============================================================================
// EmberEngine - UI / text pipeline unit tests
// =============================================================================
// Covers the parts of the text and GUI layers that do not need a GL context:
//   - log argument formatting ("{}" placeholders and plain concatenation)
//   - UTF-8 decoding and codepoint -> glyph mapping
//   - font atlas pixel orientation (no horizontal mirroring, upright rows)
//   - glyph UV rectangles (cell math, V direction, index clamping)
//   - GUI clip-rect stack (nesting + intersection)
//   - scroll area math (offset application and clamping)
//
// Build & run:
//   g++ -std=c++17 -I. Testing/UnitTests/UITests.cpp GUI/EmberGUI.cpp
//       Engine/Platform/Platform.cpp Engine/Core/Logging.cpp
//       -lopengl32 -lgdi32 -luser32 -lkernel32 -o build/UITests.exe
//   ./build/UITests.exe
// =============================================================================

#include "Engine/Core/Logging.h"
#include "Engine/Rendering/Font.h"
#include "GUI/EmberGUI.h"

#include <cmath>
#include <cstring>
#include <iostream>
#include <string>
#include <vector>

using namespace Ember;

static int g_passed = 0;
static int g_failed = 0;

#define CHECK(cond)                                                            \
    do {                                                                       \
        if (!(cond)) {                                                         \
            std::cout << "    [FAIL] " << #cond << "  (line " << __LINE__      \
                      << ")\n";                                                \
            ++g_failed;                                                        \
        } else {                                                               \
            ++g_passed;                                                        \
        }                                                                      \
    } while (0)

// Named approx(), not near(): <windef.h> defines `near` as an empty macro.
static bool approx(float a, float b, float eps = 0.0005f) {
    return std::fabs(a - b) <= eps;
}

// -----------------------------------------------------------------------------
// Log formatting
// -----------------------------------------------------------------------------
static void testLogFormatting() {
    std::cout << "[TEST] log formatting\n";

    CHECK(formatString("value {} and {}", 1, 2) == "value 1 and 2");
    CHECK(formatString("plain ", 5) == "plain 5");
    CHECK(formatString("{}", std::string("x")) == "x");
    CHECK(formatString("no args") == "no args");
    CHECK(formatString("") == "");
    // More args than placeholders: the rest is appended.
    CHECK(formatString("{}", 1, 2) == "12");
    // Fewer args than placeholders: the leftover braces stay visible.
    CHECK(formatString("{} {}", 1) == "1 {}");
    // A substituted value that itself contains braces is not re-expanded.
    CHECK(formatString("{}", std::string("{}")) == "{}");
    // Floats use the stream default formatting.
    CHECK(formatString("dt={}", 0.5f) == "dt=0.5");
}

// -----------------------------------------------------------------------------
// UTF-8 + codepoint mapping
// -----------------------------------------------------------------------------
static void testCodepointMapping() {
    std::cout << "[TEST] codepoint mapping\n";

    CHECK(codepointToGlyphIndex(' ') == 0);
    CHECK(codepointToGlyphIndex('A') == 33);
    CHECK(codepointToGlyphIndex('~') == 94);

    // Symbols used by the editor UI map to visual ASCII equivalents.
    CHECK(codepointToGlyphIndex(0x25C6) == '>' - FONT_FIRST_CP); // black diamond
    CHECK(codepointToGlyphIndex(0x21A9) == '<' - FONT_FIRST_CP); // undo arrow
    CHECK(codepointToGlyphIndex(0x2014) == '-' - FONT_FIRST_CP); // em dash
    CHECK(codepointToGlyphIndex(0x2026) == '.' - FONT_FIRST_CP); // ellipsis

    // Unsupported printable -> '?', control -> none.
    CHECK(codepointToGlyphIndex(0x4E2D) == '?' - FONT_FIRST_CP);
    CHECK(codepointToGlyphIndex(0x01) == -1);
}

static void testUtf8Decoding() {
    std::cout << "[TEST] utf8 decoding\n";

    size_t consumed = 99;

    CHECK(decodeUtf8("A", 1, &consumed) == 'A');
    CHECK(consumed == 1);

    const char* diamond = "\xE2\x97\x86"; // U+25C6
    CHECK(decodeUtf8(diamond, 3, &consumed) == 0x25C6);
    CHECK(consumed == 3);

    const char* arrow = "\xE2\x86\xA9"; // U+21A9
    CHECK(decodeUtf8(arrow, 3, &consumed) == 0x21A9);
    CHECK(consumed == 3);

    const char* copyright = "\xC2\xA9"; // U+00A9
    CHECK(decodeUtf8(copyright, 2, &consumed) == 0x00A9);
    CHECK(consumed == 2);

    // Truncated / invalid sequences consume one byte and yield U+FFFD.
    CHECK(decodeUtf8("\xE2\x97", 2, &consumed) == 0xFFFD);
    CHECK(consumed == 1);
    CHECK(decodeUtf8("\xFF", 1, &consumed) == 0xFFFD);
    CHECK(consumed == 1);
    CHECK(decodeUtf8("", 0, &consumed) == 0);
    CHECK(consumed == 0);
}

// -----------------------------------------------------------------------------
// Glyph UVs
// -----------------------------------------------------------------------------
static void testGlyphUVs() {
    std::cout << "[TEST] glyph UVs\n";

    float uMin, vMin, uMax, vMax;
    getGlyphUVs('A' - FONT_FIRST_CP, uMin, vMin, uMax, vMax);

    // 'A' is glyph #33 -> column 1, row 2.
    CHECK(approx(uMin, 6.0f / 96.0f));
    CHECK(approx(uMax, 11.0f / 96.0f));
    CHECK(approx(vMin, 1.0f - 16.0f / 48.0f));
    CHECK(approx(vMax, 1.0f - 23.0f / 48.0f));

    // The quad is exactly 5 texels wide and 7 texels tall.
    CHECK(approx((uMax - uMin) * 96.0f, 5.0f));
    CHECK(approx((vMin - vMax) * 48.0f, 7.0f));

    // The atlas is flipped, so the top vertex has the larger V.
    CHECK(vMin > vMax);

    // Out-of-range indices fall back to '?' instead of sampling garbage.
    float qMin, qvMin, qMax, qvMax;
    getGlyphUVs('?' - FONT_FIRST_CP, qMin, qvMin, qMax, qvMax);
    getGlyphUVs(-1, uMin, vMin, uMax, vMax);
    CHECK(approx(uMin, qMin) && approx(vMin, qvMin));
    getGlyphUVs(9999, uMin, vMin, uMax, vMax);
    CHECK(approx(uMin, qMin) && approx(vMin, qvMin));
}

// -----------------------------------------------------------------------------
// Font atlas pixels
// -----------------------------------------------------------------------------
static void testFontAtlasPixels() {
    std::cout << "[TEST] font atlas pixels\n";

    std::vector<uint8_t> pixels;
    buildFontAtlasPixels(pixels);
    CHECK(pixels.size() == (size_t)FONT_TEX_W * FONT_TEX_H * 4);

    // Helper: sample the atlas buffer the way GL will see it. Buffer row 0 is
    // the bottom of the texture, so image row `imgY` lives at buffer row
    // FONT_TEX_H - 1 - imgY.
    auto alphaAtImage = [&](int imgX, int imgY) {
        int bufferY = (FONT_TEX_H - 1) - imgY;
        return pixels[(size_t)(bufferY * FONT_TEX_W + imgX) * 4 + 3];
    };

    // 'L' (glyph #44, col 12, row 2) has a left stem and a bottom bar. If the
    // bits were read right-to-left the stem would appear on the right.
    // Uppercase glyphs use cell rows 1..5, so the first drawn row is Ly + 1.
    const int Lx = 12 * FONT_GLYPH_W;
    const int Ly = 2 * FONT_GLYPH_H;
    CHECK(alphaAtImage(Lx + 0, Ly + 0) == 0);    // top padding row
    CHECK(alphaAtImage(Lx + 0, Ly + 1) == 255);  // stem, first drawn row
    CHECK(alphaAtImage(Lx + 1, Ly + 1) == 0);
    CHECK(alphaAtImage(Lx + 4, Ly + 4) == 0);    // bottom bar starts at row 5
    CHECK(alphaAtImage(Lx + 0, Ly + 5) == 255);
    CHECK(alphaAtImage(Lx + 4, Ly + 5) == 255);

    // 'F' (glyph #38, col 6, row 2) has a full top bar on its first drawn row.
    const int Fx = 6 * FONT_GLYPH_W;
    for (int i = 0; i < 5; i++) CHECK(alphaAtImage(Fx + i, Ly + 1) == 255);

    // The 1px cell border must stay empty so neighbouring glyphs cannot bleed.
    for (int row = 0; row < 7; row++) CHECK(alphaAtImage(Fx + 5, Ly + row) == 0);

    // Space is completely blank.
    CHECK(alphaAtImage(0, 0) == 0);
    CHECK(alphaAtImage(4, 5) == 0);
}

// -----------------------------------------------------------------------------
// GUI clip stack
// -----------------------------------------------------------------------------
static void testClipStack() {
    std::cout << "[TEST] GUI clip stack\n";

    auto& gui = EmberGUI::get();
    gui.clearDrawCommands();

    gui.drawRectFilled(Math::Vec2(0, 0), Math::Vec2(10, 10), Math::Vec4(1.0f));
    CHECK(gui.getDrawCommands().size() == 1);
    CHECK(!gui.getDrawCommands().back().clipEnabled);

    gui.pushClipRect(Math::Vec2(10, 20), Math::Vec2(100, 50));
    gui.drawRectFilled(Math::Vec2(0, 0), Math::Vec2(10, 10), Math::Vec4(1.0f));
    const auto& clipped = gui.getDrawCommands().back();
    CHECK(clipped.clipEnabled);
    CHECK(approx(clipped.clipMin.x, 10.0f) && approx(clipped.clipMin.y, 20.0f));
    CHECK(approx(clipped.clipMax.x, 110.0f) && approx(clipped.clipMax.y, 70.0f));

    // A nested clip intersects with its parent.
    gui.pushClipRect(Math::Vec2(50, 30), Math::Vec2(100, 100));
    gui.drawRect(Math::Vec2(0, 0), Math::Vec2(1, 1), Math::Vec4(1.0f));
    const auto& nested = gui.getDrawCommands().back();
    CHECK(approx(nested.clipMin.x, 50.0f) && approx(nested.clipMin.y, 30.0f));
    CHECK(approx(nested.clipMax.x, 110.0f) && approx(nested.clipMax.y, 70.0f));

    gui.popClipRect();
    gui.drawRect(Math::Vec2(0, 0), Math::Vec2(1, 1), Math::Vec4(1.0f));
    CHECK(approx(gui.getDrawCommands().back().clipMin.x, 10.0f));

    gui.popClipRect();
    gui.drawRect(Math::Vec2(0, 0), Math::Vec2(1, 1), Math::Vec4(1.0f));
    CHECK(!gui.getDrawCommands().back().clipEnabled);

    gui.clearDrawCommands();
}

// -----------------------------------------------------------------------------
// Scroll area math
// -----------------------------------------------------------------------------
static void testScrollArea() {
    std::cout << "[TEST] scroll areas\n";

    auto& gui = EmberGUI::get();
    gui.clearDrawCommands();
    gui.getContext().windowSize = Math::Vec2(200, 100);

    // No scroll offset: content starts exactly at the area origin.
    Math::Vec2 offset(0, 0);
    gui.setCursorPos(Math::Vec2(10, 10));
    gui.beginScrollArea(offset, Math::Vec2(200, 80));
    CHECK(approx(gui.getCursorPos().y, 10.0f));
    // The area is clipped.
    gui.drawRectFilled(Math::Vec2(0, 0), Math::Vec2(1, 1), Math::Vec4(1.0f));
    CHECK(gui.getDrawCommands().back().clipEnabled);
    gui.advanceCursor(Math::Vec2(0, 200));
    gui.endScrollArea();
    // Cursor is restored to the bottom of the area.
    CHECK(approx(gui.getCursorPos().x, 10.0f) && approx(gui.getCursorPos().y, 90.0f));

    // An existing offset shifts content up by that amount.
    offset = Math::Vec2(0, 50);
    gui.setCursorPos(Math::Vec2(10, 10));
    gui.beginScrollArea(offset, Math::Vec2(200, 80));
    CHECK(approx(gui.getCursorPos().y, -40.0f));
    gui.advanceCursor(Math::Vec2(0, 200));
    gui.endScrollArea();
    CHECK(approx(offset.y, 50.0f));   // 200px content in an 80px view: still valid

    // Overshoot is clamped once the content height is known.
    offset = Math::Vec2(0, 500);
    gui.setCursorPos(Math::Vec2(10, 10));
    gui.beginScrollArea(offset, Math::Vec2(200, 80));
    gui.advanceCursor(Math::Vec2(0, 200));
    gui.endScrollArea();
    CHECK(approx(offset.y, 120.0f));  // 200 - 80

    // Short content cannot scroll at all.
    offset = Math::Vec2(0, 30);
    gui.setCursorPos(Math::Vec2(10, 10));
    gui.beginScrollArea(offset, Math::Vec2(200, 80));
    gui.advanceCursor(Math::Vec2(0, 20));
    gui.endScrollArea();
    CHECK(approx(offset.y, 0.0f));

    gui.clearDrawCommands();
}

int main() {
    std::cout << "========================================\n";
    std::cout << "  EmberEngine UI unit tests\n";
    std::cout << "========================================\n";

    testLogFormatting();
    testCodepointMapping();
    testUtf8Decoding();
    testGlyphUVs();
    testFontAtlasPixels();
    testClipStack();
    testScrollArea();

    std::cout << "----------------------------------------\n";
    std::cout << "  Passed: " << g_passed << "   Failed: " << g_failed << "\n";
    std::cout << "----------------------------------------\n";
    return g_failed == 0 ? 0 : 1;
}
