#pragma once

#include "Engine/Physics/Collider.h"
#include "Engine/Physics/RigidBody.h"
#include "Engine/Math/Math.h"
#include <vector>
#include <memory>
#include <functional>
#include <cstdint>

namespace Ember {

// Forward declarations
class Scene;

struct PhysicsConfig {
    Math::Vec3 gravity = Math::Vec3(0.0f, -9.81f, 0.0f);
    int velocityIterations = 8;
    int positionIterations = 3;
    float timeStep = 1.0f / 60.0f;
    float maxFrameTime = 0.025f; // Max time step to prevent spiral of death
    bool interpolate = true;
    bool continuousCollision = true;
};

class PhysicsWorld {
public:
    PhysicsWorld();
    ~PhysicsWorld();

    void init(const PhysicsConfig& config = PhysicsConfig());
    void shutdown();

    // Step simulation
    void step(float deltaTime);

    // Configuration
    void setGravity(const Math::Vec3& gravity) { m_config.gravity = gravity; }
    const Math::Vec3& getGravity() const { return m_config.gravity; }
    void setConfig(const PhysicsConfig& config) { m_config = config; }
    const PhysicsConfig& getConfig() const { return m_config; }

    // Body management
    uint32_t addRigidBody(const RigidBody& body);
    void removeRigidBody(uint32_t id);
    RigidBody* getRigidBody(uint32_t id);
    void clearBodies();

    // Collider management
    uint32_t addCollider(uint32_t bodyId, std::shared_ptr<Collider> collider);
    void removeCollider(uint32_t colliderId);
    Collider* getCollider(uint32_t colliderId);

    // Raycasting
    RaycastHit raycast(const Math::Vec3& origin, const Math::Vec3& direction, float maxDistance = 1000.0f) const;
    std::vector<RaycastHit> raycastAll(const Math::Vec3& origin, const Math::Vec3& direction, float maxDistance = 1000.0f) const;

    // Overlap tests
    bool overlapSphere(const Math::Vec3& center, float radius, std::vector<uint32_t>& outEntities) const;
    bool overlapBox(const Math::Vec3& center, const Math::Vec3& halfExtents, const Math::Quaternion& rotation, std::vector<uint32_t>& outEntities) const;

    // Collision detection
    bool checkCollision(uint32_t idA, uint32_t idB, CollisionInfo& info) const;

    // Gravity zones (trigger volumes that override gravity)
    void addGravityZone(const Math::Vec3& center, const Math::Vec3& halfExtents, const Math::Vec3& gravity);
    void removeGravityZone(size_t index);

    // Debug
    void enableDebugDrawing(bool enabled) { m_debugDrawing = enabled; }
    bool isDebugDrawing() const { return m_debugDrawing; }

    // Pause
    void setPaused(bool paused) { m_paused = paused; }
    bool isPaused() const { return m_paused; }

    // Stats
    size_t getBodyCount() const { return m_bodies.size(); }
    size_t getColliderCount() const { return m_colliders.size(); }

    // Collision callbacks
    using CollisionEventCallback = std::function<void(uint32_t, uint32_t, const CollisionInfo&)>;
    void onCollision(CollisionEventCallback cb) { m_onCollision = cb; }

private:
    void detectCollisions();
    void resolveCollisions();
    void integrateBodies(float deltaTime);

    PhysicsConfig m_config;
    bool m_initialized = false;
    bool m_paused = false;
    bool m_debugDrawing = false;

    // Bodies
    struct BodyEntry {
        uint32_t id;
        RigidBody body;
    };
    std::vector<BodyEntry> m_bodies;
    uint32_t m_nextBodyId = 1;

    // Colliders
    struct ColliderEntry {
        uint32_t id;
        uint32_t bodyId;
        std::shared_ptr<Collider> collider;
    };
    std::vector<ColliderEntry> m_colliders;
    uint32_t m_nextColliderId = 1;

    // Collision pairs from last frame
    struct CollisionPair {
        uint32_t colliderA;
        uint32_t colliderB;
        CollisionInfo info;
    };
    std::vector<CollisionPair> m_collisionPairs;

    // Gravity zones
    struct GravityZone {
        Math::Vec3 center;
        Math::Vec3 halfExtents;
        Math::Vec3 gravity;
    };
    std::vector<GravityZone> m_gravityZones;

    // Callbacks
    CollisionEventCallback m_onCollision;

    float m_accumulator = 0.0f;
};

} // namespace Ember
