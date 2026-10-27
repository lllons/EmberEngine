#pragma once

#include <string>
#include <sstream>
#include <mutex>
#include <memory>
#include <vector>
#include <fstream>
#include <iostream>

namespace Ember {

enum class LogLevel {
    Trace = 0,
    Debug = 1,
    Info = 2,
    Warn = 3,
    Error = 4,
    Fatal = 5
};

class Logger {
public:
    static Logger& get();

    void init(const std::string& logFile = "ember.log");
    void shutdown();

    void setLevel(LogLevel level) { m_minLevel = level; }
    LogLevel getLevel() const { return m_minLevel; }
    void setConsoleOutput(bool enabled) { m_consoleOutput = enabled; }
    void setFileOutput(bool enabled) { m_fileOutput = enabled; }

    // Simple string-based logging
    void log(LogLevel level, const char* file, int line, const std::string& message);
    void flush();

    const std::vector<std::string>& getLogBuffer() const { return m_logBuffer; }
    size_t getLogBufferCount() const { return m_logBuffer.size(); }

private:
    Logger() = default;
    ~Logger();
    Logger(const Logger&) = delete;
    Logger& operator=(const Logger&) = delete;

    std::string levelToString(LogLevel level) const;
    std::string getCurrentTimestamp() const;

    LogLevel m_minLevel = LogLevel::Trace;
    bool m_consoleOutput = true;
    bool m_fileOutput = true;
    bool m_initialized = false;
    std::ofstream m_logFile;
    std::unique_ptr<std::mutex> m_mutex;
    std::vector<std::string> m_logBuffer;
    static const size_t MAX_BUFFER_SIZE = 1000;
};

namespace detail {

// Streams a single log argument to a string.
template<typename T>
std::string logArgToString(const T& value) {
    std::ostringstream stream;
    stream << value;
    return stream.str();
}

} // namespace detail

// Joins log arguments into one message.
//
// Call sites use two styles: plain concatenation, and a printf-like first
// argument containing '{}' placeholders. Both are supported: when the first
// argument contains '{}' the remaining arguments are substituted in order,
// otherwise everything is concatenated.
template<typename... Args>
std::string formatString(const Args&... args) {
    const std::vector<std::string> parts{detail::logArgToString(args)...};
    if (parts.empty()) return std::string();

    auto argIt = parts.begin();
    std::string out = *argIt++;

    size_t search = 0;
    while (argIt != parts.end()) {
        size_t pos = out.find("{}", search);
        if (pos == std::string::npos) break;
        std::string withArg = out.substr(0, pos) + *argIt++ + out.substr(pos + 2);
        out.swap(withArg);
        search = pos + 1;
    }

    for (; argIt != parts.end(); ++argIt) out += *argIt;
    return out;
}

} // namespace Ember

// Logging macros - simple string concatenation
#define EMBER_LOG_TRACE(...)    ::Ember::Logger::get().log(::Ember::LogLevel::Trace, __FILE__, __LINE__, ::Ember::formatString(__VA_ARGS__))
#define EMBER_LOG_DEBUG(...)    ::Ember::Logger::get().log(::Ember::LogLevel::Debug, __FILE__, __LINE__, ::Ember::formatString(__VA_ARGS__))
#define EMBER_LOG_INFO(...)     ::Ember::Logger::get().log(::Ember::LogLevel::Info, __FILE__, __LINE__, ::Ember::formatString(__VA_ARGS__))
#define EMBER_LOG_WARN(...)     ::Ember::Logger::get().log(::Ember::LogLevel::Warn, __FILE__, __LINE__, ::Ember::formatString(__VA_ARGS__))
#define EMBER_LOG_ERROR(...)    ::Ember::Logger::get().log(::Ember::LogLevel::Error, __FILE__, __LINE__, ::Ember::formatString(__VA_ARGS__))
#define EMBER_LOG_FATAL(...)    ::Ember::Logger::get().log(::Ember::LogLevel::Fatal, __FILE__, __LINE__, ::Ember::formatString(__VA_ARGS__))
