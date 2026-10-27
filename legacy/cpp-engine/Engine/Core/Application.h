#pragma once

#include <string>
#include <memory>
#include <functional>

// Version info
#ifndef EMBER_VERSION_MAJOR
#define EMBER_VERSION_MAJOR 1
#endif
#ifndef EMBER_VERSION_MINOR
#define EMBER_VERSION_MINOR 0
#endif
#ifndef EMBER_VERSION_PATCH
#define EMBER_VERSION_PATCH 0
#endif

namespace Ember {

struct AppConfig {
    std::string appName = "EmberEngine";
    unsigned int windowWidth = 1280;
    unsigned int windowHeight = 720;
    bool fullscreen = false;
    bool vsync = true;
    int targetFPS = 60;
};

class Application {
public:
    Application(const AppConfig& config = AppConfig());
    virtual ~Application();

    // Non-copyable
    Application(const Application&) = delete;
    Application& operator=(const Application&) = delete;

    // Core lifecycle
    void run();
    void shutdown();
    void requestExit();

    // Saves a PPM screenshot on the given frame, then exits. Used for
    // automated visual checks (`EmberEngine --screenshot out.ppm`).
    void requestScreenshot(const std::string& path, int frame = 15);

    // Callbacks for derived classes
    virtual void onInit() {}
    virtual void onUpdate(float deltaTime) {}
    virtual void onRender() {}
    virtual void onShutdown() {}
    virtual void onEvent(class Event& event) {}
    virtual void onFileDrop(const std::string& filePath) {}

    // Accessors
    bool isRunning() const { return m_running; }
    float getDeltaTime() const { return m_deltaTime; }
    float getElapsedTime() const { return m_elapsedTime; }
    unsigned int getFPS() const { return m_fps; }
    const AppConfig& getConfig() const { return m_config; }
    void setWindowTitle(const std::string& title);

    // Singleton access
    static Application& get();
    static bool isInitialized();

private:
    void mainLoop();
    void calculateFrameTiming();

    AppConfig m_config;
    bool m_running = false;
    bool m_initialized = false;
    float m_deltaTime = 0.0f;
    float m_elapsedTime = 0.0f;
    unsigned int m_fps = 0;
    unsigned int m_frameCount = 0;

    float m_fpsTimer = 0.0f;

    // Window handle (opaque pointer for platform abstraction)
    void* m_windowHandle = nullptr;

    // Optional automated screenshot (empty path = disabled)
    std::string m_screenshotPath;
    int m_screenshotFrame = 0;

    static Application* s_instance;
};

// Application creation function - must be implemented by game
Application* createApplication();

} // namespace Ember
