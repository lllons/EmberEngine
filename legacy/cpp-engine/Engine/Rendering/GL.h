#pragma once

// ============ Centralized OpenGL Header for EmberEngine ============
// This header ensures all OpenGL extension functions are properly declared
// across all platforms (Windows, Linux, macOS).

#ifdef _WIN32
    #define WIN32_LEAN_AND_MEAN
    #ifndef NOMINMAX
        #define NOMINMAX
    #endif
    #include <windows.h>
    
    // Include GL headers
    #include <GL/gl.h>
    
    // Type definitions not in Windows GL/gl.h (GL 1.1 only)
    #ifndef GLchar
        typedef char GLchar;
    #endif
    #ifndef GLsizeiptr
        typedef ptrdiff_t GLsizeiptr;
    #endif
    #ifndef GLintptr
        typedef ptrdiff_t GLintptr;
    #endif
    
    // Declare GL extension function pointer types and prototypes
    // that are not in the standard Windows GL/gl.h (which only has GL 1.1)
    
    // ----- Framebuffer Objects (GL 3.0 / ARB_framebuffer_object) -----
    #ifndef GL_VERSION_3_0
        #define GL_FRAMEBUFFER                    0x8D40
        #define GL_READ_FRAMEBUFFER               0x8CA8
        #define GL_DRAW_FRAMEBUFFER               0x8CA9
        #define GL_RENDERBUFFER                   0x8D41
        #define GL_COLOR_ATTACHMENT0              0x8CE0
        #define GL_DEPTH_ATTACHMENT               0x8D00
        #define GL_STENCIL_ATTACHMENT             0x8D20
        #define GL_DEPTH_STENCIL_ATTACHMENT       0x821A
        #define GL_FRAMEBUFFER_COMPLETE           0x8CD5
        #define GL_DEPTH_COMPONENT24              0x81A6
        #define GL_DEPTH_COMPONENT32              0x81A7
        #define GL_DEPTH24_STENCIL8               0x88F0
        #define GL_READ_FRAMEBUFFER               0x8CA8
        #define GL_DRAW_FRAMEBUFFER               0x8CA9
        #define GL_DEPTH_STENCIL                  0x84F9
    #endif

    #ifndef GL_VERSION_2_0
        #define GL_VERTEX_SHADER                  0x8B31
        #define GL_FRAGMENT_SHADER                0x8B30
        #define GL_COMPILE_STATUS                 0x8B81
        #define GL_LINK_STATUS                    0x8B82
        #define GL_INFO_LOG_LENGTH                0x8B84
        #define GL_TRUE                           1
        #define GL_FALSE                          0
    #endif

    #ifndef GL_VERSION_3_0
        #define GL_RGBA16F                        0x881A
        #define GL_RGB16F                         0x881B
        #define GL_RGBA32F                        0x8814
        #define GL_RGB32F                         0x8815
        #define GL_R8                             0x8229
        #define GL_RG8                            0x822B
        #define GL_DEPTH_COMPONENT16              0x81A5
        #define GL_DEPTH_COMPONENT32F             0x8CAC
    #endif

    #ifndef GL_VERSION_1_3
        #define GL_TEXTURE0                       0x84C0
        #define GL_ACTIVE_TEXTURE                 0x84E0
        #define GL_CLAMP_TO_BORDER                0x812D
        #define GL_TEXTURE_CUBE_MAP               0x8513
        #define GL_TEXTURE_CUBE_MAP_POSITIVE_X    0x8515
        #define GL_TEXTURE_CUBE_MAP_NEGATIVE_X    0x8516
        #define GL_TEXTURE_CUBE_MAP_POSITIVE_Y    0x8517
        #define GL_TEXTURE_CUBE_MAP_NEGATIVE_Y    0x8518
        #define GL_TEXTURE_CUBE_MAP_POSITIVE_Z    0x8519
        #define GL_TEXTURE_CUBE_MAP_NEGATIVE_Z    0x851A
        #define GL_TEXTURE_WRAP_R                 0x8072
    #endif

    #ifndef GL_VERSION_1_4
        #define GL_FUNC_ADD                       0x8006
        #define GL_MIRRORED_REPEAT                0x8370
    #endif

    #ifndef GL_VERSION_3_0
        #define GL_MIPMAP_LINEAR                  0x2703
        #define GL_NEAREST_MIPMAP_NEAREST         0x2700
        #define GL_LINEAR_MIPMAP_NEAREST          0x2701
        #define GL_NEAREST_MIPMAP_LINEAR          0x2702
        #define GL_LINEAR_MIPMAP_LINEAR           0x2703
    #endif

    #ifndef GL_VERSION_1_3
        #define GL_TEXTURE_BORDER_COLOR           0x1004
    #endif

    #ifndef GL_VERSION_3_0
        #define GL_RED                            0x1903
        #define GL_RG                             0x8227
        #define GL_FRAMEBUFFER_COMPLETE           0x8CD5
        #define GL_COLOR_BUFFER_BIT               0x00004000
        #define GL_DEPTH_BUFFER_BIT               0x00000100
        #define GL_STENCIL_BUFFER_BIT             0x00000400
        #define GL_NEAREST                        0x2600
        #define GL_LINEAR                         0x2601
        #define GL_REPEAT                         0x2901
        #define GL_CLAMP_TO_EDGE                  0x812F
        #define GL_TEXTURE_MIN_FILTER             0x2801
        #define GL_TEXTURE_MAG_FILTER             0x2800
        #define GL_TEXTURE_WRAP_S                 0x2802
        #define GL_TEXTURE_WRAP_T                 0x2803
    #endif

    // Buffer Object functions (GL 1.5 / ARB_buffer_object)
    #ifndef GL_ARRAY_BUFFER
        #define GL_ARRAY_BUFFER                 0x8892
        #define GL_ELEMENT_ARRAY_BUFFER         0x8893
        #define GL_STATIC_DRAW                  0x88E4
        #define GL_DYNAMIC_DRAW                 0x88E8
    #endif
    
    #ifndef GL_VERSION_2_0
        #define GL_FLOAT                        0x1406
        #define GL_UNSIGNED_INT                 0x1405
    #endif
    
    typedef void (APIENTRY *PFNGLGENBUFFERSPROC)(GLsizei n, GLuint *buffers);
    typedef void (APIENTRY *PFNGLDELETEBUFFERSPROC)(GLsizei n, const GLuint *buffers);
    typedef void (APIENTRY *PFNGLBINDBUFFERPROC)(GLenum target, GLuint buffer);
    typedef void (APIENTRY *PFNGLBUFFERDATAPROC)(GLenum target, GLsizeiptr size, const void *data, GLenum usage);
    
    typedef void (APIENTRY *PFNGLVERTEXATTRIBPOINTERPROC)(GLuint index, GLint size, GLenum type, GLboolean normalized, GLsizei stride, const void *pointer);
    typedef void (APIENTRY *PFNGLENABLEVERTEXATTRIBARRAYPROC)(GLuint index);
    typedef void (APIENTRY *PFNGLDISABLEVERTEXATTRIBARRAYPROC)(GLuint index);
    
    extern PFNGLGENBUFFERSPROC glGenBuffers;
    extern PFNGLDELETEBUFFERSPROC glDeleteBuffers;
    extern PFNGLBINDBUFFERPROC glBindBuffer;
    extern PFNGLBUFFERDATAPROC glBufferData;
    
    extern PFNGLVERTEXATTRIBPOINTERPROC glVertexAttribPointer;
    extern PFNGLENABLEVERTEXATTRIBARRAYPROC glEnableVertexAttribArray;
    extern PFNGLDISABLEVERTEXATTRIBARRAYPROC glDisableVertexAttribArray;

    // Function pointer typedefs
    typedef void (APIENTRY *PFNGLGENFRAMEBUFFERSPROC)(GLsizei n, GLuint *framebuffers);
    typedef void (APIENTRY *PFNGLDELETEFRAMEBUFFERSPROC)(GLsizei n, const GLuint *framebuffers);
    typedef void (APIENTRY *PFNGLBINDFRAMEBUFFERPROC)(GLenum target, GLuint framebuffer);
    typedef void (APIENTRY *PFNGLFRAMEBUFFERTEXTURE2DPROC)(GLenum target, GLenum attachment, GLenum textarget, GLuint texture, GLint level);
    typedef void (APIENTRY *PFNGLFRAMEBUFFERRENDERBUFFERPROC)(GLenum target, GLenum attachment, GLenum renderbuffertarget, GLuint renderbuffer);
    typedef GLenum (APIENTRY *PFNGLCHECKFRAMEBUFFERSTATUSPROC)(GLenum target);
    typedef void (APIENTRY *PFNGLBLITFRAMEBUFFERPROC)(GLint srcX0, GLint srcY0, GLint srcX1, GLint srcY1, GLint dstX0, GLint dstY0, GLint dstX1, GLint dstY1, GLbitfield mask, GLenum filter);
    typedef void (APIENTRY *PFNGLGENRENDERBUFFERSPROC)(GLsizei n, GLuint *renderbuffers);
    typedef void (APIENTRY *PFNGLDELETERENDERBUFFERSPROC)(GLsizei n, const GLuint *renderbuffers);
    typedef void (APIENTRY *PFNGLBINDRENDERBUFFERPROC)(GLenum target, GLuint renderbuffer);
    typedef void (APIENTRY *PFNGLRENDERBUFFERSTORAGEPROC)(GLenum target, GLenum internalformat, GLsizei width, GLsizei height);

    // VAO functions (GL 3.0 / ARB_vertex_array_object)
    typedef void (APIENTRY *PFNGLGENVERTEXARRAYSPROC)(GLsizei n, GLuint *arrays);
    typedef void (APIENTRY *PFNGLDELETEVERTEXARRAYSPROC)(GLsizei n, const GLuint *arrays);
    typedef void (APIENTRY *PFNGLBINDVERTEXARRAYPROC)(GLuint array);

    // Shader functions (GL 2.0)
    typedef GLuint (APIENTRY *PFNGLCREATESHADERPROC)(GLenum type);
    typedef void (APIENTRY *PFNGLDELETESHADERPROC)(GLuint shader);
    typedef void (APIENTRY *PFNGLSHADERSOURCEPROC)(GLuint shader, GLsizei count, const GLchar *const*string, const GLint *length);
    typedef void (APIENTRY *PFNGLCOMPILESHADERPROC)(GLuint shader);
    typedef void (APIENTRY *PFNGLGETSHADERIVPROC)(GLuint shader, GLenum pname, GLint *params);
    typedef void (APIENTRY *PFNGLGETSHADERINFOLOGPROC)(GLuint shader, GLsizei bufSize, GLsizei *length, GLchar *infoLog);
    typedef GLuint (APIENTRY *PFNGLCREATEPROGRAMPROC)(void);
    typedef void (APIENTRY *PFNGLDELETEPROGRAMPROC)(GLuint program);
    typedef void (APIENTRY *PFNGLATTACHSHADERPROC)(GLuint program, GLuint shader);
    typedef void (APIENTRY *PFNGLDETACHSHADERPROC)(GLuint program, GLuint shader);
    typedef void (APIENTRY *PFNGLLINKPROGRAMPROC)(GLuint program);
    typedef void (APIENTRY *PFNGLVALIDATEPROGRAMPROC)(GLuint program);
    typedef void (APIENTRY *PFNGLGETPROGRAMIVPROC)(GLuint program, GLenum pname, GLint *params);
    typedef void (APIENTRY *PFNGLGETPROGRAMINFOLOGPROC)(GLuint program, GLsizei bufSize, GLsizei *length, GLchar *infoLog);
    typedef void (APIENTRY *PFNGLUSEPROGRAMPROC)(GLuint program);
    typedef GLint (APIENTRY *PFNGLGETUNIFORMLOCATIONPROC)(GLuint program, const GLchar *name);
    typedef void (APIENTRY *PFNGLUNIFORM1IPROC)(GLint location, GLint v0);
    typedef void (APIENTRY *PFNGLUNIFORM1FPROC)(GLint location, GLfloat v0);
    typedef void (APIENTRY *PFNGLUNIFORM2FPROC)(GLint location, GLfloat v0, GLfloat v1);
    typedef void (APIENTRY *PFNGLUNIFORM3FPROC)(GLint location, GLfloat v0, GLfloat v1, GLfloat v2);
    typedef void (APIENTRY *PFNGLUNIFORM4FPROC)(GLint location, GLfloat v0, GLfloat v1, GLfloat v2, GLfloat v3);
    typedef void (APIENTRY *PFNGLUNIFORMMATRIX3FVPROC)(GLint location, GLsizei count, GLboolean transpose, const GLfloat *value);
    typedef void (APIENTRY *PFNGLUNIFORMMATRIX4FVPROC)(GLint location, GLsizei count, GLboolean transpose, const GLfloat *value);

    // Texture functions (GL 1.3)
    typedef void (APIENTRY *PFNGLACTIVETEXTUREPROC)(GLenum texture);

    // Mipmap generation (GL 3.0)
    typedef void (APIENTRY *PFNGLGENERATEMIPMAPROC)(GLenum target);

    // Extern declarations for function pointers
    extern PFNGLGENFRAMEBUFFERSPROC glGenFramebuffers;
    extern PFNGLDELETEFRAMEBUFFERSPROC glDeleteFramebuffers;
    extern PFNGLBINDFRAMEBUFFERPROC glBindFramebuffer;
    extern PFNGLFRAMEBUFFERTEXTURE2DPROC glFramebufferTexture2D;
    extern PFNGLFRAMEBUFFERRENDERBUFFERPROC glFramebufferRenderbuffer;
    extern PFNGLCHECKFRAMEBUFFERSTATUSPROC glCheckFramebufferStatus;
    extern PFNGLBLITFRAMEBUFFERPROC glBlitFramebuffer;
    extern PFNGLGENRENDERBUFFERSPROC glGenRenderbuffers;
    extern PFNGLDELETERENDERBUFFERSPROC glDeleteRenderbuffers;
    extern PFNGLBINDRENDERBUFFERPROC glBindRenderbuffer;
    extern PFNGLRENDERBUFFERSTORAGEPROC glRenderbufferStorage;

    extern PFNGLGENVERTEXARRAYSPROC glGenVertexArrays;
    extern PFNGLDELETEVERTEXARRAYSPROC glDeleteVertexArrays;
    extern PFNGLBINDVERTEXARRAYPROC glBindVertexArray;

    extern PFNGLCREATESHADERPROC glCreateShader;
    extern PFNGLDELETESHADERPROC glDeleteShader;
    extern PFNGLSHADERSOURCEPROC glShaderSource;
    extern PFNGLCOMPILESHADERPROC glCompileShader;
    extern PFNGLGETSHADERIVPROC glGetShaderiv;
    extern PFNGLGETSHADERINFOLOGPROC glGetShaderInfoLog;
    extern PFNGLCREATEPROGRAMPROC glCreateProgram;
    extern PFNGLDELETEPROGRAMPROC glDeleteProgram;
    extern PFNGLATTACHSHADERPROC glAttachShader;
    extern PFNGLDETACHSHADERPROC glDetachShader;
    extern PFNGLLINKPROGRAMPROC glLinkProgram;
    extern PFNGLVALIDATEPROGRAMPROC glValidateProgram;
    extern PFNGLGETPROGRAMIVPROC glGetProgramiv;
    extern PFNGLGETPROGRAMINFOLOGPROC glGetProgramInfoLog;
    extern PFNGLUSEPROGRAMPROC glUseProgram;
    extern PFNGLGETUNIFORMLOCATIONPROC glGetUniformLocation;
    extern PFNGLUNIFORM1IPROC glUniform1i;
    extern PFNGLUNIFORM1FPROC glUniform1f;
    extern PFNGLUNIFORM2FPROC glUniform2f;
    extern PFNGLUNIFORM3FPROC glUniform3f;
    extern PFNGLUNIFORM4FPROC glUniform4f;
    extern PFNGLUNIFORMMATRIX3FVPROC glUniformMatrix3fv;
    extern PFNGLUNIFORMMATRIX4FVPROC glUniformMatrix4fv;

    extern PFNGLACTIVETEXTUREPROC glActiveTexture;
    extern PFNGLGENERATEMIPMAPROC glGenerateMipmap;

    // Function to load all GL extension function pointers
    bool loadGLExtensions();

#else
    // Linux/macOS - use GL_GLEXT_PROTOTYPES
    #define GL_GLEXT_PROTOTYPES
    #include <GL/gl.h>
    #include <GL/glext.h>
    
    #ifdef __APPLE__
        #include <OpenGL/gl3.h>
    #endif
    
    // On Linux/macOS, function prototypes are available directly
    inline bool loadGLExtensions() { return true; }
#endif
