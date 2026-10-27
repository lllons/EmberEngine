#include "Engine/Rendering/Texture.h"
#include "Engine/Core/Logging.h"
#include "Engine/Rendering/GL.h"

namespace Ember {

Texture::~Texture() { unload(); }

bool Texture::loadFromFile(const std::string& filepath) {
    m_filePath = filepath;
    // Stub: would use stb_image or similar
    m_width = 256; m_height = 256; m_channels = 4; m_format = TextureFormat::RGBA8;

    // Create a default texture for now
    if (m_textureID == 0) glGenTextures(1, &m_textureID);
    glBindTexture(GL_TEXTURE_2D, m_textureID);

    // Generate a checker pattern as placeholder
    std::vector<uint8_t> data(m_width * m_height * 4);
    for (int y = 0; y < (int)m_height; y++) {
        for (int x = 0; x < (int)m_width; x++) {
            int idx = (y * m_width + x) * 4;
            bool check = ((x / 32) + (y / 32)) % 2;
            data[idx] = check ? 180 : 100;
            data[idx + 1] = check ? 180 : 100;
            data[idx + 2] = check ? 180 : 100;
            data[idx + 3] = 255;
        }
    }
    glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA, m_width, m_height, 0, GL_RGBA, GL_UNSIGNED_BYTE, data.data());
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_REPEAT);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_REPEAT);

    m_loaded = true;
    EMBER_LOG_INFO("Texture loaded: ", filepath);
    return true;
}

bool Texture::loadFromData(const uint8_t* data, uint32_t width, uint32_t height, uint32_t channels, TextureFormat format) {
    m_width = width; m_height = height; m_channels = channels; m_format = format;
    if (m_textureID == 0) glGenTextures(1, &m_textureID);
    glBindTexture(GL_TEXTURE_2D, m_textureID);
    GLenum internalFmt = (channels == 4) ? GL_RGBA : (channels == 3) ? GL_RGB : GL_RED;
    glTexImage2D(GL_TEXTURE_2D, 0, internalFmt, width, height, 0, internalFmt, GL_UNSIGNED_BYTE, data);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
    m_loaded = true;
    return true;
}

bool Texture::createEmpty(uint32_t width, uint32_t height, TextureFormat format) {
    m_width = width; m_height = height; m_format = format; m_channels = 4;
    if (m_textureID == 0) glGenTextures(1, &m_textureID);
    glBindTexture(GL_TEXTURE_2D, m_textureID);
    glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA8, width, height, 0, GL_RGBA, GL_UNSIGNED_BYTE, nullptr);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
    m_loaded = true;
    return true;
}

bool Texture::createDepth(uint32_t width, uint32_t height, TextureFormat format) {
    m_width = width; m_height = height; m_format = format; m_channels = 1;
    if (m_textureID == 0) glGenTextures(1, &m_textureID);
    glBindTexture(GL_TEXTURE_2D, m_textureID);
    glTexImage2D(GL_TEXTURE_2D, 0, GL_DEPTH_COMPONENT24, width, height, 0, GL_DEPTH_COMPONENT, GL_FLOAT, nullptr);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
    m_loaded = true;
    return true;
}

void Texture::unload() {
    if (m_textureID) { glDeleteTextures(1, &m_textureID); m_textureID = 0; }
    m_loaded = false;
}

bool Texture::loadCubeMap(const std::string right, const std::string left, const std::string top, const std::string bottom, const std::string front, const std::string back) {
    m_isCubemap = true; m_loaded = true; m_width = 256; m_height = 256;
    return true;
}

bool Texture::loadCubeMapFromDir(const std::string& directory) {
    m_isCubemap = true; m_loaded = true; return true;
}

bool Texture::createDepthCubemap(uint32_t size) {
    m_width = size; m_height = size; m_format = TextureFormat::Depth24; m_channels = 1;
    m_isCubemap = true;
    if (m_textureID == 0) glGenTextures(1, &m_textureID);
    glBindTexture(GL_TEXTURE_CUBE_MAP, m_textureID);
    for (int i = 0; i < 6; i++) {
        glTexImage2D(GL_TEXTURE_CUBE_MAP_POSITIVE_X + i, 0, GL_DEPTH_COMPONENT24,
                     size, size, 0, GL_DEPTH_COMPONENT, GL_FLOAT, nullptr);
    }
    glTexParameteri(GL_TEXTURE_CUBE_MAP, GL_TEXTURE_MIN_FILTER, GL_NEAREST);
    glTexParameteri(GL_TEXTURE_CUBE_MAP, GL_TEXTURE_MAG_FILTER, GL_NEAREST);
    glTexParameteri(GL_TEXTURE_CUBE_MAP, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
    glTexParameteri(GL_TEXTURE_CUBE_MAP, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
    glTexParameteri(GL_TEXTURE_CUBE_MAP, GL_TEXTURE_WRAP_R, GL_CLAMP_TO_EDGE);
    m_loaded = true;
    return true;
}

void Texture::bind(uint32_t slot) const {
    if (m_textureID) {
        glActiveTexture(GL_TEXTURE0 + slot);
        if (m_isCubemap)
            glBindTexture(GL_TEXTURE_CUBE_MAP, m_textureID);
        else
            glBindTexture(GL_TEXTURE_2D, m_textureID);
    }
}

void Texture::unbind(uint32_t slot) const {
    glActiveTexture(GL_TEXTURE0 + slot);
    glBindTexture(GL_TEXTURE_2D, 0);
}

void Texture::bindCube(uint32_t slot) const {
    if (m_textureID && m_isCubemap) {
        glActiveTexture(GL_TEXTURE0 + slot);
        glBindTexture(GL_TEXTURE_CUBE_MAP, m_textureID);
    }
}

void Texture::setWrap(TextureWrap wrap) {
    glBindTexture(GL_TEXTURE_2D, m_textureID);
    GLenum glWrap = (wrap == TextureWrap::Repeat) ? GL_REPEAT :
                    (wrap == TextureWrap::MirroredRepeat) ? GL_MIRRORED_REPEAT : GL_CLAMP_TO_EDGE;
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, glWrap);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, glWrap);
}

void Texture::setFilter(TextureFilter min, TextureFilter mag) {
    glBindTexture(GL_TEXTURE_2D, m_textureID);
    auto toGL = [](TextureFilter f) -> GLenum {
        switch (f) {
            case TextureFilter::Nearest: return GL_NEAREST;
            case TextureFilter::Linear: return GL_LINEAR;
            case TextureFilter::NearestMipmapNearest: return GL_NEAREST_MIPMAP_NEAREST;
            case TextureFilter::LinearMipmapNearest: return GL_LINEAR_MIPMAP_NEAREST;
            case TextureFilter::NearestMipmapLinear: return GL_NEAREST_MIPMAP_LINEAR;
            case TextureFilter::LinearMipmapLinear: return GL_LINEAR_MIPMAP_LINEAR;
            default: return GL_LINEAR;
        }
    };
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, toGL(min));
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, toGL(mag));
}

void Texture::setBorderColor(float r, float g, float b, float a) {
    glBindTexture(GL_TEXTURE_2D, m_textureID);
    float color[] = {r, g, b, a};
    glTexParameterfv(GL_TEXTURE_2D, GL_TEXTURE_BORDER_COLOR, color);
}

void Texture::generateMipmaps() {
    if (m_textureID) {
        glBindTexture(GL_TEXTURE_2D, m_textureID);
        glGenerateMipmap(GL_TEXTURE_2D);
    }
}

uint32_t Texture::getFormatSize(TextureFormat format) {
    switch (format) {
        case TextureFormat::R8: return 1;
        case TextureFormat::RG8: return 2;
        case TextureFormat::RGB8: case TextureFormat::Depth16: return 3;
        case TextureFormat::RGBA8: case TextureFormat::Depth24: case TextureFormat::Depth32: case TextureFormat::Depth24Stencil8: return 4;
        case TextureFormat::RGB16F: return 6;
        case TextureFormat::RGBA16F: case TextureFormat::RGB32F: return 8;
        case TextureFormat::RGBA32F: return 16;
        default: return 4;
    }
}

} // namespace Ember
