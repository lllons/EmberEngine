#include "Engine/Platform/Platform.h"
#include "Engine/Core/Logging.h"
#include <algorithm>

namespace Ember {

Platform& Platform::get() {
    static Platform instance;
    return instance;
}

bool Platform::init(const WindowProps& props) {
    if (m_initialized) return true;

    m_width = props.width;
    m_height = props.height;

#ifdef _WIN32
    m_hInstance = GetModuleHandle(nullptr);
    registerWindowClass();
    if (!createWindow(props)) {
        EMBER_LOG_ERROR("Failed to create window");
        return false;
    }
    if (!createOpenGLContext()) {
        EMBER_LOG_ERROR("Failed to create OpenGL context");
        return false;
    }
    // DPI awareness
    SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);

    m_initialized = true;
    EMBER_LOG_INFO("Platform initialized: ", props.title, " (", m_width, "x", m_height, ")");
#endif

    return true;
}

void Platform::shutdown() {
    if (!m_initialized) return;

#ifdef _WIN32
    if (m_hGLRC) {
        wglMakeCurrent(nullptr, nullptr);
        wglDeleteContext(m_hGLRC);
        m_hGLRC = nullptr;
    }
    if (m_hDC && m_handle) {
        ReleaseDC((HWND)m_handle, m_hDC);
        m_hDC = nullptr;
    }
    if (m_handle) {
        DestroyWindow((HWND)m_handle);
        m_handle = nullptr;
    }
    UnregisterClassA("EmberEngineWindow", m_hInstance);
#endif

    m_initialized = false;
    EMBER_LOG_INFO("Platform shutdown");
}

#ifdef _WIN32

void Platform::registerWindowClass() {
    WNDCLASSEXA wc = {};
    wc.cbSize = sizeof(WNDCLASSEXA);
    wc.style = CS_HREDRAW | CS_VREDRAW | CS_OWNDC;
    wc.lpfnWndProc = windowProc;
    wc.hInstance = m_hInstance;
    wc.hCursor = LoadCursor(nullptr, IDC_ARROW);
    wc.hbrBackground = (HBRUSH)GetStockObject(BLACK_BRUSH);
    wc.lpszClassName = "EmberEngineWindow";
    wc.hIcon = LoadIcon(nullptr, IDI_APPLICATION);
    wc.hIconSm = LoadIcon(nullptr, IDI_APPLICATION);
    RegisterClassExA(&wc);
}

bool Platform::createWindow(const WindowProps& props) {
    DWORD style = WS_OVERLAPPEDWINDOW;
    DWORD exStyle = WS_EX_APPWINDOW;

    if (props.fullscreen) {
        style = WS_POPUP;
        exStyle = WS_EX_TOPMOST;
    }

    RECT rect = {0, 0, (LONG)props.width, (LONG)props.height};
    AdjustWindowRectEx(&rect, style, FALSE, exStyle);

    int windowX = (GetSystemMetrics(SM_CXSCREEN) - (int)props.width) / 2;
    int windowY = (GetSystemMetrics(SM_CYSCREEN) - (int)props.height) / 2;

    m_handle = CreateWindowExA(
        exStyle, "EmberEngineWindow", props.title.c_str(),
        style | WS_CLIPSIBLINGS | WS_CLIPCHILDREN,
        windowX, windowY, rect.right - rect.left, rect.bottom - rect.top,
        nullptr, nullptr, m_hInstance, this
    );

    if (!m_handle) {
        EMBER_LOG_ERROR("CreateWindowEx failed: ", GetLastError());
        return false;
    }

    ShowWindow((HWND)m_handle, SW_SHOW);
    UpdateWindow((HWND)m_handle);
    SetForegroundWindow((HWND)m_handle);
    SetFocus((HWND)m_handle);

    // Enable drag-and-drop file acceptance
    DragAcceptFiles((HWND)m_handle, TRUE);

    // Store this pointer
    SetWindowLongPtr((HWND)m_handle, GWLP_USERDATA, (LONG_PTR)this);

    return true;
}

bool Platform::createOpenGLContext() {
    m_hDC = GetDC((HWND)m_handle);

    PIXELFORMATDESCRIPTOR pfd = {};
    pfd.nSize = sizeof(PIXELFORMATDESCRIPTOR);
    pfd.nVersion = 1;
    pfd.dwFlags = PFD_DRAW_TO_WINDOW | PFD_SUPPORT_OPENGL | PFD_DOUBLEBUFFER;
    pfd.iPixelType = PFD_TYPE_RGBA;
    pfd.cColorBits = 32;
    pfd.cDepthBits = 24;
    pfd.cStencilBits = 8;
    pfd.iLayerType = PFD_MAIN_PLANE;

    int pixelFormat = ChoosePixelFormat(m_hDC, &pfd);
    if (!pixelFormat) {
        EMBER_LOG_ERROR("ChoosePixelFormat failed");
        return false;
    }

    if (!SetPixelFormat(m_hDC, pixelFormat, &pfd)) {
        EMBER_LOG_ERROR("SetPixelFormat failed");
        return false;
    }

    // Create temporary context to get wglCreateContextAttribsARB
    HGLRC tempRC = wglCreateContext(m_hDC);
    wglMakeCurrent(m_hDC, tempRC);

    // Get wglCreateContextAttribsARB
    typedef HGLRC (WINAPI *PFNWGLCREATECONTEXTATTRIBSARBPROC)(HDC, HGLRC, const int*);
    PFNWGLCREATECONTEXTATTRIBSARBPROC wglCreateContextAttribsARB =
        (PFNWGLCREATECONTEXTATTRIBSARBPROC)wglGetProcAddress("wglCreateContextAttribsARB");

    wglMakeCurrent(nullptr, nullptr);
    wglDeleteContext(tempRC);

    if (wglCreateContextAttribsARB) {
        int attribs[] = {
            WGL_CONTEXT_MAJOR_VERSION_ARB, 3,
            WGL_CONTEXT_MINOR_VERSION_ARB, 3,
            WGL_CONTEXT_PROFILE_MASK_ARB, WGL_CONTEXT_CORE_PROFILE_BIT_ARB,
            WGL_CONTEXT_FLAGS_ARB, WGL_CONTEXT_FORWARD_COMPATIBLE_BIT_ARB,
            0
        };

        m_hGLRC = wglCreateContextAttribsARB(m_hDC, nullptr, attribs);
        wglMakeCurrent(m_hDC, m_hGLRC);

        EMBER_LOG_INFO("OpenGL 3.3 Core Profile created");
    } else {
        m_hGLRC = wglCreateContext(m_hDC);
        wglMakeCurrent(m_hDC, m_hGLRC);
        EMBER_LOG_INFO("OpenGL context created (legacy)");
    }

    return m_hGLRC != nullptr;
}

LRESULT CALLBACK Platform::windowProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam) {
    Platform* platform = nullptr;

    if (msg == WM_NCCREATE) {
        CREATESTRUCT* cs = reinterpret_cast<CREATESTRUCT*>(lParam);
        platform = reinterpret_cast<Platform*>(cs->lpCreateParams);
        SetWindowLongPtr(hwnd, GWLP_USERDATA, reinterpret_cast<LONG_PTR>(platform));
    } else {
        platform = reinterpret_cast<Platform*>(GetWindowLongPtr(hwnd, GWLP_USERDATA));
    }

    if (!platform) return DefWindowProc(hwnd, msg, wParam, lParam);

    switch (msg) {
    case WM_CLOSE:
        PostQuitMessage(0);
        return 0;

    case WM_DESTROY:
        platform->m_handle = nullptr;
        return 0;

    case WM_SIZE: {
        uint32_t newW = LOWORD(lParam);
        uint32_t newH = HIWORD(lParam);
        if (newW > 0 && newH > 0) {
            platform->m_width = newW;
            platform->m_height = newH;
            platform->m_minimized = (wParam == SIZE_MINIMIZED);
            if (platform->m_resizeCallback) {
                platform->m_resizeCallback(newW, newH);
            }
        }
        return 0;
    }

    case WM_KEYDOWN:
    case WM_SYSKEYDOWN: {
        int key = (int)wParam;
        if (key >= 0 && key < 256) {
            platform->m_input.keys[key] = true;
            if (platform->m_keyCallback) platform->m_keyCallback(key, 0, true);
        }
        return 0;
    }

    case WM_KEYUP:
    case WM_SYSKEYUP: {
        int key = (int)wParam;
        if (key >= 0 && key < 256) {
            platform->m_input.keys[key] = false;
            if (platform->m_keyCallback) platform->m_keyCallback(key, 0, false);
        }
        return 0;
    }

    case WM_LBUTTONDOWN:
        platform->m_input.mouseButtons[0] = true;
        if (platform->m_mouseCallback) platform->m_mouseCallback(0, 1);
        SetCapture(hwnd);
        return 0;
    case WM_LBUTTONUP:
        platform->m_input.mouseButtons[0] = false;
        if (platform->m_mouseCallback) platform->m_mouseCallback(0, 0);
        ReleaseCapture();
        return 0;
    case WM_RBUTTONDOWN:
        platform->m_input.mouseButtons[1] = true;
        if (platform->m_mouseCallback) platform->m_mouseCallback(1, 1);
        return 0;
    case WM_RBUTTONUP:
        platform->m_input.mouseButtons[1] = false;
        if (platform->m_mouseCallback) platform->m_mouseCallback(1, 0);
        return 0;
    case WM_MBUTTONDOWN:
        platform->m_input.mouseButtons[2] = true;
        if (platform->m_mouseCallback) platform->m_mouseCallback(2, 1);
        return 0;
    case WM_MBUTTONUP:
        platform->m_input.mouseButtons[2] = false;
        if (platform->m_mouseCallback) platform->m_mouseCallback(2, 0);
        return 0;

    case WM_MOUSEMOVE: {
        int x = GET_X_LPARAM(lParam);
        int y = GET_Y_LPARAM(lParam);
        platform->m_input.mouseDeltaX = x - platform->m_input.mouseX;
        platform->m_input.mouseDeltaY = y - platform->m_input.mouseY;
        platform->m_input.mouseX = x;
        platform->m_input.mouseY = y;
        return 0;
    }

    case WM_MOUSEWHEEL: {
        float delta = (float)GET_WHEEL_DELTA_WPARAM(wParam) / WHEEL_DELTA;
        platform->m_input.mouseScrollY += delta;
        if (platform->m_scrollCallback) platform->m_scrollCallback(0.0f, delta);
        return 0;
    }

    case WM_DROPFILES: {
        HDROP hDrop = (HDROP)wParam;
        char filePath[MAX_PATH];
        if (DragQueryFileA(hDrop, 0, filePath, MAX_PATH)) {
            if (platform->m_dropCallback) platform->m_dropCallback(filePath);
        }
        DragFinish(hDrop);
        return 0;
    }

    case WM_CHAR: {
        if (wParam > 0 && wParam < 128) {
            platform->m_input.inputChar = (char)wParam;
        }
        return 0;
    }
    }

    return DefWindowProc(hwnd, msg, wParam, lParam);
}

#endif // _WIN32

bool Platform::processMessages() {
#ifdef _WIN32
    MSG msg = {};
    while (PeekMessage(&msg, nullptr, 0, 0, PM_REMOVE)) {
        if (msg.message == WM_QUIT) {
            return false;
        }
        TranslateMessage(&msg);
        DispatchMessage(&msg);
    }
#endif
    return true;
}

void Platform::setTitle(const std::string& title) {
#ifdef _WIN32
    if (m_handle) {
        SetWindowTextA((HWND)m_handle, title.c_str());
    }
#endif
}

void Platform::setSize(uint32_t width, uint32_t height) {
#ifdef _WIN32
    if (m_handle) {
        RECT rect = {0, 0, (LONG)width, (LONG)height};
        DWORD style = GetWindowLong((HWND)m_handle, GWL_STYLE);
        AdjustWindowRect(&rect, style, FALSE);
        SetWindowPos((HWND)m_handle, nullptr, 0, 0,
                     rect.right - rect.left, rect.bottom - rect.top,
                     SWP_NOMOVE | SWP_NOZORDER);
    }
#endif
}

void Platform::swapBuffers() {
#ifdef _WIN32
    if (m_hDC) {
        SwapBuffers(m_hDC);
    }
#endif
}

void Platform::setVSync(bool enabled) {
#ifdef _WIN32
    typedef BOOL (WINAPI *PFNWGLSWAPINTERVALEXTPROC)(int);
    PFNWGLSWAPINTERVALEXTPROC wglSwapIntervalEXT =
        (PFNWGLSWAPINTERVALEXTPROC)wglGetProcAddress("wglSwapIntervalEXT");
    if (wglSwapIntervalEXT) {
        wglSwapIntervalEXT(enabled ? 1 : 0);
        m_vsync = enabled;
    }
#endif
}

bool Platform::isKeyPressed(int key) const {
    if (key < 0 || key >= 256) return false;
    return m_input.keys[key];
}

bool Platform::isMouseButtonPressed(int button) const {
    if (button < 0 || button >= 8) return false;
    return m_input.mouseButtons[button];
}

void Platform::getMousePosition(int& x, int& y) const {
    x = m_input.mouseX;
    y = m_input.mouseY;
}

void Platform::getMouseDelta(int& dx, int& dy) const {
    dx = m_input.mouseDeltaX;
    dy = m_input.mouseDeltaY;
}

void Platform::setCursorVisible(bool visible) {
#ifdef _WIN32
    ShowCursor(visible ? TRUE : FALSE);
    m_input.cursorVisible = visible;
#endif
}

void Platform::setCursorLocked(bool locked) {
#ifdef _WIN32
    if (locked && m_handle) {
        RECT rect;
        GetClientRect((HWND)m_handle, &rect);
        POINT center = { (rect.right - rect.left) / 2, (rect.bottom - rect.top) / 2 };
        ClientToScreen((HWND)m_handle, &center);
        SetCursorPos(center.x, center.y);
        ClipCursor(&rect);
        // Create a blank cursor to hide it
        HCURSOR hCursor = nullptr;
        BYTE andMask = 0xFF;
        BYTE xorMask = 0x00;
        hCursor = CreateCursor(m_hInstance, 0, 0, 1, 1, &andMask, &xorMask);
        if (hCursor) SetCursor(hCursor);
        ShowCursor(FALSE);
    } else {
        ClipCursor(nullptr);
        SetCursor(LoadCursor(nullptr, IDC_ARROW));
        ShowCursor(TRUE);
    }
    m_input.cursorLocked = locked;
#endif
}

void Platform::resetMouseScroll() {
    m_input.mouseScrollX = 0.0f;
    m_input.mouseScrollY = 0.0f;
}

double Platform::getTime() const {
#ifdef _WIN32
    static LARGE_INTEGER freq = {};
    static bool freqGot = false;
    if (!freqGot) {
        QueryPerformanceFrequency(&freq);
        freqGot = true;
    }
    LARGE_INTEGER now;
    QueryPerformanceCounter(&now);
    return (double)now.QuadPart / (double)freq.QuadPart;
#else
    return 0.0;
#endif
}

std::string Platform::openFileDialog(const char* filter) {
#ifdef _WIN32
    char filename[MAX_PATH] = "";
    OPENFILENAMEA ofn = {};
    ofn.lStructSize = sizeof(OPENFILENAMEA);
    ofn.hwndOwner = (HWND)m_handle;
    ofn.lpstrFilter = filter;
    ofn.lpstrFile = filename;
    ofn.nMaxFile = MAX_PATH;
    ofn.lpstrTitle = "Open File";
    ofn.Flags = OFN_FILEMUSTEXIST | OFN_PATHMUSTEXIST | OFN_NOCHANGEDIR;

    if (GetOpenFileNameA(&ofn)) {
        return std::string(filename);
    }
#endif
    return "";
}

std::string Platform::saveFileDialog(const char* filter) {
#ifdef _WIN32
    char filename[MAX_PATH] = "";
    OPENFILENAMEA ofn = {};
    ofn.lStructSize = sizeof(OPENFILENAMEA);
    ofn.hwndOwner = (HWND)m_handle;
    ofn.lpstrFilter = filter;
    ofn.lpstrFile = filename;
    ofn.nMaxFile = MAX_PATH;
    ofn.lpstrTitle = "Save File";
    ofn.Flags = OFN_OVERWRITEPROMPT | OFN_NOCHANGEDIR;

    if (GetSaveFileNameA(&ofn)) {
        return std::string(filename);
    }
#endif
    return "";
}

std::string Platform::openDirectoryDialog() {
#ifdef _WIN32
    BROWSEINFOA bi = {};
    bi.hwndOwner = (HWND)m_handle;
    bi.lpszTitle = "Select Directory";
    bi.ulFlags = BIF_RETURNONLYFSDIRS | BIF_NEWDIALOGSTYLE;

    LPITEMIDLIST pidl = SHBrowseForFolderA(&bi);
    if (pidl) {
        char path[MAX_PATH];
        if (SHGetPathFromIDListA(pidl, path)) {
            CoTaskMemFree(pidl);
            return std::string(path);
        }
        CoTaskMemFree(pidl);
    }
#endif
    return "";
}

} // namespace Ember
