#include "Engine/Physics/RigidBody.h"
#include <cmath>

namespace Ember {

void RigidBody::setMass(float mass) {
    m_mass = std::max(0.001f, mass);
    m_inverseMass = m_isStatic ? 0.0f : 1.0f / m_mass;
    m_dirty = true;
}

void RigidBody::addForce(const Math::Vec3& force, ForceMode mode) {
    if (m_isStatic) return;
    switch (mode) {
        case ForceMode::Force: m_force += force; break;
        case ForceMode::Impulse: m_linearVelocity += force * m_inverseMass; break;
        case ForceMode::VelocityChange: m_linearVelocity += force; break;
        case ForceMode::Acceleration: m_force += force * m_mass; break;
    }
}

void RigidBody::addTorque(const Math::Vec3& torque, ForceMode mode) {
    if (m_isStatic) return;
    switch (mode) {
        case ForceMode::Force: m_torque += torque; break;
        case ForceMode::Impulse: m_angularVelocity += torque * m_inverseMass; break;
        case ForceMode::VelocityChange: m_angularVelocity += torque; break;
        case ForceMode::Acceleration: m_torque += torque * m_mass; break;
    }
}

void RigidBody::integrate(float deltaTime, const Math::Vec3& gravity) {
    if (m_isStatic || m_isKinematic) return;

    m_prevPosition = m_position;
    m_prevRotation = m_rotation;

    // Apply gravity
    if (m_useGravity) {
        m_force += gravity * m_gravityScale;
    }

    // Integrate linear motion (semi-implicit Euler)
    Math::Vec3 acceleration = m_force * m_inverseMass;
    m_linearVelocity += acceleration * deltaTime;

    // Integrate angular motion
    Math::Vec3 angularAcceleration = m_torque * m_inverseMass;
    m_angularVelocity += angularAcceleration * deltaTime;

    // Apply damping
    applyDamping(deltaTime);

    // Apply position constraints (freeze axes)
    if (m_freezePos[0]) m_linearVelocity.x = 0;
    if (m_freezePos[1]) m_linearVelocity.y = 0;
    if (m_freezePos[2]) m_linearVelocity.z = 0;
    if (m_freezeRot[0]) m_angularVelocity.x = 0;
    if (m_freezeRot[1]) m_angularVelocity.y = 0;
    if (m_freezeRot[2]) m_angularVelocity.z = 0;

    // Update position
    m_position += m_linearVelocity * deltaTime;

    // Update rotation
    Math::Vec3 angleAxis = m_angularVelocity * deltaTime;
    float angle = angleAxis.length();
    if (angle > 0.0001f) {
        Math::Quaternion deltaRot(angleAxis / angle, Math::radToDeg(angle));
        m_rotation = (deltaRot * m_rotation).normalized();
    }

    // Clear forces
    m_force = Math::Vec3::zero();
    m_torque = Math::Vec3::zero();

    // Sleep check
    if (m_linearVelocity.lengthSquared() < m_sleepThreshold * m_sleepThreshold &&
        m_angularVelocity.lengthSquared() < m_sleepThreshold * m_sleepThreshold) {
        m_sleeping = true;
    }

    m_dirty = true;
}

void RigidBody::applyDamping(float deltaTime) {
    m_linearVelocity *= (1.0f - m_linearDrag * deltaTime);
    m_angularVelocity *= (1.0f - m_angularDrag * deltaTime);
}

Math::Mat4 RigidBody::getTransformMatrix() const {
    return Math::Mat4::translate(m_position) * m_rotation.toMat4();
}

RigidBody RigidBody::createDynamic(float mass) {
    RigidBody body;
    body.setMass(mass);
    body.m_isStatic = false;
    return body;
}

RigidBody RigidBody::createStatic() {
    RigidBody body;
    body.m_isStatic = true;
    body.m_inverseMass = 0.0f;
    return body;
}

RigidBody RigidBody::createKinematic() {
    RigidBody body;
    body.m_isKinematic = true;
    body.m_inverseMass = 0.0f;
    return body;
}

} // namespace Ember

// Collider implementations are inline in the header
