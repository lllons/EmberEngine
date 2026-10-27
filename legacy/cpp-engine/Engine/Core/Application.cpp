#include "Engine/Core/Application.h"
#include "Engine/Core/Logging.h"
#include "Engine/Core/EventSystem.h"
#include "Engine/Core/Timer.h"
#include "Engine/Core/Config.h"
#include "Engine/Core/FileSystem.h"
#include "Engine/Core/ThreadPool.h"
#include "Engine/Rendering/Renderer.h"
#include "Engine/Platform/Platform.h"
#include "Engine/Rendering/GL.h"
#include "Engine/UI/UIEngine.h"
#include "GUI/EmberGUI.h"
#include "Engine/Scripting/ScriptEngine.h"
#include "Engine/AssetPipeline/AssetManager.h"
#include <chrono>
#include <thread>

namespace Ember {

Application* Application::s_instance = nullptr;

Application::Application(const AppConfig& config)
    : m_config(config)
{
    s_instance = this;
}

Application::~Application() {
    if (m_running) {
        shutdown();
    }
    s_instance = nullptr;
}

Application& Application::get() {
    return *s_instance;
}

bool Application::isInitialized() {
    return s_instance != nullptr && s_instance->m_initialized;
}

void Application::run() {
    // Initialize subsystems
    Logger::get().init("ember.log");
    EMBER_LOG_INFO("EmberEngine v", EMBER_VERSION_MAJOR, ".", EMBER_VERSION_MINOR, ".", EMBER_VERSION_PATCH, " starting up...");

    EventSystem::get().init();
    Config::get().load("config.ini");
    ThreadPool::get();
    FileSystem::get().init(".");
    ScriptEngine::get().init();
    AssetManager::get().init("Assets");

    // Initialize platform (creates window and OpenGL context)
    WindowProps wp;
    wp.title = m_config.appName;
    wp.width = m_config.windowWidth;
    wp.height = m_config.windowHeight;
    wp.fullscreen = m_config.fullscreen;
    wp.vsync = m_config.vsync;
    if (!Platform::get().init(wp)) {
        EMBER_LOG_FATAL("Failed to initialize platform!");
        return;
    }

    // Load OpenGL extensions (must be done after GL context creation)
    if (!loadGLExtensions()) {
        EMBER_LOG_FATAL("Failed to load OpenGL extensions!");
        return;
    }

    // Initialize renderer
    Renderer::get().init(RenderAPI::OpenGL);
    Renderer::get().onWindowResize(Platform::get().getWidth(), Platform::get().getHeight());

    // Initialize GUI system
    EmberGUI::get().init();

    // Set up platform callbacks
    Platform::get().setResizeCallback([this](uint32_t w, uint32_t h) {
        m_config.windowWidth = w;
        m_config.windowHeight = h;
        Renderer::get().onWindowResize(w, h);
    });
    Platform::get().setKeyCallback([this](int key, int scancode, bool pressed) {
        (void)scancode;
        if (key == 27 && pressed) requestExit(); // ESC to quit
    });
    Platform::get().setDropCallback([this](const std::string& path) {
        EMBER_LOG_INFO("File dropped: ", path);
        onFileDrop(path);
    });

    // Call user initialization
    onInit();
    m_initialized = true;
    m_running = true;

    EMBER_LOG_INFO("Engine initialized successfully. Starting main loop...");

    mainLoop();

    // Shutdown
    EMBER_LOG_INFO("Shutting down engine...");
    onShutdown();

    AssetManager::get().shutdown();
    ScriptEngine::get().shutdown();
    Renderer::get().shutdown();
    Platform::get().shutdown();
    EventSystem::get().shutdown();
    ThreadPool::get().shutdown();
    Logger::get().shutdown();

    m_initialized = false;
}

void Application::mainLoop() {
    Timer gameTimer;
    gameTimer.start();

    while (m_running) {
        gameTimer.updateDelta();
        m_deltaTime = gameTimer.getDeltaTime();
        m_elapsedTime = gameTimer.getElapsedTime();

        // Process platform messages (window events, input, etc.)
        if (!Platform::get().processMessages()) {
            m_running = false;
            break;
        }

        // Process engine events
        EventSystem::get().processEvents();

        // Update
        onUpdate(m_deltaTime);

        // Start GUI frame (updates input state, resets per-frame state)
        EmberGUI::get().newFrame(m_deltaTime);

        // Render
        Renderer::get().beginFrame();
        onRender();
        Renderer::get().renderGUI();            // Process & draw GUI commands
        EmberGUI::get().endFrame();             // Clear draw commands for next frame
        Renderer::get().endFrame();

        // Automated screenshot: read the finished back buffer, then stop.
        if (!m_screenshotPath.empty() && (int)m_frameCount >= m_screenshotFrame) {
            Renderer::get().saveScreenshotPPM(m_screenshotPath);
            m_screenshotPath.clear();
            m_running = false;
        }

        // Swap buffers to display rendered frame
        Platform::get().swapBuffers();

        // FPS calculation
        gameTimer.updateFPS();
        m_fps = static_cast<unsigned int>(gameTimer.getFPS());
        m_frameCount++;

        // Update title with FPS periodically
        static float titleUpdateTimer = 0.0f;
        titleUpdateTimer += m_deltaTime;
        if (titleUpdateTimer >= 1.0f) {
            std::string title = m_config.appName + " | FPS: " + std::to_string(m_fps);
            Platform::get().setTitle(title);
            titleUpdateTimer -= 1.0f;
        }

        // Yield some CPU time to avoid 100% usage
        std::this_thread::sleep_for(std::chrono::milliseconds(1));
    }
}

void Application::shutdown() {
    m_running = false;
}

void Application::requestExit() {
    m_running = false;
}

void Application::requestScreenshot(const std::string& path, int frame) {
    m_screenshotPath = path;
    m_screenshotFrame = frame < 0 ? 0 : frame;
}

void Application::setWindowTitle(const std::string& title) {
    m_config.appName = title;
}

} // namespace Ember
