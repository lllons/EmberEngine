// =============================================================================
// Ember Engine - Bitmap Font System
// =============================================================================
//
// A simple monospace 5x7 pixel bitmap font used for GUI text rendering.
//
// Storage layout
// --------------
//   - 95 printable ASCII glyphs (codepoints 32..126).
//   - Each glyph is 5 pixels wide x 7 pixels tall.
//   - The atlas is 16 columns x 6 rows = 96 slots (the last slot is unused).
//   - Each atlas cell is FONT_GLYPH_W=6 wide and FONT_GLYPH_H=8 tall, which
//     includes a 1-pixel border on the right and bottom. This prevents bleed
//     between neighbouring glyphs during texture sampling.
//
// Texture orientation
// -------------------
//   - OpenGL uploads pixel data with the FIRST pixel row of the source buffer
//     at V=0 (the BOTTOM of the texture).
//   - The atlas is generated here so that glyph at atlas-row R has its TOP
//     row near the TOP of the GL texture (V near 1) and its BOTTOM row near
//     V=0. We achieve this by writing the rows in reverse order when filling
//     the source pixel buffer.
//   - This means UV math in `getGlyphUVs` is natural: vMin > vMax, top
//     vertices of the quad sample high V, bottom vertices sample low V.
//
// Unicode handling
// ----------------
//   - ASCII (32..126) maps directly to a glyph in the atlas.
//   - Other printable Latin-1 characters are mapped to a '?' fallback glyph.
//   - `decodeUtf8` advances a byte index over a UTF-8 sequence and returns
//     the Unicode codepoint. The renderer uses this to walk the text string
//     safely instead of indexing by raw bytes.
// =============================================================================

#pragma once

#include "Engine/Rendering/Texture.h"
#include "Engine/Core/Logging.h"
#include <array>
#include <cstdint>
#include <vector>
#include <memory>
#include <string>
#include <fstream>

namespace Ember {

// Atlas cell dimensions
constexpr int FONT_GLYPH_W   = 6;     // glyph cell width  (5 px glyph + 1 px border)
constexpr int FONT_GLYPH_H   = 8;     // glyph cell height (7 px glyph + 1 px border)
constexpr int FONT_COLS       = 16;    // columns per atlas row
constexpr int FONT_ROWS       = 6;     // rows per atlas (= 96 slots, covers 32..126)
constexpr int FONT_TEX_W      = FONT_COLS * FONT_GLYPH_W; // 96
constexpr int FONT_TEX_H      = FONT_ROWS * FONT_GLYPH_H; // 48
constexpr int FONT_FIRST_CP   = 32;    // first printable ASCII codepoint
constexpr int FONT_GLYPH_COUNT= 95;    // ASCII 32..126 inclusive

// Glyph pixel format: each byte is one ROW of the glyph, 5 LSBs are pixels.
// Bit gx corresponds to pixel column gx, so bit 0 is the LEFTMOST column
// and bit 4 the rightmost. Bit 1 = pixel on.
using GlyphRow = uint8_t;
using GlyphBitmap = std::array<GlyphRow, 7>;

// 5x7 bitmap font - 95 ASCII glyphs (codepoints 32..126).
// Each glyph is 7 bytes; byte i holds the bits for row i (top -> bottom).
// Comment after each glyph shows the ASCII character for readability.
static const GlyphBitmap s_fontGlyphs[FONT_GLYPH_COUNT] = {
    // 32 ' '
    {{0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00}},
    // 33 '!'
    {{0x00, 0x04, 0x04, 0x04, 0x00, 0x04, 0x00}},
    // 34 '"'
    {{0x00, 0x0A, 0x0A, 0x00, 0x00, 0x00, 0x00}},
    // 35 '#'
    {{0x00, 0x0A, 0x1F, 0x0A, 0x1F, 0x0A, 0x00}},
    // 36 '$'
    {{0x04, 0x0E, 0x15, 0x0E, 0x15, 0x0E, 0x04}},
    // 37 '%'
    {{0x00, 0x11, 0x09, 0x04, 0x12, 0x11, 0x00}},
    // 38 '&'
    {{0x00, 0x0C, 0x12, 0x0C, 0x19, 0x0E, 0x00}},
    // 39 '''
    {{0x00, 0x04, 0x04, 0x00, 0x00, 0x00, 0x00}},
    // 40 '('
    {{0x00, 0x04, 0x02, 0x02, 0x02, 0x04, 0x00}},
    // 41 ')'
    {{0x00, 0x04, 0x08, 0x08, 0x08, 0x04, 0x00}},
    // 42 '*'
    {{0x00, 0x0A, 0x04, 0x0E, 0x04, 0x0A, 0x00}},
    // 43 '+'
    {{0x00, 0x04, 0x04, 0x1F, 0x04, 0x04, 0x00}},
    // 44 ','
    {{0x00, 0x00, 0x00, 0x00, 0x04, 0x02, 0x00}},
    // 45 '-'
    {{0x00, 0x00, 0x00, 0x1F, 0x00, 0x00, 0x00}},
    // 46 '.'
    {{0x00, 0x00, 0x00, 0x00, 0x00, 0x04, 0x00}},
    // 47 '/'
    {{0x00, 0x10, 0x08, 0x04, 0x02, 0x01, 0x00}},
    // 48 '0'
    {{0x00, 0x0E, 0x11, 0x11, 0x11, 0x0E, 0x00}},
    // 49 '1'
    {{0x00, 0x04, 0x06, 0x04, 0x04, 0x0E, 0x00}},
    // 50 '2'
    {{0x00, 0x0E, 0x10, 0x0E, 0x01, 0x1F, 0x00}},
    // 51 '3'
    {{0x00, 0x1E, 0x08, 0x0E, 0x08, 0x1E, 0x00}},
    // 52 '4'
    {{0x00, 0x08, 0x0C, 0x0A, 0x1F, 0x08, 0x00}},
    // 53 '5'
    {{0x00, 0x1F, 0x01, 0x0F, 0x10, 0x0F, 0x00}},
    // 54 '6'
    {{0x00, 0x0E, 0x01, 0x0F, 0x11, 0x0E, 0x00}},
    // 55 '7'
    {{0x00, 0x1F, 0x10, 0x08, 0x04, 0x04, 0x00}},
    // 56 '8'
    {{0x00, 0x0E, 0x11, 0x0E, 0x11, 0x0E, 0x00}},
    // 57 '9'
    {{0x00, 0x0E, 0x11, 0x1E, 0x10, 0x0E, 0x00}},
    // 58 ':'
    {{0x00, 0x00, 0x04, 0x00, 0x04, 0x00, 0x00}},
    // 59 ';'
    {{0x00, 0x00, 0x04, 0x00, 0x04, 0x02, 0x00}},
    // 60 '<'
    {{0x00, 0x08, 0x04, 0x02, 0x04, 0x08, 0x00}},
    // 61 '='
    {{0x00, 0x00, 0x1F, 0x00, 0x1F, 0x00, 0x00}},
    // 62 '>'
    {{0x00, 0x02, 0x04, 0x08, 0x04, 0x02, 0x00}},
    // 63 '?'
    {{0x00, 0x0E, 0x10, 0x08, 0x04, 0x00, 0x04}},
    // 64 '@'
    {{0x00, 0x0E, 0x11, 0x16, 0x12, 0x0E, 0x00}},
    // 65 'A'
    {{0x00, 0x04, 0x0A, 0x1F, 0x11, 0x11, 0x00}},
    // 66 'B'
    {{0x00, 0x0F, 0x11, 0x0F, 0x11, 0x0F, 0x00}},
    // 67 'C'
    {{0x00, 0x0E, 0x11, 0x01, 0x11, 0x0E, 0x00}},
    // 68 'D'
    {{0x00, 0x0F, 0x11, 0x11, 0x11, 0x0F, 0x00}},
    // 69 'E'
    {{0x00, 0x1F, 0x01, 0x0F, 0x01, 0x1F, 0x00}},
    // 70 'F'
    {{0x00, 0x1F, 0x01, 0x0F, 0x01, 0x01, 0x00}},
    // 71 'G'
    {{0x00, 0x0E, 0x01, 0x1D, 0x11, 0x0E, 0x00}},
    // 72 'H'
    {{0x00, 0x11, 0x11, 0x1F, 0x11, 0x11, 0x00}},
    // 73 'I'
    {{0x00, 0x0E, 0x04, 0x04, 0x04, 0x0E, 0x00}},
    // 74 'J'
    {{0x00, 0x1C, 0x08, 0x08, 0x09, 0x06, 0x00}},
    // 75 'K'
    {{0x00, 0x11, 0x09, 0x07, 0x09, 0x11, 0x00}},
    // 76 'L'
    {{0x00, 0x01, 0x01, 0x01, 0x01, 0x1F, 0x00}},
    // 77 'M'
    {{0x00, 0x11, 0x1B, 0x15, 0x11, 0x11, 0x00}},
    // 78 'N'
    {{0x00, 0x11, 0x13, 0x15, 0x19, 0x11, 0x00}},
    // 79 'O'
    {{0x00, 0x0E, 0x11, 0x11, 0x11, 0x0E, 0x00}},
    // 80 'P'
    {{0x00, 0x0F, 0x11, 0x0F, 0x01, 0x01, 0x00}},
    // 81 'Q'
    {{0x00, 0x0E, 0x11, 0x11, 0x15, 0x0E, 0x08}},
    // 82 'R'
    {{0x00, 0x0F, 0x11, 0x0F, 0x09, 0x11, 0x00}},
    // 83 'S'
    {{0x00, 0x0E, 0x01, 0x0E, 0x10, 0x0F, 0x00}},
    // 84 'T'
    {{0x00, 0x1F, 0x04, 0x04, 0x04, 0x04, 0x00}},
    // 85 'U'
    {{0x00, 0x11, 0x11, 0x11, 0x11, 0x0E, 0x00}},
    // 86 'V'
    {{0x00, 0x11, 0x11, 0x11, 0x0A, 0x04, 0x00}},
    // 87 'W'
    {{0x00, 0x11, 0x11, 0x15, 0x1B, 0x11, 0x00}},
    // 88 'X'
    {{0x00, 0x11, 0x0A, 0x04, 0x0A, 0x11, 0x00}},
    // 89 'Y'
    {{0x00, 0x11, 0x0A, 0x04, 0x04, 0x04, 0x00}},
    // 90 'Z'
    {{0x00, 0x1F, 0x08, 0x04, 0x02, 0x1F, 0x00}},
    // 91 '['
    {{0x00, 0x0E, 0x02, 0x02, 0x02, 0x0E, 0x00}},
    // 92 '\'
    {{0x00, 0x01, 0x02, 0x04, 0x08, 0x10, 0x00}},
    // 93 ']'
    {{0x00, 0x0E, 0x08, 0x08, 0x08, 0x0E, 0x00}},
    // 94 '^'
    {{0x00, 0x04, 0x0A, 0x00, 0x00, 0x00, 0x00}},
    // 95 '_'
    {{0x00, 0x00, 0x00, 0x00, 0x00, 0x1F, 0x00}},
    // 96 '`'
    {{0x00, 0x02, 0x04, 0x00, 0x00, 0x00, 0x00}},
    // 97 'a'
    {{0x00, 0x00, 0x0E, 0x10, 0x1E, 0x11, 0x1E}},
    // 98 'b'
    {{0x00, 0x01, 0x01, 0x0F, 0x11, 0x11, 0x0F}},
    // 99 'c'
    {{0x00, 0x00, 0x0E, 0x11, 0x01, 0x11, 0x0E}},
    // 100 'd'
    {{0x00, 0x10, 0x10, 0x1E, 0x11, 0x11, 0x1E}},
    // 101 'e'
    {{0x00, 0x00, 0x0E, 0x11, 0x1F, 0x01, 0x0E}},
    // 102 'f'
    {{0x00, 0x0C, 0x12, 0x02, 0x0F, 0x02, 0x02}},
    // 103 'g'
    {{0x00, 0x00, 0x1E, 0x11, 0x1E, 0x10, 0x0E}},
    // 104 'h'
    {{0x00, 0x01, 0x01, 0x0F, 0x11, 0x11, 0x11}},
    // 105 'i'
    {{0x00, 0x04, 0x00, 0x06, 0x04, 0x04, 0x0E}},
    // 106 'j'
    {{0x00, 0x08, 0x00, 0x0C, 0x08, 0x09, 0x06}},
    // 107 'k'
    {{0x00, 0x01, 0x01, 0x09, 0x07, 0x09, 0x08}},
    // 108 'l'
    {{0x00, 0x06, 0x04, 0x04, 0x04, 0x04, 0x0E}},
    // 109 'm'
    {{0x00, 0x00, 0x1B, 0x15, 0x15, 0x15, 0x15}},
    // 110 'n'
    {{0x00, 0x00, 0x0F, 0x11, 0x11, 0x11, 0x11}},
    // 111 'o'
    {{0x00, 0x00, 0x0E, 0x11, 0x11, 0x11, 0x0E}},
    // 112 'p'
    {{0x00, 0x00, 0x0F, 0x11, 0x0F, 0x01, 0x01}},
    // 113 'q'
    {{0x00, 0x00, 0x1E, 0x11, 0x1E, 0x10, 0x10}},
    // 114 'r'
    {{0x00, 0x00, 0x01, 0x01, 0x0D, 0x13, 0x01}},
    // 115 's'
    {{0x00, 0x00, 0x0E, 0x01, 0x0E, 0x10, 0x0F}},
    // 116 't'
    {{0x00, 0x02, 0x02, 0x0F, 0x02, 0x12, 0x0C}},
    // 117 'u'
    {{0x00, 0x00, 0x11, 0x11, 0x11, 0x11, 0x0E}},
    // 118 'v'
    {{0x00, 0x00, 0x11, 0x11, 0x11, 0x0A, 0x04}},
    // 119 'w'
    {{0x00, 0x00, 0x11, 0x11, 0x15, 0x1B, 0x11}},
    // 120 'x'
    {{0x00, 0x00, 0x11, 0x0A, 0x04, 0x0A, 0x11}},
    // 121 'y'
    {{0x00, 0x00, 0x11, 0x11, 0x1E, 0x10, 0x0E}},
    // 122 'z'
    {{0x00, 0x00, 0x1F, 0x08, 0x04, 0x02, 0x1F}},
    // 123 '{'
    {{0x00, 0x04, 0x02, 0x06, 0x02, 0x04, 0x00}},
    // 124 '|'
    {{0x00, 0x04, 0x04, 0x04, 0x04, 0x04, 0x00}},
    // 125 '}'
    {{0x00, 0x04, 0x08, 0x0C, 0x08, 0x04, 0x00}},
    // 126 '~'
    {{0x00, 0x0C, 0x12, 0x00, 0x00, 0x00, 0x00}},
};

// Build the font atlas RGBA pixel buffer.
//
// Pixels are written so that, after `glTexImage2D`, the TOP visual row of
// every glyph sits near V=1 in the resulting texture (because GL uploads
// with the first row at V=0). This makes `getGlyphUVs` a natural forward
// mapping.
inline void buildFontAtlasPixels(std::vector<uint8_t>& outPixels) {
    outPixels.assign(FONT_TEX_W * FONT_TEX_H * 4, 0);

    // We treat row 0 of the source buffer as the BOTTOM of the GL texture.
    // So atlas row R (where R=0 is the top of the image) corresponds to
    // texture row (FONT_TEX_H - 1 - R) when we fill the source buffer.
    auto putPixel = [&](int x, int y, uint8_t alpha) {
        if (x < 0 || x >= FONT_TEX_W || y < 0 || y >= FONT_TEX_H) return;
        int idx = (y * FONT_TEX_W + x) * 4;
        // Premultiplied white text: RGB is always 255, alpha carries the mask.
        outPixels[idx + 0] = 255;
        outPixels[idx + 1] = 255;
        outPixels[idx + 2] = 255;
        outPixels[idx + 3] = alpha;
    };

    for (int c = FONT_FIRST_CP; c < FONT_FIRST_CP + FONT_GLYPH_COUNT; c++) {
        int idx  = c - FONT_FIRST_CP;
        int col  = idx % FONT_COLS;
        int row  = idx / FONT_COLS;
        int ax   = col * FONT_GLYPH_W;  // left edge of cell, in atlas image
        int ay   = row * FONT_GLYPH_H;  // top edge of cell, in atlas image

        for (int gy = 0; gy < 7; gy++) {
            uint8_t rowBits = s_fontGlyphs[idx][gy];
            // gy=0 is the top row of the glyph in atlas space. In the source
            // pixel buffer, the BOTTOM row of the texture is index 0. So the
            // destination y is: (FONT_TEX_H - 1) - (ay + gy)
            int dy = (FONT_TEX_H - 1) - (ay + gy);
            for (int gx = 0; gx < 5; gx++) {
                // Bit gx is pixel column gx (bit 0 = leftmost). Reading the
                // bits in the opposite order mirrors every glyph horizontally.
                bool pixelOn = ((rowBits >> gx) & 1) != 0;
                putPixel(ax + gx, dy, pixelOn ? 255 : 0);
            }
        }
    }
}

// Create the font atlas texture used by the UI renderer.
inline std::shared_ptr<Texture> createFontTexture() {
    std::vector<uint8_t> pixels;
    buildFontAtlasPixels(pixels);

    auto tex = std::make_shared<Texture>();
    tex->loadFromData(pixels.data(), FONT_TEX_W, FONT_TEX_H, 4);
    tex->setWrap(TextureWrap::ClampToEdge);
    tex->setFilter(TextureFilter::Nearest, TextureFilter::Nearest);

    EMBER_LOG_INFO("Font texture created: ", FONT_TEX_W, "x", FONT_TEX_H,
                   " (", FONT_GLYPH_COUNT, " glyphs)");

    // Write the atlas once for debugging as a PGM (greyscale) image.
    // Only on first invocation; safe to remove for release builds.
    static bool savedAtlas = false;
    if (!savedAtlas) {
        std::string path = "font_atlas_debug.pgm";
        std::ofstream out(path, std::ios::binary);
        if (out.is_open()) {
            out << "P5\n" << FONT_TEX_W << " " << FONT_TEX_H << "\n255\n";
            // PGM rows are top-to-bottom; emit in atlas-image order (top first).
            for (int y = 0; y < FONT_TEX_H; y++) {
                for (int x = 0; x < FONT_TEX_W; x++) {
                    // Map image-y to source buffer y (flipped).
                    int srcY = (FONT_TEX_H - 1) - y;
                    int idx  = (srcY * FONT_TEX_W + x) * 4 + 3;
                    out.put(static_cast<char>(pixels[idx]));
                }
            }
            EMBER_LOG_INFO("Font atlas saved to ", path);
        }
        savedAtlas = true;
    }
    return tex;
}

// Map a Unicode codepoint to its atlas index, or -1 if unsupported.
//
// We currently ship ASCII 32..126 plus a few common Latin-1 punctuation
// glyphs (mapped to visual equivalents). Anything else falls back to '?'.
inline int codepointToGlyphIndex(uint32_t cp) {
    if (cp >= FONT_FIRST_CP && cp < FONT_FIRST_CP + FONT_GLYPH_COUNT) {
        return static_cast<int>(cp - FONT_FIRST_CP);
    }
    switch (cp) {
        // Latin-1 punctuation -> nearest ASCII equivalent
        case 0x2013: // en dash
        case 0x2014: // em dash
            return '-' - FONT_FIRST_CP;
        case 0x2018: // left single quote
        case 0x2019: // right single quote
        case 0x201A: // single low quote
            return '\'' - FONT_FIRST_CP;
        case 0x201C: // left double quote
        case 0x201D: // right double quote
        case 0x201E: // double low quote
            return '"' - FONT_FIRST_CP;
        case 0x2022: // bullet
        case 0x25C6: // black diamond
        case 0x25CB: // white circle
        case 0x25BA: // right-pointing pointer
            return '>' - FONT_FIRST_CP;
        case 0x2026: // horizontal ellipsis
        case 0x22EF: // mid-line horizontal ellipsis
            return '.' - FONT_FIRST_CP;
        case 0x00B7: // middle dot
            return '.' - FONT_FIRST_CP;
        case 0x2192: // rightwards arrow
        case 0x21A9: // leftwards arrow with hook (undo)
        case 0x21AA: // rightwards arrow with hook (redo)
            return '<' - FONT_FIRST_CP;
        case 0x25B6: // black right-pointing triangle (play)
        case 0x25A0: // black square (stop)
        case 0x23F8: // double vertical bar (pause)
        case 0x25A3: // white square containing black small square
            return '>' - FONT_FIRST_CP;
        case 0x2588: // full block
        case 0x25AE: // black vertical rectangle
            return '|' - FONT_FIRST_CP;
        default:
            // Any other unsupported printable character -> '?' fallback.
            if (cp >= 0x20 && cp != 0x7F) return '?' - FONT_FIRST_CP;
            return -1; // control / non-printable
    }
}

// Decode one UTF-8 sequence starting at `p` (with `remaining` bytes available).
// On success returns the codepoint and writes the number of bytes consumed to
// `*consumed` (1..4). On an invalid sequence returns 0xFFFD and consumes 1 byte
// so the caller can keep advancing.
inline uint32_t decodeUtf8(const char* p, size_t remaining, size_t* consumed) {
    if (!p || remaining == 0) {
        if (consumed) *consumed = 0;
        return 0;
    }
    unsigned char lead = static_cast<unsigned char>(*p);

    // ASCII fast path.
    if (lead < 0x80) {
        if (consumed) *consumed = 1;
        return lead;
    }
    // 2-byte: 110xxxxx 10xxxxxx
    if ((lead & 0xE0) == 0xC0 && remaining >= 2) {
        unsigned char b1 = static_cast<unsigned char>(p[1]);
        if ((b1 & 0xC0) != 0x80) goto invalid;
        uint32_t cp = ((lead & 0x1F) << 6) | (b1 & 0x3F);
        if (consumed) *consumed = 2;
        return cp;
    }
    // 3-byte: 1110xxxx 10xxxxxx 10xxxxxx
    if ((lead & 0xF0) == 0xE0 && remaining >= 3) {
        unsigned char b1 = static_cast<unsigned char>(p[1]);
        unsigned char b2 = static_cast<unsigned char>(p[2]);
        if (((b1 | b2) & 0xC0) != 0x80) goto invalid;
        uint32_t cp = ((lead & 0x0F) << 12) | ((b1 & 0x3F) << 6) | (b2 & 0x3F);
        if (consumed) *consumed = 3;
        return cp;
    }
    // 4-byte: 11110xxx 10xxxxxx 10xxxxxx 10xxxxxx
    if ((lead & 0xF8) == 0xF0 && remaining >= 4) {
        unsigned char b1 = static_cast<unsigned char>(p[1]);
        unsigned char b2 = static_cast<unsigned char>(p[2]);
        unsigned char b3 = static_cast<unsigned char>(p[3]);
        if (((b1 | b2 | b3) & 0xC0) != 0x80) goto invalid;
        uint32_t cp = ((lead & 0x07) << 18) | ((b1 & 0x3F) << 12)
                    | ((b2 & 0x3F) << 6)  |  (b3 & 0x3F);
        if (consumed) *consumed = 4;
        return cp;
    }

invalid:
    if (consumed) *consumed = 1;
    return 0xFFFD; // Unicode replacement character
}

// UV rectangle for a given codepoint in the font atlas.
//
// `glyphIndex` is the value returned by `codepointToGlyphIndex`. Any value
// outside [0, FONT_GLYPH_COUNT) is clamped to '?'.
//
// Because the atlas is generated with glyph rows pointing the right way, vMin
// is always greater than vMax and they sample the top and bottom edges of
// the glyph respectively when used with the standard top-left coordinate
// system.
inline void getGlyphUVs(int glyphIndex, float& uMin, float& vMin, float& uMax, float& vMax) {
    if (glyphIndex < 0 || glyphIndex >= FONT_GLYPH_COUNT) {
        glyphIndex = '?' - FONT_FIRST_CP; // '?' fallback
    }
    int col = glyphIndex % FONT_COLS;
    int row = glyphIndex / FONT_COLS;

    // U: left-to-right mapping, source row orientation is irrelevant.
    uMin = static_cast<float>(col * FONT_GLYPH_W) / static_cast<float>(FONT_TEX_W);
    uMax = static_cast<float>(col * FONT_GLYPH_W + (FONT_GLYPH_W - 1)) / static_cast<float>(FONT_TEX_W);

    // V: atlas row 0 (top of image) corresponds to texture V near 1, because
    // the source pixel buffer is uploaded with row 0 at the texture bottom.
    // For glyph at atlas row R, the top pixel row (image y = R * GH) ends up
    // at texture V = 1 - (R * GH) / TEX_H.
    vMin = 1.0f - static_cast<float>(row * FONT_GLYPH_H) / static_cast<float>(FONT_TEX_H);
    vMax = 1.0f - static_cast<float>(row * FONT_GLYPH_H + (FONT_GLYPH_H - 1)) / static_cast<float>(FONT_TEX_H);
}

// Convenience overload that takes a Unicode codepoint directly.
inline void getGlyphUVsForCodepoint(uint32_t cp, float& uMin, float& vMin, float& uMax, float& vMax) {
    getGlyphUVs(codepointToGlyphIndex(cp), uMin, vMin, uMax, vMax);
}

} // namespace Ember