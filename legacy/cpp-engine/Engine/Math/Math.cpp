#include "Engine/Math/Math.h"
#include <cmath>
#include <cstring>
#include <algorithm>

namespace Ember {
namespace Math {

// ============ Vec3 Slerp ============
Vec3 Vec3::slerp(const Vec3& v, float t) const {
    float dotProduct = dot(v);
    dotProduct = std::max(-1.0f, std::min(1.0f, dotProduct));
    float theta = std::acos(dotProduct);
    if (theta < EPSILON) return *this;
    float sinTheta = std::sin(theta);
    float factorA = std::sin((1.0f - t) * theta) / sinTheta;
    float factorB = std::sin(t * theta) / sinTheta;
    return (*this * factorA) + (v * factorB);
}

// ============ Mat3 ============
Mat3::Mat3() { std::memset(data, 0, sizeof(data)); }

Mat3::Mat3(float diagonal) {
    std::memset(data, 0, sizeof(data));
    data[0] = data[4] = data[8] = diagonal;
}

Mat3 Mat3::operator*(const Mat3& m) const {
    Mat3 result;
    for (int row = 0; row < 3; row++) {
        for (int col = 0; col < 3; col++) {
            float sum = 0;
            for (int k = 0; k < 3; k++) {
                sum += (*this)(row, k) * m(k, col);
            }
            result(row, col) = sum;
        }
    }
    return result;
}

Mat3 Mat3::operator*(float s) const {
    Mat3 result;
    for (int i = 0; i < 9; i++) result.data[i] = data[i] * s;
    return result;
}

Vec3 Mat3::operator*(const Vec3& v) const {
    return Vec3(
        data[0]*v.x + data[3]*v.y + data[6]*v.z,
        data[1]*v.x + data[4]*v.y + data[7]*v.z,
        data[2]*v.x + data[5]*v.y + data[8]*v.z
    );
}

Mat3 Mat3::transposed() const {
    Mat3 result;
    for (int row = 0; row < 3; row++)
        for (int col = 0; col < 3; col++)
            result(row, col) = (*this)(col, row);
    return result;
}

float Mat3::determinant() const {
    return data[0] * (data[4]*data[8] - data[5]*data[7])
         - data[3] * (data[1]*data[8] - data[2]*data[7])
         + data[6] * (data[1]*data[5] - data[2]*data[4]);
}

Mat3 Mat3::inverse() const {
    float det = determinant();
    if (std::abs(det) < EPSILON) return identity();
    float invDet = 1.0f / det;
    Mat3 result;
    result(0,0) = (data[4]*data[8] - data[5]*data[7]) * invDet;
    result(0,1) = (data[2]*data[7] - data[1]*data[8]) * invDet;
    result(0,2) = (data[1]*data[5] - data[2]*data[4]) * invDet;
    result(1,0) = (data[5]*data[6] - data[3]*data[8]) * invDet;
    result(1,1) = (data[0]*data[8] - data[2]*data[6]) * invDet;
    result(1,2) = (data[2]*data[3] - data[0]*data[5]) * invDet;
    result(2,0) = (data[3]*data[7] - data[4]*data[6]) * invDet;
    result(2,1) = (data[1]*data[6] - data[0]*data[7]) * invDet;
    result(2,2) = (data[0]*data[4] - data[1]*data[3]) * invDet;
    return result;
}

Mat3 Mat3::identity() {
    Mat3 m;
    m(0,0) = m(1,1) = m(2,2) = 1.0f;
    return m;
}

// ============ Mat4 ============
Mat4::Mat4() { std::memset(data, 0, sizeof(data)); }

Mat4::Mat4(float diagonal) {
    std::memset(data, 0, sizeof(data));
    data[0] = data[5] = data[10] = data[15] = diagonal;
}

Mat4::Mat4(const float* columnMajor) { std::memcpy(data, columnMajor, sizeof(data)); }

Mat4 Mat4::operator*(const Mat4& m) const {
    Mat4 result;
    for (int row = 0; row < 4; row++) {
        for (int col = 0; col < 4; col++) {
            float sum = 0;
            for (int k = 0; k < 4; k++) sum += (*this)(row, k) * m(k, col);
            result(row, col) = sum;
        }
    }
    return result;
}

Vec4 Mat4::operator*(const Vec4& v) const {
    return Vec4(
        data[0]*v.x + data[4]*v.y + data[8]*v.z + data[12]*v.w,
        data[1]*v.x + data[5]*v.y + data[9]*v.z + data[13]*v.w,
        data[2]*v.x + data[6]*v.y + data[10]*v.z + data[14]*v.w,
        data[3]*v.x + data[7]*v.y + data[11]*v.z + data[15]*v.w
    );
}

Mat4 Mat4::operator*(float s) const {
    Mat4 result;
    for (int i = 0; i < 16; i++) result.data[i] = data[i] * s;
    return result;
}

Mat4 Mat4::operator+(const Mat4& m) const {
    Mat4 result;
    for (int i = 0; i < 16; i++) result.data[i] = data[i] + m.data[i];
    return result;
}

Mat4 Mat4::operator-(const Mat4& m) const {
    Mat4 result;
    for (int i = 0; i < 16; i++) result.data[i] = data[i] - m.data[i];
    return result;
}

Mat4 Mat4::operator-() const {
    Mat4 result;
    for (int i = 0; i < 16; i++) result.data[i] = -data[i];
    return result;
}

Mat4& Mat4::operator*=(const Mat4& m) { *this = *this * m; return *this; }

Mat4 Mat4::transposed() const {
    Mat4 result;
    for (int row = 0; row < 4; row++)
        for (int col = 0; col < 4; col++)
            result(row, col) = (*this)(col, row);
    return result;
}

float Mat4::determinant() const {
    float det = 0;
    det = data[0] * (data[5]*(data[10]*data[15]-data[11]*data[14]) - data[6]*(data[9]*data[15]-data[11]*data[13]) + data[7]*(data[9]*data[14]-data[10]*data[13]));
    det -= data[4] * (data[1]*(data[10]*data[15]-data[11]*data[14]) - data[2]*(data[9]*data[15]-data[11]*data[13]) + data[3]*(data[9]*data[14]-data[10]*data[13]));
    det += data[8] * (data[1]*(data[6]*data[15]-data[7]*data[14]) - data[2]*(data[5]*data[15]-data[7]*data[13]) + data[3]*(data[5]*data[14]-data[6]*data[13]));
    det -= data[12] * (data[1]*(data[6]*data[11]-data[7]*data[10]) - data[2]*(data[5]*data[11]-data[7]*data[9]) + data[3]*(data[5]*data[10]-data[6]*data[9]));
    return det;
}

Mat4 Mat4::inverse() const {
    float det = determinant();
    if (std::abs(det) < EPSILON) return identity();
    Mat4 inv;
    float invDet = 1.0f / det;
    inv.data[0] = (data[5]*(data[10]*data[15]-data[11]*data[14]) - data[6]*(data[9]*data[15]-data[11]*data[13]) + data[7]*(data[9]*data[14]-data[10]*data[13])) * invDet;
    inv.data[1] = -(data[1]*(data[10]*data[15]-data[11]*data[14]) - data[2]*(data[9]*data[15]-data[11]*data[13]) + data[3]*(data[9]*data[14]-data[10]*data[13])) * invDet;
    inv.data[2] = (data[1]*(data[6]*data[15]-data[7]*data[14]) - data[2]*(data[5]*data[15]-data[7]*data[13]) + data[3]*(data[5]*data[14]-data[6]*data[13])) * invDet;
    inv.data[3] = -(data[1]*(data[6]*data[11]-data[7]*data[10]) - data[2]*(data[5]*data[11]-data[7]*data[9]) + data[3]*(data[5]*data[10]-data[6]*data[9])) * invDet;
    inv.data[4] = -(data[4]*(data[10]*data[15]-data[11]*data[14]) - data[6]*(data[8]*data[15]-data[11]*data[12]) + data[7]*(data[8]*data[14]-data[10]*data[12])) * invDet;
    inv.data[5] = (data[0]*(data[10]*data[15]-data[11]*data[14]) - data[2]*(data[8]*data[15]-data[11]*data[12]) + data[3]*(data[8]*data[14]-data[10]*data[12])) * invDet;
    inv.data[6] = -(data[0]*(data[6]*data[15]-data[7]*data[14]) - data[2]*(data[4]*data[15]-data[7]*data[12]) + data[3]*(data[4]*data[14]-data[6]*data[12])) * invDet;
    inv.data[7] = (data[0]*(data[6]*data[11]-data[7]*data[10]) - data[2]*(data[4]*data[11]-data[7]*data[8]) + data[3]*(data[4]*data[10]-data[6]*data[8])) * invDet;
    inv.data[8] = (data[4]*(data[9]*data[15]-data[11]*data[13]) - data[5]*(data[8]*data[15]-data[11]*data[12]) + data[7]*(data[8]*data[13]-data[9]*data[12])) * invDet;
    inv.data[9] = -(data[0]*(data[9]*data[15]-data[11]*data[13]) - data[1]*(data[8]*data[15]-data[11]*data[12]) + data[3]*(data[8]*data[13]-data[9]*data[12])) * invDet;
    inv.data[10] = (data[0]*(data[5]*data[15]-data[7]*data[13]) - data[1]*(data[4]*data[15]-data[7]*data[12]) + data[3]*(data[4]*data[13]-data[5]*data[12])) * invDet;
    inv.data[11] = -(data[0]*(data[5]*data[11]-data[7]*data[9]) - data[1]*(data[4]*data[11]-data[7]*data[8]) + data[3]*(data[4]*data[9]-data[5]*data[8])) * invDet;
    inv.data[12] = (data[4]*(data[9]*data[14]-data[10]*data[13]) - data[5]*(data[8]*data[14]-data[10]*data[12]) + data[6]*(data[8]*data[13]-data[9]*data[12])) * invDet;
    inv.data[13] = -(data[0]*(data[9]*data[14]-data[10]*data[13]) - data[1]*(data[8]*data[14]-data[10]*data[12]) + data[2]*(data[8]*data[13]-data[9]*data[12])) * invDet;
    inv.data[14] = -(data[0]*(data[5]*data[14]-data[6]*data[13]) - data[1]*(data[4]*data[14]-data[6]*data[12]) + data[2]*(data[4]*data[13]-data[5]*data[12])) * invDet;
    inv.data[15] = (data[0]*(data[5]*data[10]-data[6]*data[9]) - data[1]*(data[4]*data[10]-data[6]*data[8]) + data[2]*(data[4]*data[9]-data[5]*data[8])) * invDet;
    return inv;
}

Mat4 Mat4::identity() {
    Mat4 m;
    m(0,0) = m(1,1) = m(2,2) = m(3,3) = 1.0f;
    return m;
}

Mat4 Mat4::translate(const Vec3& position) {
    Mat4 m = identity();
    m(0, 3) = position.x; m(1, 3) = position.y; m(2, 3) = position.z;
    return m;
}

Mat4 Mat4::rotate(float angle, const Vec3& axis) {
    Vec3 a = axis.normalized();
    float c = std::cos(degToRad(angle));
    float s = std::sin(degToRad(angle));
    float t = 1.0f - c;
    Mat4 m = identity();
    m(0,0) = t*a.x*a.x + c;       m(0,1) = t*a.x*a.y - s*a.z; m(0,2) = t*a.x*a.z + s*a.y;
    m(1,0) = t*a.x*a.y + s*a.z;   m(1,1) = t*a.y*a.y + c;     m(1,2) = t*a.y*a.z - s*a.x;
    m(2,0) = t*a.x*a.z - s*a.y;   m(2,1) = t*a.y*a.z + s*a.x; m(2,2) = t*a.z*a.z + c;
    return m;
}

Mat4 Mat4::rotateX(float angle) {
    float c = std::cos(degToRad(angle)); float s = std::sin(degToRad(angle));
    Mat4 m = identity(); m(1,1) = c; m(1,2) = -s; m(2,1) = s; m(2,2) = c;
    return m;
}

Mat4 Mat4::rotateY(float angle) {
    float c = std::cos(degToRad(angle)); float s = std::sin(degToRad(angle));
    Mat4 m = identity(); m(0,0) = c; m(0,2) = s; m(2,0) = -s; m(2,2) = c;
    return m;
}

Mat4 Mat4::rotateZ(float angle) {
    float c = std::cos(degToRad(angle)); float s = std::sin(degToRad(angle));
    Mat4 m = identity(); m(0,0) = c; m(0,1) = -s; m(1,0) = s; m(1,1) = c;
    return m;
}

Mat4 Mat4::scale(const Vec3& scale) {
    Mat4 m;
    m(0,0) = scale.x; m(1,1) = scale.y; m(2,2) = scale.z; m(3,3) = 1.0f;
    return m;
}

Mat4 Mat4::lookAt(const Vec3& eye, const Vec3& center, const Vec3& up) {
    Vec3 f = (center - eye).normalized();
    Vec3 s = f.cross(up).normalized();
    Vec3 u = s.cross(f);
    Mat4 m = identity();
    m(0,0) = s.x;  m(0,1) = s.y;  m(0,2) = s.z;
    m(1,0) = u.x;  m(1,1) = u.y;  m(1,2) = u.z;
    m(2,0) = -f.x; m(2,1) = -f.y; m(2,2) = -f.z;
    m(0,3) = -s.dot(eye); m(1,3) = -u.dot(eye); m(2,3) = f.dot(eye);
    return m;
}

Mat4 Mat4::perspective(float fovY, float aspect, float zNear, float zFar) {
    float tanHalfFov = std::tan(degToRad(fovY) / 2.0f);
    Mat4 m;
    m(0,0) = 1.0f / (aspect * tanHalfFov);
    m(1,1) = 1.0f / tanHalfFov;
    m(2,2) = -(zFar + zNear) / (zFar - zNear);
    m(2,3) = -(2.0f * zFar * zNear) / (zFar - zNear);
    m(3,2) = -1.0f;
    return m;
}

Mat4 Mat4::orthographic(float left, float right, float bottom, float top, float zNear, float zFar) {
    Mat4 m;
    m(0,0) = 2.0f / (right - left);
    m(1,1) = 2.0f / (top - bottom);
    m(2,2) = -2.0f / (zFar - zNear);
    m(0,3) = -(right + left) / (right - left);
    m(1,3) = -(top + bottom) / (top - bottom);
    m(2,3) = -(zFar + zNear) / (zFar - zNear);
    m(3,3) = 1.0f;
    return m;
}

Mat4 Mat4::viewport(int x, int y, int width, int height) {
    Mat4 m = identity();
    m(0,0) = width / 2.0f; m(1,1) = height / 2.0f; m(2,2) = 0.5f;
    m(0,3) = x + width / 2.0f; m(1,3) = y + height / 2.0f; m(2,3) = 0.5f;
    return m;
}

// ============ Quaternion ============
Quaternion::Quaternion(const Vec3& axis, float angle) {
    float halfAngle = degToRad(angle) * 0.5f;
    float s = std::sin(halfAngle);
    Vec3 a = axis.normalized();
    x = a.x * s; y = a.y * s; z = a.z * s; w = std::cos(halfAngle);
}

Quaternion::Quaternion(const Vec3& euler) {
    float pitch = degToRad(euler.x) * 0.5f;
    float yaw = degToRad(euler.y) * 0.5f;
    float roll = degToRad(euler.z) * 0.5f;
    float cp = std::cos(pitch), sp = std::sin(pitch);
    float cy = std::cos(yaw), sy = std::sin(yaw);
    float cr = std::cos(roll), sr = std::sin(roll);
    w = cp*cy*cr + sp*sy*sr; x = sp*cy*cr - cp*sy*sr;
    y = cp*sy*cr + sp*cy*sr; z = cp*cy*sr - sp*sy*cr;
}

Quaternion::Quaternion(const Mat4& m) {
    float trace = m(0,0) + m(1,1) + m(2,2);
    if (trace > 0) {
        float s = 0.5f / std::sqrt(trace + 1.0f);
        w = 0.25f / s; x = (m(2,1)-m(1,2))*s; y = (m(0,2)-m(2,0))*s; z = (m(1,0)-m(0,1))*s;
    } else if (m(0,0) > m(1,1) && m(0,0) > m(2,2)) {
        float s = 2.0f * std::sqrt(1.0f + m(0,0) - m(1,1) - m(2,2));
        w = (m(2,1)-m(1,2))/s; x = 0.25f*s; y = (m(0,1)+m(1,0))/s; z = (m(0,2)+m(2,0))/s;
    } else if (m(1,1) > m(2,2)) {
        float s = 2.0f * std::sqrt(1.0f + m(1,1) - m(0,0) - m(2,2));
        w = (m(0,2)-m(2,0))/s; x = (m(0,1)+m(1,0))/s; y = 0.25f*s; z = (m(1,2)+m(2,1))/s;
    } else {
        float s = 2.0f * std::sqrt(1.0f + m(2,2) - m(0,0) - m(1,1));
        w = (m(1,0)-m(0,1))/s; x = (m(0,2)+m(2,0))/s; y = (m(1,2)+m(2,1))/s; z = 0.25f*s;
    }
}

Quaternion Quaternion::operator*(const Quaternion& q) const {
    return Quaternion(w*q.x+x*q.w+y*q.z-z*q.y, w*q.y-x*q.z+y*q.w+z*q.x,
                      w*q.z+x*q.y-y*q.x+z*q.w, w*q.w-x*q.x-y*q.y-z*q.z);
}

Quaternion Quaternion::normalized() const {
    float len = std::sqrt(x*x+y*y+z*z+w*w);
    if (len < EPSILON) return identity();
    return Quaternion(x/len, y/len, z/len, w/len);
}

Vec3 Quaternion::rotate(const Vec3& v) const {
    Quaternion qv(v.x, v.y, v.z, 0.0f);
    Quaternion result = (*this) * qv * conjugate();
    return Vec3(result.x, result.y, result.z);
}Vec3 Quaternion::toEuler() const {
    // Convert to rotation matrix first, then extract euler angles
    // This avoids convention mismatches between construction and extraction
    Mat4 m = toMat4();
    // Use matrix element directly - avoids any sign convention ambiguity
    // m(1,2) = 2*(y*z - w*x) = -sin(pitch)
    float sinp = -m(1, 2);
    float pitch = std::abs(sinp) >= 1.0f ? std::copysign(HALF_PI, sinp) : std::asin(sinp);
    float yaw, roll;
    if (std::abs(sinp) >= 0.9999f) {
        // Gimbal lock: yaw and roll are coupled
        if (sinp > 0) {
            yaw = std::atan2(m(0, 1), m(0, 0));
        } else {
            yaw = std::atan2(-m(0, 1), m(0, 0));
        }
        roll = 0.0f;
    } else {
        yaw = std::atan2(m(0, 2), m(2, 2));
        roll = std::atan2(m(1, 0), m(1, 1));
    }
    return Vec3(radToDeg(pitch), radToDeg(yaw), radToDeg(roll));
}

Mat4 Quaternion::toMat4() const {
    float xx = x*x, yy = y*y, zz = z*z, xy = x*y, xz = x*z, yz = y*z, wx = w*x, wy = w*y, wz = w*z;
    Mat4 m = Mat4::identity();
    m(0,0) = 1-2*(yy+zz); m(0,1) = 2*(xy-wz);     m(0,2) = 2*(xz+wy);
    m(1,0) = 2*(xy+wz);   m(1,1) = 1-2*(xx+zz);    m(1,2) = 2*(yz-wx);
    m(2,0) = 2*(xz-wy);   m(2,1) = 2*(yz+wx);      m(2,2) = 1-2*(xx+yy);
    return m;
}

Quaternion Quaternion::slerp(const Quaternion& q, float t) const {
    float d = this->dot(q);
    Quaternion target = (d < 0.0f) ? -q : q;
    if (d < 0.0f) d = -d;
    if (d > 0.9995f) return (*this) + (target - *this) * t;
    float theta0 = std::acos(d);
    float theta = theta0 * t;
    float sinTheta0 = std::sin(theta0);
    float sinTheta = std::sin(theta);
    float s0 = std::cos(theta) - d * sinTheta / sinTheta0;
    float s1 = sinTheta / sinTheta0;
    return (*this) * s0 + target * s1;
}

} // namespace Math
} // namespace Ember
