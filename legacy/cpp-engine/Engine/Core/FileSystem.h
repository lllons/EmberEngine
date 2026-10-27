#pragma once

#include <string>
#include <fstream>
#include <vector>
#include <functional>
#include <filesystem>

namespace Ember {

class FileSystem {
public:
    static FileSystem& get();

    void init(const std::string& basePath = ".");

    // Path operations
    std::string getBasePath() const { return m_basePath; }
    std::string getAbsolutePath(const std::string& relativePath) const;
    std::string getRelativePath(const std::string& absolutePath) const;
    std::string getParentPath(const std::string& path) const;
    std::string getFileName(const std::string& path) const;
    std::string getFileExtension(const std::string& path) const;
    std::string removeExtension(const std::string& path) const;

    // File operations
    bool fileExists(const std::string& path) const;
    bool directoryExists(const std::string& path) const;
    bool createDirectory(const std::string& path);
    bool createDirectories(const std::string& path); // Recursive
    bool deleteFile(const std::string& path);
    bool deleteDirectory(const std::string& path);
    bool rename(const std::string& oldPath, const std::string& newPath);
    bool copyFile(const std::string& src, const std::string& dst);

    // Read/Write
    std::string readFile(const std::string& path) const;
    std::vector<uint8_t> readBinaryFile(const std::string& path) const;
    bool writeFile(const std::string& path, const std::string& content);
    bool writeBinaryFile(const std::string& path, const std::vector<uint8_t>& data);
    bool appendToFile(const std::string& path, const std::string& content);

    // Directory listing
    std::vector<std::string> listFiles(const std::string& directory, bool recursive = false) const;
    std::vector<std::string> listDirectories(const std::string& directory) const;

    // Watch for file changes (simple implementation)
    using FileChangeCallback = std::function<void(const std::string& path)>;
    void watchFile(const std::string& path, FileChangeCallback callback);
    void unwatchFile(const std::string& path);
    void updateWatchers(); // Call each frame

    // Path separator
    static const char SEPARATOR;
    static const char SEPARATOR_STR[];

private:
    FileSystem() = default;
    ~FileSystem() = default;

    std::string m_basePath;
    struct WatchInfo {
        std::string path;
        FileChangeCallback callback;
        std::filesystem::file_time_type lastWriteTime;
    };
    std::vector<WatchInfo> m_watchers;
};

} // namespace Ember
