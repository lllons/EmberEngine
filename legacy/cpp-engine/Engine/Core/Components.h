#pragma once

#include "Engine/Math/Math.h"
#include "Engine/Rendering/Material.h"
#include <memory>
#include <string>
#include <functional>
#include <cstdint>

namespace Ember {

// Forward declarations
class Mesh;
class Texture;
class Collider;

// ============ Transform Component ============
struct Transform {
    Math::Vec3 position = Math::Vec3::zero();
    Math::Quaternion rotation = Math::Quaternion::identity();
    Math::Vec3 scale = Math::Vec3::one();

    Math::Mat4 getTransformMatrix() const {
        return Math::Mat4::translate(position) * rotation.toMat4() * Math::Mat4::scale(scale);
    }

    Math::Vec3 getForward() const { return rotation.rotate(Math::Vec3::forward()); }
    Math::Vec3 getRight() const { return rotation.rotate(Math::Vec3::right()); }
    Math::Vec3 getUp() const { return rotation.rotate(Math::Vec3::up()); }

    void translate(const Math::Vec3& offset) { position += offset; }
    void rotate(float yaw, float pitch, float roll = 0.0f) {
        Math::Quaternion yawQ(Math::Vec3::up(), yaw);
        Math::Quaternion pitchQ(Math::Vec3::right(), pitch);
        Math::Quaternion rollQ(Math::Vec3::forward(), roll);
        rotation = (yawQ * pitchQ * rollQ * rotation).normalized();
    }
};

// ============ Tag Component ============
struct Tag {
    std::string name;
    uint32_t layer = 0;
    uint32_t tagID = 0;
};

// ============ MeshRenderer Component ============
struct MeshRenderer {
    std::shared_ptr<Mesh> mesh;
    std::shared_ptr<Material> material;
    bool castShadows = true;
    bool receiveShadows = true;
    bool enabled = true;

    void setAlbedo(const Math::Vec3& color) {
        if (material) material->setAlbedo(color);
    }
};

// ============ Camera Component ============
struct CameraComponent {
    enum Projection { Perspective, Orthographic };

    Projection projectionType = Perspective;
    float fov = 45.0f;
    float aspect = 16.0f / 9.0f;
    float nearPlane = 0.1f;
    float farPlane = 1000.0f;
    float orthoSize = 10.0f;
    int priority = 0;
    bool primary = false;
    bool enabled = true;
};

// ============ Light Component ============
struct LightComponent {
    enum Type { Directional, Point, Spot };

    Type type = Point;
    Math::Vec3 color = Math::Vec3::one();
    float intensity = 1.0f;
    float range = 50.0f;
    float constant = 1.0f;
    float linear = 0.09f;
    float quadratic = 0.032f;
    float innerCutoff = 12.5f;
    float outerCutoff = 17.5f;
    bool castShadows = true;
    float shadowBias = 0.005f;
    int shadowResolution = 2048;
    bool enabled = true;

    float getAttenuation(float distance) const {
        return 1.0f / (constant + linear * distance + quadratic * distance * distance);
    }
};

// ============ RigidBody Component ============
struct RigidBodyComponent {
    enum BodyType { Static, Dynamic, Kinematic };
    BodyType bodyType = Dynamic;
    float mass = 1.0f;
    float linearDrag = 0.01f;
    float angularDrag = 0.05f;
    bool useGravity = true;
    bool isKinematic = false;
    bool enabled = true;
    Math::Vec3 linearVelocity = Math::Vec3::zero();
    Math::Vec3 angularVelocity = Math::Vec3::zero();
};

// ============ Collider Components ============
struct BoxColliderComponent {
    Math::Vec3 size = Math::Vec3(1.0f);
    Math::Vec3 offset = Math::Vec3::zero();
    bool isTrigger = false;
    float friction = 0.5f;
    float bounciness = 0.3f;
    bool enabled = true;
};

struct SphereColliderComponent {
    float radius = 0.5f;
    Math::Vec3 offset = Math::Vec3::zero();
    bool isTrigger = false;
    float friction = 0.5f;
    float bounciness = 0.3f;
    bool enabled = true;
};

struct CapsuleColliderComponent {
    float radius = 0.5f;
    float height = 2.0f;
    Math::Vec3 offset = Math::Vec3::zero();
    bool isTrigger = false;
    float friction = 0.5f;
    float bounciness = 0.3f;
    bool enabled = true;
};

// ============ Audio Component ============
struct AudioSourceComponent {
    std::string clipPath;
    float volume = 1.0f;
    float pitch = 1.0f;
    bool loop = false;
    bool spatialized = false;
    float minDistance = 1.0f;
    float maxDistance = 100.0f;
    bool playOnStart = false;
    bool enabled = true;
};

// ============ Particle Emitter Component ============
struct ParticleEmitterComponent {
    int maxParticles = 100;
    float emissionRate = 10.0f;
    float lifetime = 2.0f;
    Math::Vec3 startVelocityMin = Math::Vec3(-0.5f, 1.0f, -0.5f);
    Math::Vec3 startVelocityMax = Math::Vec3(0.5f, 2.0f, 0.5f);
    float startSizeMin = 0.1f;
    float startSizeMax = 0.5f;
    Math::Vec4 startColor = Math::Vec4(1.0f);
    Math::Vec4 endColor = Math::Vec4(1.0f, 1.0f, 1.0f, 0.0f);
    bool loop = true;
    bool enabled = true;
};

// ============ Script Component ============
struct ScriptComponent {
    std::string scriptName;
    bool enabled = true;
};

// ============ Name Component ============
struct NameComponent {
    std::string name;
};

// ============ Prefab Component ============
struct PrefabComponent {
    std::string prefabPath;       // Path to the .emberprefab file
    std::string prefabName;       // Display name of the prefab
    uint64_t prefabID = 0;        // Unique ID for this prefab template
    bool instantiated = false;    // Whether this entity was instantiated from a prefab
    bool breakPrefab = false;     // Whether prefab link is broken (free editing)
};

} // namespace Ember
