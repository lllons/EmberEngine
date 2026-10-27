#pragma once

#include <cstdint>
#include <vector>
#include <memory>
#include "Engine/Rendering/Texture.h"

namespace Ember {

struct FrameBufferAttachment {
    std::shared_ptr<Texture> texture;
    uint32_t glTarget = 0; // GL_COLOR_ATTACHMENT0 etc.
};

class FrameBuffer {
public:
    FrameBuffer() = default;
    ~FrameBuffer();

    void create(uint32_t width, uint32_t height);
    void destroy();

    void bind() const;
    void unbind() const;

    // Attachments
    void addColorAttachment(TextureFormat format = TextureFormat::RGBA8);
    void addDepthAttachment(TextureFormat format = TextureFormat::Depth24);
    void addDepthStencilAttachment(TextureFormat format = TextureFormat::Depth24Stencil8);
    void addHDRColorAttachment(TextureFormat format = TextureFormat::RGBA16F);

    // Resize
    void resize(uint32_t width, uint32_t height);

    // Getters
    uint32_t getID() const { return m_fboID; }
    uint32_t getWidth() const { return m_width; }
    uint32_t getHeight() const { return m_height; }
    bool isComplete() const { return m_complete; }

    // Access attachments
    std::shared_ptr<Texture> getColorAttachment(uint32_t index = 0) const;
    std::shared_ptr<Texture> getDepthAttachment() const { return m_depthTexture; }
    const std::vector<FrameBufferAttachment>& getColorAttachments() const { return m_colorAttachments; }

    // Blit to another framebuffer
    void blitTo(const std::shared_ptr<FrameBuffer>& target) const;

    // Static factories
    static std::shared_ptr<FrameBuffer> createDefault(uint32_t width, uint32_t height);
    static std::shared_ptr<FrameBuffer> createHDR(uint32_t width, uint32_t height);
    static std::shared_ptr<FrameBuffer> createShadowMap(uint32_t resolution);
    static std::shared_ptr<FrameBuffer> createDepthOnly(uint32_t width, uint32_t height);
    static std::shared_ptr<FrameBuffer> createCubemapShadowMap(uint32_t resolution);

private:
    void rebuild();

    uint32_t m_fboID = 0;
    uint32_t m_width = 0;
    uint32_t m_height = 0;
    bool m_complete = false;

    std::vector<FrameBufferAttachment> m_colorAttachments;
    std::shared_ptr<Texture> m_depthTexture;
    uint32_t m_depthRBO = 0;
};

} // namespace Ember
