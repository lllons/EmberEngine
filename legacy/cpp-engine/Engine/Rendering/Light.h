#pragma once

#include "Engine/Math/Math.h"
#include <vector>
#include <cstdint>

namespace Ember {

enum class LightType {
    Directional,
    Point,
    Spot,
    Area
};

class Light {
public:
    Light();
    Light(LightType type);
    ~Light() = default;

    // Type
    void setType(LightType type) { m_type = type; }
    LightType getType() const { return m_type; }

    // Position
    void setPosition(const Math::Vec3& pos) { m_position = pos; }
    const Math::Vec3& getPosition() const { return m_position; }

    // Direction
    void setDirection(const Math::Vec3& dir) { m_direction = dir.normalized(); }
    const Math::Vec3& getDirection() const { return m_direction; }

    // Colors
    void setColor(const Math::Vec3& color) { m_color = color; }
    const Math::Vec3& getColor() const { return m_color; }
    void setIntensity(float intensity) { m_intensity = intensity; }
    float getIntensity() const { return m_intensity; }

    // Attenuation (Point/Spot)
    void setConstant(float c) { m_constant = c; }
    void setLinear(float l) { m_linear = l; }
    void setQuadratic(float q) { m_quadratic = q; }

    float getConstant() const { return m_constant; }
    float getLinear() const { return m_linear; }
    float getQuadratic() const { return m_quadratic; }

    // Spot light
    void setInnerCutoff(float angle) { m_innerCutoff = cos(Math::degToRad(angle)); }
    void setOuterCutoff(float angle) { m_outerCutoff = cos(Math::degToRad(angle)); }
    float getInnerCutoff() const { return m_innerCutoff; }
    float getOuterCutoff() const { return m_outerCutoff; }

    // Area light
    void setAreaWidth(float w) { m_areaWidth = w; }
    void setAreaHeight(float h) { m_areaHeight = h; }
    float getAreaWidth() const { return m_areaWidth; }
    float getAreaHeight() const { return m_areaHeight; }

    // Shadow
    void enableShadows(bool enabled) { m_castsShadows = enabled; }
    bool castsShadows() const { return m_castsShadows; }
    void setShadowBias(float bias) { m_shadowBias = bias; }
    float getShadowBias() const { return m_shadowBias; }
    void setShadowResolution(uint32_t res) { m_shadowResolution = res; }
    uint32_t getShadowResolution() const { return m_shadowResolution; }

    // Helper
    float getAttenuation(const Math::Vec3& fragPos) const;

    // Static factories
    static Light createDirectional(const Math::Vec3& direction, const Math::Vec3& color = Math::Vec3::one(), float intensity = 1.0f);
    static Light createPoint(const Math::Vec3& position, const Math::Vec3& color = Math::Vec3::one(), float intensity = 1.0f);
    static Light createSpot(const Math::Vec3& position, const Math::Vec3& direction, const Math::Vec3& color = Math::Vec3::one(), float intensity = 1.0f);

private:
    LightType m_type = LightType::Point;
    Math::Vec3 m_position = Math::Vec3::zero();
    Math::Vec3 m_direction = Math::Vec3::forward();
    Math::Vec3 m_color = Math::Vec3::one();
    float m_intensity = 1.0f;

    // Attenuation
    float m_constant = 1.0f;
    float m_linear = 0.09f;
    float m_quadratic = 0.032f;

    // Spot
    float m_innerCutoff = 12.5f;
    float m_outerCutoff = 17.5f;

    // Area
    float m_areaWidth = 1.0f;
    float m_areaHeight = 1.0f;

    // Shadow
    bool m_castsShadows = true;
    float m_shadowBias = 0.005f;
    uint32_t m_shadowResolution = 2048;
};

// Light manager for scene
class LightManager {
public:
    void addLight(const Light& light);
    void removeLight(size_t index);
    Light& getLight(size_t index) { return m_lights[index]; }
    const Light& getLight(size_t index) const { return m_lights[index]; }
    size_t getLightCount() const { return m_lights.size(); }
    const std::vector<Light>& getLights() const { return m_lights; }

    void setAmbientColor(const Math::Vec3& color) { m_ambientColor = color; }
    const Math::Vec3& getAmbientColor() const { return m_ambientColor; }
    void setAmbientIntensity(float intensity) { m_ambientIntensity = intensity; }
    float getAmbientIntensity() const { return m_ambientIntensity; }

    void clear() { m_lights.clear(); }

private:
    std::vector<Light> m_lights;
    Math::Vec3 m_ambientColor = Math::Vec3(0.15f);
    float m_ambientIntensity = 1.0f;
};

} // namespace Ember
