#include "Engine/Rendering/GL.h"
#include "Engine/Core/Logging.h"

#ifdef _WIN32

// Define all GL extension function pointers
// Buffer Object functions
PFNGLGENBUFFERSPROC glGenBuffers = nullptr;
PFNGLDELETEBUFFERSPROC glDeleteBuffers = nullptr;
PFNGLBINDBUFFERPROC glBindBuffer = nullptr;
PFNGLBUFFERDATAPROC glBufferData = nullptr;

PFNGLVERTEXATTRIBPOINTERPROC glVertexAttribPointer = nullptr;
PFNGLENABLEVERTEXATTRIBARRAYPROC glEnableVertexAttribArray = nullptr;
PFNGLDISABLEVERTEXATTRIBARRAYPROC glDisableVertexAttribArray = nullptr;

// Framebuffer Objects
PFNGLGENFRAMEBUFFERSPROC glGenFramebuffers = nullptr;
PFNGLDELETEFRAMEBUFFERSPROC glDeleteFramebuffers = nullptr;
PFNGLBINDFRAMEBUFFERPROC glBindFramebuffer = nullptr;
PFNGLFRAMEBUFFERTEXTURE2DPROC glFramebufferTexture2D = nullptr;
PFNGLFRAMEBUFFERRENDERBUFFERPROC glFramebufferRenderbuffer = nullptr;
PFNGLCHECKFRAMEBUFFERSTATUSPROC glCheckFramebufferStatus = nullptr;
PFNGLBLITFRAMEBUFFERPROC glBlitFramebuffer = nullptr;
PFNGLGENRENDERBUFFERSPROC glGenRenderbuffers = nullptr;
PFNGLDELETERENDERBUFFERSPROC glDeleteRenderbuffers = nullptr;
PFNGLBINDRENDERBUFFERPROC glBindRenderbuffer = nullptr;
PFNGLRENDERBUFFERSTORAGEPROC glRenderbufferStorage = nullptr;

// Vertex Array Objects
PFNGLGENVERTEXARRAYSPROC glGenVertexArrays = nullptr;
PFNGLDELETEVERTEXARRAYSPROC glDeleteVertexArrays = nullptr;
PFNGLBINDVERTEXARRAYPROC glBindVertexArray = nullptr;

PFNGLCREATESHADERPROC glCreateShader = nullptr;
PFNGLDELETESHADERPROC glDeleteShader = nullptr;
PFNGLSHADERSOURCEPROC glShaderSource = nullptr;
PFNGLCOMPILESHADERPROC glCompileShader = nullptr;
PFNGLGETSHADERIVPROC glGetShaderiv = nullptr;
PFNGLGETSHADERINFOLOGPROC glGetShaderInfoLog = nullptr;
PFNGLCREATEPROGRAMPROC glCreateProgram = nullptr;
PFNGLDELETEPROGRAMPROC glDeleteProgram = nullptr;
PFNGLATTACHSHADERPROC glAttachShader = nullptr;
PFNGLDETACHSHADERPROC glDetachShader = nullptr;
PFNGLLINKPROGRAMPROC glLinkProgram = nullptr;
PFNGLVALIDATEPROGRAMPROC glValidateProgram = nullptr;
PFNGLGETPROGRAMIVPROC glGetProgramiv = nullptr;
PFNGLGETPROGRAMINFOLOGPROC glGetProgramInfoLog = nullptr;
PFNGLUSEPROGRAMPROC glUseProgram = nullptr;
PFNGLGETUNIFORMLOCATIONPROC glGetUniformLocation = nullptr;
PFNGLUNIFORM1IPROC glUniform1i = nullptr;
PFNGLUNIFORM1FPROC glUniform1f = nullptr;
PFNGLUNIFORM2FPROC glUniform2f = nullptr;
PFNGLUNIFORM3FPROC glUniform3f = nullptr;
PFNGLUNIFORM4FPROC glUniform4f = nullptr;
PFNGLUNIFORMMATRIX3FVPROC glUniformMatrix3fv = nullptr;
PFNGLUNIFORMMATRIX4FVPROC glUniformMatrix4fv = nullptr;

PFNGLACTIVETEXTUREPROC glActiveTexture = nullptr;
PFNGLGENERATEMIPMAPROC glGenerateMipmap = nullptr;

// Helper to load a single function pointer
template<typename T>
static T loadFunc(HMODULE lib, const char* name) {
    T func = (T)wglGetProcAddress(name);
    if (!func) func = (T)GetProcAddress(lib, name);
    return func;
}

bool loadGLExtensions() {
    HMODULE opengl32 = GetModuleHandleA("opengl32.dll");
    if (!opengl32) {
        EMBER_LOG_ERROR("Failed to get opengl32.dll handle");
        return false;
    }

    // Buffer Objects
    glGenBuffers = loadFunc<PFNGLGENBUFFERSPROC>(opengl32, "glGenBuffers");
    glDeleteBuffers = loadFunc<PFNGLDELETEBUFFERSPROC>(opengl32, "glDeleteBuffers");
    glBindBuffer = loadFunc<PFNGLBINDBUFFERPROC>(opengl32, "glBindBuffer");
    glBufferData = loadFunc<PFNGLBUFFERDATAPROC>(opengl32, "glBufferData");

    // Vertex attributes
    glVertexAttribPointer = loadFunc<PFNGLVERTEXATTRIBPOINTERPROC>(opengl32, "glVertexAttribPointer");
    glEnableVertexAttribArray = loadFunc<PFNGLENABLEVERTEXATTRIBARRAYPROC>(opengl32, "glEnableVertexAttribArray");
    glDisableVertexAttribArray = loadFunc<PFNGLDISABLEVERTEXATTRIBARRAYPROC>(opengl32, "glDisableVertexAttribArray");

    // Framebuffer objects
    glGenFramebuffers = loadFunc<PFNGLGENFRAMEBUFFERSPROC>(opengl32, "glGenFramebuffers");
    glDeleteFramebuffers = loadFunc<PFNGLDELETEFRAMEBUFFERSPROC>(opengl32, "glDeleteFramebuffers");
    glBindFramebuffer = loadFunc<PFNGLBINDFRAMEBUFFERPROC>(opengl32, "glBindFramebuffer");
    glFramebufferTexture2D = loadFunc<PFNGLFRAMEBUFFERTEXTURE2DPROC>(opengl32, "glFramebufferTexture2D");
    glFramebufferRenderbuffer = loadFunc<PFNGLFRAMEBUFFERRENDERBUFFERPROC>(opengl32, "glFramebufferRenderbuffer");
    glCheckFramebufferStatus = loadFunc<PFNGLCHECKFRAMEBUFFERSTATUSPROC>(opengl32, "glCheckFramebufferStatus");
    glBlitFramebuffer = loadFunc<PFNGLBLITFRAMEBUFFERPROC>(opengl32, "glBlitFramebuffer");
    glGenRenderbuffers = loadFunc<PFNGLGENRENDERBUFFERSPROC>(opengl32, "glGenRenderbuffers");
    glDeleteRenderbuffers = loadFunc<PFNGLDELETERENDERBUFFERSPROC>(opengl32, "glDeleteRenderbuffers");
    glBindRenderbuffer = loadFunc<PFNGLBINDRENDERBUFFERPROC>(opengl32, "glBindRenderbuffer");
    glRenderbufferStorage = loadFunc<PFNGLRENDERBUFFERSTORAGEPROC>(opengl32, "glRenderbufferStorage");

    // Vertex Array Objects
    glGenVertexArrays = loadFunc<PFNGLGENVERTEXARRAYSPROC>(opengl32, "glGenVertexArrays");
    glDeleteVertexArrays = loadFunc<PFNGLDELETEVERTEXARRAYSPROC>(opengl32, "glDeleteVertexArrays");
    glBindVertexArray = loadFunc<PFNGLBINDVERTEXARRAYPROC>(opengl32, "glBindVertexArray");

    // Shaders
    glCreateShader = loadFunc<PFNGLCREATESHADERPROC>(opengl32, "glCreateShader");
    glDeleteShader = loadFunc<PFNGLDELETESHADERPROC>(opengl32, "glDeleteShader");
    glShaderSource = loadFunc<PFNGLSHADERSOURCEPROC>(opengl32, "glShaderSource");
    glCompileShader = loadFunc<PFNGLCOMPILESHADERPROC>(opengl32, "glCompileShader");
    glGetShaderiv = loadFunc<PFNGLGETSHADERIVPROC>(opengl32, "glGetShaderiv");
    glGetShaderInfoLog = loadFunc<PFNGLGETSHADERINFOLOGPROC>(opengl32, "glGetShaderInfoLog");
    glCreateProgram = loadFunc<PFNGLCREATEPROGRAMPROC>(opengl32, "glCreateProgram");
    glDeleteProgram = loadFunc<PFNGLDELETEPROGRAMPROC>(opengl32, "glDeleteProgram");
    glAttachShader = loadFunc<PFNGLATTACHSHADERPROC>(opengl32, "glAttachShader");
    glDetachShader = loadFunc<PFNGLDETACHSHADERPROC>(opengl32, "glDetachShader");
    glLinkProgram = loadFunc<PFNGLLINKPROGRAMPROC>(opengl32, "glLinkProgram");
    glValidateProgram = loadFunc<PFNGLVALIDATEPROGRAMPROC>(opengl32, "glValidateProgram");
    glGetProgramiv = loadFunc<PFNGLGETPROGRAMIVPROC>(opengl32, "glGetProgramiv");
    glGetProgramInfoLog = loadFunc<PFNGLGETPROGRAMINFOLOGPROC>(opengl32, "glGetProgramInfoLog");
    glUseProgram = loadFunc<PFNGLUSEPROGRAMPROC>(opengl32, "glUseProgram");
    glGetUniformLocation = loadFunc<PFNGLGETUNIFORMLOCATIONPROC>(opengl32, "glGetUniformLocation");
    glUniform1i = loadFunc<PFNGLUNIFORM1IPROC>(opengl32, "glUniform1i");
    glUniform1f = loadFunc<PFNGLUNIFORM1FPROC>(opengl32, "glUniform1f");
    glUniform2f = loadFunc<PFNGLUNIFORM2FPROC>(opengl32, "glUniform2f");
    glUniform3f = loadFunc<PFNGLUNIFORM3FPROC>(opengl32, "glUniform3f");
    glUniform4f = loadFunc<PFNGLUNIFORM4FPROC>(opengl32, "glUniform4f");
    glUniformMatrix3fv = loadFunc<PFNGLUNIFORMMATRIX3FVPROC>(opengl32, "glUniformMatrix3fv");
    glUniformMatrix4fv = loadFunc<PFNGLUNIFORMMATRIX4FVPROC>(opengl32, "glUniformMatrix4fv");

    // Textures
    glActiveTexture = loadFunc<PFNGLACTIVETEXTUREPROC>(opengl32, "glActiveTexture");
    glGenerateMipmap = loadFunc<PFNGLGENERATEMIPMAPROC>(opengl32, "glGenerateMipmap");

    // Verify critical functions loaded
    bool allLoaded = true;
    if (!glGenFramebuffers || !glBindFramebuffer || !glCheckFramebufferStatus) {
        EMBER_LOG_ERROR("Failed to load FBO functions");
        allLoaded = false;
    }
    if (!glGenVertexArrays || !glBindVertexArray) {
        EMBER_LOG_ERROR("Failed to load VAO functions");
        allLoaded = false;
    }
    if (!glCreateShader || !glCreateProgram || !glLinkProgram) {
        EMBER_LOG_ERROR("Failed to load shader functions");
        allLoaded = false;
    }

    if (allLoaded) {
        EMBER_LOG_INFO("All OpenGL extension functions loaded successfully");
    }

    return allLoaded;
}

#endif // _WIN32
