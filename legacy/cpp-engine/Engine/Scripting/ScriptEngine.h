#pragma once

#include <string>
#include <unordered_map>
#include <functional>

namespace Ember {

// Simple scripting engine interface
// For now, provides a console command system and data-driven configuration
// Full scripting can be added via Lua or AngelScript integration later

class ScriptEngine {
public:
    static ScriptEngine& get();

    bool init();
    void shutdown();

    // Console commands
    using CommandHandler = std::function<void(const std::string& args)>;
    void registerCommand(const std::string& name, CommandHandler handler, const std::string& description = "");
    bool executeCommand(const std::string& commandLine);
    void registerDefaultCommands();

    // Console log
    void log(const std::string& message);
    const std::vector<std::string>& getConsoleLog() const { return m_consoleLog; }
    void clearConsoleLog() { m_consoleLog.clear(); }
    size_t getMaxLogSize() const { return m_maxLogSize; }

    // Command list
    std::vector<std::string> getCommandNames() const;
    std::string getCommandDescription(const std::string& name) const;
    std::string tabComplete(const std::string& partial) const;

    bool isInitialized() const { return m_initialized; }

private:
    ScriptEngine() = default;
    ~ScriptEngine() = default;

    struct CommandEntry {
        CommandHandler handler;
        std::string description;
    };

    bool m_initialized = false;
    std::unordered_map<std::string, CommandEntry> m_commands;
    std::vector<std::string> m_consoleLog;
    size_t m_maxLogSize = 500;
};

} // namespace Ember
