#include "Engine/Rendering/Camera.h"
#include <cmath>
#include <algorithm>

namespace Ember {

Camera::Camera() { update(); }

Camera::Camera(float fov, float aspect, float nearPlane, float farPlane)
    : m_fov(fov), m_aspect(aspect), m_nearPlane(nearPlane), m_farPlane(farPlane) {
    update();
}

void Camera::update() {
    if (m_viewDirty) { updateViewMatrix(); m_viewDirty = false; }
    if (m_projDirty) { updateProjectionMatrix(); m_projDirty = false; }
    updateFrustumPlanes();
}

Math::Vec3 Camera::getForward() const { return m_rotation.rotate(Math::Vec3::forward()); }
Math::Vec3 Camera::getRight() const { return m_rotation.rotate(Math::Vec3::right()); }
Math::Vec3 Camera::getUp() const { return m_rotation.rotate(Math::Vec3::up()); }

void Camera::move(const Math::Vec3& offset) { m_position += offset; m_viewDirty = true; }

void Camera::rotate(float yaw, float pitch, void* roll) {
    (void)roll;
    m_yaw += yaw;
    m_pitch = std::max(-89.0f, std::min(89.0f, m_pitch + pitch));
    Math::Quaternion yawQ(Math::Vec3::up(), m_yaw);
    Math::Quaternion pitchQ(Math::Vec3::right(), m_pitch);
    m_rotation = (yawQ * pitchQ).normalized();
    m_viewDirty = true;
}

void Camera::lookAt(const Math::Vec3& target) {
    Math::Vec3 dir = (target - m_position).normalized();
    float yaw = std::atan2(dir.x, dir.z);
    float pitch = std::asin(dir.y);
    m_yaw = Math::radToDeg(yaw);
    m_pitch = Math::radToDeg(-pitch);
    Math::Quaternion yawQ(Math::Vec3::up(), m_yaw);
    Math::Quaternion pitchQ(Math::Vec3::right(), m_pitch);
    m_rotation = (yawQ * pitchQ).normalized();
    m_viewDirty = true;
}

Math::Vec3 Camera::screenToWorld(const Math::Vec2& screenPos, float depth) const {
    Math::Mat4 invVP = (m_projectionMatrix * m_viewMatrix).inverse();
    Math::Vec4 ndc(screenPos.x * 2.0f - 1.0f, 1.0f - screenPos.y * 2.0f, depth * 2.0f - 1.0f, 1.0f);
    Math::Vec4 world = invVP * ndc;
    return world.xyz() * (1.0f / world.w);
}

void Camera::processKeyboard(const Math::Vec3& direction, float deltaTime, float speed) {
    m_position += direction * speed * deltaTime;
    m_viewDirty = true;
}

void Camera::processMouse(float xoffset, float yoffset, float sensitivity) {
    rotate(xoffset * sensitivity, yoffset * sensitivity);
}

void Camera::updateViewMatrix() {
    Math::Vec3 target = m_position + getForward();
    m_viewMatrix = Math::Mat4::lookAt(m_position, target, getUp());
}

void Camera::updateProjectionMatrix() {
    if (m_projectionType == Projection::Perspective) {
        m_projectionMatrix = Math::Mat4::perspective(m_fov, m_aspect, m_nearPlane, m_farPlane);
    } else {
        float halfSize = m_orthoSize * 0.5f * m_aspect;
        m_projectionMatrix = Math::Mat4::orthographic(-halfSize, halfSize, -m_orthoSize * 0.5f, m_orthoSize * 0.5f, m_nearPlane, m_farPlane);
    }
}

void Camera::updateFrustumPlanes() {
    Math::Mat4 vp = m_projectionMatrix * m_viewMatrix;
    // Left
    m_frustumPlanes[0].normal.x = vp(0,3) + vp(0,0);
    m_frustumPlanes[0].normal.y = vp(1,3) + vp(1,0);
    m_frustumPlanes[0].normal.z = vp(2,3) + vp(2,0);
    m_frustumPlanes[0].d = vp(3,3) + vp(3,0);
    // Right
    m_frustumPlanes[1].normal.x = vp(0,3) - vp(0,0);
    m_frustumPlanes[1].normal.y = vp(1,3) - vp(1,0);
    m_frustumPlanes[1].normal.z = vp(2,3) - vp(2,0);
    m_frustumPlanes[1].d = vp(3,3) - vp(3,0);
    // Bottom
    m_frustumPlanes[2].normal.x = vp(0,3) + vp(0,1);
    m_frustumPlanes[2].normal.y = vp(1,3) + vp(1,1);
    m_frustumPlanes[2].normal.z = vp(2,3) + vp(2,1);
    m_frustumPlanes[2].d = vp(3,3) + vp(3,1);
    // Top
    m_frustumPlanes[3].normal.x = vp(0,3) - vp(0,1);
    m_frustumPlanes[3].normal.y = vp(1,3) - vp(1,1);
    m_frustumPlanes[3].normal.z = vp(2,3) - vp(2,1);
    m_frustumPlanes[3].d = vp(3,3) - vp(3,1);
    // Near
    m_frustumPlanes[4].normal.x = vp(0,3) + vp(0,2);
    m_frustumPlanes[4].normal.y = vp(1,3) + vp(1,2);
    m_frustumPlanes[4].normal.z = vp(2,3) + vp(2,2);
    m_frustumPlanes[4].d = vp(3,3) + vp(3,2);
    // Far
    m_frustumPlanes[5].normal.x = vp(0,3) - vp(0,2);
    m_frustumPlanes[5].normal.y = vp(1,3) - vp(1,2);
    m_frustumPlanes[5].normal.z = vp(2,3) - vp(2,2);
    m_frustumPlanes[5].d = vp(3,3) - vp(3,2);
    for (auto& p : m_frustumPlanes) {
        float len = p.normal.length();
        p.normal = p.normal / len;
        p.d /= len;
    }
}

bool Camera::isPointInFrustum(const Math::Vec3& point) const {
    for (const auto& plane : m_frustumPlanes) {
        if (plane.normal.dot(point) + plane.d < 0) return false;
    }
    return true;
}

bool Camera::isSphereInFrustum(const Math::Vec3& center, float radius) const {
    for (const auto& plane : m_frustumPlanes) {
        if (plane.normal.dot(center) + plane.d < -radius) return false;
    }
    return true;
}

bool Camera::isBoxInFrustum(const Math::Vec3& min, const Math::Vec3& max) const {
    for (const auto& plane : m_frustumPlanes) {
        Math::Vec3 positiveVertex = min;
        if (plane.normal.x >= 0) positiveVertex.x = max.x;
        if (plane.normal.y >= 0) positiveVertex.y = max.y;
        if (plane.normal.z >= 0) positiveVertex.z = max.z;
        if (plane.normal.dot(positiveVertex) + plane.d < 0) return false;
    }
    return true;
}

Camera Camera::createDefault() {
    Camera cam;
    cam.setPosition(Math::Vec3(0, 2, 5));
    cam.lookAt(Math::Vec3::zero());
    return cam;
}

// ========================================================================
// CSM Helpers
// ========================================================================

std::array<Math::Vec3, 8> Camera::getFrustumCorners(float nearDist, float farDist) const {
    float tanFov = std::tan(Math::degToRad(m_fov * 0.5f));
    float nearH = tanFov * nearDist;
    float nearW = nearH * m_aspect;
    float farH = tanFov * farDist;
    float farW = farH * m_aspect;

    Math::Vec3 forward = getForward();
    Math::Vec3 right = getRight();
    Math::Vec3 up = getUp();

    Math::Vec3 nearCenter = m_position + forward * nearDist;
    Math::Vec3 farCenter = m_position + forward * farDist;

    std::array<Math::Vec3, 8> corners;
    corners[0] = nearCenter - right * nearW - up * nearH; // near bottom-left
    corners[1] = nearCenter + right * nearW - up * nearH; // near bottom-right
    corners[2] = nearCenter + right * nearW + up * nearH; // near top-right
    corners[3] = nearCenter - right * nearW + up * nearH; // near top-left
    corners[4] = farCenter - right * farW - up * farH;    // far bottom-left
    corners[5] = farCenter + right * farW - up * farH;    // far bottom-right
    corners[6] = farCenter + right * farW + up * farH;    // far top-right
    corners[7] = farCenter - right * farW + up * farH;    // far top-left

    return corners;
}

void Camera::calculateCascadeSplits(float nearPlane, float farPlane, int numCascades, float* splits, float lambda) {
    for (int i = 0; i < numCascades; i++) {
        float p = (float)(i + 1) / (float)numCascades;
        float logSplit = nearPlane * powf(farPlane / nearPlane, p);
        float uniformSplit = nearPlane + (farPlane - nearPlane) * p;
        splits[i] = logSplit * lambda + uniformSplit * (1.0f - lambda);
    }
}

} // namespace Ember
