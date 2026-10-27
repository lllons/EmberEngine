#include "Engine/Rendering/Renderer.h"
#include "Engine/Rendering/Shader.h"
#include "Engine/Rendering/Mesh.h"
#include "Engine/Rendering/Material.h"
#include "Engine/Rendering/Texture.h"
#include "Engine/Rendering/Camera.h"
#include "Engine/Rendering/Light.h"
#include "Engine/Rendering/FrameBuffer.h"
#include "Engine/Core/Logging.h"
#include "Engine/Core/ECS.h"
#include "Engine/Core/Components.h"
#include "Engine/Rendering/GL.h"
#include "GUI/EmberGUI.h"
#include "Engine/Rendering/Font.h"
#include <fstream>
#include <vector>

namespace Ember {

// GUI rendering helpers
namespace {
    std::shared_ptr<Shader> s_guiShader = nullptr;
    uint32_t s_guiVAO = 0, s_guiVBO = 0;
    bool s_guiInitDone = false;
    std::shared_ptr<Texture> s_fontTexture = nullptr;
    
    void cleanupGUIResources() {
        if (s_guiVAO) { glDeleteVertexArrays(1, &s_guiVAO); s_guiVAO = 0; }
        if (s_guiVBO) { glDeleteBuffers(1, &s_guiVBO); s_guiVBO = 0; }
        s_guiShader.reset();
        s_fontTexture.reset();
        s_guiInitDone = false;
    }

    // Vertex layout constants for the GUI vertex buffer.
    // Per vertex: position(vec3) + uv(vec2) + color(vec4) = 9 floats = 36 bytes.
    constexpr int GUI_VERTEX_FLOATS = 9;
    constexpr int GUI_VERTEX_BYTES  = GUI_VERTEX_FLOATS * (int)sizeof(float);
    constexpr int GUI_POS_OFFSET    = 0;
    constexpr int GUI_UV_OFFSET     = 3 * (int)sizeof(float);
    constexpr int GUI_COLOR_OFFSET  = 5 * (int)sizeof(float);

    // Scissors a GUI draw command to its recorded clip rectangle. The GUI uses
    // a top-left origin while glScissor is bottom-left, so Y is flipped here.
    // Restores the previous scissor state on destruction.
    struct ScissorGuard {
        bool active = false;
        GLboolean wasEnabled = GL_FALSE;
        GLint previousBox[4] = {0, 0, 0, 0};

        ScissorGuard(const DrawCmd& cmd, int viewportWidth, int viewportHeight) {
            (void)viewportWidth;
            if (!cmd.clipEnabled) return;

            active = true;
            wasEnabled = glIsEnabled(GL_SCISSOR_TEST);
            glGetIntegerv(GL_SCISSOR_BOX, previousBox);

            int x = (int)cmd.clipMin.x;
            int y = (int)((float)viewportHeight - cmd.clipMax.y);
            int w = (int)(cmd.clipMax.x - cmd.clipMin.x);
            int h = (int)(cmd.clipMax.y - cmd.clipMin.y);
            if (w < 0) w = 0;
            if (h < 0) h = 0;

            glEnable(GL_SCISSOR_TEST);
            glScissor(x, y, w, h);
        }

        ~ScissorGuard() {
            if (!active) return;
            glScissor(previousBox[0], previousBox[1], previousBox[2], previousBox[3]);
            if (!wasEnabled) glDisable(GL_SCISSOR_TEST);
        }
    };
}

Renderer& Renderer::get() { static Renderer instance; return instance; }

void Renderer::init(RenderAPI api) {
    m_api = api;
    m_initialized = true;

    // OpenGL state setup
    glEnable(GL_DEPTH_TEST);
    glDepthFunc(GL_LEQUAL);
    glEnable(GL_CULL_FACE);
    glCullFace(GL_BACK);
    glFrontFace(GL_CCW);
    glEnable(GL_BLEND);
    glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
    glClearColor(0.1f, 0.1f, 0.12f, 1.0f);
    glClearDepth(1.0);

    // Get viewport size
    GLint viewport[4];
    glGetIntegerv(GL_VIEWPORT, viewport);
    m_viewportWidth = viewport[2];
    m_viewportHeight = viewport[3];

    EMBER_LOG_INFO("Renderer initialized with OpenGL");
}

void Renderer::shutdown() {
    m_currentShader.reset();
    m_currentFBO.reset();
    m_debugShader.reset();
    m_depthShader.reset();
    m_shadowFboCache.clear();
    m_shadowMaps.clear();
    m_postProcessEffects.clear();
    m_debugLines.clear();
    cleanupGUIResources();
    m_initialized = false;
    EMBER_LOG_INFO("Renderer shutdown");
}

void Renderer::onWindowResize(uint32_t width, uint32_t height) {
    m_viewportWidth = width;
    m_viewportHeight = height;
    setViewport(0, 0, width, height);
}

void Renderer::beginFrame() {
    m_stats.reset();
    m_debugLines.clear();
    // Bind default framebuffer
    if (m_mainWindowFBO != 0) {
        glBindFramebuffer(GL_FRAMEBUFFER, m_mainWindowFBO);
    } else {
        glBindFramebuffer(GL_FRAMEBUFFER, 0);
    }
    glViewport(0, 0, m_viewportWidth, m_viewportHeight);
    clear();
}

void Renderer::endFrame() {
    if (m_postProcessingEnabled) renderPostProcessing();

    // Render debug lines
    if (m_debugRendering && !m_debugLines.empty()) {
        // Could use a debug shader here
        m_debugLines.clear();
    }
}

void Renderer::submitFrame() {}

void Renderer::clear(float r, float g, float b, float a) {
    glClearColor(r, g, b, a);
    glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT | GL_STENCIL_BUFFER_BIT);
}

void Renderer::setViewport(uint32_t x, uint32_t y, uint32_t width, uint32_t height) {
    m_viewportWidth = width;
    m_viewportHeight = height;
    glViewport(x, y, width, height);
}

void Renderer::drawMesh(const std::shared_ptr<Mesh>& mesh, const Math::Mat4& /*transform*/) {
    if (!mesh) return;
    mesh->draw();
    m_stats.drawCalls++;
    m_stats.triangles += mesh->getTriangleCount();
    m_stats.vertices += mesh->getVertexCount();
}

void Renderer::drawMesh(const std::shared_ptr<Mesh>& mesh, const std::shared_ptr<Material>& material, const Math::Mat4& /*transform*/) {
    if (!mesh || !material) return;
    material->bind();
    mesh->draw();
    m_stats.drawCalls++;
    m_stats.triangles += mesh->getTriangleCount();
    m_stats.vertices += mesh->getVertexCount();
}

void Renderer::drawIndexed(const std::shared_ptr<Mesh>& mesh, uint32_t indexCount) {
    if (!mesh) return;
    mesh->drawIndexed(indexCount);
    m_stats.drawCalls++;
}

void Renderer::drawArrays(uint32_t vertexCount) {
    glDrawArrays(GL_TRIANGLES, 0, vertexCount);
    m_stats.drawCalls++;
}

void Renderer::renderShadowPass(Scene& scene) {
    // This method maintains the existing single-cascade shadow rendering
    // for backward compatibility. The new CSM rendering is in renderCascadeShadowPass().
    auto& ecs = scene.getECS();
    auto lightEntities = ecs.getEntitiesWith<LightComponent>();
    if (lightEntities.empty()) return;

    // Initialize depth shader if needed
    if (!m_depthShader) {
        m_depthShader = Shader::createDepthShader();
        if (!m_depthShader) {
            EMBER_LOG_ERROR("Failed to create depth shader for shadow mapping");
            return;
        }
    }

    m_shadowMaps.clear();

    for (Entity lightEntity : lightEntities) {
        if (!ecs.hasComponent<LightComponent>(lightEntity) || !ecs.hasComponent<Transform>(lightEntity)) continue;
        
        auto& lightComp = ecs.getComponent<LightComponent>(lightEntity);
        if (!lightComp.castShadows || !lightComp.enabled) continue;

        auto& lightTransform = ecs.getComponent<Transform>(lightEntity);
        
        uint32_t shadowRes = (uint32_t)std::max(lightComp.shadowResolution, 16);
        
        // Find existing shadow FBO for this light or create new one
        auto it = m_shadowFboCache.find(lightEntity);
        std::shared_ptr<FrameBuffer> shadowFBO;
        if (it != m_shadowFboCache.end()) {
            shadowFBO = it->second;
            if (shadowFBO->getWidth() != shadowRes) {
                shadowFBO->resize(shadowRes, shadowRes);
            }
        } else {
            shadowFBO = FrameBuffer::createShadowMap(shadowRes);
            m_shadowFboCache[lightEntity] = shadowFBO;
        }

        Math::Vec3 lightDir = -lightTransform.getForward();
        float orthoSize = 15.0f;
        float nearPlane = 0.1f, farPlane = 50.0f;
        Math::Mat4 lightProjection = Math::Mat4::orthographic(-orthoSize, orthoSize, -orthoSize, orthoSize, nearPlane, farPlane);
        Math::Vec3 target = Math::Vec3::zero();
        Math::Mat4 lightView = Math::Mat4::lookAt(target - lightDir * 20.0f, target, Math::Vec3::up());
        Math::Mat4 lightSpaceMatrix = lightProjection * lightView;

        ShadowMapData smd;
        smd.fbo = shadowFBO;
        smd.lightSpaceMatrix = lightSpaceMatrix;
        smd.lightDir = lightDir;
        smd.bias = lightComp.shadowBias;
        m_shadowMaps.push_back(smd);

        // Render depth
        shadowFBO->bind();
        glClear(GL_DEPTH_BUFFER_BIT);
        glEnable(GL_DEPTH_TEST);
        glDisable(GL_CULL_FACE);
        glDisable(GL_BLEND);

        m_depthShader->bind();
        m_depthShader->setMat4("uLightSpaceMatrix", lightSpaceMatrix.ptr());

        auto entities = ecs.getEntitiesWith<MeshRenderer>();
        for (Entity entity : entities) {
            if (!ecs.hasComponent<Transform>(entity)) continue;
            auto& transform = ecs.getComponent<Transform>(entity);
            auto& meshRenderer = ecs.getComponent<MeshRenderer>(entity);
            if (!meshRenderer.enabled || !meshRenderer.mesh || !meshRenderer.castShadows) continue;

            Math::Mat4 model = transform.getTransformMatrix();
            m_depthShader->setMat4("uModel", model.ptr());
            meshRenderer.mesh->draw();
            m_stats.drawCalls++;
        }

        m_depthShader->unbind();
        glBindFramebuffer(GL_FRAMEBUFFER, 0);
    }

    applySceneViewport();
}

void Renderer::calculateCascadeMatrices(Camera& camera, const Math::Vec3& lightDir,
                                          CascadeData* cascades, int numCascades) {
    if (numCascades <= 0) return;

    float nearPlane = camera.getNearPlane();
    float farPlane = camera.getFarPlane();

    // Calculate cascade split distances
    std::vector<float> splits(numCascades);
    Camera::calculateCascadeSplits(nearPlane, farPlane, numCascades, splits.data(), 0.85f);

    // For each cascade, calculate the tight light-space frustum
    for (int i = 0; i < numCascades; i++) {
        float splitNear = (i == 0) ? nearPlane : splits[i - 1];
        float splitFar = splits[i];

        // Get frustum corners for this slice
        auto corners = camera.getFrustumCorners(splitNear, splitFar);

        // Transform corners to light space
        Math::Vec3 target = Math::Vec3::zero();
        // Find scene center to look at
        for (int j = 0; j < 8; j++) {
            target = target + corners[j];
        }
        target = target * (1.0f / 8.0f);

        // Build light view matrix
        Math::Vec3 lightPos = target - lightDir * 50.0f;
        Math::Mat4 lightView = Math::Mat4::lookAt(lightPos, target, Math::Vec3::up());

        // Transform frustum corners to light space
        Math::Vec3 lightCorners[8];
        for (int j = 0; j < 8; j++) {
            Math::Vec4 v = lightView * Math::Vec4(corners[j].x, corners[j].y, corners[j].z, 1.0f);
            lightCorners[j] = Math::Vec3(v.x, v.y, v.z) * (1.0f / v.w);
        }

        // Find min/max in light space
        Math::Vec3 minBounds = lightCorners[0];
        Math::Vec3 maxBounds = lightCorners[0];
        for (int j = 1; j < 8; j++) {
            minBounds = minBounds.min(lightCorners[j]);
            maxBounds = maxBounds.max(lightCorners[j]);
        }

        // Add padding to avoid shimmering and near-plane clipping
        float padConstant = 20.0f;
        minBounds.x -= padConstant;
        minBounds.y -= padConstant;
        maxBounds.x += padConstant;
        maxBounds.y += padConstant;

        // Create orthographic projection with padding on both near and far planes
        float nearPad = 10.0f;
        float farExt = 150.0f;
        Math::Mat4 lightProjection = Math::Mat4::orthographic(
            minBounds.x, maxBounds.x,
            minBounds.y, maxBounds.y,
            -maxBounds.z - nearPad, -minBounds.z + farExt);

        cascades[i].lightSpaceMatrix = lightProjection * lightView;
        cascades[i].splitDist = splitFar;
    }
}

void Renderer::renderSpotShadowPass(Scene& scene) {
    auto& ecs = scene.getECS();
    auto lightEntities = ecs.getEntitiesWith<LightComponent>();
    if (lightEntities.empty()) return;

    if (!m_depthShader) {
        m_depthShader = Shader::createDepthShader();
        if (!m_depthShader) { EMBER_LOG_ERROR("Failed to create depth shader"); return; }
    }

    m_spotShadowMaps.clear();

    for (Entity lightEntity : lightEntities) {
        if (!ecs.hasComponent<LightComponent>(lightEntity) || !ecs.hasComponent<Transform>(lightEntity)) continue;
        auto& lightComp = ecs.getComponent<LightComponent>(lightEntity);
        if (!lightComp.castShadows || !lightComp.enabled) continue;
        if (lightComp.type != LightComponent::Spot) continue;

        auto& lightTransform = ecs.getComponent<Transform>(lightEntity);
        uint32_t shadowRes = (uint32_t)std::max(lightComp.shadowResolution, 16);

        // Reuse or create spot shadow FBO
        auto it = m_spotShadowFboCache.find(lightEntity);
        std::shared_ptr<FrameBuffer> shadowFBO;
        if (it != m_spotShadowFboCache.end()) {
            shadowFBO = it->second;
            if (shadowFBO->getWidth() != shadowRes) shadowFBO->resize(shadowRes, shadowRes);
        } else {
            shadowFBO = FrameBuffer::createShadowMap(shadowRes);
            m_spotShadowFboCache[lightEntity] = shadowFBO;
        }

        // Perspective projection for spot light using outer cutoff as FOV
        float fov = lightComp.outerCutoff * 2.0f;
        float aspect = 1.0f; // square shadow map
        float nearPlane = 0.1f;
        float farPlane = lightComp.range;
        Math::Mat4 lightProjection = Math::Mat4::perspective(fov, aspect, nearPlane, farPlane);

        // View matrix: look in light direction
        Math::Vec3 lightDir = -lightTransform.getForward();
        Math::Vec3 lightPos = lightTransform.position;
        Math::Mat4 lightView = Math::Mat4::lookAt(lightPos, lightPos + lightDir, Math::Vec3::up());
        Math::Mat4 lightSpaceMatrix = lightProjection * lightView;

        SpotShadowData ssd;
        ssd.fbo = shadowFBO;
        ssd.lightSpaceMatrix = lightSpaceMatrix;
        ssd.position = lightPos;
        ssd.direction = lightDir;
        ssd.bias = lightComp.shadowBias;
        ssd.farPlane = farPlane;
        m_spotShadowMaps.push_back(ssd);

        // Render depth
        shadowFBO->bind();
        glClear(GL_DEPTH_BUFFER_BIT);
        glEnable(GL_DEPTH_TEST);
        glDisable(GL_CULL_FACE);
        glDisable(GL_BLEND);

        m_depthShader->bind();
        m_depthShader->setMat4("uLightSpaceMatrix", lightSpaceMatrix.ptr());

        auto entities = ecs.getEntitiesWith<MeshRenderer>();
        for (Entity entity : entities) {
            if (!ecs.hasComponent<Transform>(entity)) continue;
            auto& transform = ecs.getComponent<Transform>(entity);
            auto& meshRenderer = ecs.getComponent<MeshRenderer>(entity);
            if (!meshRenderer.enabled || !meshRenderer.mesh || !meshRenderer.castShadows) continue;

            Math::Mat4 model = transform.getTransformMatrix();
            m_depthShader->setMat4("uModel", model.ptr());
            meshRenderer.mesh->draw();
            m_stats.drawCalls++;
        }

        m_depthShader->unbind();
        glBindFramebuffer(GL_FRAMEBUFFER, 0);
    }

    applySceneViewport();
}

void Renderer::renderPointShadowPass(Scene& scene) {
    auto& ecs = scene.getECS();
    auto lightEntities = ecs.getEntitiesWith<LightComponent>();
    if (lightEntities.empty()) return;

    if (!m_depthShader) {
        m_depthShader = Shader::createDepthShader();
        if (!m_depthShader) { EMBER_LOG_ERROR("Failed to create depth shader"); return; }
    }

    m_pointShadowMaps.clear();

    // Cubemap face view directions and up vectors
    static const Math::Vec3 faceTargets[6] = {
        Math::Vec3(1, 0, 0),  Math::Vec3(-1, 0, 0), // +X, -X
        Math::Vec3(0, 1, 0),  Math::Vec3(0, -1, 0), // +Y, -Y
        Math::Vec3(0, 0, 1),  Math::Vec3(0, 0, -1)  // +Z, -Z
    };
    static const Math::Vec3 faceUps[6] = {
        Math::Vec3(0, -1, 0), Math::Vec3(0, -1, 0), // +X, -X
        Math::Vec3(0, 0, 1),  Math::Vec3(0, 0, -1), // +Y, -Y
        Math::Vec3(0, -1, 0), Math::Vec3(0, -1, 0)  // +Z, -Z
    };

    for (Entity lightEntity : lightEntities) {
        if (!ecs.hasComponent<LightComponent>(lightEntity) || !ecs.hasComponent<Transform>(lightEntity)) continue;
        auto& lightComp = ecs.getComponent<LightComponent>(lightEntity);
        if (!lightComp.castShadows || !lightComp.enabled) continue;
        if (lightComp.type != LightComponent::Point) continue;

        auto& lightTransform = ecs.getComponent<Transform>(lightEntity);
        uint32_t shadowRes = (uint32_t)std::max(lightComp.shadowResolution, 16);
        Math::Vec3 lightPos = lightTransform.position;
        float farPlane = lightComp.range;

        // Reuse or create point light cubemap FBO
        auto it = m_pointShadowFboCache.find(lightEntity);
        std::shared_ptr<FrameBuffer> shadowFBO;
        std::shared_ptr<Texture> cubemapTex;
        if (it != m_pointShadowFboCache.end()) {
            shadowFBO = it->second;
            cubemapTex = shadowFBO->getDepthAttachment();
            if (shadowFBO->getWidth() != shadowRes) shadowFBO->resize(shadowRes, shadowRes);
        } else {
            shadowFBO = FrameBuffer::createCubemapShadowMap(shadowRes);
            cubemapTex = shadowFBO->getDepthAttachment();
            m_pointShadowFboCache[lightEntity] = shadowFBO;
        }

        float aspect = 1.0f;
        float nearPlane = 0.1f;
        Math::Mat4 pointProjection = Math::Mat4::perspective(90.0f, aspect, nearPlane, farPlane);

        PointShadowData psd;
        psd.fbo = shadowFBO;
        psd.cubemap = cubemapTex;
        psd.position = lightPos;
        psd.bias = lightComp.shadowBias;
        psd.farPlane = farPlane;
        psd.projectionMatrix = pointProjection;

        // Render each face of the cubemap
        for (int face = 0; face < 6; face++) {
            Math::Vec3 target = lightPos + faceTargets[face];
            Math::Mat4 faceView = Math::Mat4::lookAt(lightPos, target, faceUps[face]);
            Math::Mat4 faceSpaceMatrix = pointProjection * faceView;
            psd.viewMatrices[face] = faceView;

            // Attach this face of the cubemap to the FBO
            glBindFramebuffer(GL_FRAMEBUFFER, shadowFBO->getID());
            glFramebufferTexture2D(GL_FRAMEBUFFER, GL_DEPTH_ATTACHMENT,
                                   GL_TEXTURE_CUBE_MAP_POSITIVE_X + face,
                                   cubemapTex->getID(), 0);
            glClear(GL_DEPTH_BUFFER_BIT);
            glEnable(GL_DEPTH_TEST);
            glDisable(GL_CULL_FACE);
            glDisable(GL_BLEND);

            m_depthShader->bind();
            m_depthShader->setMat4("uLightSpaceMatrix", faceSpaceMatrix.ptr());

            auto entities = ecs.getEntitiesWith<MeshRenderer>();
            for (Entity entity : entities) {
                if (!ecs.hasComponent<Transform>(entity)) continue;
                auto& transform = ecs.getComponent<Transform>(entity);
                auto& meshRenderer = ecs.getComponent<MeshRenderer>(entity);
                if (!meshRenderer.enabled || !meshRenderer.mesh || !meshRenderer.castShadows) continue;

                Math::Mat4 model = transform.getTransformMatrix();
                m_depthShader->setMat4("uModel", model.ptr());
                meshRenderer.mesh->draw();
                m_stats.drawCalls++;
            }
        }

        m_pointShadowMaps.push_back(psd);
        glBindFramebuffer(GL_FRAMEBUFFER, 0);
    }

    applySceneViewport();
}

void Renderer::renderCascadeShadowPass(Scene& scene, Camera& camera) {
    auto& ecs = scene.getECS();
    auto lightEntities = ecs.getEntitiesWith<LightComponent>();
    if (lightEntities.empty()) return;

    // Initialize depth shader if needed
    if (!m_depthShader) {
        m_depthShader = Shader::createDepthShader();
        if (!m_depthShader) {
            EMBER_LOG_ERROR("Failed to create depth shader for shadow mapping");
            return;
        }
    }

    m_cascadeShadowMaps.clear();

    for (Entity lightEntity : lightEntities) {
        if (!ecs.hasComponent<LightComponent>(lightEntity) || !ecs.hasComponent<Transform>(lightEntity)) continue;

        auto& lightComp = ecs.getComponent<LightComponent>(lightEntity);
        if (!lightComp.castShadows || !lightComp.enabled) continue;
        if (lightComp.type != LightComponent::Directional) continue; // CSM only for directional lights

        auto& lightTransform = ecs.getComponent<Transform>(lightEntity);
        Math::Vec3 lightDir = -lightTransform.getForward();
        uint32_t shadowRes = (uint32_t)std::max(lightComp.shadowResolution, 16);

        // Calculate cascade matrices
        CascadeData cascades[NUM_CASCADES];
        calculateCascadeMatrices(camera, lightDir, cascades, NUM_CASCADES);

        auto entities = ecs.getEntitiesWith<MeshRenderer>();

        // Render each cascade
        for (int c = 0; c < NUM_CASCADES; c++) {
            // Reuse or create cascade FBO
            uint64_t cacheKey = (uint64_t)lightEntity * NUM_CASCADES + c;
            auto cit = m_cascadeFboCache.find(cacheKey);
            std::shared_ptr<FrameBuffer> cascadeFBO;
            if (cit != m_cascadeFboCache.end()) {
                cascadeFBO = cit->second;
                if (cascadeFBO->getWidth() != shadowRes) {
                    cascadeFBO->resize(shadowRes, shadowRes);
                }
            } else {
                cascadeFBO = FrameBuffer::createShadowMap(shadowRes);
                m_cascadeFboCache[cacheKey] = cascadeFBO;
            }

            cascades[c].fbo = cascadeFBO;
            m_cascadeShadowMaps.push_back(cascades[c]);

            // Render depth from this cascade's light-space matrix
            cascadeFBO->bind();
            glClear(GL_DEPTH_BUFFER_BIT);
            glEnable(GL_DEPTH_TEST);
            glDisable(GL_CULL_FACE);
            glDisable(GL_BLEND);

            m_depthShader->bind();
            m_depthShader->setMat4("uLightSpaceMatrix", cascades[c].lightSpaceMatrix.ptr());

            for (Entity entity : entities) {
                if (!ecs.hasComponent<Transform>(entity)) continue;
                auto& transform = ecs.getComponent<Transform>(entity);
                auto& meshRenderer = ecs.getComponent<MeshRenderer>(entity);
                if (!meshRenderer.enabled || !meshRenderer.mesh || !meshRenderer.castShadows) continue;

                Math::Mat4 model = transform.getTransformMatrix();
                m_depthShader->setMat4("uModel", model.ptr());
                meshRenderer.mesh->draw();
                m_stats.drawCalls++;
            }

            m_depthShader->unbind();
            glBindFramebuffer(GL_FRAMEBUFFER, 0);
        }
    }

    applySceneViewport();
}

void Renderer::setSceneViewport(int x, int y, int width, int height) {
    m_sceneViewportEnabled = (width > 0 && height > 0);
    m_sceneViewportX = x;
    m_sceneViewportY = y;
    m_sceneViewportW = width;
    m_sceneViewportH = height;
}

void Renderer::applySceneViewport() {
    if (!m_sceneViewportEnabled) {
        glViewport(0, 0, m_viewportWidth, m_viewportHeight);
        glDisable(GL_SCISSOR_TEST);
        return;
    }

    // Top-left origin (GUI space) -> bottom-left origin (GL space).
    const int glY = (int)m_viewportHeight - (m_sceneViewportY + m_sceneViewportH);
    glViewport(m_sceneViewportX, glY, m_sceneViewportW, m_sceneViewportH);
    glEnable(GL_SCISSOR_TEST);
    glScissor(m_sceneViewportX, glY, m_sceneViewportW, m_sceneViewportH);
}

void Renderer::renderScene(Scene& scene, Camera& camera) {
    camera.update();
    Math::Mat4 view = camera.getViewMatrix();
    Math::Mat4 projection = camera.getProjectionMatrix();

    // Render all shadow types
    renderCascadeShadowPass(scene, camera);
    if (m_cascadeShadowMaps.empty()) {
        renderShadowPass(scene);
    }
    renderSpotShadowPass(scene);
    renderPointShadowPass(scene);

    Math::Vec3 lightDir(-0.3f, -1.0f, -0.5f);
    Math::Vec3 lightColor(1.0f, 0.98f, 0.95f);
    float ambientStrength = 0.15f;
    bool hasShadow = false;
    bool hasCSM = false;
    Math::Mat4 lightSpaceMatrix = Math::Mat4::identity();
    float shadowBias = 0.005f;
    int lightType = 0; // 0=directional, 1=spot, 2=point
    Math::Vec3 lightPos(0, 0, 0);
    float lightFarPlane = 50.0f;

    Math::Mat4 cascadeMatrices[NUM_CASCADES];
    float cascadeSplits[NUM_CASCADES];
    int numCascades = 0;

    auto& ecs = scene.getECS();
    auto lightEntities = ecs.getEntitiesWith<LightComponent>();

    // Per-light shadow binding trackers
    int spotIdx = 0;
    int pointIdx = 0;
    int cascadeIdx = 0;

    if (!lightEntities.empty()) {
        auto& lt = ecs.getComponent<LightComponent>(lightEntities[0]);
        lightColor = lt.color * lt.intensity;
        auto& ltTransform = ecs.getComponent<Transform>(lightEntities[0]);
        lightDir = -ltTransform.getForward();
        lightPos = ltTransform.position;
        lightType = (int)lt.type;
        shadowBias = lt.shadowBias;

        hasShadow = lt.castShadows && (!m_shadowMaps.empty() || !m_spotShadowMaps.empty() || !m_pointShadowMaps.empty());
        hasCSM = lt.castShadows && !m_cascadeShadowMaps.empty();

        if (hasShadow && !m_shadowMaps.empty()) {
            lightSpaceMatrix = m_shadowMaps[0].lightSpaceMatrix;
        }

        if (hasCSM) {
            int cCount = (int)m_cascadeShadowMaps.size() / std::max((int)lightEntities.size(), 1);
            for (int i = 0; i < NUM_CASCADES && i < cCount; i++) {
                cascadeMatrices[i] = m_cascadeShadowMaps[i].lightSpaceMatrix;
                cascadeSplits[i] = m_cascadeShadowMaps[i].splitDist;
                numCascades++;
            }
        }

        // Spot light far plane
        if (lightType == 1 && !m_spotShadowMaps.empty()) {
            lightFarPlane = m_spotShadowMaps[0].farPlane;
            lightSpaceMatrix = m_spotShadowMaps[0].lightSpaceMatrix;
        }

        // Point light far plane
        if (lightType == 2 && !m_pointShadowMaps.empty()) {
            lightFarPlane = m_pointShadowMaps[0].farPlane;
        }
    }

    // Render all mesh renderers
    auto entities = ecs.getEntitiesWith<MeshRenderer>();
    for (Entity entity : entities) {
        if (!ecs.hasComponent<Transform>(entity)) continue;
        auto& transform = ecs.getComponent<Transform>(entity);
        auto& meshRenderer = ecs.getComponent<MeshRenderer>(entity);

        if (!meshRenderer.enabled || !meshRenderer.mesh) continue;

        Math::Mat4 model = transform.getTransformMatrix();

        auto setShaderUniforms = [&](const std::shared_ptr<Shader>& shader) {
            if (!shader) return;
            shader->setMat4("uModel", model.ptr());
            shader->setMat4("uView", view.ptr());
            shader->setMat4("uProjection", projection.ptr());
            shader->setMat4("uLightSpaceMatrix", lightSpaceMatrix.ptr());
            shader->setVec3("uLightDir", lightDir.x, lightDir.y, lightDir.z);
            shader->setVec3("uLightColor", lightColor.x, lightColor.y, lightColor.z);
            shader->setVec3("uViewPos", camera.getPosition().x, camera.getPosition().y, camera.getPosition().z);
            shader->setFloat("uAmbient", ambientStrength);
            shader->setFloat("uShadowBias", shadowBias);
            shader->setVec3("uLightPos", lightPos.x, lightPos.y, lightPos.z);
            shader->setFloat("uLightFarPlane", lightFarPlane);
            shader->setInt("uLightType", lightType);

            if (hasCSM && numCascades > 0) {
                for (int c = 0; c < NUM_CASCADES && c < (int)m_cascadeShadowMaps.size(); c++) {
                    std::string matName = "uCascadeMatrices[" + std::to_string(c) + "]";
                    shader->setMat4(matName, cascadeMatrices[c].ptr());
                }
                shader->setFloat("uCascadeSplits", cascadeSplits[0]);
                if (numCascades > 1) shader->setFloat("uCascadeSplits1", cascadeSplits[1]);
                if (numCascades > 2) shader->setFloat("uCascadeSplits2", cascadeSplits[2]);
                if (numCascades > 3) shader->setFloat("uCascadeSplits3", cascadeSplits[3]);
                shader->setInt("uNumCascades", numCascades);

                for (int c = 0; c < NUM_CASCADES && c < (int)m_cascadeShadowMaps.size(); c++) {
                    auto depthTex = m_cascadeShadowMaps[c].fbo->getDepthAttachment();
                    if (depthTex) {
                        depthTex->bind(2 + c);
                        std::string samplerName = "uShadowMap" + std::to_string(c);
                        shader->setInt(samplerName, 2 + c);
                    }
                }
                shader->setInt("uShadowEnabled", 1);
            } else if (lightType == 1 && !m_spotShadowMaps.empty()) {
                // Spot light shadow
                auto depthTex = m_spotShadowMaps[spotIdx].fbo->getDepthAttachment();
                if (depthTex) {
                    depthTex->bind(1);
                    shader->setInt("uShadowMap", 1);
                    shader->setInt("uShadowEnabled", 1);
                }
                shader->setInt("uNumCascades", 0);
            } else if (lightType == 2 && !m_pointShadowMaps.empty()) {
                // Point light shadow (cubemap) - bind to separate unit with samplerCube
                auto cubemapTex = m_pointShadowMaps[pointIdx].cubemap;
                if (cubemapTex) {
                    cubemapTex->bind(8);
                    shader->setInt("uPointShadowMap", 8);
                    shader->setInt("uShadowEnabled", 1);
                }
                shader->setInt("uNumCascades", 0);
            } else if (hasShadow && !m_shadowMaps.empty() && m_shadowMaps[0].fbo) {
                auto depthTex = m_shadowMaps[0].fbo->getDepthAttachment();
                if (depthTex) {
                    depthTex->bind(1);
                    shader->setInt("uShadowMap", 1);
                    shader->setInt("uShadowEnabled", 1);
                }
                shader->setInt("uNumCascades", 0);
                shader->setInt("uLightType", 0);
            } else {
                shader->setInt("uShadowEnabled", 0);
            }

            // Albedo texture support - material's applyProperties already binds it to unit 0
            if (meshRenderer.material) {
                auto albedoMap = meshRenderer.material->getTexture("albedoTexture");
                if (albedoMap) {
                    shader->setInt("uUseAlbedoMap", 1);
                    shader->setInt("uAlbedoMap", 0);
                } else {
                    shader->setInt("uUseAlbedoMap", 0);
                }
            } else {
                shader->setInt("uUseAlbedoMap", 0);
            }
        };

        // Advance per-light indices
        if (!lightEntities.empty()) {
            auto& lt = ecs.getComponent<LightComponent>(lightEntities[0]);
            if (lt.type == LightComponent::Spot && spotIdx < (int)m_spotShadowMaps.size() - 1) spotIdx++;
            if (lt.type == LightComponent::Point && pointIdx < (int)m_pointShadowMaps.size() - 1) pointIdx++;
        }

        if (meshRenderer.material) {
            meshRenderer.material->bind();
            auto shader = meshRenderer.material->getShader();
            if (shader) {
                setShaderUniforms(shader);
            }
            drawMesh(meshRenderer.mesh, meshRenderer.material, model);
        } else {
            if (m_currentShader) {
                setShaderUniforms(m_currentShader);
                m_currentShader->setVec3("uAlbedo", 0.8f, 0.8f, 0.8f);
                m_currentShader->setFloat("uMetallic", 0.0f);
                m_currentShader->setFloat("uRoughness", 0.5f);
            }
            drawMesh(meshRenderer.mesh, model);
        }
    }

    // The GUI pass after us expects the full-window viewport again.
    glDisable(GL_SCISSOR_TEST);
    glViewport(0, 0, m_viewportWidth, m_viewportHeight);
}

void Renderer::enableDepthTest(bool enabled) {
    if (enabled) glEnable(GL_DEPTH_TEST);
    else glDisable(GL_DEPTH_TEST);
}

void Renderer::enableCullFace(bool enabled) {
    if (enabled) glEnable(GL_CULL_FACE);
    else glDisable(GL_CULL_FACE);
}

void Renderer::enableBlend(bool enabled) {
    if (enabled) glEnable(GL_BLEND);
    else glDisable(GL_BLEND);
}

void Renderer::setBlendFunc(uint32_t src, uint32_t dst) {
    glBlendFunc(src, dst);
}

void Renderer::setDepthFunc(uint32_t func) {
    glDepthFunc(func);
}

void Renderer::bindShader(const std::shared_ptr<Shader>& shader) {
    if (shader != m_currentShader) {
        m_currentShader = shader;
        m_stats.shaderSwitches++;
    }
    if (shader) shader->bind();
}

void Renderer::bindTexture(const std::shared_ptr<Texture>& texture, uint32_t slot) {
    if (texture) {
        texture->bind(slot);
        m_stats.textureBinds++;
    }
}

void Renderer::bindMaterial(const std::shared_ptr<Material>& material) {
    if (material) material->bind();
}

void Renderer::bindFrameBuffer(const std::shared_ptr<FrameBuffer>& fbo) {
    m_currentFBO = fbo;
    if (fbo) fbo->bind();
    else glBindFramebuffer(GL_FRAMEBUFFER, m_mainWindowFBO);
}

void Renderer::setUniform(const std::string& name, int value) {
    if (m_currentShader) m_currentShader->setInt(name, value);
}

void Renderer::setUniform(const std::string& name, float value) {
    if (m_currentShader) m_currentShader->setFloat(name, value);
}

void Renderer::setUniform(const std::string& name, const Math::Vec2& value) {
    if (m_currentShader) m_currentShader->setVec2(name, value.x, value.y);
}

void Renderer::setUniform(const std::string& name, const Math::Vec3& value) {
    if (m_currentShader) m_currentShader->setVec3(name, value.x, value.y, value.z);
}

void Renderer::setUniform(const std::string& name, const Math::Vec4& value) {
    if (m_currentShader) m_currentShader->setVec4(name, value.x, value.y, value.z, value.w);
}

void Renderer::setUniform(const std::string& name, const Math::Mat4& value) {
    if (m_currentShader) m_currentShader->setMat4(name, value.ptr());
}

void Renderer::setUniform(const std::string& name, const Math::Mat3& value) {
    if (m_currentShader) m_currentShader->setMat3(name, value.ptr());
}

void Renderer::addPostProcessEffect(std::function<void()> effect) {
    m_postProcessEffects.push_back(effect);
}

void Renderer::setWireframeMode(bool enabled) {
    m_wireframeMode = enabled;
    glPolygonMode(GL_FRONT_AND_BACK, enabled ? GL_LINE : GL_FILL);
}

void Renderer::drawDebugLine(const Math::Vec3& start, const Math::Vec3& end, const Math::Vec3& color) {
    m_debugLines.push_back({start, end, color});
}

void Renderer::drawDebugCube(const Math::Vec3& center, const Math::Vec3& halfExtents, const Math::Vec3& color) {
    Math::Vec3 corners[8] = {
        center + Math::Vec3(-halfExtents.x, -halfExtents.y, -halfExtents.z),
        center + Math::Vec3( halfExtents.x, -halfExtents.y, -halfExtents.z),
        center + Math::Vec3( halfExtents.x,  halfExtents.y, -halfExtents.z),
        center + Math::Vec3(-halfExtents.x,  halfExtents.y, -halfExtents.z),
        center + Math::Vec3(-halfExtents.x, -halfExtents.y,  halfExtents.z),
        center + Math::Vec3( halfExtents.x, -halfExtents.y,  halfExtents.z),
        center + Math::Vec3( halfExtents.x,  halfExtents.y,  halfExtents.z),
        center + Math::Vec3(-halfExtents.x,  halfExtents.y,  halfExtents.z)
    };
    // Front face
    drawDebugLine(corners[0], corners[1], color);
    drawDebugLine(corners[1], corners[2], color);
    drawDebugLine(corners[2], corners[3], color);
    drawDebugLine(corners[3], corners[0], color);
    // Back face
    drawDebugLine(corners[4], corners[5], color);
    drawDebugLine(corners[5], corners[6], color);
    drawDebugLine(corners[6], corners[7], color);
    drawDebugLine(corners[7], corners[4], color);
    // Connecting edges
    drawDebugLine(corners[0], corners[4], color);
    drawDebugLine(corners[1], corners[5], color);
    drawDebugLine(corners[2], corners[6], color);
    drawDebugLine(corners[3], corners[7], color);
}

void Renderer::drawDebugSphere(const Math::Vec3& center, float radius, const Math::Vec3& color) {
    int segments = 16;
    for (int i = 0; i < segments; i++) {
        float angle1 = (float)i / segments * 2.0f * 3.14159f;
        float angle2 = (float)(i + 1) / segments * 2.0f * 3.14159f;
        Math::Vec3 p1 = center + Math::Vec3(std::cos(angle1) * radius, 0, std::sin(angle1) * radius);
        Math::Vec3 p2 = center + Math::Vec3(std::cos(angle2) * radius, 0, std::sin(angle2) * radius);
        drawDebugLine(p1, p2, color);
        p1 = center + Math::Vec3(0, std::cos(angle1) * radius, std::sin(angle1) * radius);
        p2 = center + Math::Vec3(0, std::cos(angle2) * radius, std::sin(angle2) * radius);
        drawDebugLine(p1, p2, color);
        p1 = center + Math::Vec3(std::cos(angle1) * radius, std::sin(angle1) * radius, 0);
        p2 = center + Math::Vec3(std::cos(angle2) * radius, std::sin(angle2) * radius, 0);
        drawDebugLine(p1, p2, color);
    }
}

void Renderer::drawDebugGrid(float size, int divisions, const Math::Vec3& center) {
    float halfSize = size * 0.5f;
    float step = size / divisions;
    Math::Vec3 color(0.3f, 0.3f, 0.3f);
    for (int i = 0; i <= divisions; i++) {
        float pos = -halfSize + i * step;
        drawDebugLine(center + Math::Vec3(pos, 0, -halfSize), center + Math::Vec3(pos, 0, halfSize), color);
        drawDebugLine(center + Math::Vec3(-halfSize, 0, pos), center + Math::Vec3(halfSize, 0, pos), color);
    }
    // Origin axes
    drawDebugLine(center, center + Math::Vec3(2, 0, 0), Math::Vec3(1, 0, 0)); // X red
    drawDebugLine(center, center + Math::Vec3(0, 2, 0), Math::Vec3(0, 1, 0)); // Y green
    drawDebugLine(center, center + Math::Vec3(0, 0, 2), Math::Vec3(0, 0, 1)); // Z blue
}

void Renderer::drawGizmo(const Math::Vec3& position, const Math::Quaternion& rotation, float size) {
    Math::Vec3 right = rotation.rotate(Math::Vec3::right()) * size;
    Math::Vec3 up = rotation.rotate(Math::Vec3::up()) * size;
    Math::Vec3 forward = rotation.rotate(Math::Vec3::forward()) * size;
    drawDebugLine(position, position + right, Math::Vec3(1, 0, 0));   // X - Red
    drawDebugLine(position, position + up, Math::Vec3(0, 1, 0));     // Y - Green
    drawDebugLine(position, position + forward, Math::Vec3(0, 0, 1)); // Z - Blue
}

void Renderer::renderPostProcessing() {
    for (auto& effect : m_postProcessEffects) {
        effect();
    }
}

void Renderer::renderGUI() {
    auto& gui = EmberGUI::get();
    const auto& commands = gui.getDrawCommands();
    if (commands.empty()) return;

    // Init GUI render resources once
    if (!s_guiInitDone) {
        s_guiShader = Shader::createUIShader();
        if (!s_guiShader) {
            EMBER_LOG_ERROR("Failed to create GUI shader");
            return;
        }
        s_fontTexture = createFontTexture();
        if (!s_fontTexture || !s_fontTexture->isLoaded()) {
            EMBER_LOG_WARN("Font texture creation failed, text will be rendered as placeholders");
        }
        glGenVertexArrays(1, &s_guiVAO);
        glGenBuffers(1, &s_guiVBO);
        s_guiInitDone = true;
    }

    if (!s_guiShader) return;

    // Save state
    GLboolean depthTestEnabled = glIsEnabled(GL_DEPTH_TEST);
    GLboolean cullFaceEnabled = glIsEnabled(GL_CULL_FACE);
    GLboolean blendEnabled = glIsEnabled(GL_BLEND);

    glDisable(GL_DEPTH_TEST);
    glDisable(GL_CULL_FACE);
    glEnable(GL_BLEND);
    glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);

    s_guiShader->bind();
    
    // Orthographic projection for 2D rendering
    Math::Mat4 orthoProj = Math::Mat4::orthographic(0.0f, (float)m_viewportWidth, (float)m_viewportHeight, 0.0f, -1.0f, 1.0f);
    s_guiShader->setMat4("uProjection", orthoProj.ptr());
    
    // Debug: log projection matrix and viewport once
    static bool loggedProj = false;
    if (!loggedProj) {
        EMBER_LOG_INFO("GUI viewport: ", m_viewportWidth, "x", m_viewportHeight);
        EMBER_LOG_INFO("GUI projection (col-major): ");
        EMBER_LOG_INFO("  [0]: ", orthoProj(0,0), " ", orthoProj(0,1), " ", orthoProj(0,2), " ", orthoProj(0,3));
        EMBER_LOG_INFO("  [1]: ", orthoProj(1,0), " ", orthoProj(1,1), " ", orthoProj(1,2), " ", orthoProj(1,3));
        EMBER_LOG_INFO("  [2]: ", orthoProj(2,0), " ", orthoProj(2,1), " ", orthoProj(2,2), " ", orthoProj(2,3));
        EMBER_LOG_INFO("  [3]: ", orthoProj(3,0), " ", orthoProj(3,1), " ", orthoProj(3,2), " ", orthoProj(3,3));
        // Manual NDC check for (20,7) = top-left of "File" menu:
        float ndcX = 20.0f * orthoProj(0,0) + orthoProj(0,3);
        float ndcY = 7.0f * orthoProj(1,1) + orthoProj(1,3);
        EMBER_LOG_INFO("  (20,7) -> NDC (", ndcX, ", ", ndcY, ")");
        loggedProj = true;
    }

    glBindVertexArray(s_guiVAO);

    // Helper lambda to extract RGBA from Vec4
    auto col = [](const Math::Vec4& c) { return std::array<float,4>{c.x, c.y, c.z, c.w}; };
    
    // Debug: render a white test quad at fixed position to verify GUI transform
    // Position (100,100) size (50,50). If this appears at the wrong location or mirrored,
    // the bug is in the projection matrix or vertex generation. If correct, the bug is in text UVs.
    static bool firstFrame = true;
    if (firstFrame) {
        float tqx = 100.0f, tqy = 100.0f, tqw = 50.0f, tqh = 50.0f;
        float tqVerts[] = {
            tqx,    tqy,    0.0f, 0.0f, 0.0f, 1.0f, 1.0f, 1.0f, 1.0f,
            tqx+tqw, tqy,    0.0f, 1.0f, 0.0f, 1.0f, 1.0f, 1.0f, 1.0f,
            tqx+tqw, tqy+tqh, 0.0f, 1.0f, 1.0f, 1.0f, 1.0f, 1.0f, 1.0f,
            tqx,    tqy+tqh, 0.0f, 0.0f, 1.0f, 1.0f, 1.0f, 1.0f, 1.0f
        };
        glBindBuffer(GL_ARRAY_BUFFER, s_guiVBO);
        glBufferData(GL_ARRAY_BUFFER, sizeof(tqVerts), tqVerts, GL_DYNAMIC_DRAW);
        glVertexAttribPointer(0, 3, GL_FLOAT, GL_FALSE, 9 * sizeof(float), (void*)0);
        glEnableVertexAttribArray(0);
        glVertexAttribPointer(2, 2, GL_FLOAT, GL_FALSE, 9 * sizeof(float), (void*)(3 * sizeof(float)));
        glEnableVertexAttribArray(2);
        glVertexAttribPointer(3, 4, GL_FLOAT, GL_FALSE, 9 * sizeof(float), (void*)(5 * sizeof(float)));
        glEnableVertexAttribArray(3);
        s_guiShader->setInt("uUseTexture", 0);
        glDrawArrays(GL_TRIANGLE_FAN, 0, 4);
        m_stats.drawCalls++;
        
        // Also render a red outline rectangle around it for visibility
        float borderVerts[] = {
            tqx,    tqy,    0.0f, 1.0f, 0.0f, 0.0f, 0.0f, 0.0f, 0.0f,
            tqx+tqw, tqy,    0.0f, 1.0f, 0.0f, 1.0f, 0.0f, 0.0f, 1.0f,
            tqx+tqw, tqy+tqh, 0.0f, 1.0f, 1.0f, 1.0f, 0.0f, 0.0f, 1.0f,
            tqx,    tqy+tqh, 0.0f, 0.0f, 1.0f, 1.0f, 0.0f, 0.0f, 1.0f
        };
        glBindBuffer(GL_ARRAY_BUFFER, s_guiVBO);
        glBufferData(GL_ARRAY_BUFFER, sizeof(borderVerts), borderVerts, GL_DYNAMIC_DRAW);
        glVertexAttribPointer(0, 3, GL_FLOAT, GL_FALSE, 9 * sizeof(float), (void*)0);
        glEnableVertexAttribArray(0);
        glVertexAttribPointer(2, 2, GL_FLOAT, GL_FALSE, 9 * sizeof(float), (void*)(3 * sizeof(float)));
        glEnableVertexAttribArray(2);
        glVertexAttribPointer(3, 4, GL_FLOAT, GL_FALSE, 9 * sizeof(float), (void*)(5 * sizeof(float)));
        glEnableVertexAttribArray(3);
        s_guiShader->setInt("uUseTexture", 0);
        glDrawArrays(GL_LINE_LOOP, 0, 4);
        m_stats.drawCalls++;
        
        EMBER_LOG_INFO("Debug test quad drawn at (", tqx, ",", tqy, ") size ", tqw, "x", tqh);
        
        // Debug: render font atlas directly as a textured quad (full texture, UV 0,0 to 1,1)
        if (s_fontTexture && s_fontTexture->isLoaded()) {
            float atx = 160.0f, aty = 100.0f, atw = 192.0f, ath = 96.0f; // 2x scale
            float atlasVerts[] = {
                atx,    aty,    0.0f, 0.0f, 0.0f, 1.0f, 0.0f, 0.0f, 1.0f,
                atx+atw, aty,    0.0f, 1.0f, 0.0f, 1.0f, 0.0f, 0.0f, 1.0f,
                atx+atw, aty+ath, 0.0f, 1.0f, 1.0f, 1.0f, 0.0f, 0.0f, 1.0f,
                atx,    aty+ath, 0.0f, 0.0f, 1.0f, 1.0f, 0.0f, 0.0f, 1.0f
            };
            s_fontTexture->bind(0);
            s_guiShader->setInt("uUseTexture", 1);
            s_guiShader->setInt("uTexture", 0);
            glBindBuffer(GL_ARRAY_BUFFER, s_guiVBO);
            glBufferData(GL_ARRAY_BUFFER, sizeof(atlasVerts), atlasVerts, GL_DYNAMIC_DRAW);
            glVertexAttribPointer(0, 3, GL_FLOAT, GL_FALSE, 9 * sizeof(float), (void*)0);
            glEnableVertexAttribArray(0);
            glVertexAttribPointer(2, 2, GL_FLOAT, GL_FALSE, 9 * sizeof(float), (void*)(3 * sizeof(float)));
            glEnableVertexAttribArray(2);
            glVertexAttribPointer(3, 4, GL_FLOAT, GL_FALSE, 9 * sizeof(float), (void*)(5 * sizeof(float)));
            glEnableVertexAttribArray(3);
            glDrawArrays(GL_TRIANGLE_FAN, 0, 4);
            m_stats.drawCalls++;
            EMBER_LOG_INFO("Font atlas direct render at (", atx, ",", aty, ") size ", atw, "x", ath, " UV (0,0)-(1,1)");
        }
        
        // Debug: render hardcoded 'A' glyph with known correct UVs
        if (s_fontTexture && s_fontTexture->isLoaded()) {
            float ax = 370.0f, ay = 100.0f, aw = 20.0f, ah = 28.0f;
            // Derive the UVs from the same helper the text renderer uses so
            // this reference glyph can never drift from the real mapping.
            float a_uMin, a_vMin, a_uMax, a_vMax;
            getGlyphUVs('A' - FONT_FIRST_CP, a_uMin, a_vMin, a_uMax, a_vMax);
            float aVerts[] = {
                ax,    ay,    0.0f, a_uMin, a_vMin, 1.0f, 1.0f, 1.0f, 1.0f,
                ax+aw, ay,    0.0f, a_uMax, a_vMin, 1.0f, 1.0f, 1.0f, 1.0f,
                ax+aw, ay+ah, 0.0f, a_uMax, a_vMax, 1.0f, 1.0f, 1.0f, 1.0f,
                ax,    ay+ah, 0.0f, a_uMin, a_vMax, 1.0f, 1.0f, 1.0f, 1.0f
            };
            s_fontTexture->bind(0);
            s_guiShader->setInt("uUseTexture", 1);
            s_guiShader->setInt("uTexture", 0);
            glBindBuffer(GL_ARRAY_BUFFER, s_guiVBO);
            glBufferData(GL_ARRAY_BUFFER, sizeof(aVerts), aVerts, GL_DYNAMIC_DRAW);
            glVertexAttribPointer(0, 3, GL_FLOAT, GL_FALSE, 9 * sizeof(float), (void*)0);
            glEnableVertexAttribArray(0);
            glVertexAttribPointer(2, 2, GL_FLOAT, GL_FALSE, 9 * sizeof(float), (void*)(3 * sizeof(float)));
            glEnableVertexAttribArray(2);
            glVertexAttribPointer(3, 4, GL_FLOAT, GL_FALSE, 9 * sizeof(float), (void*)(5 * sizeof(float)));
            glEnableVertexAttribArray(3);
            glDrawArrays(GL_TRIANGLE_FAN, 0, 4);
            m_stats.drawCalls++;
            // Also draw a green outline around the 'A' quad
            float aBorder[] = {
                ax,    ay,    0.0f, 0.0f, 0.0f, 0.0f, 1.0f, 0.0f, 1.0f,
                ax+aw, ay,    0.0f, 1.0f, 0.0f, 0.0f, 1.0f, 0.0f, 1.0f,
                ax+aw, ay+ah, 0.0f, 1.0f, 1.0f, 0.0f, 1.0f, 0.0f, 1.0f,
                ax,    ay+ah, 0.0f, 0.0f, 1.0f, 0.0f, 1.0f, 0.0f, 1.0f
            };
            s_fontTexture->bind(0);
            s_guiShader->setInt("uUseTexture", 0);
            glBindBuffer(GL_ARRAY_BUFFER, s_guiVBO);
            glBufferData(GL_ARRAY_BUFFER, sizeof(aBorder), aBorder, GL_DYNAMIC_DRAW);
            glVertexAttribPointer(0, 3, GL_FLOAT, GL_FALSE, 9 * sizeof(float), (void*)0);
            glEnableVertexAttribArray(0);
            glVertexAttribPointer(2, 2, GL_FLOAT, GL_FALSE, 9 * sizeof(float), (void*)(3 * sizeof(float)));
            glEnableVertexAttribArray(2);
            glVertexAttribPointer(3, 4, GL_FLOAT, GL_FALSE, 9 * sizeof(float), (void*)(5 * sizeof(float)));
            glEnableVertexAttribArray(3);
            glDrawArrays(GL_LINE_LOOP, 0, 4);
            m_stats.drawCalls++;
            EMBER_LOG_INFO("Hardcoded 'A' glyph at (", ax, ",", ay, ") size ", aw, "x", ah, " UV (", a_uMin, ",", a_vMin, ")-(", a_uMax, ",", a_vMax, ")");
            // Reset to untextured state
            s_guiShader->setInt("uUseTexture", 0);
        }
        
        // Debug: log the vertex attrib pointer layout
        EMBER_LOG_INFO("Vertex attrib layout: stride=9*sizeof(float)=", 9*(int)sizeof(float), " bytes");
        EMBER_LOG_INFO("  Location 0: pos3, offset=0 bytes");
        EMBER_LOG_INFO("  Location 2: uv2,  offset=", 3*(int)sizeof(float), " bytes");
        EMBER_LOG_INFO("  Location 3: col4, offset=", 5*(int)sizeof(float), " bytes");
        EMBER_LOG_INFO("  Vertex size: 9 floats = ", 9*(int)sizeof(float), " bytes");
        EMBER_LOG_INFO("GUI state: depth=", (int)depthTestEnabled, " cull=", (int)cullFaceEnabled, " blend=", (int)blendEnabled);
        
        firstFrame = false;
    }

    // Process each draw command
    for (const auto& cmd : commands) {
        auto rgba = col(cmd.color);
        ScissorGuard clipGuard(cmd, (int)m_viewportWidth, (int)m_viewportHeight);
        switch (cmd.type) {
            case DrawCmdType::RectFilled:
            case DrawCmdType::Rect: {
                // Create a simple quad for this rectangle
                float vertices[] = {
                    cmd.pos.x,          cmd.pos.y,          0.0f, 0.0f, 0.0f, rgba[0], rgba[1], rgba[2], rgba[3],
                    cmd.pos.x + cmd.size.x, cmd.pos.y,          0.0f, 1.0f, 0.0f, rgba[0], rgba[1], rgba[2], rgba[3],
                    cmd.pos.x + cmd.size.x, cmd.pos.y + cmd.size.y, 0.0f, 1.0f, 1.0f, rgba[0], rgba[1], rgba[2], rgba[3],
                    cmd.pos.x,          cmd.pos.y + cmd.size.y, 0.0f, 0.0f, 1.0f, rgba[0], rgba[1], rgba[2], rgba[3]
                };
                
                glBindBuffer(GL_ARRAY_BUFFER, s_guiVBO);
                glBufferData(GL_ARRAY_BUFFER, sizeof(vertices), vertices, GL_DYNAMIC_DRAW);
                
                // Position (3 floats)
                glVertexAttribPointer(0, 3, GL_FLOAT, GL_FALSE, 9 * sizeof(float), (void*)0);
                glEnableVertexAttribArray(0);
                // TexCoord (2 floats)
                glVertexAttribPointer(2, 2, GL_FLOAT, GL_FALSE, 9 * sizeof(float), (void*)(3 * sizeof(float)));
                glEnableVertexAttribArray(2);
                // Color (4 floats)
                glVertexAttribPointer(3, 4, GL_FLOAT, GL_FALSE, 9 * sizeof(float), (void*)(5 * sizeof(float)));
                glEnableVertexAttribArray(3);
                
                s_guiShader->setInt("uUseTexture", 0);
                
                if (cmd.type == DrawCmdType::Rect) {
                    glDrawArrays(GL_LINE_LOOP, 0, 4);
                } else {
                    glDrawArrays(GL_TRIANGLE_FAN, 0, 4);
                }
                m_stats.drawCalls++;
                break;
            }
            
            case DrawCmdType::Line: {
                float lineVerts[] = {
                    cmd.pos.x, cmd.pos.y, 0.0f, rgba[0], rgba[1], rgba[2], rgba[3],
                    cmd.pos.x + cmd.size.x, cmd.pos.y + cmd.size.y, 0.0f, rgba[0], rgba[1], rgba[2], rgba[3]
                };
                glBindBuffer(GL_ARRAY_BUFFER, s_guiVBO);
                glBufferData(GL_ARRAY_BUFFER, sizeof(lineVerts), lineVerts, GL_DYNAMIC_DRAW);
                glVertexAttribPointer(0, 3, GL_FLOAT, GL_FALSE, 7 * sizeof(float), (void*)0);
                glEnableVertexAttribArray(0);
                glVertexAttribPointer(3, 4, GL_FLOAT, GL_FALSE, 7 * sizeof(float), (void*)(3 * sizeof(float)));
                glEnableVertexAttribArray(3);
                s_guiShader->setInt("uUseTexture", 0);
                glDrawArrays(GL_LINES, 0, 2);
                m_stats.drawCalls++;
                break;
            }
            
            case DrawCmdType::Triangle: {
                glBindBuffer(GL_ARRAY_BUFFER, s_guiVBO);
                float pts[7 * 3] = {
                    cmd.pos.x, cmd.pos.y, 0.0f, rgba[0], rgba[1], rgba[2], rgba[3],
                    cmd.size.x, cmd.size.y, 0.0f, rgba[0], rgba[1], rgba[2], rgba[3],
                    (cmd.pos.x + cmd.size.x) * 0.5f, (cmd.pos.y + cmd.size.y) * 0.5f + cmd.thickness, 0.0f, rgba[0], rgba[1], rgba[2], rgba[3]
                };
                glBufferData(GL_ARRAY_BUFFER, sizeof(pts), pts, GL_DYNAMIC_DRAW);
                glVertexAttribPointer(0, 3, GL_FLOAT, GL_FALSE, 7 * sizeof(float), (void*)0);
                glEnableVertexAttribArray(0);
                glVertexAttribPointer(3, 4, GL_FLOAT, GL_FALSE, 7 * sizeof(float), (void*)(3 * sizeof(float)));
                glEnableVertexAttribArray(3);
                s_guiShader->setInt("uUseTexture", 0);
                glDrawArrays(GL_TRIANGLES, 0, 3);
                m_stats.drawCalls++;
                break;
            }
            
            case DrawCmdType::Text: {
                if (s_fontTexture && s_fontTexture->isLoaded()) {
                    // Debug: log font texture info once
                    static bool loggedTexInfo = false;
                    if (!loggedTexInfo) {
                        EMBER_LOG_INFO("Font texture ID: ", s_fontTexture->getID(), ", size: ", s_fontTexture->getWidth(), "x", s_fontTexture->getHeight());
                        loggedTexInfo = true;
                    }
                    
                    s_fontTexture->bind(0);
                    s_guiShader->setInt("uUseTexture", 1);
                    s_guiShader->setInt("uTexture", 0);
                    
                    float fontSize = cmd.thickness > 0 ? cmd.thickness : 14.0f;
                    // Atlas cells are 6x8 with a 5x7 glyph inside. Draw the
                    // glyph quad at that aspect ratio (otherwise text is
                    // squeezed horizontally) and advance by one full cell so
                    // neighbouring glyphs do not collide.
                    float gh = fontSize * 0.85f;
                    float gw = gh * (5.0f / 7.0f);
                    float advance = gh * (6.0f / 7.0f);
                    size_t n = cmd.text.size();
                    
                    // Debug: log text string for first few commands
                    if (n > 0 && n < 200) {
                        EMBER_LOG_DEBUG("Rendering text: \"", cmd.text, "\" at (", cmd.pos.x, ",", cmd.pos.y, ") glyphs=", n);
                    }
                    
                    // Batch all glyph quads into a single buffer
                    // Each quad: 2 triangles = 6 vertices, each vertex = 9 floats (pos3+uv2+color4)
                    std::vector<float> verts;
                    verts.reserve(n * 9 * 6);
                    float curX = cmd.pos.x;
                    float curY = cmd.pos.y;
                    
                    for (size_t ci = 0; ci < n; ) {
                        // Walk the string as UTF-8 code points. Multi-byte
                        // characters (e.g. the symbols used by the editor UI)
                        // map to their own glyph via codepointToGlyphIndex
                        // instead of collapsing to a '?' placeholder. Note the
                        // UV lookup wants an ATLAS INDEX, not the codepoint.
                        size_t consumed = 0;
                        uint32_t cp = decodeUtf8(cmd.text.data() + ci, n - ci, &consumed);
                        if (consumed == 0) break;
                        ci += consumed;
                        
                        // Control characters have no glyph; skip them.
                        if (cp < 0x20 || cp == 0x7F) continue;
                        
                        if (cp == ' ') {
                            curX += advance;
                            continue;
                        }
                        
                        float uMin, vMin, uMax, vMax;
                        getGlyphUVsForCodepoint(cp, uMin, vMin, uMax, vMax);
                        
                        // Debug: log glyph info for first few characters of first text command
                        static int debugGlyphCount = 0;
                        if (debugGlyphCount < 5) {
                            EMBER_LOG_DEBUG("  Glyph U+", cp, " UV: (u=", uMin, "..", uMax, ", v=", vMin, "..", vMax, ") pos=(", curX, ",", curY, ")");
                            debugGlyphCount++;
                        } else {
                            debugGlyphCount++;
                            if (debugGlyphCount >= 200) debugGlyphCount = 0; // Reset periodically
                        }
                        
                        // 6 vertices per glyph (2 triangles for the quad)
                        // Tri 1: (0,0)-(w,0)-(w,h)
                        // Tri 2: (w,h)-(0,h)-(0,0)
                        float gv[] = {
                            curX,    curY,    0.0f, uMin, vMin, rgba[0], rgba[1], rgba[2], rgba[3],
                            curX+gw, curY,    0.0f, uMax, vMin, rgba[0], rgba[1], rgba[2], rgba[3],
                            curX+gw, curY+gh, 0.0f, uMax, vMax, rgba[0], rgba[1], rgba[2], rgba[3],
                            curX+gw, curY+gh, 0.0f, uMax, vMax, rgba[0], rgba[1], rgba[2], rgba[3],
                            curX,    curY+gh, 0.0f, uMin, vMax, rgba[0], rgba[1], rgba[2], rgba[3],
                            curX,    curY,    0.0f, uMin, vMin, rgba[0], rgba[1], rgba[2], rgba[3]
                        };
                        // Debug: dump vertex data for first glyph
                        static bool dumpedVerts = false;
                        if (!dumpedVerts) {
                            EMBER_LOG_INFO("First glyph vertex dump (pos3+uv2+col4 per vertex, 6 verts):");
                            for (int v = 0; v < 6; v++) {
                                int base = v * 9;
                                EMBER_LOG_INFO("  V", v, ": pos=(", gv[base], ",", gv[base+1], ",", gv[base+2], 
                                    ") uv=(", gv[base+3], ",", gv[base+4], 
                                    ") col=(", gv[base+5], ",", gv[base+6], ",", gv[base+7], ",", gv[base+8], ")");
                            }
                            // Manual NDC projection of first vertex
                            float px = gv[0], py = gv[1], pz = gv[2];
                            // orthoProj is in scope above, but we can recalculate
                            Math::Mat4 proj = Math::Mat4::orthographic(0.0f, (float)m_viewportWidth, (float)m_viewportHeight, 0.0f, -1.0f, 1.0f);
                            Math::Vec4 clip = proj * Math::Vec4(px, py, pz, 1.0f);
                            EMBER_LOG_INFO("  -> NDC: (", clip.x, ", ", clip.y, ", ", clip.z, ", ", clip.w, ")");
                            dumpedVerts = true;
                        }
                        verts.insert(verts.end(), gv, gv + 54);  // 6 * 9 = 54 floats
                        curX += advance;
                    }
                    
                    if (!verts.empty()) {
                        glBindBuffer(GL_ARRAY_BUFFER, s_guiVBO);
                        glBufferData(GL_ARRAY_BUFFER, verts.size() * sizeof(float), verts.data(), GL_DYNAMIC_DRAW);
                        glVertexAttribPointer(0, 3, GL_FLOAT, GL_FALSE, 9 * sizeof(float), (void*)0);
                        glEnableVertexAttribArray(0);
                        glVertexAttribPointer(2, 2, GL_FLOAT, GL_FALSE, 9 * sizeof(float), (void*)(3 * sizeof(float)));
                        glEnableVertexAttribArray(2);
                        glVertexAttribPointer(3, 4, GL_FLOAT, GL_FALSE, 9 * sizeof(float), (void*)(5 * sizeof(float)));
                        glEnableVertexAttribArray(3);
                        glDrawArrays(GL_TRIANGLES, 0, (GLsizei)(verts.size() / 9));
                        m_stats.drawCalls++;
                    }
                } else {
                    // Fallback: draw colored rectangles
                    float textWidth = (float)cmd.text.size() * 8.0f;
                    float textHeight = 14.0f;
                    float tv[] = {
                        cmd.pos.x, cmd.pos.y, 0.0f, 0.0f, 0.0f, rgba[0], rgba[1], rgba[2], rgba[3],
                        cmd.pos.x + textWidth, cmd.pos.y, 0.0f, 1.0f, 0.0f, rgba[0], rgba[1], rgba[2], rgba[3],
                        cmd.pos.x + textWidth, cmd.pos.y + textHeight, 0.0f, 1.0f, 1.0f, rgba[0], rgba[1], rgba[2], rgba[3],
                        cmd.pos.x, cmd.pos.y + textHeight, 0.0f, 0.0f, 1.0f, rgba[0], rgba[1], rgba[2], rgba[3]
                    };
                    glBindBuffer(GL_ARRAY_BUFFER, s_guiVBO);
                    glBufferData(GL_ARRAY_BUFFER, sizeof(tv), tv, GL_DYNAMIC_DRAW);
                    glVertexAttribPointer(0, 3, GL_FLOAT, GL_FALSE, 9 * sizeof(float), (void*)0);
                    glEnableVertexAttribArray(0);
                    glVertexAttribPointer(2, 2, GL_FLOAT, GL_FALSE, 9 * sizeof(float), (void*)(3 * sizeof(float)));
                    glEnableVertexAttribArray(2);
                    glVertexAttribPointer(3, 4, GL_FLOAT, GL_FALSE, 9 * sizeof(float), (void*)(5 * sizeof(float)));
                    glEnableVertexAttribArray(3);
                    s_guiShader->setInt("uUseTexture", 0);
                    glDrawArrays(GL_TRIANGLE_FAN, 0, 4);
                    m_stats.drawCalls++;
                }
                break;
            }
            
            case DrawCmdType::Image: {
                // Draw a textured quad
                if (cmd.textureID != 0) {
                    glActiveTexture(GL_TEXTURE0);
                    glBindTexture(GL_TEXTURE_2D, cmd.textureID);
                    s_guiShader->setInt("uUseTexture", 1);
                    s_guiShader->setInt("uTexture", 0);
                } else {
                    s_guiShader->setInt("uUseTexture", 0);
                }
                
                float uvLeft = cmd.uvMin.x, uvTop = cmd.uvMin.y;
                float uvRight = cmd.uvMax.x, uvBottom = cmd.uvMax.y;
                
                float imgVerts[] = {
                    cmd.pos.x, cmd.pos.y, 0.0f, uvLeft, uvTop, rgba[0], rgba[1], rgba[2], rgba[3],
                    cmd.pos.x + cmd.size.x, cmd.pos.y, 0.0f, uvRight, uvTop, rgba[0], rgba[1], rgba[2], rgba[3],
                    cmd.pos.x + cmd.size.x, cmd.pos.y + cmd.size.y, 0.0f, uvRight, uvBottom, rgba[0], rgba[1], rgba[2], rgba[3],
                    cmd.pos.x, cmd.pos.y + cmd.size.y, 0.0f, uvLeft, uvBottom, rgba[0], rgba[1], rgba[2], rgba[3]
                };
                
                glBindBuffer(GL_ARRAY_BUFFER, s_guiVBO);
                glBufferData(GL_ARRAY_BUFFER, sizeof(imgVerts), imgVerts, GL_DYNAMIC_DRAW);
                glVertexAttribPointer(0, 3, GL_FLOAT, GL_FALSE, 9 * sizeof(float), (void*)0);
                glEnableVertexAttribArray(0);
                glVertexAttribPointer(2, 2, GL_FLOAT, GL_FALSE, 9 * sizeof(float), (void*)(3 * sizeof(float)));
                glEnableVertexAttribArray(2);
                glVertexAttribPointer(3, 4, GL_FLOAT, GL_FALSE, 9 * sizeof(float), (void*)(5 * sizeof(float)));
                glEnableVertexAttribArray(3);
                glDrawArrays(GL_TRIANGLE_FAN, 0, 4);
                m_stats.drawCalls++;
                
                // Unbind texture to avoid affecting subsequent draw commands
                if (cmd.textureID != 0) {
                    glBindTexture(GL_TEXTURE_2D, 0);
                    s_guiShader->setInt("uUseTexture", 0);
                }
                break;
            }
            
            case DrawCmdType::Circle: {
                // Draw a circle as line loop
                int segments = (int)cmd.size.y > 0 ? (int)cmd.size.y : 16;
                float radius = cmd.size.x > 0 ? cmd.size.x : 10.0f;
                std::vector<float> circleVerts;
                for (int i = 0; i <= segments; i++) {
                    float angle = (float)i / segments * 2.0f * 3.14159f;
                    float cx = cmd.pos.x + std::cos(angle) * radius;
                    float cy = cmd.pos.y + std::sin(angle) * radius;
                    circleVerts.push_back(cx); circleVerts.push_back(cy); circleVerts.push_back(0.0f);
                    circleVerts.push_back(rgba[0]); circleVerts.push_back(rgba[1]);
                    circleVerts.push_back(rgba[2]); circleVerts.push_back(rgba[3]);
                }
                if (!circleVerts.empty()) {
                    glBindBuffer(GL_ARRAY_BUFFER, s_guiVBO);
                    glBufferData(GL_ARRAY_BUFFER, circleVerts.size() * sizeof(float), circleVerts.data(), GL_DYNAMIC_DRAW);
                    glVertexAttribPointer(0, 3, GL_FLOAT, GL_FALSE, 7 * sizeof(float), (void*)0);
                    glEnableVertexAttribArray(0);
                    glVertexAttribPointer(3, 4, GL_FLOAT, GL_FALSE, 7 * sizeof(float), (void*)(3 * sizeof(float)));
                    glEnableVertexAttribArray(3);
                    s_guiShader->setInt("uUseTexture", 0);
                    glDrawArrays(GL_LINE_LOOP, 0, segments + 1);
                    m_stats.drawCalls++;
                }
                break;
            }
            
            default:
                break;
        }
    }

    glBindVertexArray(0);
    s_guiShader->unbind();

    // Restore state
    if (depthTestEnabled) glEnable(GL_DEPTH_TEST);
    else glDisable(GL_DEPTH_TEST);
    if (cullFaceEnabled) glEnable(GL_CULL_FACE);
    else glDisable(GL_CULL_FACE);
    if (blendEnabled) glEnable(GL_BLEND);
    else glDisable(GL_BLEND);
}

bool Renderer::saveScreenshotPPM(const std::string& path) {
    const int width = (int)m_viewportWidth;
    const int height = (int)m_viewportHeight;
    if (width <= 0 || height <= 0) {
        EMBER_LOG_ERROR("Screenshot: invalid viewport size");
        return false;
    }

    std::vector<unsigned char> pixels((size_t)width * (size_t)height * 3u);
    glPixelStorei(GL_PACK_ALIGNMENT, 1);
    glReadPixels(0, 0, width, height, GL_RGB, GL_UNSIGNED_BYTE, pixels.data());

    std::ofstream out(path, std::ios::binary);
    if (!out.is_open()) {
        EMBER_LOG_ERROR("Screenshot: failed to open ", path);
        return false;
    }

    out << "P6\n" << width << " " << height << "\n255\n";
    // glReadPixels returns rows bottom-up; PPM stores them top-down.
    for (int y = height - 1; y >= 0; --y) {
        out.write(reinterpret_cast<const char*>(pixels.data() + (size_t)y * (size_t)width * 3u),
                  (std::streamsize)width * 3);
    }
    out.close();

    EMBER_LOG_INFO("Screenshot saved: ", path, " (", width, "x", height, ")");
    return true;
}

} // namespace Ember
