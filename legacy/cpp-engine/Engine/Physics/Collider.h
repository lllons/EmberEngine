#pragma once

#include "Engine/Math/Math.h"
#include <vector>
#include <functional>
#include <algorithm>
#include <cstdint>

namespace Ember {

enum class ShapeType { None, Sphere, AABB, OBB, Capsule, Plane, ConvexHull, Mesh };

struct RaycastHit {
    bool hit = false;
    Math::Vec3 point;
    Math::Vec3 normal;
    float distance = 0.0f;
    uint32_t entityID = 0;
};

struct CollisionInfo {
    bool colliding = false;
    Math::Vec3 contactPoint;
    Math::Vec3 contactNormal;
    float penetrationDepth = 0.0f;
    uint32_t otherEntityID = 0;
};

class Collider {
public:
    Collider() = default;
    virtual ~Collider() = default;

    ShapeType getShapeType() const { return m_shapeType; }
    void setTrigger(bool trigger) { m_isTrigger = trigger; }
    bool isTrigger() const { return m_isTrigger; }
    void setOffset(const Math::Vec3& offset) { m_offset = offset; }
    const Math::Vec3& getOffset() const { return m_offset; }
    void setScale(const Math::Vec3& scale) { m_scale = scale; }
    const Math::Vec3& getScale() const { return m_scale; }
    void setFriction(float f) { m_friction = f; }
    float getFriction() const { return m_friction; }
    void setBounciness(float b) { m_bounciness = b; }
    float getBounciness() const { return m_bounciness; }

    using CollisionCallback = std::function<void(const CollisionInfo&)>;
    void onCollisionEnter(CollisionCallback cb) { m_onCollisionEnter = cb; }
    void onCollisionStay(CollisionCallback cb) { m_onCollisionStay = cb; }
    void onCollisionExit(CollisionCallback cb) { m_onCollisionExit = cb; }
    void onTriggerEnter(CollisionCallback cb) { m_onTriggerEnter = cb; }
    void onTriggerExit(CollisionCallback cb) { m_onTriggerExit = cb; }

    void invokeCollisionEnter(const CollisionInfo& info) { if (m_onCollisionEnter) m_onCollisionEnter(info); }
    void invokeCollisionStay(const CollisionInfo& info) { if (m_onCollisionStay) m_onCollisionStay(info); }
    void invokeCollisionExit(const CollisionInfo& info) { if (m_onCollisionExit) m_onCollisionExit(info); }
    void invokeTriggerEnter(const CollisionInfo& info) { if (m_onTriggerEnter) m_onTriggerEnter(info); }
    void invokeTriggerExit(const CollisionInfo& info) { if (m_onTriggerExit) m_onTriggerExit(info); }

protected:
    ShapeType m_shapeType = ShapeType::None;
    bool m_isTrigger = false;
    Math::Vec3 m_offset = Math::Vec3::zero();
    Math::Vec3 m_scale = Math::Vec3::one();
    float m_friction = 0.5f;
    float m_bounciness = 0.3f;
    CollisionCallback m_onCollisionEnter, m_onCollisionStay, m_onCollisionExit;
    CollisionCallback m_onTriggerEnter, m_onTriggerExit;
};

class SphereCollider : public Collider {
public:
    SphereCollider() { m_shapeType = ShapeType::Sphere; }
    void setRadius(float r) { m_radius = r; }
    float getRadius() const { return m_radius; }
    float getEffectiveRadius() const { return m_radius * std::max({m_scale.x, m_scale.y, m_scale.z}); }
private:
    float m_radius = 0.5f;
};

class BoxCollider : public Collider {
public:
    BoxCollider() { m_shapeType = ShapeType::AABB; }
    void setHalfExtents(const Math::Vec3& half) { m_min = -half; m_max = half; }
    Math::Vec3 getHalfExtents() const { return (m_max - m_min) * 0.5f * m_scale; }
private:
    Math::Vec3 m_min = Math::Vec3(-0.5f);
    Math::Vec3 m_max = Math::Vec3(0.5f);
};

class CapsuleCollider : public Collider {
public:
    CapsuleCollider() { m_shapeType = ShapeType::Capsule; }
    void setRadius(float r) { m_radius = r; }
    float getRadius() const { return m_radius; }
    void setHalfHeight(float h) { m_halfHeight = h; }
    float getHalfHeight() const { return m_halfHeight; }
private:
    float m_radius = 0.5f, m_halfHeight = 1.0f;
};

} // namespace Ember
