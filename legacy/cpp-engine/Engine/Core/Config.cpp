#include "Engine/Core/Config.h"
#include "Engine/Core/Logging.h"
#include <fstream>
#include <sstream>

namespace Ember {

Config& Config::get() {
    static Config instance;
    return instance;
}

bool Config::load(const std::string& filepath) {
    std::lock_guard<std::mutex> lock(m_mutex);
    m_filepath = filepath;

    std::ifstream file(filepath);
    if (!file.is_open()) {
        EMBER_LOG_WARN("Config: Could not open config file '{}', using defaults", filepath);
        setDefaults();
        return false;
    }

    m_values.clear();
    std::string line;
    while (std::getline(file, line)) {
        line = trim(line);
        if (line.empty() || line[0] == '#' || line[0] == '[') continue;

        size_t eqPos = line.find('=');
        if (eqPos == std::string::npos) continue;

        std::string key = trim(line.substr(0, eqPos));
        std::string value = trim(line.substr(eqPos + 1));
        m_values[key] = parseValue(value);
    }

    file.close();
    EMBER_LOG_INFO("Config loaded from '{}', {} entries", filepath, m_values.size());
    return true;
}

bool Config::save(const std::string& filepath) {
    std::lock_guard<std::mutex> lock(m_mutex);
    std::string targetPath = filepath.empty() ? m_filepath : filepath;

    std::ofstream file(targetPath, std::ios::out | std::ios::trunc);
    if (!file.is_open()) {
        EMBER_LOG_ERROR("Config: Could not save to '{}'", targetPath);
        return false;
    }

    file << "# EmberEngine Configuration\n";
    for (const auto& [key, value] : m_values) {
        file << key << " = " << valueToString(value) << "\n";
    }

    file.close();
    return true;
}

void Config::setDefaults() {
    m_values["app_name"] = std::string("EmberEngine");
    m_values["window_width"] = 1280;
    m_values["window_height"] = 720;
    m_values["fullscreen"] = false;
    m_values["vsync"] = true;
    m_values["target_fps"] = 60;
    m_values["log_level"] = std::string("info");
    m_values["audio_enabled"] = true;
    m_values["physics_gravity_x"] = 0.0f;
    m_values["physics_gravity_y"] = -9.81f;
    m_values["physics_gravity_z"] = 0.0f;
}

std::optional<int> Config::getInt(const std::string& key) const {
    auto it = m_values.find(key);
    if (it == m_values.end()) return std::nullopt;
    if (auto* val = std::get_if<int>(&it->second)) return *val;
    if (auto* val = std::get_if<float>(&it->second)) return static_cast<int>(*val);
    return std::nullopt;
}

std::optional<float> Config::getFloat(const std::string& key) const {
    auto it = m_values.find(key);
    if (it == m_values.end()) return std::nullopt;
    if (auto* val = std::get_if<float>(&it->second)) return *val;
    if (auto* val = std::get_if<int>(&it->second)) return static_cast<float>(*val);
    return std::nullopt;
}

std::optional<bool> Config::getBool(const std::string& key) const {
    auto it = m_values.find(key);
    if (it == m_values.end()) return std::nullopt;
    if (auto* val = std::get_if<bool>(&it->second)) return *val;
    return std::nullopt;
}

std::optional<std::string> Config::getString(const std::string& key) const {
    auto it = m_values.find(key);
    if (it == m_values.end()) return std::nullopt;
    if (auto* val = std::get_if<std::string>(&it->second)) return *val;
    return std::nullopt;
}

int Config::getInt(const std::string& key, int defaultVal) const {
    auto val = getInt(key);
    return val.value_or(defaultVal);
}

float Config::getFloat(const std::string& key, float defaultVal) const {
    auto val = getFloat(key);
    return val.value_or(defaultVal);
}

bool Config::getBool(const std::string& key, bool defaultVal) const {
    auto val = getBool(key);
    return val.value_or(defaultVal);
}

std::string Config::getString(const std::string& key, const std::string& defaultVal) const {
    auto val = getString(key);
    return val.value_or(defaultVal);
}

void Config::setInt(const std::string& key, int value) { std::lock_guard<std::mutex> lock(m_mutex); m_values[key] = value; }
void Config::setFloat(const std::string& key, float value) { std::lock_guard<std::mutex> lock(m_mutex); m_values[key] = value; }
void Config::setBool(const std::string& key, bool value) { std::lock_guard<std::mutex> lock(m_mutex); m_values[key] = value; }
void Config::setString(const std::string& key, const std::string& value) { std::lock_guard<std::mutex> lock(m_mutex); m_values[key] = value; }

bool Config::hasKey(const std::string& key) const {
    return m_values.find(key) != m_values.end();
}

void Config::remove(const std::string& key) {
    std::lock_guard<std::mutex> lock(m_mutex);
    m_values.erase(key);
}

std::vector<std::string> Config::getKeys() const {
    std::vector<std::string> keys;
    for (const auto& [key, value] : m_values) {
        keys.push_back(key);
    }
    return keys;
}

void Config::clear() {
    std::lock_guard<std::mutex> lock(m_mutex);
    m_values.clear();
}

std::string Config::trim(const std::string& str) const {
    size_t start = str.find_first_not_of(" \t\r\n");
    size_t end = str.find_last_not_of(" \t\r\n");
    return (start == std::string::npos) ? "" : str.substr(start, end - start + 1);
}

ConfigValue Config::parseValue(const std::string& value) const {
    // Try bool
    if (value == "true" || value == "1") return true;
    if (value == "false" || value == "0") return false;

    // Try int
    try {
        size_t pos;
        int i = std::stoi(value, &pos);
        if (pos == value.size()) return i;
    } catch (...) {}

    // Try float
    try {
        size_t pos;
        float f = std::stof(value, &pos);
        if (pos == value.size()) return f;
    } catch (...) {}

    // String
    return value;
}

std::string Config::valueToString(const ConfigValue& value) const {
    return std::visit([](const auto& v) -> std::string {
        using T = std::decay_t<decltype(v)>;
        if constexpr (std::is_same_v<T, std::string>) return v;
        else if constexpr (std::is_same_v<T, bool>) return v ? "true" : "false";
        else return std::to_string(v);
    }, value);
}

} // namespace Ember
