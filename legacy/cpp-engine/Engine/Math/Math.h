#pragma once

#include <cmath>
#include <cstring>
#include <iostream>

namespace Ember {
namespace Math {

constexpr float PI = 3.14159265358979323846f;
constexpr float TWO_PI = 2.0f * PI;
constexpr float HALF_PI = PI / 2.0f;
constexpr float EPSILON = 1e-6f;

// ============ Vec2 ============
struct Vec2 {
    float x = 0.0f, y = 0.0f;
    Vec2() = default;
    Vec2(float x, float y) : x(x), y(y) {}
    explicit Vec2(float scalar) : x(scalar), y(scalar) {}
    Vec2 operator+(const Vec2& v) const { return {x + v.x, y + v.y}; }
    Vec2 operator-(const Vec2& v) const { return {x - v.x, y - v.y}; }
    Vec2 operator*(float s) const { return {x * s, y * s}; }
    Vec2 operator/(float s) const { return {x / s, y / s}; }
    Vec2 operator-() const { return {-x, -y}; }
    Vec2& operator+=(const Vec2& v) { x += v.x; y += v.y; return *this; }
    Vec2& operator-=(const Vec2& v) { x -= v.x; y -= v.y; return *this; }
    Vec2& operator*=(float s) { x *= s; y *= s; return *this; }
    Vec2& operator/=(float s) { x /= s; y /= s; return *this; }
    bool operator==(const Vec2& v) const { return std::abs(x - v.x) < EPSILON && std::abs(y - v.y) < EPSILON; }
    bool operator!=(const Vec2& v) const { return !(*this == v); }
    float length() const { return std::sqrt(x * x + y * y); }
    float lengthSquared() const { return x * x + y * y; }
    Vec2 normalized() const { float l = length(); return l > EPSILON ? *this / l : Vec2(0.0f); }
    float dot(const Vec2& v) const { return x * v.x + y * v.y; }
    float cross(const Vec2& v) const { return x * v.y - y * v.x; }
    Vec2 lerp(const Vec2& v, float t) const { return *this + (v - *this) * t; }
    Vec2 min(const Vec2& v) const { return {std::min(x, v.x), std::min(y, v.y)}; }
    Vec2 max(const Vec2& v) const { return {std::max(x, v.x), std::max(y, v.y)}; }
    Vec2 clamp(const Vec2& mn, const Vec2& mx) const { return this->max(mn).min(mx); }
    static Vec2 zero() { return {0.0f, 0.0f}; }
    static Vec2 one() { return {1.0f, 1.0f}; }
    static Vec2 up() { return {0.0f, 1.0f}; }
    static Vec2 down() { return {0.0f, -1.0f}; }
    static Vec2 left() { return {-1.0f, 0.0f}; }
    static Vec2 right() { return {1.0f, 0.0f}; }
    friend std::ostream& operator<<(std::ostream& os, const Vec2& v) {
        os << "Vec2(" << v.x << ", " << v.y << ")";
        return os;
    }
};

// ============ Vec3 ============
struct Vec3 {
    float x = 0.0f, y = 0.0f, z = 0.0f;
    Vec3() = default;
    Vec3(float x, float y, float z) : x(x), y(y), z(z) {}
    explicit Vec3(float scalar) : x(scalar), y(scalar), z(scalar) {}
    Vec3 operator+(const Vec3& v) const { return {x + v.x, y + v.y, z + v.z}; }
    Vec3 operator-(const Vec3& v) const { return {x - v.x, y - v.y, z - v.z}; }
    Vec3 operator*(float s) const { return {x * s, y * s, z * s}; }
    Vec3 operator/(float s) const { return {x / s, y / s, z / s}; }
    Vec3 operator*(const Vec3& v) const { return {x * v.x, y * v.y, z * v.z}; }
    Vec3 operator-() const { return {-x, -y, -z}; }
    Vec3& operator+=(const Vec3& v) { x += v.x; y += v.y; z += v.z; return *this; }
    Vec3& operator-=(const Vec3& v) { x -= v.x; y -= v.y; z -= v.z; return *this; }
    Vec3& operator*=(float s) { x *= s; y *= s; z *= s; return *this; }
    Vec3& operator/=(float s) { x /= s; y /= s; z /= s; return *this; }
    bool operator==(const Vec3& v) const { return std::abs(x - v.x) < EPSILON && std::abs(y - v.y) < EPSILON && std::abs(z - v.z) < EPSILON; }
    bool operator!=(const Vec3& v) const { return !(*this == v); }
    float length() const { return std::sqrt(x * x + y * y + z * z); }
    float lengthSquared() const { return x * x + y * y + z * z; }
    Vec3 normalized() const { float l = length(); return l > EPSILON ? *this / l : Vec3(0.0f); }
    float dot(const Vec3& v) const { return x * v.x + y * v.y + z * v.z; }
    Vec3 cross(const Vec3& v) const { return {y * v.z - z * v.y, z * v.x - x * v.z, x * v.y - y * v.x}; }
    Vec3 lerp(const Vec3& v, float t) const { return *this + (v - *this) * t; }
    Vec3 slerp(const Vec3& v, float t) const;
    Vec3 min(const Vec3& v) const { return {std::min(x, v.x), std::min(y, v.y), std::min(z, v.z)}; }
    Vec3 max(const Vec3& v) const { return {std::max(x, v.x), std::max(y, v.y), std::max(z, v.z)}; }
    Vec3 clamp(const Vec3& mn, const Vec3& mx) const { return this->max(mn).min(mx); }
    Vec3 reflect(const Vec3& normal) const { return *this - normal * (2.0f * dot(normal)); }
    Vec3 project(const Vec3& onto) const { return onto * (dot(onto) / onto.dot(onto)); }
    float distanceTo(const Vec3& v) const { return (*this - v).length(); }
    static Vec3 zero() { return {0.0f, 0.0f, 0.0f}; }
    static Vec3 one() { return {1.0f, 1.0f, 1.0f}; }
    static Vec3 up() { return {0.0f, 1.0f, 0.0f}; }
    static Vec3 down() { return {0.0f, -1.0f, 0.0f}; }
    static Vec3 left() { return {-1.0f, 0.0f, 0.0f}; }
    static Vec3 right() { return {1.0f, 0.0f, 0.0f}; }
    static Vec3 forward() { return {0.0f, 0.0f, -1.0f}; }
    static Vec3 back() { return {0.0f, 0.0f, 1.0f}; }
    friend std::ostream& operator<<(std::ostream& os, const Vec3& v) {
        os << "Vec3(" << v.x << ", " << v.y << ", " << v.z << ")";
        return os;
    }
};

// ============ Vec4 ============
struct Vec4 {
    float x = 0.0f, y = 0.0f, z = 0.0f, w = 0.0f;
    Vec4() = default;
    Vec4(float x, float y, float z, float w) : x(x), y(y), z(z), w(w) {}
    explicit Vec4(float scalar) : x(scalar), y(scalar), z(scalar), w(scalar) {}
    Vec4(const Vec3& v, float w) : x(v.x), y(v.y), z(v.z), w(w) {}
    Vec3 xyz() const { return {x, y, z}; }
    Vec2 xy() const { return {x, y}; }
    Vec4 operator+(const Vec4& v) const { return {x + v.x, y + v.y, z + v.z, w + v.w}; }
    Vec4 operator-(const Vec4& v) const { return {x - v.x, y - v.y, z - v.z, w - v.w}; }
    Vec4 operator*(float s) const { return {x * s, y * s, z * s, w * s}; }
    Vec4 operator/(float s) const { return {x / s, y / s, z / s, w / s}; }
    Vec4 operator-() const { return {-x, -y, -z, -w}; }
    float& operator[](int i) { return (&x)[i]; }
    const float& operator[](int i) const { return (&x)[i]; }
    float length() const { return std::sqrt(x * x + y * y + z * z + w * w); }
    float dot(const Vec4& v) const { return x * v.x + y * v.y + z * v.z + w * v.w; }
    friend std::ostream& operator<<(std::ostream& os, const Vec4& v) {
        os << "Vec4(" << v.x << ", " << v.y << ", " << v.z << ", " << v.w << ")";
        return os;
    }
};

// ============ Mat3 ============
struct Mat3 {
    float data[9]; // column-major

    Mat3();
    Mat3(float diagonal);

    float& operator()(int row, int col) { return data[col * 3 + row]; }
    const float& operator()(int row, int col) const { return data[col * 3 + row]; }

    Mat3 operator*(const Mat3& m) const;
    Mat3 operator*(float s) const;
    Vec3 operator*(const Vec3& v) const;

    Mat3 transposed() const;
    float determinant() const;
    Mat3 inverse() const;
    const float* ptr() const { return data; }

    static Mat3 identity();

    friend std::ostream& operator<<(std::ostream& os, const Mat3& m) {
        os << "Mat3[\n";
        for (int r = 0; r < 3; r++) {
            os << "  ";
            for (int c = 0; c < 3; c++) {
                os << m(r, c) << " ";
            }
            os << "\n";
        }
        os << "]";
        return os;
    }
};

// ============ Mat4 ============
struct Mat4 {
    float data[16]; // column-major

    Mat4();
    Mat4(float diagonal);
    Mat4(const float* columnMajor);

    float& operator()(int row, int col) { return data[col * 4 + row]; }
    const float& operator()(int row, int col) const { return data[col * 4 + row]; }

    Mat4 operator*(const Mat4& m) const;
    Vec4 operator*(const Vec4& v) const;
    Mat4 operator*(float s) const;
    Mat4 operator+(const Mat4& m) const;
    Mat4 operator-(const Mat4& m) const;
    Mat4 operator-() const;
    Mat4& operator*=(const Mat4& m);

    Mat4 transposed() const;
    float determinant() const;
    Mat4 inverse() const;

    const float* ptr() const { return data; }

    // Transformations
    static Mat4 identity();
    static Mat4 translate(const Vec3& position);
    static Mat4 rotate(float angle, const Vec3& axis);
    static Mat4 rotateX(float angle);
    static Mat4 rotateY(float angle);
    static Mat4 rotateZ(float angle);
    static Mat4 scale(const Vec3& scale);
    static Mat4 lookAt(const Vec3& eye, const Vec3& center, const Vec3& up);
    static Mat4 perspective(float fovY, float aspect, float zNear, float zFar);
    static Mat4 orthographic(float left, float right, float bottom, float top, float zNear, float zFar);
    static Mat4 viewport(int x, int y, int width, int height);

    friend std::ostream& operator<<(std::ostream& os, const Mat4& m) {
        os << "Mat4[\n";
        for (int r = 0; r < 4; r++) {
            os << "  ";
            for (int c = 0; c < 4; c++) {
                os << m(r, c) << " ";
            }
            os << "\n";
        }
        os << "]";
        return os;
    }
};

// ============ Quaternion ============
struct Quaternion {
    float x = 0.0f, y = 0.0f, z = 0.0f, w = 1.0f;

    Quaternion() = default;
    Quaternion(float x, float y, float z, float w) : x(x), y(y), z(z), w(w) {}
    Quaternion(const Vec3& axis, float angle);
    Quaternion(const Vec3& euler);
    Quaternion(const Mat4& m);

    Quaternion operator*(const Quaternion& q) const;
    Quaternion operator*(float s) const { return {x * s, y * s, z * s, w * s}; }
    Quaternion operator-() const { return {-x, -y, -z, -w}; }
    Quaternion operator+(const Quaternion& q) const { return {x + q.x, y + q.y, z + q.z, w + q.w}; }
    Quaternion operator-(const Quaternion& q) const { return {x - q.x, y - q.y, z - q.z, w - q.w}; }

    Quaternion normalized() const;
    Quaternion conjugate() const { return {-x, -y, -z, w}; }
    Quaternion inverse() const { return conjugate(); }
    float dot(const Quaternion& q) const { return x * q.x + y * q.y + z * q.z + w * q.w; }

    Vec3 rotate(const Vec3& v) const;
    Vec3 toEuler() const;
    Mat4 toMat4() const;

    Quaternion slerp(const Quaternion& q, float t) const;

    static Quaternion identity() { return {0.0f, 0.0f, 0.0f, 1.0f}; }

    friend std::ostream& operator<<(std::ostream& os, const Quaternion& q) {
        os << "Quat(" << q.x << ", " << q.y << ", " << q.z << ", " << q.w << ")";
        return os;
    }
};

// ============ Utility Functions ============
inline float degToRad(float degrees) { return degrees * PI / 180.0f; }
inline float radToDeg(float radians) { return radians * 180.0f / PI; }
inline float clamp(float value, float mn, float mx) { return std::max(mn, std::min(mx, value)); }
inline float lerp(float a, float b, float t) { return a + (b - a) * t; }
inline float smoothstep(float edge0, float edge1, float x) {
    float t = clamp((x - edge0) / (edge1 - edge0), 0.0f, 1.0f);
    return t * t * (3.0f - 2.0f * t);
}

} // namespace Math
} // namespace Ember
