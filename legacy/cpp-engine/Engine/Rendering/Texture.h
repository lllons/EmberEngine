#pragma once

#include <string>
#include <cstdint>
#include <memory>

namespace Ember {

enum class TextureFormat {
    R8, RG8, RGB8, RGBA8, RGB16F, RGBA16F, RGB32F, RGBA32F,
    Depth16, Depth24, Depth32, Depth24Stencil8
};

enum class TextureWrap { Repeat, MirroredRepeat, ClampToEdge, ClampToBorder };
enum class TextureFilter { Nearest, Linear, NearestMipmapNearest, LinearMipmapNearest, NearestMipmapLinear, LinearMipmapLinear };

class Texture {
public:
    Texture() = default;
    ~Texture();

    bool loadFromFile(const std::string& filepath);
    bool loadFromData(const uint8_t* data, uint32_t width, uint32_t height, uint32_t channels, TextureFormat format = TextureFormat::RGBA8);
    bool createEmpty(uint32_t width, uint32_t height, TextureFormat format = TextureFormat::RGBA8);
    bool createDepth(uint32_t width, uint32_t height, TextureFormat format = TextureFormat::Depth24);
    void unload();
    bool loadCubeMap(const std::string right, const std::string left, const std::string top, const std::string bottom, const std::string front, const std::string back);
    bool loadCubeMapFromDir(const std::string& directory);
    bool createDepthCubemap(uint32_t size);
    void bind(uint32_t slot = 0) const;
    void unbind(uint32_t slot = 0) const;
    void bindCube(uint32_t slot = 0) const;

    uint32_t getID() const { return m_textureID; }
    uint32_t getWidth() const { return m_width; }
    uint32_t getHeight() const { return m_height; }
    uint32_t getChannels() const { return m_channels; }
    TextureFormat getFormat() const { return m_format; }
    bool isLoaded() const { return m_loaded; }
    bool isCubemap() const { return m_isCubemap; }
    const std::string& getFilePath() const { return m_filePath; }

    void setWrap(TextureWrap wrap);
    void setFilter(TextureFilter min, TextureFilter mag);
    void setBorderColor(float r, float g, float b, float a);
    void generateMipmaps();
    static uint32_t getFormatSize(TextureFormat format);

private:
    uint32_t m_textureID = 0, m_width = 0, m_height = 0, m_channels = 0;
    TextureFormat m_format = TextureFormat::RGBA8;
    bool m_loaded = false, m_isCubemap = false;
    std::string m_filePath;
};

} // namespace Ember
