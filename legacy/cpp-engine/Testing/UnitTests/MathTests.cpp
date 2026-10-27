#include "Engine/Math/Math.h"
#include "Engine/Core/Logging.h"
#include <cassert>
#include <cmath>
#include <iostream>

using namespace Ember::Math;

void testVec3BasicOps() {
    Vec3 a(1, 2, 3); Vec3 b(4, 5, 6);
    Vec3 sum = a + b;
    assert(std::abs(sum.x - 5.0f) < EPSILON);
    assert(std::abs(sum.y - 7.0f) < EPSILON);
    assert(std::abs(sum.z - 9.0f) < EPSILON);
    Vec3 diff = b - a;
    assert(std::abs(diff.x - 3.0f) < EPSILON);
    Vec3 scaled = a * 2.0f;
    assert(std::abs(scaled.x - 2.0f) < EPSILON);
    std::cout << "  [PASS] Vec3 basic operations\n";
}

void testVec3DotProduct() {
    Vec3 a(1, 0, 0); Vec3 b(0, 1, 0);
    assert(std::abs(a.dot(b)) < EPSILON);
    Vec3 c(1, 2, 3); Vec3 d(4, 5, 6);
    assert(std::abs(c.dot(d) - 32.0f) < EPSILON);
    std::cout << "  [PASS] Vec3 dot product\n";
}

void testVec3CrossProduct() {
    Vec3 x(1, 0, 0); Vec3 y(0, 1, 0);
    Vec3 z = x.cross(y);
    assert(std::abs(z.x) < EPSILON);
    assert(std::abs(z.y) < EPSILON);
    assert(std::abs(z.z - 1.0f) < EPSILON);
    std::cout << "  [PASS] Vec3 cross product\n";
}

void testVec3Normalize() {
    Vec3 v(3, 4, 0); Vec3 n = v.normalized();
    assert(std::abs(n.length() - 1.0f) < EPSILON);
    assert(std::abs(n.x - 0.6f) < EPSILON);
    assert(std::abs(n.y - 0.8f) < EPSILON);
    std::cout << "  [PASS] Vec3 normalize\n";
}

void testVec3Lerp() {
    Vec3 a(0, 0, 0); Vec3 b(10, 10, 10);
    Vec3 mid = a.lerp(b, 0.5f);
    assert(std::abs(mid.x - 5.0f) < EPSILON);
    std::cout << "  [PASS] Vec3 lerp\n";
}

void testVec3Distance() {
    Vec3 a(0, 0, 0); Vec3 b(3, 4, 0);
    assert(std::abs(a.distanceTo(b) - 5.0f) < EPSILON);
    std::cout << "  [PASS] Vec3 distance\n";
}

void testMat4Identity() {
    Mat4 m = Mat4::identity();
    assert(std::abs(m(0,0) - 1.0f) < EPSILON);
    assert(std::abs(m(1,1) - 1.0f) < EPSILON);
    assert(std::abs(m(2,2) - 1.0f) < EPSILON);
    assert(std::abs(m(3,3) - 1.0f) < EPSILON);
    std::cout << "  [PASS] Mat4 identity\n";
}

void testMat4Multiply() {
    Mat4 a = Mat4::identity(); Mat4 b = Mat4::identity();
    Mat4 c = a * b;
    assert(std::abs(c(0,0) - 1.0f) < EPSILON);
    std::cout << "  [PASS] Mat4 multiply\n";
}

void testMat4Translate() {
    Mat4 m = Mat4::translate(Vec3(1, 2, 3));
    assert(std::abs(m(0,3) - 1.0f) < EPSILON);
    Vec4 point(0, 0, 0, 1);
    Vec4 translated = m * point;
    assert(std::abs(translated.x - 1.0f) < EPSILON);
    std::cout << "  [PASS] Mat4 translate\n";
}

void testMat4Inverse() {
    Mat4 m = Mat4::translate(Vec3(5, 10, 15));
    Mat4 inv = m.inverse();
    Mat4 result = m * inv;
    assert(std::abs(result(0,0) - 1.0f) < EPSILON);
    assert(std::abs(result(1,1) - 1.0f) < EPSILON);
    std::cout << "  [PASS] Mat4 inverse (translation)\n";
}

void testMat4InverseRotation() {
    Mat4 m = Mat4::rotate(45.0f, Vec3(0, 1, 0));
    Mat4 inv = m.inverse();
    Mat4 result = m * inv;
    for (int i = 0; i < 4; i++)
        for (int j = 0; j < 4; j++)
            assert(std::abs(result(i,j) - ((i==j)?1.0f:0.0f)) < 0.001f);
    std::cout << "  [PASS] Mat4 inverse (rotation)\n";
}

void testMat4Scale() {
    Mat4 m = Mat4::scale(Vec3(2, 3, 4));
    Vec4 point(1, 1, 1, 1);
    Vec4 scaled = m * point;
    assert(std::abs(scaled.x - 2.0f) < EPSILON);
    assert(std::abs(scaled.y - 3.0f) < EPSILON);
    assert(std::abs(scaled.z - 4.0f) < EPSILON);
    std::cout << "  [PASS] Mat4 scale\n";
}

void testMat4Perspective() {
    Mat4 p = Mat4::perspective(45.0f, 16.0f / 9.0f, 0.1f, 100.0f);
    assert(std::abs(p(3,2) + 1.0f) < EPSILON);
    assert(p(2,2) < 0.0f);
    std::cout << "  [PASS] Mat4 perspective\n";
}

void testQuaternionIdentity() {
    Quaternion q = Quaternion::identity();
    assert(std::abs(q.x) < EPSILON);
    assert(std::abs(q.w - 1.0f) < EPSILON);
    std::cout << "  [PASS] Quaternion identity\n";
}

void testQuaternionMultiply() {
    Quaternion q1 = Quaternion::identity(); Quaternion q2 = Quaternion::identity();
    Quaternion result = q1 * q2;
    assert(std::abs(result.w - 1.0f) < EPSILON);
    std::cout << "  [PASS] Quaternion multiply\n";
}

void testQuaternionRotate() {
    Quaternion q(Vec3(0, 1, 0), 90.0f);
    Vec3 forward(0, 0, -1);
    Vec3 rotated = q.rotate(forward);
    assert(std::abs(rotated.x - (-1.0f)) < 0.01f);
    assert(std::abs(rotated.y) < 0.01f);
    assert(std::abs(rotated.z) < 0.01f);
    std::cout << "  [PASS] Quaternion rotate\n";
}

void testQuaternionToEuler() {
    Quaternion q(Vec3(0, 90.0f, 0));
    Vec3 euler = q.toEuler();
    assert(std::abs(euler.y - 90.0f) < 1.0f);
    std::cout << "  [PASS] Quaternion toEuler\n";
}

void testQuaternionSlerp() {
    Quaternion q1 = Quaternion::identity();
    Quaternion q2(Vec3(0, 1, 0), 90.0f);
    Quaternion mid = q1.slerp(q2, 0.5f);
    Vec3 euler = mid.toEuler();
    assert(std::abs(euler.y - 45.0f) < 5.0f);
    std::cout << "  [PASS] Quaternion slerp\n";
}

void testMat3Inverse() {
    Mat3 m = Mat3::identity();
    Mat3 inv = m.inverse();
    Mat3 result = m * inv;
    assert(std::abs(result(0,0) - 1.0f) < EPSILON);
    assert(std::abs(result(1,1) - 1.0f) < EPSILON);
    assert(std::abs(result(2,2) - 1.0f) < EPSILON);
    std::cout << "  [PASS] Mat3 inverse\n";
}

void testUtilityFunctions() {
    assert(std::abs(degToRad(180.0f) - PI) < EPSILON);
    assert(std::abs(radToDeg(PI) - 180.0f) < EPSILON);
    assert(std::abs(clamp(5.0f, 0.0f, 3.0f) - 3.0f) < EPSILON);
    assert(std::abs(lerp(0.0f, 10.0f, 0.5f) - 5.0f) < EPSILON);
    std::cout << "  [PASS] Utility functions\n";
}

int main() {
    Ember::Logger::get().init("math_test.log");

    std::cout << "========================================\n";
    std::cout << "  EmberEngine Math Unit Tests\n";
    std::cout << "========================================\n\n";

    std::cout << "Vec3 Tests:\n";
    testVec3BasicOps();
    testVec3DotProduct();
    testVec3CrossProduct();
    testVec3Normalize();
    testVec3Lerp();
    testVec3Distance();

    std::cout << "\nMat4 Tests:\n";
    testMat4Identity();
    testMat4Multiply();
    testMat4Translate();
    testMat4Inverse();
    testMat4InverseRotation();
    testMat4Scale();
    testMat4Perspective();

    std::cout << "\nMat3 Tests:\n";
    testMat3Inverse();

    std::cout << "\nQuaternion Tests:\n";
    testQuaternionIdentity();
    testQuaternionMultiply();
    testQuaternionRotate();
    testQuaternionToEuler();
    testQuaternionSlerp();

    std::cout << "\nUtility Tests:\n";
    testUtilityFunctions();

    std::cout << "\n========================================\n";
    std::cout << "  All Math tests PASSED!\n";
    std::cout << "========================================\n";

    return 0;
}
