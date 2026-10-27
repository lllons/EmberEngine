#pragma once

#include <memory>
#include <string>
#include <unordered_map>
#include <variant>
#include "Engine/Math/Math.h"

namespace Ember {

class Shader;
class Texture;

enum class MaterialPropertyType {
    Int, Float, Vec2, Vec3, Vec4, Texture
};

struct MaterialProperty {
    MaterialPropertyType type;
    union {
        int intVal;
        float floatVal;
    };
    Math::Vec2 vec2Val;
    Math::Vec3 vec3Val;
    Math::Vec4 vec4Val;
    std::shared_ptr<Texture> textureVal;

    MaterialProperty() : type(MaterialPropertyType::Float), floatVal(0.0f) {}
    MaterialProperty(int v) : type(MaterialPropertyType::Int), intVal(v) {}
    MaterialProperty(float v) : type(MaterialPropertyType::Float), floatVal(v) {}
    MaterialProperty(const Math::Vec2& v) : type(MaterialPropertyType::Vec2), vec2Val(v) {}
    MaterialProperty(const Math::Vec3& v) : type(MaterialPropertyType::Vec3), vec3Val(v) {}
    MaterialProperty(const Math::Vec4& v) : type(MaterialPropertyType::Vec4), vec4Val(v) {}
    MaterialProperty(const std::shared_ptr<Texture>& v) : type(MaterialPropertyType::Texture), textureVal(v) {}
};

class Material {
public:
    Material() = default;
    Material(const std::shared_ptr<Shader>& shader);
    ~Material() = default;

    void bind() const;
    void unbind() const;

    // Shader
    void setShader(const std::shared_ptr<Shader>& shader) { m_shader = shader; m_dirty = true; }
    std::shared_ptr<Shader> getShader() const { return m_shader; }

    // Properties
    void setInt(const std::string& name, int value);
    void setFloat(const std::string& name, float value);
    void setVec2(const std::string& name, const Math::Vec2& value);
    void setVec3(const std::string& name, const Math::Vec3& value);
    void setVec4(const std::string& name, const Math::Vec4& value);
    void setTexture(const std::string& name, const std::shared_ptr<Texture>& texture);

    int getInt(const std::string& name, int defaultVal = 0) const;
    float getFloat(const std::string& name, float defaultVal = 0.0f) const;
    Math::Vec2 getVec2(const std::string& name, const Math::Vec2& defaultVal = Math::Vec2::zero()) const;
    Math::Vec3 getVec3(const std::string& name, const Math::Vec3& defaultVal = Math::Vec3::zero()) const;
    Math::Vec4 getVec4(const std::string& name, const Math::Vec4& defaultVal = Math::Vec4(0,0,0,1)) const;
    std::shared_ptr<Texture> getTexture(const std::string& name) const;

    bool hasProperty(const std::string& name) const { return m_properties.find(name) != m_properties.end(); }
    void removeProperty(const std::string& name) { m_properties.erase(name); m_dirty = true; }
    const auto& getProperties() const { return m_properties; }

    // PBR shortcuts
    void setAlbedo(const Math::Vec3& color);
    void setAlbedoTexture(const std::shared_ptr<Texture>& tex);
    void setMetallic(float metallic);
    void setRoughness(float roughness);
    void setNormalMap(const std::shared_ptr<Texture>& tex);
    void setEmission(const Math::Vec3& emission);
    void setAO(float ao);
    void setAlpha(float alpha);

    Math::Vec3 getAlbedo() const { return getVec3("uAlbedo", Math::Vec3(1.0f)); }
    float getMetallic() const { return getFloat("uMetallic", 0.0f); }
    float getRoughness() const { return getFloat("uRoughness", 0.5f); }
    Math::Vec3 getEmission() const { return getVec3("emission", Math::Vec3::zero()); }

    // Transparency
    bool isTransparent() const { return m_transparent; }
    void setTransparent(bool transparent) { m_transparent = transparent; m_dirty = true; }
    bool isDoubleSided() const { return m_doubleSided; }
    void setDoubleSided(bool doubleSided) { m_doubleSided = doubleSided; m_dirty = true; }

    // Caching
    void setDirty(bool dirty) { m_dirty = dirty; }
    bool isDirty() const { return m_dirty; }

    // Factory
    static std::shared_ptr<Material> createDefault();
    static std::shared_ptr<Material> createPBR();
    static std::shared_ptr<Material> createUnlit();
    static std::shared_ptr<Material> createWireframe();

private:
    void applyProperties() const;

    std::shared_ptr<Shader> m_shader;
    std::unordered_map<std::string, MaterialProperty> m_properties;
    bool m_transparent = false;
    bool m_doubleSided = false;
    mutable bool m_dirty = true;
};

} // namespace Ember
