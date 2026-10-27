#pragma once

#include "Engine/Math/Math.h"
#include <vector>
#include <cstdint>
#include <string>
#include <memory>

namespace Ember {

struct Vertex {
    Math::Vec3 position;
    Math::Vec3 normal;
    Math::Vec2 texCoords;
    Math::Vec4 color;
    Math::Vec3 tangent;
    Math::Vec3 bitangent;
};

enum class PrimitiveType { Triangles, TriangleStrip, TriangleFan, Lines, LineStrip, Points };

class Mesh {
public:
    Mesh() = default;
    ~Mesh();

    void setData(const std::vector<Vertex>& vertices, const std::vector<uint32_t>& indices);
    void setVertices(const std::vector<Vertex>& vertices);
    void setIndices(const std::vector<uint32_t>& indices);
    void clear();
    void bind() const;
    void unbind() const;
    void draw() const;
    void drawIndexed(uint32_t indexCount = 0) const;

    const std::vector<Vertex>& getVertices() const { return m_vertices; }
    const std::vector<uint32_t>& getIndices() const { return m_indices; }
    uint32_t getVertexCount() const { return static_cast<uint32_t>(m_vertices.size()); }
    uint32_t getIndexCount() const { return static_cast<uint32_t>(m_indices.size()); }
    uint32_t getTriangleCount() const { return getIndexCount() / 3; }
    bool isLoaded() const { return m_loaded; }
    uint32_t getVAO() const { return m_vao; }
    Math::Vec3 getBoundingBoxMin() const { return m_bboxMin; }
    Math::Vec3 getBoundingBoxMax() const { return m_bboxMax; }
    Math::Vec3 getCenter() const { return (m_bboxMin + m_bboxMax) * 0.5f; }
    float getBoundingRadius() const { return m_boundingRadius; }
    void calculateTangents();

    static std::shared_ptr<Mesh> createQuad(float width = 1.0f, float height = 1.0f);
    static std::shared_ptr<Mesh> createCube(float size = 1.0f);
    static std::shared_ptr<Mesh> createSphere(float radius = 0.5f, int rings = 16, int sectors = 32);
    static std::shared_ptr<Mesh> createPlane(float size = 1.0f, int subdivisions = 1);
    static std::shared_ptr<Mesh> createScreenQuad();

private:
    void calculateBoundingInfo();
    std::vector<Vertex> m_vertices;
    std::vector<uint32_t> m_indices;
    uint32_t m_vao = 0, m_vbo = 0, m_ebo = 0;
    bool m_loaded = false;
    PrimitiveType m_primitiveType = PrimitiveType::Triangles;
    Math::Vec3 m_bboxMin, m_bboxMax;
    float m_boundingRadius = 0.0f;
};

} // namespace Ember
