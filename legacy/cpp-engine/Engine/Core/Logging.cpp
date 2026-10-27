#include "Engine/Core/Logging.h"
#include <iostream>
#include <iomanip>
#include <sstream>
#include <chrono>

namespace Ember {

Logger& Logger::get() {
    static Logger instance;
    return instance;
}

Logger::~Logger() {
    shutdown();
}

void Logger::init(const std::string& logFile) {
    // Initialize mutex lazily to avoid static initialization issues
    if (!m_mutex) {
        m_mutex = std::make_unique<std::mutex>();
    }
    std::lock_guard<std::mutex> lock(*m_mutex);
    m_initialized = true;
    if (m_fileOutput) {
        m_logFile.open(logFile, std::ios::out | std::ios::trunc);
        if (m_logFile.is_open()) {
            m_logFile << "=== EmberEngine Log ===" << std::endl;
        }
    }
    m_logBuffer.clear();
}

void Logger::shutdown() {
    if (!m_mutex) return; // Not initialized
    std::lock_guard<std::mutex> lock(*m_mutex);
    m_initialized = false;
    if (m_logFile.is_open()) {
        m_logFile << "=== Log End ===" << std::endl;
        m_logFile.close();
    }
    m_logBuffer.clear();
}

void Logger::log(LogLevel level, const char* file, int line, const std::string& message) {
    if (level < m_minLevel) return;
    if (!m_initialized) return;
    if (!m_mutex) return;

    std::lock_guard<std::mutex> lock(*m_mutex);

    std::string timestamp = getCurrentTimestamp();
    std::string levelStr = levelToString(level);
    std::string fileName = std::string(file);
    // Extract just the filename
    size_t lastSlash = fileName.find_last_of("/\\");
    if (lastSlash != std::string::npos) {
        fileName = fileName.substr(lastSlash + 1);
    }

    std::ostringstream oss;
    oss << "[" << timestamp << "] [" << levelStr << "] " << fileName << ":" << line << " - " << message;

    std::string formatted = oss.str();

    // Add to buffer
    m_logBuffer.push_back(formatted);
    if (m_logBuffer.size() > MAX_BUFFER_SIZE) {
        m_logBuffer.erase(m_logBuffer.begin());
    }

    // Console output with colors
    if (m_consoleOutput) {
        switch (level) {
            case LogLevel::Trace: std::cout << "\033[90m"; break; // Dark gray
            case LogLevel::Debug: std::cout << "\033[36m"; break; // Cyan
            case LogLevel::Info:  std::cout << "\033[32m"; break; // Green
            case LogLevel::Warn:  std::cout << "\033[33m"; break; // Yellow
            case LogLevel::Error: std::cout << "\033[31m"; break; // Red
            case LogLevel::Fatal: std::cout << "\033[35m"; break; // Magenta
        }
        std::cout << formatted << "\033[0m" << std::endl;
    }

    // File output
    if (m_fileOutput && m_logFile.is_open()) {
        m_logFile << formatted << std::endl;
    }
}

void Logger::flush() {
    if (!m_mutex) return;
    std::lock_guard<std::mutex> lock(*m_mutex);
    if (m_logFile.is_open()) {
        m_logFile.flush();
    }
    std::cout.flush();
}

std::string Logger::levelToString(LogLevel level) const {
    switch (level) {
        case LogLevel::Trace: return "TRACE";
        case LogLevel::Debug: return "DEBUG";
        case LogLevel::Info:  return "INFO ";
        case LogLevel::Warn:  return "WARN ";
        case LogLevel::Error: return "ERROR";
        case LogLevel::Fatal: return "FATAL";
        default: return "?????";
    }
}

std::string Logger::getCurrentTimestamp() const {
    auto now = std::chrono::system_clock::now();
    auto time = std::chrono::system_clock::to_time_t(now);
    auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(
        now.time_since_epoch()) % 1000;

    struct tm tm;
#ifdef _WIN32
    localtime_s(&tm, &time);
#else
    localtime_r(&time, &tm);
#endif

    std::ostringstream oss;
    oss << std::setfill('0')
        << std::setw(2) << tm.tm_hour << ":"
        << std::setw(2) << tm.tm_min << ":"
        << std::setw(2) << tm.tm_sec << "."
        << std::setw(3) << ms.count();
    return oss.str();
}

} // namespace Ember
