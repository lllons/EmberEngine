#pragma once

#include "Engine/Math/Math.h"
#include <array>

namespace Ember {

class Camera {
public:
    enum class Projection { Perspective, Orthographic };

    Camera();
    Camera(float fov, float aspect, float nearPlane, float farPlane);
    ~Camera() = default;

    void update();
    const Math::Mat4& getViewMatrix() const { return m_viewMatrix; }
    const Math::Mat4& getProjectionMatrix() const { return m_projectionMatrix; }
    Math::Mat4 getViewProjectionMatrix() const { return m_projectionMatrix * m_viewMatrix; }

    void setPosition(const Math::Vec3& pos) { m_position = pos; m_viewDirty = true; }
    const Math::Vec3& getPosition() const { return m_position; }
    void setRotation(const Math::Quaternion& rot) { m_rotation = rot; m_viewDirty = true; }
    const Math::Quaternion& getRotation() const { return m_rotation; }
    Math::Vec3 getForward() const;
    Math::Vec3 getRight() const;
    Math::Vec3 getUp() const;
    void move(const Math::Vec3& offset);
    void rotate(float yaw, float pitch, void* roll = nullptr);
    void lookAt(const Math::Vec3& target);

    void setProjection(Projection proj) { m_projectionType = proj; m_projDirty = true; }
    Projection getProjectionType() const { return m_projectionType; }
    void setFOV(float fov) { m_fov = fov; m_projDirty = true; }
    float getFOV() const { return m_fov; }
    void setAspect(float aspect) { m_aspect = aspect; m_projDirty = true; }
    float getAspect() const { return m_aspect; }
    void setNearPlane(float near) { m_nearPlane = near; m_projDirty = true; }
    float getNearPlane() const { return m_nearPlane; }
    void setFarPlane(float far) { m_farPlane = far; m_projDirty = true; }
    float getFarPlane() const { return m_farPlane; }
    void setOrthoSize(float size) { m_orthoSize = size; m_projDirty = true; }
    Math::Vec3 screenToWorld(const Math::Vec2& screenPos, float depth = 0.0f) const;
    bool isPointInFrustum(const Math::Vec3& point) const;
    bool isSphereInFrustum(const Math::Vec3& center, float radius) const;
    bool isBoxInFrustum(const Math::Vec3& min, const Math::Vec3& max) const;
    void processKeyboard(const Math::Vec3& direction, float deltaTime, float speed = 5.0f);
    void processMouse(float xoffset, float yoffset, float sensitivity = 0.1f);
    static Camera createDefault();

    // CSM helpers
    std::array<Math::Vec3, 8> getFrustumCorners(float nearDist, float farDist) const;
    static void calculateCascadeSplits(float nearPlane, float farPlane, int numCascades, float* splits, float lambda = 0.85f);

private:
    void updateViewMatrix();
    void updateProjectionMatrix();
    void updateFrustumPlanes();

    Projection m_projectionType = Projection::Perspective;
    Math::Vec3 m_position = Math::Vec3::zero();
    Math::Quaternion m_rotation = Math::Quaternion::identity();
    float m_fov = 45.0f, m_aspect = 16.0f / 9.0f, m_nearPlane = 0.1f, m_farPlane = 1000.0f;
    float m_orthoSize = 10.0f, m_yaw = 0.0f, m_pitch = 0.0f;
    Math::Mat4 m_viewMatrix = Math::Mat4::identity();
    Math::Mat4 m_projectionMatrix = Math::Mat4::identity();
    bool m_viewDirty = true, m_projDirty = true;

    struct Plane { Math::Vec3 normal; float d = 0.0f; };
    std::array<Plane, 6> m_frustumPlanes = {};
};

} // namespace Ember
