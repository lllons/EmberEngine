#include "Engine/Rendering/FrameBuffer.h"
#include "Engine/Core/Logging.h"
#include "Engine/Rendering/GL.h"

namespace Ember {

FrameBuffer::~FrameBuffer() { destroy(); }

void FrameBuffer::create(uint32_t width, uint32_t height) {
    m_width = width; m_height = height;
    glGenFramebuffers(1, &m_fboID);
    glBindFramebuffer(GL_FRAMEBUFFER, m_fboID);
    m_complete = true;
    EMBER_LOG_INFO("FrameBuffer created: ", width, "x", height);
}

void FrameBuffer::destroy() {
    if (m_fboID) {
        glDeleteFramebuffers(1, &m_fboID);
        m_fboID = 0;
    }
    if (m_depthRBO) {
        glDeleteRenderbuffers(1, &m_depthRBO);
        m_depthRBO = 0;
    }
    m_colorAttachments.clear();
    m_depthTexture.reset();
    m_complete = false;
}

void FrameBuffer::bind() const {
    glBindFramebuffer(GL_FRAMEBUFFER, m_fboID);
    glViewport(0, 0, m_width, m_height);
}

void FrameBuffer::unbind() const {
    glBindFramebuffer(GL_FRAMEBUFFER, 0);
}

void FrameBuffer::addColorAttachment(TextureFormat format) {
    FrameBufferAttachment att;
    att.texture = std::make_shared<Texture>();
    att.texture->createEmpty(m_width, m_height, format);
    glBindFramebuffer(GL_FRAMEBUFFER, m_fboID);
    glFramebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0 + (GLenum)m_colorAttachments.size(),
                           GL_TEXTURE_2D, att.texture->getID(), 0);
    att.glTarget = GL_COLOR_ATTACHMENT0 + (GLenum)m_colorAttachments.size();
    m_colorAttachments.push_back(att);
    m_complete = (glCheckFramebufferStatus(GL_FRAMEBUFFER) == GL_FRAMEBUFFER_COMPLETE);
}

void FrameBuffer::addDepthAttachment(TextureFormat format) {
    m_depthTexture = std::make_shared<Texture>();
    m_depthTexture->createDepth(m_width, m_height, format);
    glBindFramebuffer(GL_FRAMEBUFFER, m_fboID);
    glFramebufferTexture2D(GL_FRAMEBUFFER, GL_DEPTH_ATTACHMENT, GL_TEXTURE_2D, m_depthTexture->getID(), 0);
    // Depth-only FBO must explicitly disable color draw/read buffers
    glDrawBuffer(GL_NONE);
    glReadBuffer(GL_NONE);
    // Check completeness
    GLenum status = glCheckFramebufferStatus(GL_FRAMEBUFFER);
    m_complete = (status == GL_FRAMEBUFFER_COMPLETE);
    if (!m_complete) {
        EMBER_LOG_ERROR("Depth-only Framebuffer is incomplete! Status: ", (int)status);
    }
}

void FrameBuffer::addDepthStencilAttachment(TextureFormat format) {
    m_depthTexture = std::make_shared<Texture>();
    m_depthTexture->createDepth(m_width, m_height, format);
    glBindFramebuffer(GL_FRAMEBUFFER, m_fboID);
    glFramebufferTexture2D(GL_FRAMEBUFFER, GL_DEPTH_STENCIL_ATTACHMENT, GL_TEXTURE_2D, m_depthTexture->getID(), 0);
}

void FrameBuffer::addHDRColorAttachment(TextureFormat format) {
    addColorAttachment(format);
}

void FrameBuffer::resize(uint32_t width, uint32_t height) {
    m_width = width; m_height = height;
    rebuild();
}

void FrameBuffer::rebuild() {
    destroy();
    create(m_width, m_height);
}

std::shared_ptr<Texture> FrameBuffer::getColorAttachment(uint32_t index) const {
    return (index < m_colorAttachments.size()) ? m_colorAttachments[index].texture : nullptr;
}

void FrameBuffer::blitTo(const std::shared_ptr<FrameBuffer>& target) const {
    if (target) {
        glBindFramebuffer(GL_READ_FRAMEBUFFER, m_fboID);
        glBindFramebuffer(GL_DRAW_FRAMEBUFFER, target->getID());
    } else {
        glBindFramebuffer(GL_READ_FRAMEBUFFER, m_fboID);
        glBindFramebuffer(GL_DRAW_FRAMEBUFFER, 0);
    }
    glBlitFramebuffer(0, 0, m_width, m_height, 0, 0, m_width, m_height, GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT, GL_NEAREST);
    glBindFramebuffer(GL_FRAMEBUFFER, 0);
}

std::shared_ptr<FrameBuffer> FrameBuffer::createDefault(uint32_t width, uint32_t height) {
    auto fbo = std::make_shared<FrameBuffer>();
    fbo->create(width, height);
    fbo->addColorAttachment(TextureFormat::RGBA8);
    fbo->addDepthAttachment(TextureFormat::Depth24);
    return fbo;
}

std::shared_ptr<FrameBuffer> FrameBuffer::createHDR(uint32_t width, uint32_t height) {
    auto fbo = std::make_shared<FrameBuffer>();
    fbo->create(width, height);
    fbo->addHDRColorAttachment(TextureFormat::RGBA16F);
    fbo->addDepthAttachment(TextureFormat::Depth24);
    return fbo;
}

std::shared_ptr<FrameBuffer> FrameBuffer::createShadowMap(uint32_t resolution) {
    auto fbo = std::make_shared<FrameBuffer>();
    fbo->create(resolution, resolution);
    fbo->addDepthAttachment(TextureFormat::Depth32);
    return fbo;
}

std::shared_ptr<FrameBuffer> FrameBuffer::createDepthOnly(uint32_t width, uint32_t height) {
    auto fbo = std::make_shared<FrameBuffer>();
    fbo->create(width, height);
    fbo->addDepthAttachment(TextureFormat::Depth24);
    return fbo;
}

std::shared_ptr<FrameBuffer> FrameBuffer::createCubemapShadowMap(uint32_t resolution) {
    auto fbo = std::make_shared<FrameBuffer>();
    fbo->create(resolution, resolution);
    // Create cubemap depth attachment
    auto depthTex = std::make_shared<Texture>();
    depthTex->createDepthCubemap(resolution);
    fbo->m_depthTexture = depthTex;
    glBindFramebuffer(GL_FRAMEBUFFER, fbo->m_fboID);
    // Attach only the first face for FBO completeness - we'll change the face each render
    glFramebufferTexture2D(GL_FRAMEBUFFER, GL_DEPTH_ATTACHMENT, GL_TEXTURE_CUBE_MAP_POSITIVE_X, depthTex->getID(), 0);
    glDrawBuffer(GL_NONE);
    glReadBuffer(GL_NONE);
    GLenum status = glCheckFramebufferStatus(GL_FRAMEBUFFER);
    fbo->m_complete = (status == GL_FRAMEBUFFER_COMPLETE);
    if (!fbo->m_complete) {
        EMBER_LOG_ERROR("Cubemap depth Framebuffer is incomplete! Status: ", (int)status);
    }
    return fbo;
}

} // namespace Ember
