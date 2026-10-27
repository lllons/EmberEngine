#pragma once

#include <string>
#include <unordered_map>
#include <variant>
#include <vector>
#include <mutex>
#include <optional>

namespace Ember {

using ConfigValue = std::variant<int, float, bool, std::string>;

class Config {
public:
    static Config& get();

    bool load(const std::string& filepath);
    bool save(const std::string& filepath = "");
    void setDefaults();

    // Getters
    std::optional<int> getInt(const std::string& key) const;
    std::optional<float> getFloat(const std::string& key) const;
    std::optional<bool> getBool(const std::string& key) const;
    std::optional<std::string> getString(const std::string& key) const;

    // Get with defaults
    int getInt(const std::string& key, int defaultVal) const;
    float getFloat(const std::string& key, float defaultVal) const;
    bool getBool(const std::string& key, bool defaultVal) const;
    std::string getString(const std::string& key, const std::string& defaultVal) const;

    // Setters
    void setInt(const std::string& key, int value);
    void setFloat(const std::string& key, float value);
    void setBool(const std::string& key, bool value);
    void setString(const std::string& key, const std::string& value);

    // Check if key exists
    bool hasKey(const std::string& key) const;

    // Remove key
    void remove(const std::string& key);

    // Get all keys
    std::vector<std::string> getKeys() const;

    // Clear all config
    void clear();

    // Get config file path
    const std::string& getFilePath() const { return m_filepath; }

private:
    Config() = default;
    ~Config() = default;

    std::string m_filepath;
    std::unordered_map<std::string, ConfigValue> m_values;
    mutable std::mutex m_mutex;

    // Simple config file parser
    std::string trim(const std::string& str) const;
    ConfigValue parseValue(const std::string& value) const;
    std::string valueToString(const ConfigValue& value) const;
};

} // namespace Ember
