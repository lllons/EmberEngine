#pragma once

#include <chrono>
#include <string>
#include <functional>
#include <vector>

namespace Ember {

class Timer {
public:
    Timer();

    // Timer control
    void start();
    void stop();
    void pause();
    void resume();
    void reset();

    // Time queries
    float getElapsedTime() const;      // Seconds since start
    float getDeltaTime() const;        // Time since last deltaTime call
    float getDeltaTimeRaw() const;     // Raw delta without capping
    void  updateDelta();               // Update delta time

    // FPS tracking
    void  updateFPS();
    float getFPS() const { return m_fps; }
    unsigned int getFrameCount() const { return m_frameCount; }

    // State queries
    bool isRunning() const { return m_running; }
    bool isPaused() const { return m_paused; }

    // Cap delta time to prevent spiral of death
    void setMaxDeltaTime(float maxDelta) { m_maxDeltaTime = maxDelta; }
    float getMaxDeltaTime() const { return m_maxDeltaTime; }

    // Benchmarks
    class ScopedTimer {
    public:
        ScopedTimer(const std::string& name);
        ~ScopedTimer();

    private:
        std::string m_name;
        std::chrono::high_resolution_clock::time_point m_start;
    };

    // Utility
    static double getCurrentTime();
    static void sleep(float seconds);

private:
    using Clock = std::chrono::high_resolution_clock;
    using TimePoint = Clock::time_point;

    TimePoint m_startTime;
    TimePoint m_lastTime;
    TimePoint m_pauseTime;
    float m_deltaTime = 0.0f;
    float m_maxDeltaTime = 0.1f; // 100ms max
    float m_fps = 0.0f;
    float m_fpsAccumulator = 0.0f;
    unsigned int m_frameCount = 0;
    unsigned int m_fpsFrameCount = 0;
    bool m_running = false;
    bool m_paused = false;
};

// Global timers
Timer& getGameTimer();
Timer& getEngineTimer();

} // namespace Ember
