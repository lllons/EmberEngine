#include "Engine/AssetPipeline/AssetManager.h"
#include "Engine/Rendering/Texture.h"
#include "Engine/Rendering/Mesh.h"
#include "Engine/Rendering/Shader.h"
#include "Engine/Rendering/Material.h"
#include "Engine/Audio/Sound.h"
#include "Engine/Core/Logging.h"
#include "Engine/Core/FileSystem.h"
#include "Engine/Math/Math.h"
#include <filesystem>
#include <fstream>
#include <sstream>
#include <algorithm>
#include <unordered_map>
#include <cstring>
#include <cmath>

namespace Ember {

AssetManager& AssetManager::get() { static AssetManager instance; return instance; }

void AssetManager::init(const std::string& assetsDir) {
    m_assetsDir = assetsDir;
    m_initialized = true;
    EMBER_LOG_INFO("AssetManager initialized, assets dir: {}", assetsDir);
}

void AssetManager::shutdown() {
    unloadAll();
    m_initialized = false;
    EMBER_LOG_INFO("AssetManager shutdown");
}

uint64_t AssetManager::generateHandle() { return m_nextHandle++; }

AssetHandle AssetManager::loadTexture(const std::string& path) {
    AssetHandle handle;
    handle.id = generateHandle();
    handle.path = path;
    handle.type = AssetType::Texture;

    auto texture = std::make_shared<Texture>();
    if (texture->loadFromFile(path)) {
        m_assets[handle.id] = texture;
        m_metadata[handle.id] = {handle, std::filesystem::path(path).stem().string(), path, AssetType::Texture, 0, true, 1, 0};
        m_pathToHandle[path] = handle.id;
        EMBER_LOG_INFO("Texture asset loaded: {}", path);
    }
    return handle;
}

// ============================================================================
// OBJ Parser
// ============================================================================

// Helper: split a string by whitespace
static std::vector<std::string> splitWhitespace(const std::string& s) {
    std::vector<std::string> tokens;
    std::string token;
    std::istringstream stream(s);
    while (stream >> token) {
        tokens.push_back(token);
    }
    return tokens;
}

// Helper: split a string by a delimiter character
static std::vector<std::string> splitByChar(const std::string& s, char delim) {
    std::vector<std::string> tokens;
    std::string token;
    std::istringstream stream(s);
    while (std::getline(stream, token, delim)) {
        tokens.push_back(token);
    }
    return tokens;
}

// Helper: parse a float from a string with error handling
static float parseFloat(const std::string& s, float defaultVal = 0.0f) {
    try {
        return std::stof(s);
    } catch (...) {
        return defaultVal;
    }
}

// Helper: compute triangle normal from 3 vertices
static Math::Vec3 computeNormal(const Math::Vec3& v0, const Math::Vec3& v1, const Math::Vec3& v2) {
    Math::Vec3 e1 = v1 - v0;
    Math::Vec3 e2 = v2 - v0;
    Math::Vec3 n = e1.cross(e2);
    float len = n.length();
    return len > 1e-8f ? n / len : Math::Vec3(0.0f, 1.0f, 0.0f);
}

// Helper: parse an integer from a string with error handling
static int parseInt(const std::string& s, int defaultVal = 0) {
    try {
        return std::stoi(s);
    } catch (...) {
        return defaultVal;
    }
}

static std::shared_ptr<Mesh> parseOBJ(const std::string& path) {
    // Read file
    std::string content = FileSystem::get().readFile(path);
    if (content.empty()) {
        EMBER_LOG_ERROR("OBJ parse: empty file or failed to read: {}", path);
        return nullptr;
    }

    // Temporary data
    std::vector<Math::Vec3> positions;
    std::vector<Math::Vec3> normals;
    std::vector<Math::Vec2> texcoords;

    // Face data: each "face vertex" is a combination of position/normal/texcoord indices
    // We'll store per-face-vertex data and then resolve unique vertices
    struct FaceVertex {
        int posIdx = -1;
        int texIdx = -1;
        int normIdx = -1;
    };
    struct Face {
        std::vector<FaceVertex> vertices;
    };
    std::vector<Face> faces;
    bool hasNormals = false;
    bool hasTexcoords = false;

    std::istringstream stream(content);
    std::string line;
    int lineNum = 0;

    while (std::getline(stream, line)) {
        lineNum++;
        // Trim whitespace
        size_t start = line.find_first_not_of(" \t\r\n");
        if (start == std::string::npos) continue;
        line = line.substr(start);

        // Skip empty lines and comments
        if (line.empty() || line[0] == '#') continue;

        std::vector<std::string> tokens = splitWhitespace(line);
        if (tokens.empty()) continue;

        const std::string& keyword = tokens[0];

        if (keyword == "v" && tokens.size() >= 4) {
            // Vertex position
            float x = parseFloat(tokens[1]);
            float y = parseFloat(tokens[2]);
            float z = parseFloat(tokens[3]);
            positions.push_back(Math::Vec3(x, y, z));
        }
        else if (keyword == "vn" && tokens.size() >= 4) {
            // Vertex normal
            float x = parseFloat(tokens[1]);
            float y = parseFloat(tokens[2]);
            float z = parseFloat(tokens[3]);
            normals.push_back(Math::Vec3(x, y, z));
            hasNormals = true;
        }
        else if (keyword == "vt" && tokens.size() >= 3) {
            // Texture coordinate
            float u = parseFloat(tokens[1]);
            float v = parseFloat(tokens[2]);
            texcoords.push_back(Math::Vec2(u, v));
            hasTexcoords = true;
        }
        else if (keyword == "f") {
            // Face - need at least 3 vertices
            if (tokens.size() < 4) continue;

            Face face;
            for (size_t i = 1; i < tokens.size(); i++) {
                const std::string& vertStr = tokens[i];
                FaceVertex fv;

                // Format can be: v, v/vt, v//vn, v/vt/vn
                std::vector<std::string> parts = splitByChar(vertStr, '/');
                if (!parts.empty() && !parts[0].empty()) {
                    fv.posIdx = parseInt(parts[0]) - 1; // OBJ indices are 1-based
                }
                if (parts.size() >= 2 && !parts[1].empty()) {
                    fv.texIdx = parseInt(parts[1]) - 1;
                }
                if (parts.size() >= 3 && !parts[2].empty()) {
                    fv.normIdx = parseInt(parts[2]) - 1;
                }

                face.vertices.push_back(fv);
            }
            faces.push_back(face);
        }
        // Skip other keywords: o, g, usemtl, mtllib, s, etc.
    }

    if (positions.empty()) {
        EMBER_LOG_ERROR("OBJ parse: no vertices found in: {}", path);
        return nullptr;
    }

    if (faces.empty()) {
        EMBER_LOG_ERROR("OBJ parse: no faces found in: {}", path);
        return nullptr;
    }

    // Build mesh data from faces
    std::vector<Vertex> vertices;
    std::vector<uint32_t> indices;

    // Use a hash map to deduplicate vertices (keyed by posIdx/texIdx/normIdx)
    struct VertexKey {
        int posIdx;
        int texIdx;
        int normIdx;

        bool operator==(const VertexKey& other) const {
            return posIdx == other.posIdx && texIdx == other.texIdx && normIdx == other.normIdx;
        }
    };

    struct VertexKeyHash {
        size_t operator()(const VertexKey& key) const {
            return std::hash<int>()(key.posIdx) ^
                   (std::hash<int>()(key.texIdx) << 10) ^
                   (std::hash<int>()(key.normIdx) << 20);
        }
    };

    std::unordered_map<VertexKey, uint32_t, VertexKeyHash> vertexMap;

    // Process all faces, triangulating quads/polygons
    for (const auto& face : faces) {
        size_t numVerts = face.vertices.size();
        if (numVerts < 3) continue;

        // Triangulate: for quads, use (0,1,2) and (0,2,3); for other polygons, fan triangulation
        for (size_t tri = 0; tri < numVerts - 2; tri++) {
            int triIndices[3] = {0, (int)(tri + 1), (int)(tri + 2)};

            for (int vi = 0; vi < 3; vi++) {
                const FaceVertex& fv = face.vertices[triIndices[vi]];
                VertexKey key = {fv.posIdx, fv.texIdx, fv.normIdx};

                auto it = vertexMap.find(key);
                if (it != vertexMap.end()) {
                    indices.push_back(it->second);
                } else {
                    uint32_t newIdx = (uint32_t)vertices.size();

                    Vertex vert;
                    // Position
                    if (fv.posIdx >= 0 && fv.posIdx < (int)positions.size()) {
                        vert.position = positions[fv.posIdx];
                    } else {
                        vert.position = Math::Vec3::zero();
                    }

                    // Normal
                    if (fv.normIdx >= 0 && fv.normIdx < (int)normals.size()) {
                        vert.normal = normals[fv.normIdx];
                    } else {
                        vert.normal = Math::Vec3(0.0f, 1.0f, 0.0f);
                    }

                    // TexCoord
                    if (fv.texIdx >= 0 && fv.texIdx < (int)texcoords.size()) {
                        vert.texCoords = texcoords[fv.texIdx];
                    } else {
                        vert.texCoords = Math::Vec2(0.0f, 0.0f);
                    }

                    vert.color = Math::Vec4(1.0f, 1.0f, 1.0f, 1.0f);
                    vert.tangent = Math::Vec3(1.0f, 0.0f, 0.0f);
                    vert.bitangent = Math::Vec3(0.0f, 1.0f, 0.0f);

                    vertices.push_back(vert);
                    vertexMap[key] = newIdx;
                    indices.push_back(newIdx);
                }
            }
        }
    }

    // Compute normals if the OBJ didn't provide them
    if (!hasNormals || normals.size() < 3) {
        // Reset normals to zero
        for (auto& v : vertices) {
            v.normal = Math::Vec3::zero();
        }

        // Accumulate face normals for each vertex
        for (size_t i = 0; i < indices.size(); i += 3) {
            if (i + 2 >= indices.size()) break;
            uint32_t i0 = indices[i];
            uint32_t i1 = indices[i + 1];
            uint32_t i2 = indices[i + 2];
            Math::Vec3 faceNorm = computeNormal(
                vertices[i0].position,
                vertices[i1].position,
                vertices[i2].position);

            vertices[i0].normal = vertices[i0].normal + faceNorm;
            vertices[i1].normal = vertices[i1].normal + faceNorm;
            vertices[i2].normal = vertices[i2].normal + faceNorm;
        }

        // Normalize all normals
        for (auto& v : vertices) {
            float len = v.normal.length();
            if (len > 1e-8f) {
                v.normal = v.normal / len;
            } else {
                v.normal = Math::Vec3(0.0f, 1.0f, 0.0f);
            }
        }
    }

    if (vertices.empty()) {
        EMBER_LOG_ERROR("OBJ parse: no vertices generated from: {}", path);
        return nullptr;
    }

    // Create the mesh
    auto mesh = std::make_shared<Mesh>();
    mesh->setData(vertices, indices);

    EMBER_LOG_INFO("OBJ parsed: {} - {} vertices, {} triangles from {} faces",
        std::filesystem::path(path).filename().string(),
        vertices.size(), indices.size() / 3, faces.size());

    return mesh;
}

AssetHandle AssetManager::loadModel(const std::string& path) {
    AssetHandle handle;
    handle.id = generateHandle();
    handle.path = path;
    handle.type = AssetType::Model;

    // Parse OBJ file
    auto mesh = parseOBJ(path);

    if (mesh && mesh->isLoaded()) {
        m_assets[handle.id] = mesh;
        m_metadata[handle.id] = {handle, std::filesystem::path(path).stem().string(), path, AssetType::Model, 0, true, 1, 0};
        m_pathToHandle[path] = handle.id;
        EMBER_LOG_INFO("Model asset loaded: {}", path);
    } else {
        // Fallback: create a default sphere so the user has something visible
        EMBER_LOG_WARN("Failed to parse OBJ: {}, creating fallback mesh", path);
        mesh = Mesh::createSphere(0.5f, 16, 32);
        m_assets[handle.id] = mesh;
        m_metadata[handle.id] = {handle, std::filesystem::path(path).stem().string(), path, AssetType::Model, 0, true, 1, 0};
        m_pathToHandle[path] = handle.id;
        EMBER_LOG_INFO("Model asset loaded: {} (fallback sphere)", path);
    }

    return handle;
}

AssetHandle AssetManager::loadAudio(const std::string& path) {
    AssetHandle handle;
    handle.id = generateHandle();
    handle.path = path;
    handle.type = AssetType::Audio;

    auto sound = std::make_shared<Sound>();
    if (sound->loadFromFile(path)) {
        m_assets[handle.id] = sound;
        m_metadata[handle.id] = {handle, std::filesystem::path(path).stem().string(), path, AssetType::Audio, 0, true, 1, 0};
        m_pathToHandle[path] = handle.id;
    }
    return handle;
}

AssetHandle AssetManager::loadShader(const std::string& vertexPath, const std::string& fragmentPath) {
    AssetHandle handle;
    handle.id = generateHandle();
    handle.path = vertexPath + ";" + fragmentPath;
    handle.type = AssetType::Shader;

    auto shader = std::make_shared<Shader>();
    if (shader->loadFromFile(vertexPath, fragmentPath)) {
        m_assets[handle.id] = shader;
        m_metadata[handle.id] = {handle, std::filesystem::path(vertexPath).stem().string(), handle.path, AssetType::Shader, 0, true, 1, 0};
    }
    return handle;
}

void AssetManager::unload(AssetHandle handle) {
    if (!handle.valid()) return;
    m_assets.erase(handle.id);
    m_metadata.erase(handle.id);
}

void AssetManager::unloadAll() {
    m_assets.clear();
    m_metadata.clear();
    m_pathToHandle.clear();
}

void AssetManager::retain(AssetHandle handle) {
    if (handle.valid() && m_metadata.find(handle.id) != m_metadata.end()) {
        m_metadata[handle.id].referenceCount++;
    }
}

void AssetManager::release(AssetHandle handle) {
    if (!handle.valid()) return;
    auto it = m_metadata.find(handle.id);
    if (it != m_metadata.end()) {
        it->second.referenceCount--;
        if (it->second.referenceCount <= 0) {
            unload(handle);
        }
    }
}

const AssetMetadata& AssetManager::getMetadata(AssetHandle handle) const {
    static AssetMetadata empty;
    auto it = m_metadata.find(handle.id);
    return it != m_metadata.end() ? it->second : empty;
}

AssetHandle AssetManager::findByName(const std::string& name) const {
    for (const auto& [id, meta] : m_metadata) {
        if (meta.name == name) return meta.handle;
    }
    return {};
}

AssetHandle AssetManager::findByPath(const std::string& path) const {
    auto it = m_pathToHandle.find(path);
    return (it != m_pathToHandle.end()) ? AssetHandle{it->second, path, AssetType::Unknown} : AssetHandle{};
}

std::vector<AssetHandle> AssetManager::getAllAssets() const {
    std::vector<AssetHandle> handles;
    for (const auto& [id, meta] : m_metadata) {
        handles.push_back(meta.handle);
    }
    return handles;
}

std::vector<AssetHandle> AssetManager::getAssetsByType(AssetType type) const {
    std::vector<AssetHandle> handles;
    for (const auto& [id, meta] : m_metadata) {
        if (meta.type == type) handles.push_back(meta.handle);
    }
    return handles;
}

void AssetManager::checkForChanges() {
    if (!m_hotReloading) return;
    // Would use FileSystem watchers to detect changes
}

size_t AssetManager::getMemoryUsage() const {
    return m_assets.size() * 1024; // Placeholder
}

} // namespace Ember
