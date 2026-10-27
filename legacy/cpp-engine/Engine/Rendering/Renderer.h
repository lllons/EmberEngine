#pragma once

#include "Engine/Math/Math.h"
#include <cstdint>
#include <memory>
#include <vector>
#include <string>
#include <functional>
#include <unordered_map>

namespace Ember {

class Shader;
class Mesh;
class Material;
class Texture;
class Camera;
class Light;
class FrameBuffer;
class Scene;
class EntityComponentSystem;

enum class RenderAPI {
    None = 0, OpenGL, Vulkan, DirectX11, DirectX12
};

struct RenderStats {
    uint32_t drawCalls = 0;
    uint32_t triangles = 0;
    uint32_t vertices = 0;
    uint32_t textureBinds = 0;
    uint32_t shaderSwitches = 0;
    float frameTime = 0.0f;
    void reset() { drawCalls = triangles = vertices = textureBinds = shaderSwitches = 0; }
};

class Renderer {
public:
    static Renderer& get();
    void init(RenderAPI api = RenderAPI::OpenGL);
    void shutdown();
    void onWindowResize(uint32_t width, uint32_t height);
    void beginFrame();
    void endFrame();
    void submitFrame();
    void clear(float r = 0.1f, float g = 0.1f, float b = 0.1f, float a = 1.0f);
    void setViewport(uint32_t x, uint32_t y, uint32_t width, uint32_t height);
    void drawMesh(const std::shared_ptr<Mesh>& mesh, const Math::Mat4& transform);
    void drawMesh(const std::shared_ptr<Mesh>& mesh, const std::shared_ptr<Material>& material, const Math::Mat4& transform);
    void drawIndexed(const std::shared_ptr<Mesh>& mesh, uint32_t indexCount = 0);
    void drawArrays(uint32_t vertexCount);
    void renderScene(Scene& scene, Camera& camera);
    void enableDepthTest(bool enabled = true);
    void enableCullFace(bool enabled = true);
    void enableBlend(bool enabled = true);
    void setBlendFunc(uint32_t src, uint32_t dst);
    void setDepthFunc(uint32_t func);
    void bindShader(const std::shared_ptr<Shader>& shader);
    void bindTexture(const std::shared_ptr<Texture>& texture, uint32_t slot = 0);
    void bindMaterial(const std::shared_ptr<Material>& material);
    void bindFrameBuffer(const std::shared_ptr<FrameBuffer>& fbo);
    void setUniform(const std::string& name, int value);
    void setUniform(const std::string& name, float value);
    void setUniform(const std::string& name, const Math::Vec2& value);
    void setUniform(const std::string& name, const Math::Vec3& value);
    void setUniform(const std::string& name, const Math::Vec4& value);
    void setUniform(const std::string& name, const Math::Mat4& value);
    void setUniform(const std::string& name, const Math::Mat3& value);
    void enablePostProcessing(bool enabled) { m_postProcessingEnabled = enabled; }
    bool isPostProcessingEnabled() const { return m_postProcessingEnabled; }
    void addPostProcessEffect(std::function<void()> effect);
    void setWireframeMode(bool enabled);
    void enableDebugRendering(bool enabled) { m_debugRendering = enabled; }
    void drawDebugLine(const Math::Vec3& start, const Math::Vec3& end, const Math::Vec3& color);
    void drawDebugCube(const Math::Vec3& center, const Math::Vec3& halfExtents, const Math::Vec3& color);
    void drawDebugSphere(const Math::Vec3& center, float radius, const Math::Vec3& color);
    void drawDebugGrid(float size, int divisions, const Math::Vec3& center);
    void drawGizmo(const Math::Vec3& position, const Math::Quaternion& rotation, float size);
    void renderGUI();
    void renderPostProcessing();
    const RenderStats& getStats() const { return m_stats; }
    void resetStats() { m_stats.reset(); }
    uint32_t getDrawCallCount() const { return m_stats.drawCalls; }
    uint32_t getTriangleCount() const { return m_stats.triangles; }
    RenderAPI getAPI() const { return m_api; }
    bool isInitialized() const { return m_initialized; }
    uint32_t getWindowWidth() const { return m_viewportWidth; }
    uint32_t getWindowHeight() const { return m_viewportHeight; }
    void setMainWindowFBO(uint32_t fbo) { m_mainWindowFBO = fbo; }
    uint32_t getMainWindowFBO() const { return m_mainWindowFBO; }

    // Restricts scene rendering to a screen-space rectangle (top-left
    // origin). Pass a zero size to render to the whole window again.
    void setSceneViewport(int x, int y, int width, int height);

    // Reads the current back buffer and writes it as a binary PPM (P6).
    // Must be called after rendering and before the buffers are swapped.
    bool saveScreenshotPPM(const std::string& path);

private:
    Renderer() = default;
    ~Renderer() = default;
    RenderAPI m_api = RenderAPI::None;
    bool m_initialized = false;
    bool m_postProcessingEnabled = false;
    bool m_debugRendering = false;
    bool m_wireframeMode = false;
    uint32_t m_viewportWidth = 0;

    // Optional scene viewport sub-rectangle (top-left origin, GUI space).
    bool m_sceneViewportEnabled = false;
    int m_sceneViewportX = 0;
    int m_sceneViewportY = 0;
    int m_sceneViewportW = 0;
    int m_sceneViewportH = 0;
    void applySceneViewport();
    uint32_t m_viewportHeight = 0;
    uint32_t m_mainWindowFBO = 0;
    RenderStats m_stats;
    std::shared_ptr<Shader> m_currentShader;
    std::shared_ptr<FrameBuffer> m_currentFBO;
    std::vector<std::function<void()>> m_postProcessEffects;

    // Shadow mapping
    static const int NUM_CASCADES = 4;

    struct ShadowMapData {
        std::shared_ptr<FrameBuffer> fbo;
        Math::Mat4 lightSpaceMatrix;
        Math::Vec3 lightDir;
        float bias;
    };

    struct CascadeData {
        std::shared_ptr<FrameBuffer> fbo;
        Math::Mat4 lightSpaceMatrix;
        float splitDist; // view-space far distance for this cascade
    };

    // Per-light shadow map data (directional/spot single, point cubemap)
    struct SpotShadowData {
        std::shared_ptr<FrameBuffer> fbo;
        Math::Mat4 lightSpaceMatrix;
        Math::Vec3 position;
        Math::Vec3 direction;
        float bias;
        float farPlane;
    };

    struct PointShadowData {
        std::shared_ptr<FrameBuffer> fbo;
        std::shared_ptr<Texture> cubemap;
        Math::Vec3 position;
        float bias;
        float farPlane;
        Math::Mat4 viewMatrices[6]; // 6 face view matrices
        Math::Mat4 projectionMatrix;
    };

    std::vector<ShadowMapData> m_shadowMaps;
    std::vector<CascadeData> m_cascadeShadowMaps;
    std::vector<SpotShadowData> m_spotShadowMaps;
    std::vector<PointShadowData> m_pointShadowMaps;
    std::unordered_map<uint32_t, std::shared_ptr<FrameBuffer>> m_shadowFboCache;
    std::unordered_map<uint32_t, std::shared_ptr<FrameBuffer>> m_spotShadowFboCache;
    std::unordered_map<uint32_t, std::shared_ptr<FrameBuffer>> m_pointShadowFboCache;
    std::unordered_map<uint64_t, std::shared_ptr<FrameBuffer>> m_cascadeFboCache;
    std::shared_ptr<Shader> m_depthShader;
    void renderShadowPass(Scene& scene);
    void renderSpotShadowPass(Scene& scene);
    void renderPointShadowPass(Scene& scene);
    void renderCascadeShadowPass(Scene& scene, Camera& camera);
    void calculateCascadeMatrices(Camera& camera, const Math::Vec3& lightDir, CascadeData* cascades, int numCascades);

    // Debug primitives
    struct DebugLine { Math::Vec3 start, end, color; };
    std::vector<DebugLine> m_debugLines;
    std::shared_ptr<Shader> m_debugShader;
};

} // namespace Ember
