#include "Engine/Core/FileSystem.h"
#include "Engine/Core/Logging.h"
#include <algorithm>

namespace Ember {

const char FileSystem::SEPARATOR =
#ifdef _WIN32
    '\\';
#else
    '/';
#endif

const char FileSystem::SEPARATOR_STR[] =
#ifdef _WIN32
    "\\";
#else
    "/";
#endif

FileSystem& FileSystem::get() {
    static FileSystem instance;
    return instance;
}

void FileSystem::init(const std::string& basePath) {
    m_basePath = std::filesystem::absolute(basePath).string();
    EMBER_LOG_INFO("FileSystem initialized, base path: {}", m_basePath);
}

std::string FileSystem::getAbsolutePath(const std::string& relativePath) const {
    return std::filesystem::absolute(std::filesystem::path(m_basePath) / relativePath).string();
}

std::string FileSystem::getRelativePath(const std::string& absolutePath) const {
    auto base = std::filesystem::path(m_basePath);
    auto abs = std::filesystem::path(absolutePath);
    std::error_code ec;
    auto rel = std::filesystem::relative(abs, base, ec);
    return ec ? abs.string() : rel.string();
}

std::string FileSystem::getParentPath(const std::string& path) const {
    return std::filesystem::path(path).parent_path().string();
}

std::string FileSystem::getFileName(const std::string& path) const {
    return std::filesystem::path(path).filename().string();
}

std::string FileSystem::getFileExtension(const std::string& path) const {
    return std::filesystem::path(path).extension().string();
}

std::string FileSystem::removeExtension(const std::string& path) const {
    return std::filesystem::path(path).stem().string();
}

bool FileSystem::fileExists(const std::string& path) const {
    return std::filesystem::exists(path) && std::filesystem::is_regular_file(path);
}

bool FileSystem::directoryExists(const std::string& path) const {
    return std::filesystem::exists(path) && std::filesystem::is_directory(path);
}

bool FileSystem::createDirectory(const std::string& path) {
    std::error_code ec;
    return std::filesystem::create_directory(path, ec);
}

bool FileSystem::createDirectories(const std::string& path) {
    std::error_code ec;
    return std::filesystem::create_directories(path, ec);
}

bool FileSystem::deleteFile(const std::string& path) {
    std::error_code ec;
    return std::filesystem::remove(path, ec);
}

bool FileSystem::deleteDirectory(const std::string& path) {
    std::error_code ec;
    return std::filesystem::remove_all(path, ec) > 0;
}

bool FileSystem::rename(const std::string& oldPath, const std::string& newPath) {
    std::error_code ec;
    std::filesystem::rename(oldPath, newPath, ec);
    return !ec;
}

bool FileSystem::copyFile(const std::string& src, const std::string& dst) {
    std::error_code ec;
    return std::filesystem::copy_file(src, dst, std::filesystem::copy_options::overwrite_existing, ec);
}

std::string FileSystem::readFile(const std::string& path) const {
    std::ifstream file(path, std::ios::in | std::ios::binary);
    if (!file.is_open()) {
        EMBER_LOG_ERROR("FileSystem: Failed to open file '{}'", path);
        return "";
    }
    std::string content((std::istreambuf_iterator<char>(file)), std::istreambuf_iterator<char>());
    return content;
}

std::vector<uint8_t> FileSystem::readBinaryFile(const std::string& path) const {
    std::ifstream file(path, std::ios::in | std::ios::binary);
    if (!file.is_open()) {
        EMBER_LOG_ERROR("FileSystem: Failed to open binary file '{}'", path);
        return {};
    }
    file.seekg(0, std::ios::end);
    size_t size = file.tellg();
    file.seekg(0, std::ios::beg);
    std::vector<uint8_t> data(size);
    file.read(reinterpret_cast<char*>(data.data()), size);
    return data;
}

bool FileSystem::writeFile(const std::string& path, const std::string& content) {
    // Ensure parent directory exists
    createDirectories(getParentPath(path));
    std::ofstream file(path, std::ios::out | std::ios::trunc);
    if (!file.is_open()) {
        EMBER_LOG_ERROR("FileSystem: Failed to write to '{}'", path);
        return false;
    }
    file << content;
    return true;
}

bool FileSystem::writeBinaryFile(const std::string& path, const std::vector<uint8_t>& data) {
    createDirectories(getParentPath(path));
    std::ofstream file(path, std::ios::out | std::ios::binary | std::ios::trunc);
    if (!file.is_open()) {
        EMBER_LOG_ERROR("FileSystem: Failed to write binary to '{}'", path);
        return false;
    }
    file.write(reinterpret_cast<const char*>(data.data()), data.size());
    return true;
}

bool FileSystem::appendToFile(const std::string& path, const std::string& content) {
    std::ofstream file(path, std::ios::out | std::ios::app);
    if (!file.is_open()) return false;
    file << content;
    return true;
}

std::vector<std::string> FileSystem::listFiles(const std::string& directory, bool recursive) const {
    std::vector<std::string> files;
    std::error_code ec;
    if (recursive) {
        for (const auto& entry : std::filesystem::recursive_directory_iterator(directory, ec)) {
            if (entry.is_regular_file()) {
                files.push_back(entry.path().string());
            }
        }
    } else {
        for (const auto& entry : std::filesystem::directory_iterator(directory, ec)) {
            if (entry.is_regular_file()) {
                files.push_back(entry.path().string());
            }
        }
    }
    return files;
}

std::vector<std::string> FileSystem::listDirectories(const std::string& directory) const {
    std::vector<std::string> dirs;
    std::error_code ec;
    for (const auto& entry : std::filesystem::directory_iterator(directory, ec)) {
        if (entry.is_directory()) {
            dirs.push_back(entry.path().string());
        }
    }
    return dirs;
}

void FileSystem::watchFile(const std::string& path, FileChangeCallback callback) {
    WatchInfo info;
    info.path = path;
    info.callback = callback;
    if (std::filesystem::exists(path)) {
        info.lastWriteTime = std::filesystem::last_write_time(path);
    }
    m_watchers.push_back(info);
}

void FileSystem::unwatchFile(const std::string& path) {
    m_watchers.erase(
        std::remove_if(m_watchers.begin(), m_watchers.end(),
            [&path](const WatchInfo& info) { return info.path == path; }),
        m_watchers.end());
}

void FileSystem::updateWatchers() {
    for (auto& watcher : m_watchers) {
        if (!std::filesystem::exists(watcher.path)) continue;
        auto lastWrite = std::filesystem::last_write_time(watcher.path);
        if (lastWrite != watcher.lastWriteTime) {
            watcher.lastWriteTime = lastWrite;
            if (watcher.callback) {
                watcher.callback(watcher.path);
            }
        }
    }
}

} // namespace Ember
