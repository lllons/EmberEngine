#include "Engine/Core/Timer.h"
#include "Engine/Core/Logging.h"
#include <thread>

namespace Ember {

Timer::Timer() = default;

void Timer::start() {
    m_startTime = Clock::now();
    m_lastTime = m_startTime;
    m_running = true;
    m_paused = false;
    m_deltaTime = 0.0f;
    m_fps = 0.0f;
    m_frameCount = 0;
    m_fpsFrameCount = 0;
    m_fpsAccumulator = 0.0f;
}

void Timer::stop() {
    m_running = false;
    m_paused = false;
}

void Timer::pause() {
    if (m_running && !m_paused) {
        m_pauseTime = Clock::now();
        m_paused = true;
    }
}

void Timer::resume() {
    if (m_running && m_paused) {
        auto pauseDuration = Clock::now() - m_pauseTime;
        m_startTime += pauseDuration;
        m_lastTime += pauseDuration;
        m_paused = false;
    }
}

void Timer::reset() {
    m_startTime = Clock::now();
    m_lastTime = m_startTime;
    m_deltaTime = 0.0f;
    m_frameCount = 0;
    m_fpsFrameCount = 0;
    m_fpsAccumulator = 0.0f;
    m_fps = 0.0f;
}

float Timer::getElapsedTime() const {
    if (!m_running) return 0.0f;
    auto now = m_paused ? m_pauseTime : Clock::now();
    return std::chrono::duration<float>(now - m_startTime).count();
}

float Timer::getDeltaTime() const {
    return m_deltaTime;
}

float Timer::getDeltaTimeRaw() const {
    if (!m_running || m_paused) return 0.0f;
    auto now = Clock::now();
    float delta = std::chrono::duration<float>(now - m_lastTime).count();
    return delta;
}

void Timer::updateDelta() {
    if (!m_running || m_paused) {
        m_deltaTime = 0.0f;
        return;
    }
    auto now = Clock::now();
    m_deltaTime = std::chrono::duration<float>(now - m_lastTime).count();
    m_deltaTime = std::min(m_deltaTime, m_maxDeltaTime);
    m_lastTime = now;
}

void Timer::updateFPS() {
    if (!m_running || m_paused) return;
    m_frameCount++;
    m_fpsFrameCount++;
    m_fpsAccumulator += m_deltaTime;

    if (m_fpsAccumulator >= 1.0f) {
        m_fps = static_cast<float>(m_fpsFrameCount) / m_fpsAccumulator;
        m_fpsFrameCount = 0;
        m_fpsAccumulator -= 1.0f;
    }
}

// ScopedTimer
Timer::ScopedTimer::ScopedTimer(const std::string& name)
    : m_name(name), m_start(Clock::now()) {
}

Timer::ScopedTimer::~ScopedTimer() {
    auto end = Clock::now();
    float ms = std::chrono::duration<float, std::milli>(end - m_start).count();
    EMBER_LOG_TRACE("[Timer] {}: {:.3f}ms", m_name, ms);
}

// Utility
double Timer::getCurrentTime() {
    auto now = Clock::now();
    return std::chrono::duration<double>(now.time_since_epoch()).count();
}

void Timer::sleep(float seconds) {
    std::this_thread::sleep_for(std::chrono::duration<float>(seconds));
}

// Global timers
Timer& getGameTimer() {
    static Timer timer;
    return timer;
}

Timer& getEngineTimer() {
    static Timer timer;
    return timer;
}

} // namespace Ember
