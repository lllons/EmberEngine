#pragma once

#include <string>
#include <vector>
#include <unordered_map>
#include <memory>
#include <functional>
#include <cstdint>

namespace Ember {

// Asset type enum
enum class AssetType {
    Unknown,
    Texture,
    Model,
    Material,
    Shader,
    Audio,
    Animation,
    Scene,
    Script,
    Font
};

// Asset handle
struct AssetHandle {
    uint64_t id = 0;
    std::string path;
    AssetType type = AssetType::Unknown;
    bool valid() const { return id != 0; }
    bool operator==(const AssetHandle& other) const { return id == other.id; }
    bool operator!=(const AssetHandle& other) const { return id != other.id; }
};

// Asset metadata
struct AssetMetadata {
    AssetHandle handle;
    std::string name;
    std::string filepath;
    AssetType type = AssetType::Unknown;
    size_t fileSize = 0;
    bool loaded = false;
    uint32_t referenceCount = 0;
    double lastAccessTime = 0.0;
};

class AssetManager {
public:
    static AssetManager& get();

    void init(const std::string& assetsDir = "Assets");
    void shutdown();

    // Load assets
    AssetHandle loadTexture(const std::string& path);
    AssetHandle loadModel(const std::string& path);
    AssetHandle loadAudio(const std::string& path);
    AssetHandle loadShader(const std::string& vertexPath, const std::string& fragmentPath);

    // Get loaded asset
    template<typename T>
    std::shared_ptr<T> getAsset(AssetHandle handle) {
        auto it = m_assets.find(handle.id);
        if (it != m_assets.end()) {
            return std::static_pointer_cast<T>(it->second);
        }
        return nullptr;
    }

    // Unload
    void unload(AssetHandle handle);
    void unloadAll();

    // Reference counting
    void retain(AssetHandle handle);
    void release(AssetHandle handle);

    // Asset metadata
    const AssetMetadata& getMetadata(AssetHandle handle) const;
    AssetHandle findByName(const std::string& name) const;
    AssetHandle findByPath(const std::string& path) const;

    // Hot reloading
    void enableHotReloading(bool enabled) { m_hotReloading = enabled; }
    bool isHotReloading() const { return m_hotReloading; }
    void checkForChanges();

    // Query all assets
    std::vector<AssetHandle> getAllAssets() const;
    std::vector<AssetHandle> getAssetsByType(AssetType type) const;

    // Statistics
    size_t getLoadedAssetCount() const { return m_metadata.size(); }
    size_t getMemoryUsage() const;

    // Directories
    void setAssetsDirectory(const std::string& dir) { m_assetsDir = dir; }
    const std::string& getAssetsDirectory() const { return m_assetsDir; }

private:
    AssetManager() = default;
    ~AssetManager() = default;

    uint64_t generateHandle();

    std::string m_assetsDir;
    bool m_initialized = false;
    bool m_hotReloading = false;
    uint64_t m_nextHandle = 1;

    std::unordered_map<uint64_t, AssetMetadata> m_metadata;
    std::unordered_map<uint64_t, std::shared_ptr<void>> m_assets;
    std::unordered_map<std::string, uint64_t> m_pathToHandle;
};

} // namespace Ember
