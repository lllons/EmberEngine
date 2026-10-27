#include "Engine/Rendering/Material.h"
#include "Engine/Rendering/Shader.h"
#include "Engine/Rendering/Texture.h"

namespace Ember {

Material::Material(const std::shared_ptr<Shader>& shader) : m_shader(shader) {}

void Material::bind() const {
    if (!m_shader) return;
    m_shader->bind();
    applyProperties();
    m_dirty = false;
}

void Material::unbind() const {
    if (m_shader) m_shader->unbind();
}

void Material::setInt(const std::string& name, int value) { m_properties[name] = MaterialProperty(value); m_dirty = true; }
void Material::setFloat(const std::string& name, float value) { m_properties[name] = MaterialProperty(value); m_dirty = true; }
void Material::setVec2(const std::string& name, const Math::Vec2& value) { m_properties[name] = MaterialProperty(value); m_dirty = true; }
void Material::setVec3(const std::string& name, const Math::Vec3& value) { m_properties[name] = MaterialProperty(value); m_dirty = true; }
void Material::setVec4(const std::string& name, const Math::Vec4& value) { m_properties[name] = MaterialProperty(value); m_dirty = true; }
void Material::setTexture(const std::string& name, const std::shared_ptr<Texture>& texture) { m_properties[name] = MaterialProperty(texture); m_dirty = true; }

int Material::getInt(const std::string& name, int defaultVal) const {
    auto it = m_properties.find(name);
    return (it != m_properties.end() && it->second.type == MaterialPropertyType::Int) ? it->second.intVal : defaultVal;
}

float Material::getFloat(const std::string& name, float defaultVal) const {
    auto it = m_properties.find(name);
    return (it != m_properties.end() && it->second.type == MaterialPropertyType::Float) ? it->second.floatVal : defaultVal;
}

Math::Vec2 Material::getVec2(const std::string& name, const Math::Vec2& defaultVal) const {
    auto it = m_properties.find(name);
    return (it != m_properties.end() && it->second.type == MaterialPropertyType::Vec2) ? it->second.vec2Val : defaultVal;
}

Math::Vec3 Material::getVec3(const std::string& name, const Math::Vec3& defaultVal) const {
    auto it = m_properties.find(name);
    return (it != m_properties.end() && it->second.type == MaterialPropertyType::Vec3) ? it->second.vec3Val : defaultVal;
}

Math::Vec4 Material::getVec4(const std::string& name, const Math::Vec4& defaultVal) const {
    auto it = m_properties.find(name);
    return (it != m_properties.end() && it->second.type == MaterialPropertyType::Vec4) ? it->second.vec4Val : defaultVal;
}

std::shared_ptr<Texture> Material::getTexture(const std::string& name) const {
    auto it = m_properties.find(name);
    return (it != m_properties.end() && it->second.type == MaterialPropertyType::Texture) ? it->second.textureVal : nullptr;
}

void Material::setAlbedo(const Math::Vec3& color) { setVec3("uAlbedo", color); }
void Material::setAlbedoTexture(const std::shared_ptr<Texture>& tex) { setTexture("albedoTexture", tex); }
void Material::setMetallic(float metallic) { setFloat("uMetallic", metallic); }
void Material::setRoughness(float roughness) { setFloat("uRoughness", roughness); }
void Material::setNormalMap(const std::shared_ptr<Texture>& tex) { setTexture("normalMap", tex); }
void Material::setEmission(const Math::Vec3& emission) { setVec3("emission", emission); }
void Material::setAO(float ao) { setFloat("ao", ao); }
void Material::setAlpha(float alpha) { setFloat("alpha", alpha); }

void Material::applyProperties() const {
    if (!m_shader) return;
    for (const auto& [name, prop] : m_properties) {
        switch (prop.type) {
            case MaterialPropertyType::Int: m_shader->setInt(name, prop.intVal); break;
            case MaterialPropertyType::Float: m_shader->setFloat(name, prop.floatVal); break;
            case MaterialPropertyType::Vec2: m_shader->setVec2(name, prop.vec2Val.x, prop.vec2Val.y); break;
            case MaterialPropertyType::Vec3: m_shader->setVec3(name, prop.vec3Val.x, prop.vec3Val.y, prop.vec3Val.z); break;
            case MaterialPropertyType::Vec4: m_shader->setVec4(name, prop.vec4Val.x, prop.vec4Val.y, prop.vec4Val.z, prop.vec4Val.w); break;
            case MaterialPropertyType::Texture:
                if (prop.textureVal) prop.textureVal->bind(0);
                break;
        }
    }
}

std::shared_ptr<Material> Material::createDefault() {
    auto shader = Shader::createDefaultShader();
    auto mat = std::make_shared<Material>(shader);
    mat->setAlbedo(Math::Vec3(0.8f));
    mat->setRoughness(0.5f);
    mat->setMetallic(0.0f);
    return mat;
}

std::shared_ptr<Material> Material::createPBR() {
    auto shader = Shader::createDefaultShader();
    auto mat = std::make_shared<Material>(shader);
    mat->setAlbedo(Math::Vec3(1.0f));
    mat->setRoughness(0.5f);
    mat->setMetallic(0.0f);
    mat->setAO(1.0f);
    return mat;
}

std::shared_ptr<Material> Material::createUnlit() {
    auto shader = Shader::createBasicShader();
    auto mat = std::make_shared<Material>(shader);
    mat->setAlbedo(Math::Vec3(1.0f));
    return mat;
}

std::shared_ptr<Material> Material::createWireframe() {
    auto shader = Shader::createBasicShader();
    auto mat = std::make_shared<Material>(shader);
    mat->setAlbedo(Math::Vec3(0.0f, 1.0f, 0.0f));
    return mat;
}

} // namespace Ember
