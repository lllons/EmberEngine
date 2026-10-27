#include "Engine/Rendering/Light.h"
#include <cmath>

namespace Ember {

Light::Light() = default;
Light::Light(LightType type) : m_type(type) {}

float Light::getAttenuation(const Math::Vec3& fragPos) const {
    float distance = (m_position - fragPos).length();
    return 1.0f / (m_constant + m_linear * distance + m_quadratic * distance * distance);
}

Light Light::createDirectional(const Math::Vec3& direction, const Math::Vec3& color, float intensity) {
    Light l(LightType::Directional);
    l.setDirection(direction);
    l.setColor(color);
    l.setIntensity(intensity);
    l.enableShadows(true);
    return l;
}

Light Light::createPoint(const Math::Vec3& position, const Math::Vec3& color, float intensity) {
    Light l(LightType::Point);
    l.setPosition(position);
    l.setColor(color);
    l.setIntensity(intensity);
    return l;
}

Light Light::createSpot(const Math::Vec3& position, const Math::Vec3& direction, const Math::Vec3& color, float intensity) {
    Light l(LightType::Spot);
    l.setPosition(position);
    l.setDirection(direction);
    l.setColor(color);
    l.setIntensity(intensity);
    return l;
}

void LightManager::addLight(const Light& light) { m_lights.push_back(light); }
void LightManager::removeLight(size_t index) {
    if (index < m_lights.size()) m_lights.erase(m_lights.begin() + index);
}

} // namespace Ember
