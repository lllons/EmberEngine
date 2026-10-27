#include "Engine/Physics/PhysicsWorld.h"
#include "Engine/Core/Logging.h"
#include <algorithm>
#include <cmath>

namespace Ember {

PhysicsWorld::PhysicsWorld() = default;
PhysicsWorld::~PhysicsWorld() { shutdown(); }

void PhysicsWorld::init(const PhysicsConfig& config) {
    m_config = config;
    m_initialized = true;
    m_accumulator = 0.0f;
    EMBER_LOG_INFO("PhysicsWorld initialized, gravity: ({}, {}, {})", config.gravity.x, config.gravity.y, config.gravity.z);
}

void PhysicsWorld::shutdown() {
    m_bodies.clear();
    m_colliders.clear();
    m_collisionPairs.clear();
    m_gravityZones.clear();
    m_initialized = false;
    EMBER_LOG_INFO("PhysicsWorld shutdown");
}

void PhysicsWorld::step(float deltaTime) {
    if (m_paused || !m_initialized) return;

    m_accumulator += deltaTime;
    while (m_accumulator >= m_config.timeStep) {
        detectCollisions();
        resolveCollisions();
        integrateBodies(m_config.timeStep);
        m_accumulator -= m_config.timeStep;
    }
}

uint32_t PhysicsWorld::addRigidBody(const RigidBody& body) {
    uint32_t id = m_nextBodyId++;
    m_bodies.push_back({id, body});
    return id;
}

void PhysicsWorld::removeRigidBody(uint32_t id) {
    m_bodies.erase(std::remove_if(m_bodies.begin(), m_bodies.end(),
        [id](const BodyEntry& e) { return e.id == id; }), m_bodies.end());
    m_colliders.erase(std::remove_if(m_colliders.begin(), m_colliders.end(),
        [id](const ColliderEntry& e) { return e.bodyId == id; }), m_colliders.end());
}

RigidBody* PhysicsWorld::getRigidBody(uint32_t id) {
    for (auto& entry : m_bodies) {
        if (entry.id == id) return &entry.body;
    }
    return nullptr;
}

void PhysicsWorld::clearBodies() {
    m_bodies.clear();
    m_colliders.clear();
    m_collisionPairs.clear();
}

uint32_t PhysicsWorld::addCollider(uint32_t bodyId, std::shared_ptr<Collider> collider) {
    uint32_t id = m_nextColliderId++;
    m_colliders.push_back({id, bodyId, std::move(collider)});
    return id;
}

void PhysicsWorld::removeCollider(uint32_t colliderId) {
    m_colliders.erase(std::remove_if(m_colliders.begin(), m_colliders.end(),
        [colliderId](const ColliderEntry& e) { return e.id == colliderId; }), m_colliders.end());
}

Collider* PhysicsWorld::getCollider(uint32_t colliderId) {
    for (auto& entry : m_colliders) {
        if (entry.id == colliderId) return entry.collider.get();
    }
    return nullptr;
}

RaycastHit PhysicsWorld::raycast(const Math::Vec3& origin, const Math::Vec3& direction, float maxDistance) const {
    RaycastHit closest;
    closest.distance = maxDistance;
    Math::Vec3 dir = direction.normalized();

    for (const auto& bodyEntry : m_bodies) {
        Math::Vec3 toBody = bodyEntry.body.getPosition() - origin;
        float t = toBody.dot(dir);
        if (t < 0 || t > closest.distance) continue;

        Math::Vec3 closestPoint = origin + dir * t;
        float distSq = (closestPoint - bodyEntry.body.getPosition()).lengthSquared();

        float radius = 1.0f; // Simplified - should use actual collider shape
        if (distSq < radius * radius) {
            closest.hit = true;
            closest.point = closestPoint;
            closest.normal = (closestPoint - bodyEntry.body.getPosition()).normalized();
            closest.distance = t;
            closest.entityID = bodyEntry.id;
        }
    }
    return closest;
}

std::vector<RaycastHit> PhysicsWorld::raycastAll(const Math::Vec3& origin, const Math::Vec3& direction, float maxDistance) const {
    std::vector<RaycastHit> results;
    Math::Vec3 dir = direction.normalized();

    for (const auto& bodyEntry : m_bodies) {
        Math::Vec3 toBody = bodyEntry.body.getPosition() - origin;
        float t = toBody.dot(dir);
        if (t < 0 || t > maxDistance) continue;

        Math::Vec3 closestPoint = origin + dir * t;
        float distSq = (closestPoint - bodyEntry.body.getPosition()).lengthSquared();
        float radius = 1.0f;

        if (distSq < radius * radius) {
            RaycastHit hit;
            hit.hit = true;
            hit.point = closestPoint;
            hit.normal = (closestPoint - bodyEntry.body.getPosition()).normalized();
            hit.distance = t;
            hit.entityID = bodyEntry.id;
            results.push_back(hit);
        }
    }
    return results;
}

bool PhysicsWorld::overlapSphere(const Math::Vec3& center, float radius, std::vector<uint32_t>& outEntities) const {
    bool found = false;
    for (const auto& entry : m_bodies) {
        float dist = (entry.body.getPosition() - center).length();
        if (dist < radius) {
            outEntities.push_back(entry.id);
            found = true;
        }
    }
    return found;
}

bool PhysicsWorld::overlapBox(const Math::Vec3& center, const Math::Vec3& halfExtents, const Math::Quaternion& rotation, std::vector<uint32_t>& outEntities) const {
    (void)rotation;
    bool found = false;
    for (const auto& entry : m_bodies) {
        Math::Vec3 localPos = entry.body.getPosition() - center;
        if (std::abs(localPos.x) < halfExtents.x && std::abs(localPos.y) < halfExtents.y && std::abs(localPos.z) < halfExtents.z) {
            outEntities.push_back(entry.id);
            found = true;
        }
    }
    return found;
}

bool PhysicsWorld::checkCollision(uint32_t idA, uint32_t idB, CollisionInfo& info) const {
    const RigidBody* bodyA = nullptr;
    const RigidBody* bodyB = nullptr;
    for (const auto& entry : m_bodies) {
        if (entry.id == idA) bodyA = &entry.body;
        if (entry.id == idB) bodyB = &entry.body;
    }
    if (!bodyA || !bodyB) return false;

    float dist = (bodyA->getPosition() - bodyB->getPosition()).length();
    float radius = 2.0f; // Simplified

    info.colliding = dist < radius;
    if (info.colliding) {
        Math::Vec3 delta = bodyB->getPosition() - bodyA->getPosition();
        info.contactNormal = delta.normalized();
        info.contactPoint = bodyA->getPosition() + info.contactNormal * (dist * 0.5f);
        info.penetrationDepth = radius - dist;
        info.otherEntityID = idB;
    }
    return info.colliding;
}

void PhysicsWorld::detectCollisions() {
    m_collisionPairs.clear();
    for (size_t i = 0; i < m_bodies.size(); i++) {
        for (size_t j = i + 1; j < m_bodies.size(); j++) {
            CollisionInfo info;
            if (checkCollision(m_bodies[i].id, m_bodies[j].id, info)) {
                m_collisionPairs.push_back({0, 0, info}); // Simplified collider IDs
                if (m_onCollision) {
                    m_onCollision(m_bodies[i].id, m_bodies[j].id, info);
                }
            }
        }
    }
}

void PhysicsWorld::resolveCollisions() {
    for (auto& pair : m_collisionPairs) {
        if (!pair.info.colliding) continue;
        Math::Vec3 normal = pair.info.contactNormal;
        float penetration = pair.info.penetrationDepth;

        // Simple position correction
        // Find bodies and push apart
        for (auto& entry : m_bodies) {
            if (!entry.body.isStatic()) {
                entry.body.setPosition(entry.body.getPosition() + normal * (penetration * 0.5f));
            }
        }
    }
}

void PhysicsWorld::integrateBodies(float deltaTime) {
    for (auto& entry : m_bodies) {
        if (entry.body.isStatic() || entry.body.isSleeping()) continue;

        Math::Vec3 gravity = m_config.gravity * entry.body.getGravityScale();
        entry.body.integrate(deltaTime, gravity);
    }
}

void PhysicsWorld::addGravityZone(const Math::Vec3& center, const Math::Vec3& halfExtents, const Math::Vec3& gravity) {
    m_gravityZones.push_back({center, halfExtents, gravity});
}

void PhysicsWorld::removeGravityZone(size_t index) {
    if (index < m_gravityZones.size()) {
        m_gravityZones.erase(m_gravityZones.begin() + index);
    }
}

} // namespace Ember
