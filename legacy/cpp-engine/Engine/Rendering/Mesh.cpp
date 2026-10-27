#include "Engine/Rendering/Mesh.h"
#include "Engine/Core/Logging.h"
#include "Engine/Rendering/GL.h"
#include <cmath>

namespace Ember {

Mesh::~Mesh() { clear(); }

void Mesh::setData(const std::vector<Vertex>& vertices, const std::vector<uint32_t>& indices) {
    m_vertices = vertices;
    m_indices = indices;
    calculateBoundingInfo();
    calculateTangents();

    // Upload to GPU
    if (m_vao == 0) glGenVertexArrays(1, &m_vao);
    if (m_vbo == 0) glGenBuffers(1, &m_vbo);
    if (m_ebo == 0) glGenBuffers(1, &m_ebo);

    glBindVertexArray(m_vao);

    glBindBuffer(GL_ARRAY_BUFFER, m_vbo);
    glBufferData(GL_ARRAY_BUFFER, m_vertices.size() * sizeof(Vertex), m_vertices.data(), GL_STATIC_DRAW);

    glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, m_ebo);
    glBufferData(GL_ELEMENT_ARRAY_BUFFER, m_indices.size() * sizeof(uint32_t), m_indices.data(), GL_STATIC_DRAW);

    // Position
    glVertexAttribPointer(0, 3, GL_FLOAT, GL_FALSE, sizeof(Vertex), (void*)offsetof(Vertex, position));
    glEnableVertexAttribArray(0);
    // Normal
    glVertexAttribPointer(1, 3, GL_FLOAT, GL_FALSE, sizeof(Vertex), (void*)offsetof(Vertex, normal));
    glEnableVertexAttribArray(1);
    // TexCoords
    glVertexAttribPointer(2, 2, GL_FLOAT, GL_FALSE, sizeof(Vertex), (void*)offsetof(Vertex, texCoords));
    glEnableVertexAttribArray(2);
    // Color
    glVertexAttribPointer(3, 4, GL_FLOAT, GL_FALSE, sizeof(Vertex), (void*)offsetof(Vertex, color));
    glEnableVertexAttribArray(3);
    // Tangent
    glVertexAttribPointer(4, 3, GL_FLOAT, GL_FALSE, sizeof(Vertex), (void*)offsetof(Vertex, tangent));
    glEnableVertexAttribArray(4);
    // Bitangent
    glVertexAttribPointer(5, 3, GL_FLOAT, GL_FALSE, sizeof(Vertex), (void*)offsetof(Vertex, bitangent));
    glEnableVertexAttribArray(5);

    glBindVertexArray(0);
    m_loaded = true;
}

void Mesh::setVertices(const std::vector<Vertex>& vertices) {
    m_vertices = vertices;
    calculateBoundingInfo();
}

void Mesh::setIndices(const std::vector<uint32_t>& indices) {
    m_indices = indices;
}

void Mesh::clear() {
    if (m_ebo) { glDeleteBuffers(1, &m_ebo); m_ebo = 0; }
    if (m_vbo) { glDeleteBuffers(1, &m_vbo); m_vbo = 0; }
    if (m_vao) { glDeleteVertexArrays(1, &m_vao); m_vao = 0; }
    m_vertices.clear();
    m_indices.clear();
    m_loaded = false;
}

void Mesh::bind() const {
    glBindVertexArray(m_vao);
}

void Mesh::unbind() const {
    glBindVertexArray(0);
}

void Mesh::draw() const {
    if (!m_loaded || m_vao == 0) return;
    glBindVertexArray(m_vao);
    glDrawElements(GL_TRIANGLES, (GLsizei)m_indices.size(), GL_UNSIGNED_INT, nullptr);
    glBindVertexArray(0);
}

void Mesh::drawIndexed(uint32_t indexCount) const {
    if (!m_loaded || m_vao == 0) return;
    glBindVertexArray(m_vao);
    uint32_t count = indexCount > 0 ? indexCount : (uint32_t)m_indices.size();
    glDrawElements(GL_TRIANGLES, count, GL_UNSIGNED_INT, nullptr);
    glBindVertexArray(0);
}

void Mesh::calculateBoundingInfo() {
    if (m_vertices.empty()) return;
    m_bboxMin = Math::Vec3(std::numeric_limits<float>::max());
    m_bboxMax = Math::Vec3(std::numeric_limits<float>::lowest());
    for (const auto& v : m_vertices) {
        m_bboxMin = m_bboxMin.min(v.position);
        m_bboxMax = m_bboxMax.max(v.position);
    }
    m_boundingRadius = (m_bboxMax - m_bboxMin).length() * 0.5f;
}

void Mesh::calculateTangents() {
    for (auto& v : m_vertices) { v.tangent = Math::Vec3::zero(); v.bitangent = Math::Vec3::zero(); }
    for (size_t i = 0; i + 2 < m_indices.size(); i += 3) {
        Vertex& v0 = m_vertices[m_indices[i]];
        Vertex& v1 = m_vertices[m_indices[i+1]];
        Vertex& v2 = m_vertices[m_indices[i+2]];
        Math::Vec3 edge1 = v1.position - v0.position;
        Math::Vec3 edge2 = v2.position - v0.position;
        Math::Vec2 dUV1 = v1.texCoords - v0.texCoords;
        Math::Vec2 dUV2 = v2.texCoords - v0.texCoords;
        float denom = dUV1.x * dUV2.y - dUV2.x * dUV1.y;
        if (std::abs(denom) < 1e-6f) continue;
        float f = 1.0f / denom;
        Math::Vec3 tangent = (edge1 * dUV2.y - edge2 * dUV1.y) * f;
        Math::Vec3 bitangent = (edge2 * dUV1.x - edge1 * dUV2.x) * f;
        v0.tangent += tangent; v0.bitangent += bitangent;
        v1.tangent += tangent; v1.bitangent += bitangent;
        v2.tangent += tangent; v2.bitangent += bitangent;
    }
    for (auto& v : m_vertices) { v.tangent = v.tangent.normalized(); v.bitangent = v.bitangent.normalized(); }
}

std::shared_ptr<Mesh> Mesh::createQuad(float width, float height) {
    auto mesh = std::make_shared<Mesh>();
    float hw = width * 0.5f, hh = height * 0.5f;
    mesh->m_vertices = {
        {{-hw,-hh,0},{0,0,1},{0,0},{1,1,1,1},{1,0,0},{0,1,0}},
        {{ hw,-hh,0},{0,0,1},{1,0},{1,1,1,1},{1,0,0},{0,1,0}},
        {{ hw, hh,0},{0,0,1},{1,1},{1,1,1,1},{1,0,0},{0,1,0}},
        {{-hw, hh,0},{0,0,1},{0,1},{1,1,1,1},{1,0,0},{0,1,0}}
    };
    mesh->m_indices = {0,1,2,2,3,0};
    mesh->calculateBoundingInfo();
    // Upload to GPU
    if (mesh->m_vao == 0) glGenVertexArrays(1, &mesh->m_vao);
    if (mesh->m_vbo == 0) glGenBuffers(1, &mesh->m_vbo);
    if (mesh->m_ebo == 0) glGenBuffers(1, &mesh->m_ebo);
    glBindVertexArray(mesh->m_vao);
    glBindBuffer(GL_ARRAY_BUFFER, mesh->m_vbo);
    glBufferData(GL_ARRAY_BUFFER, mesh->m_vertices.size() * sizeof(Vertex), mesh->m_vertices.data(), GL_STATIC_DRAW);
    glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, mesh->m_ebo);
    glBufferData(GL_ELEMENT_ARRAY_BUFFER, mesh->m_indices.size() * sizeof(uint32_t), mesh->m_indices.data(), GL_STATIC_DRAW);
    glVertexAttribPointer(0, 3, GL_FLOAT, GL_FALSE, sizeof(Vertex), (void*)offsetof(Vertex, position));
    glEnableVertexAttribArray(0);
    glVertexAttribPointer(1, 3, GL_FLOAT, GL_FALSE, sizeof(Vertex), (void*)offsetof(Vertex, normal));
    glEnableVertexAttribArray(1);
    glVertexAttribPointer(2, 2, GL_FLOAT, GL_FALSE, sizeof(Vertex), (void*)offsetof(Vertex, texCoords));
    glEnableVertexAttribArray(2);
    glVertexAttribPointer(3, 4, GL_FLOAT, GL_FALSE, sizeof(Vertex), (void*)offsetof(Vertex, color));
    glEnableVertexAttribArray(3);
    glBindVertexArray(0);
    mesh->m_loaded = true;
    return mesh;
}

std::shared_ptr<Mesh> Mesh::createCube(float size) {
    auto mesh = std::make_shared<Mesh>();
    float s = size * 0.5f;
    mesh->m_vertices = {
        {{-s,-s, s},{ 0, 0, 1},{0,0},{1,1,1,1},{1,0,0},{0,1,0}},{{ s,-s, s},{ 0, 0, 1},{1,0},{1,1,1,1},{1,0,0},{0,1,0}},{{ s, s, s},{ 0, 0, 1},{1,1},{1,1,1,1},{1,0,0},{0,1,0}},{{-s, s, s},{ 0, 0, 1},{0,1},{1,1,1,1},{1,0,0},{0,1,0}},
        {{ s,-s,-s},{ 0, 0,-1},{0,0},{1,1,1,1},{-1,0,0},{0,1,0}},{{-s,-s,-s},{ 0, 0,-1},{1,0},{1,1,1,1},{-1,0,0},{0,1,0}},{{-s, s,-s},{ 0, 0,-1},{1,1},{1,1,1,1},{-1,0,0},{0,1,0}},{{ s, s,-s},{ 0, 0,-1},{0,1},{1,1,1,1},{-1,0,0},{0,1,0}},
        {{ s,-s, s},{ 1, 0, 0},{0,0},{1,1,1,1},{0,0,1},{0,1,0}},{{ s,-s,-s},{ 1, 0, 0},{1,0},{1,1,1,1},{0,0,1},{0,1,0}},{{ s, s,-s},{ 1, 0, 0},{1,1},{1,1,1,1},{0,0,1},{0,1,0}},{{ s, s, s},{ 1, 0, 0},{0,1},{1,1,1,1},{0,0,1},{0,1,0}},
        {{-s,-s,-s},{-1, 0, 0},{0,0},{1,1,1,1},{0,0,-1},{0,1,0}},{{-s,-s, s},{-1, 0, 0},{1,0},{1,1,1,1},{0,0,-1},{0,1,0}},{{-s, s, s},{-1, 0, 0},{1,1},{1,1,1,1},{0,0,-1},{0,1,0}},{{-s, s,-s},{-1, 0, 0},{0,1},{1,1,1,1},{0,0,-1},{0,1,0}},
        {{-s, s, s},{ 0, 1, 0},{0,0},{1,1,1,1},{1,0,0},{0,0,1}},{{ s, s, s},{ 0, 1, 0},{1,0},{1,1,1,1},{1,0,0},{0,0,1}},{{ s, s,-s},{ 0, 1, 0},{1,1},{1,1,1,1},{1,0,0},{0,0,1}},{{-s, s,-s},{ 0, 1, 0},{0,1},{1,1,1,1},{1,0,0},{0,0,1}},
        {{-s,-s,-s},{ 0,-1, 0},{0,0},{1,1,1,1},{1,0,0},{0,0,-1}},{{ s,-s,-s},{ 0,-1, 0},{1,0},{1,1,1,1},{1,0,0},{0,0,-1}},{{ s,-s, s},{ 0,-1, 0},{1,1},{1,1,1,1},{1,0,0},{0,0,-1}},{{-s,-s, s},{ 0,-1, 0},{0,1},{1,1,1,1},{1,0,0},{0,0,-1}}
    };
    for (uint32_t face = 0; face < 6; face++) {
        uint32_t base = face * 4;
        mesh->m_indices.insert(mesh->m_indices.end(), {base, base+1, base+2, base+2, base+3, base});
    }
    mesh->calculateBoundingInfo();
    // Upload to GPU
    if (mesh->m_vao == 0) glGenVertexArrays(1, &mesh->m_vao);
    if (mesh->m_vbo == 0) glGenBuffers(1, &mesh->m_vbo);
    if (mesh->m_ebo == 0) glGenBuffers(1, &mesh->m_ebo);
    glBindVertexArray(mesh->m_vao);
    glBindBuffer(GL_ARRAY_BUFFER, mesh->m_vbo);
    glBufferData(GL_ARRAY_BUFFER, mesh->m_vertices.size() * sizeof(Vertex), mesh->m_vertices.data(), GL_STATIC_DRAW);
    glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, mesh->m_ebo);
    glBufferData(GL_ELEMENT_ARRAY_BUFFER, mesh->m_indices.size() * sizeof(uint32_t), mesh->m_indices.data(), GL_STATIC_DRAW);
    glVertexAttribPointer(0, 3, GL_FLOAT, GL_FALSE, sizeof(Vertex), (void*)offsetof(Vertex, position));
    glEnableVertexAttribArray(0);
    glVertexAttribPointer(1, 3, GL_FLOAT, GL_FALSE, sizeof(Vertex), (void*)offsetof(Vertex, normal));
    glEnableVertexAttribArray(1);
    glVertexAttribPointer(2, 2, GL_FLOAT, GL_FALSE, sizeof(Vertex), (void*)offsetof(Vertex, texCoords));
    glEnableVertexAttribArray(2);
    glVertexAttribPointer(3, 4, GL_FLOAT, GL_FALSE, sizeof(Vertex), (void*)offsetof(Vertex, color));
    glEnableVertexAttribArray(3);
    glBindVertexArray(0);
    mesh->m_loaded = true;
    return mesh;
}

std::shared_ptr<Mesh> Mesh::createSphere(float radius, int rings, int sectors) {
    auto mesh = std::make_shared<Mesh>();
    float const PI = 3.14159265f;
    for (int r = 0; r <= rings; r++) {
        float theta = r * PI / rings;
        float sinTheta = std::sin(theta), cosTheta = std::cos(theta);
        for (int s = 0; s <= sectors; s++) {
            float phi = s * 2.0f * PI / sectors;
            Math::Vec3 normal = {std::cos(phi) * sinTheta, cosTheta, std::sin(phi) * sinTheta};
            Vertex v;
            v.position = normal * radius;
            v.normal = normal;
            v.texCoords = {(float)s / sectors, (float)r / rings};
            v.color = {1,1,1,1};
            mesh->m_vertices.push_back(v);
        }
    }
    for (int r = 0; r < rings; r++) {
        for (int s = 0; s < sectors; s++) {
            uint32_t first = r * (sectors + 1) + s;
            uint32_t second = first + sectors + 1;
            mesh->m_indices.insert(mesh->m_indices.end(), {first, second, first+1, second, second+1, first+1});
        }
    }
    mesh->calculateBoundingInfo();
    // Upload to GPU
    if (mesh->m_vao == 0) glGenVertexArrays(1, &mesh->m_vao);
    if (mesh->m_vbo == 0) glGenBuffers(1, &mesh->m_vbo);
    if (mesh->m_ebo == 0) glGenBuffers(1, &mesh->m_ebo);
    glBindVertexArray(mesh->m_vao);
    glBindBuffer(GL_ARRAY_BUFFER, mesh->m_vbo);
    glBufferData(GL_ARRAY_BUFFER, mesh->m_vertices.size() * sizeof(Vertex), mesh->m_vertices.data(), GL_STATIC_DRAW);
    glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, mesh->m_ebo);
    glBufferData(GL_ELEMENT_ARRAY_BUFFER, mesh->m_indices.size() * sizeof(uint32_t), mesh->m_indices.data(), GL_STATIC_DRAW);
    glVertexAttribPointer(0, 3, GL_FLOAT, GL_FALSE, sizeof(Vertex), (void*)offsetof(Vertex, position));
    glEnableVertexAttribArray(0);
    glVertexAttribPointer(1, 3, GL_FLOAT, GL_FALSE, sizeof(Vertex), (void*)offsetof(Vertex, normal));
    glEnableVertexAttribArray(1);
    glVertexAttribPointer(2, 2, GL_FLOAT, GL_FALSE, sizeof(Vertex), (void*)offsetof(Vertex, texCoords));
    glEnableVertexAttribArray(2);
    glVertexAttribPointer(3, 4, GL_FLOAT, GL_FALSE, sizeof(Vertex), (void*)offsetof(Vertex, color));
    glEnableVertexAttribArray(3);
    glBindVertexArray(0);
    mesh->m_loaded = true;
    return mesh;
}

std::shared_ptr<Mesh> Mesh::createPlane(float size, int subdivisions) {
    auto mesh = std::make_shared<Mesh>();
    float s = size * 0.5f;
    float step = size / subdivisions;
    for (int z = 0; z <= subdivisions; z++) {
        for (int x = 0; x <= subdivisions; x++) {
            Vertex v;
            v.position = {-s + x * step, 0.0f, -s + z * step};
            v.normal = {0.0f, 1.0f, 0.0f};
            v.texCoords = {(float)x / subdivisions, (float)z / subdivisions};
            v.color = {1,1,1,1};
            mesh->m_vertices.push_back(v);
        }
    }
    for (int z = 0; z < subdivisions; z++) {
        for (int x = 0; x < subdivisions; x++) {
            uint32_t tl = z * (subdivisions + 1) + x;
            mesh->m_indices.insert(mesh->m_indices.end(), {tl, tl+subdivisions+1, tl+1, tl+1, tl+subdivisions+1, tl+subdivisions+2});
        }
    }
    mesh->calculateBoundingInfo();
    mesh->setData(mesh->m_vertices, mesh->m_indices);
    return mesh;
}

std::shared_ptr<Mesh> Mesh::createScreenQuad() {
    auto mesh = std::make_shared<Mesh>();
    mesh->m_vertices = {
        {{-1,-1,0},{0,0,1},{0,0},{1,1,1,1},{1,0,0},{0,1,0}},
        {{ 1,-1,0},{0,0,1},{1,0},{1,1,1,1},{1,0,0},{0,1,0}},
        {{ 1, 1,0},{0,0,1},{1,1},{1,1,1,1},{1,0,0},{0,1,0}},
        {{-1, 1,0},{0,0,1},{0,1},{1,1,1,1},{1,0,0},{0,1,0}}
    };
    mesh->m_indices = {0,1,2,2,3,0};
    mesh->calculateBoundingInfo();
    mesh->setData(mesh->m_vertices, mesh->m_indices);
    return mesh;
}

} // namespace Ember
