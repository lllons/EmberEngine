#include "Engine/Scripting/ScriptEngine.h"
#include "Engine/Core/Logging.h"
#include <sstream>

namespace Ember {

ScriptEngine& ScriptEngine::get() { static ScriptEngine instance; return instance; }

bool ScriptEngine::init() {
    registerDefaultCommands();
    m_initialized = true;
    EMBER_LOG_INFO("ScriptEngine initialized");
    return true;
}

void ScriptEngine::shutdown() {
    m_commands.clear();
    m_consoleLog.clear();
    m_initialized = false;
    EMBER_LOG_INFO("ScriptEngine shutdown");
}

void ScriptEngine::registerCommand(const std::string& name, CommandHandler handler, const std::string& description) {
    m_commands[name] = {handler, description};
}

bool ScriptEngine::executeCommand(const std::string& commandLine) {
    std::istringstream iss(commandLine);
    std::string cmd;
    iss >> cmd;

    // Add to log
    log("> " + commandLine);

    auto it = m_commands.find(cmd);
    if (it == m_commands.end()) {
        log("Unknown command: " + cmd);
        return false;
    }

    std::string args;
    std::getline(iss >> std::ws, args);
    it->second.handler(args);
    return true;
}

void ScriptEngine::registerDefaultCommands() {
    registerCommand("help", [this](const std::string&) {
        log("Available commands:");
        for (auto& [name, entry] : m_commands) {
            log("  " + name + " - " + entry.description);
        }
    }, "Show available commands");

    registerCommand("clear", [this](const std::string&) {
        clearConsoleLog();
    }, "Clear console log");

    registerCommand("echo", [this](const std::string& args) {
        log(args);
    }, "Echo a message");

    registerCommand("version", [this](const std::string&) {
        log("EmberEngine v1.0.0");
    }, "Show engine version");
}

void ScriptEngine::log(const std::string& message) {
    m_consoleLog.push_back(message);
    if (m_consoleLog.size() > m_maxLogSize) {
        m_consoleLog.erase(m_consoleLog.begin());
    }
}

std::vector<std::string> ScriptEngine::getCommandNames() const {
    std::vector<std::string> names;
    for (auto& [name, entry] : m_commands) names.push_back(name);
    return names;
}

std::string ScriptEngine::getCommandDescription(const std::string& name) const {
    auto it = m_commands.find(name);
    return it != m_commands.end() ? it->second.description : "";
}

std::string ScriptEngine::tabComplete(const std::string& partial) const {
    for (auto& [name, entry] : m_commands) {
        if (name.find(partial) == 0) return name;
    }
    return partial;
}

} // namespace Ember
