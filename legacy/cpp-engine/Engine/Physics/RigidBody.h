#pragma once

#include "Engine/Math/Math.h"
#include <cstdint>

namespace Ember {

enum class ForceMode {
    Force,       // N (continuous)
    Impulse,     // N*s (instant)
    VelocityChange, // m/s (instant velocity)
    Acceleration // m/s² (continuous acceleration)
};

class RigidBody {
public:
    RigidBody() = default;
    ~RigidBody() = default;

    // State
    void setStatic(bool isStatic) { m_isStatic = isStatic; m_dirty = true; }
    bool isStatic() const { return m_isStatic; }
    void setKinematic(bool isKinematic) { m_isKinematic = isKinematic; }
    bool isKinematic() const { return m_isKinematic; }

    // Mass
    void setMass(float mass);
    float getMass() const { return m_mass; }
    float getInverseMass() const { return m_isStatic ? 0.0f : m_inverseMass; }

    // Position & rotation
    void setPosition(const Math::Vec3& pos) { m_position = pos; m_dirty = true; }
    const Math::Vec3& getPosition() const { return m_position; }
    void setRotation(const Math::Quaternion& rot) { m_rotation = rot; m_dirty = true; }
    const Math::Quaternion& getRotation() const { return m_rotation; }
    void setTransform(const Math::Vec3& pos, const Math::Quaternion& rot) { m_position = pos; m_rotation = rot; m_dirty = true; }

    // Velocity
    void setLinearVelocity(const Math::Vec3& vel) { m_linearVelocity = vel; }
    const Math::Vec3& getLinearVelocity() const { return m_linearVelocity; }
    void setAngularVelocity(const Math::Vec3& vel) { m_angularVelocity = vel; }
    const Math::Vec3& getAngularVelocity() const { return m_angularVelocity; }

    // Forces
    void addForce(const Math::Vec3& force, ForceMode mode = ForceMode::Force);
    void addTorque(const Math::Vec3& torque, ForceMode mode = ForceMode::Force);

    // Drag
    void setLinearDrag(float drag) { m_linearDrag = drag; }
    float getLinearDrag() const { return m_linearDrag; }
    void setAngularDrag(float drag) { m_angularDrag = drag; }
    float getAngularDrag() const { return m_angularDrag; }

    // Gravity
    void useGravity(bool use) { m_useGravity = use; }
    bool usesGravity() const { return m_useGravity; }
    void setGravityScale(float scale) { m_gravityScale = scale; }
    float getGravityScale() const { return m_gravityScale; }

    // Constraints
    void freezePositionX(bool freeze) { m_freezePos[0] = freeze; }
    void freezePositionY(bool freeze) { m_freezePos[1] = freeze; }
    void freezePositionZ(bool freeze) { m_freezePos[2] = freeze; }
    void freezeRotationX(bool freeze) { m_freezeRot[0] = freeze; }
    void freezeRotationY(bool freeze) { m_freezeRot[1] = freeze; }
    void freezeRotationZ(bool freeze) { m_freezeRot[2] = freeze; }

    // Center of mass
    void setCenterOfMass(const Math::Vec3& com) { m_centerOfMass = com; }
    const Math::Vec3& getCenterOfMass() const { return m_centerOfMass; }

    // Sleep
    void setSleepThreshold(float threshold) { m_sleepThreshold = threshold; }
    bool isSleeping() const { return m_sleeping; }
    void setSleeping(bool sleeping) { m_sleeping = sleeping; }

    // Interpolation
    void setInterpolation(bool enabled) { m_interpolation = enabled; }
    bool usesInterpolation() const { return m_interpolation; }

    // Update physics
    void integrate(float deltaTime, const Math::Vec3& gravity);
    void applyDamping(float deltaTime);

    // Get transform matrix
    Math::Mat4 getTransformMatrix() const;

    // Inertia tensor (for rotation)
    void setInertiaTensor(const Math::Mat3& tensor) { m_inertiaTensor = tensor; m_invInertiaTensor = tensor.inverse(); }
    const Math::Mat3& getInertiaTensor() const { return m_inertiaTensor; }
    const Math::Mat3& getInverseInertiaTensor() const { return m_invInertiaTensor; }

    void setDirty(bool dirty) { m_dirty = dirty; }
    bool isDirty() const { return m_dirty; }

    // Static factories
    static RigidBody createDynamic(float mass = 1.0f);
    static RigidBody createStatic();
    static RigidBody createKinematic();

private:
    // Position & rotation
    Math::Vec3 m_position = Math::Vec3::zero();
    Math::Quaternion m_rotation = Math::Quaternion::identity();

    // Previous frame for interpolation
    Math::Vec3 m_prevPosition = Math::Vec3::zero();
    Math::Quaternion m_prevRotation = Math::Quaternion::identity();

    // Velocity
    Math::Vec3 m_linearVelocity = Math::Vec3::zero();
    Math::Vec3 m_angularVelocity = Math::Vec3::zero();

    // Forces
    Math::Vec3 m_force = Math::Vec3::zero();
    Math::Vec3 m_torque = Math::Vec3::zero();

    // Mass
    float m_mass = 1.0f;
    float m_inverseMass = 1.0f;

    // Inertia
    Math::Mat3 m_inertiaTensor = Math::Mat3::identity();
    Math::Mat3 m_invInertiaTensor = Math::Mat3::identity();

    // Damping
    float m_linearDrag = 0.01f;
    float m_angularDrag = 0.05f;

    // Gravity
    bool m_useGravity = true;
    float m_gravityScale = 1.0f;

    // Center of mass
    Math::Vec3 m_centerOfMass = Math::Vec3::zero();

    // Constraints
    bool m_freezePos[3] = { false, false, false };
    bool m_freezeRot[3] = { false, false, false };

    // State
    bool m_isStatic = false;
    bool m_isKinematic = false;
    bool m_sleeping = false;
    float m_sleepThreshold = 0.1f;
    bool m_interpolation = true;
    bool m_dirty = true;
};

} // namespace Ember
