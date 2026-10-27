#pragma once

#include <string>
#include <functional>
#include <cstdint>

#ifdef _WIN32
    #define WIN32_LEAN_AND_MEAN
    #ifndef NOMINMAX
        #define NOMINMAX
    #endif
    #include <windows.h>
    #include <windowsx.h>
    #include <commdlg.h>
    #include <shellapi.h>
    #include <shlobj.h>
    #include <GL/gl.h>
    #include <GL/glu.h>

    // WGL constants for OpenGL context creation
    #ifndef WGL_CONTEXT_MAJOR_VERSION_ARB
        #define WGL_CONTEXT_MAJOR_VERSION_ARB     0x2091
        #define WGL_CONTEXT_MINOR_VERSION_ARB     0x2092
        #define WGL_CONTEXT_PROFILE_MASK_ARB      0x9126
        #define WGL_CONTEXT_CORE_PROFILE_BIT_ARB  0x00000001
        #define WGL_CONTEXT_FLAGS_ARB             0x2094
        #define WGL_CONTEXT_FORWARD_COMPATIBLE_BIT_ARB 0x0002
    #endif
#endif

namespace Ember {

struct WindowProps {
    std::string title = "EmberEngine";
    uint32_t width = 1280;
    uint32_t height = 720;
    bool fullscreen = false;
    bool resizable = true;
    bool vsync = true;
    int multisamples = 4;
};

// Input state
struct InputState {
    bool keys[256] = {};
    bool mouseButtons[8] = {};
    int mouseX = 0, mouseY = 0;
    int mouseDeltaX = 0, mouseDeltaY = 0;
    float mouseScrollX = 0.0f, mouseScrollY = 0.0f;
    bool cursorVisible = true;
    bool cursorLocked = false;
    char inputChar = 0;
};

class Platform {
public:
    static Platform& get();

    bool init(const WindowProps& props = WindowProps());
    void shutdown();
    bool processMessages();

    // Window
    void setTitle(const std::string& title);
    void setSize(uint32_t width, uint32_t height);
    uint32_t getWidth() const { return m_width; }
    uint32_t getHeight() const { return m_height; }
    bool isMinimized() const { return m_minimized; }
    void* getHandle() const { return m_handle; }

    // OpenGL
    void swapBuffers();
    void setVSync(bool enabled);
    bool isVSync() const { return m_vsync; }

    // Input
    const InputState& getInput() const { return m_input; }
    bool isKeyPressed(int key) const;
    bool isMouseButtonPressed(int button) const;
    void getMousePosition(int& x, int& y) const;
    void getMouseDelta(int& dx, int& dy) const;
    void setCursorVisible(bool visible);
    void setCursorLocked(bool locked);
    float getMouseScroll() const { return m_input.mouseScrollY; }
    void resetMouseScroll();
    char getInputChar() const { return m_input.inputChar; }
    void resetInputChar() { m_input.inputChar = 0; }

    // DPI
    float getDPIScale() const { return m_dpiScale; }

    // Callbacks
    using ResizeCallback = std::function<void(uint32_t, uint32_t)>;
    using KeyCallback = std::function<void(int, int, bool)>;
    using MouseCallback = std::function<void(int, int)>;
    using ScrollCallback = std::function<void(float, float)>;
    using DropCallback = std::function<void(const std::string&)>;

    void setResizeCallback(ResizeCallback cb) { m_resizeCallback = cb; }
    void setKeyCallback(KeyCallback cb) { m_keyCallback = cb; }
    void setMouseCallback(MouseCallback cb) { m_mouseCallback = cb; }
    void setScrollCallback(ScrollCallback cb) { m_scrollCallback = cb; }
    void setDropCallback(DropCallback cb) { m_dropCallback = cb; }

    // Time
    double getTime() const;

    // Open file dialog
    std::string openFileDialog(const char* filter = "All Files\0*.*\0");
    std::string saveFileDialog(const char* filter = "All Files\0*.*\0");
    std::string openDirectoryDialog();

private:
    Platform() = default;
    ~Platform() = default;

#ifdef _WIN32
    static LRESULT CALLBACK windowProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam);
    void registerWindowClass();
    bool createWindow(const WindowProps& props);
    bool createOpenGLContext();
#endif

    // State
    void* m_handle = nullptr;
    void* m_glContext = nullptr;
    uint32_t m_width = 0;
    uint32_t m_height = 0;
    bool m_minimized = false;
    bool m_vsync = true;
    bool m_initialized = false;
    float m_dpiScale = 1.0f;

    InputState m_input;
    InputState m_prevInput;

    // Callbacks
    ResizeCallback m_resizeCallback;
    KeyCallback m_keyCallback;
    MouseCallback m_mouseCallback;
    ScrollCallback m_scrollCallback;
    DropCallback m_dropCallback;

#ifdef _WIN32
    HINSTANCE m_hInstance = nullptr;
    HDC m_hDC = nullptr;
    HGLRC m_hGLRC = nullptr;
    HMENU m_hMenu = nullptr;
#endif
};

} // namespace Ember
