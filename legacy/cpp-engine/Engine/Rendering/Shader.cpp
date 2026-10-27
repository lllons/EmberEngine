#include "Engine/Rendering/Shader.h"
#include "Engine/Core/Logging.h"
#include "Engine/Rendering/GL.h"
#include <fstream>
#include <sstream>

namespace Ember {

Shader::~Shader() { unload(); }

bool Shader::loadFromFile(const std::string& vertexPath, const std::string& fragmentPath) {
    std::string vertexSource = readFile(vertexPath);
    std::string fragmentSource = readFile(fragmentPath);
    if (vertexSource.empty() || fragmentSource.empty()) return false;
    return compile(vertexSource, fragmentSource);
}

bool Shader::loadFromSource(const std::string& vertexSource, const std::string& fragmentSource) {
    return compile(vertexSource, fragmentSource);
}

void Shader::unload() {
    if (m_programID) {
        glDeleteProgram(m_programID);
        m_programID = 0;
    }
    m_uniformCache.clear();
    m_bound = false;
}

void Shader::bind() const {
    if (m_programID) {
        glUseProgram(m_programID);
        m_bound = true;
    }
}

void Shader::unbind() const {
    glUseProgram(0);
    m_bound = false;
}

void Shader::setInt(const std::string& name, int value) {
    int loc = getUniformLocation(name);
    if (loc >= 0) glUniform1i(loc, value);
}

void Shader::setFloat(const std::string& name, float value) {
    int loc = getUniformLocation(name);
    if (loc >= 0) glUniform1f(loc, value);
}

void Shader::setVec2(const std::string& name, float x, float y) {
    int loc = getUniformLocation(name);
    if (loc >= 0) glUniform2f(loc, x, y);
}

void Shader::setVec3(const std::string& name, float x, float y, float z) {
    int loc = getUniformLocation(name);
    if (loc >= 0) glUniform3f(loc, x, y, z);
}

void Shader::setVec4(const std::string& name, float x, float y, float z, float w) {
    int loc = getUniformLocation(name);
    if (loc >= 0) glUniform4f(loc, x, y, z, w);
}

void Shader::setMat3(const std::string& name, const float* data) {
    int loc = getUniformLocation(name);
    if (loc >= 0) glUniformMatrix3fv(loc, 1, GL_FALSE, data);
}

void Shader::setMat4(const std::string& name, const float* data) {
    int loc = getUniformLocation(name);
    if (loc >= 0) glUniformMatrix4fv(loc, 1, GL_FALSE, data);
}

int Shader::getUniformLocation(const std::string& name) {
    auto it = m_uniformCache.find(name);
    if (it != m_uniformCache.end()) return it->second;
    int loc = glGetUniformLocation(m_programID, name.c_str());
    m_uniformCache[name] = loc;
    if (loc < 0) {
        EMBER_LOG_WARN("Uniform '", name, "' not found");
    }
    return loc;
}

bool Shader::compile(const std::string& vertexSource, const std::string& fragmentSource, const std::string& name) {
    std::string shaderLabel = name.empty() ? "" : name + " ";
    EMBER_LOG_INFO(shaderLabel, "Compiling shader...");
    
    // Compile vertex shader
    GLuint vertexShader = glCreateShader(GL_VERTEX_SHADER);
    const char* vSrc = vertexSource.c_str();
    glShaderSource(vertexShader, 1, &vSrc, nullptr);
    glCompileShader(vertexShader);

    GLint success;
    glGetShaderiv(vertexShader, GL_COMPILE_STATUS, &success);
    if (!success) {
        char infoLog[2048];
        glGetShaderInfoLog(vertexShader, 2048, nullptr, infoLog);
        EMBER_LOG_ERROR(shaderLabel, "Vertex shader compilation FAILED: ", infoLog);
        // Print first 500 chars of source for debugging
        std::string srcPreview = vertexSource.substr(0, 500);
        EMBER_LOG_ERROR(shaderLabel, "Vertex source (first 500 chars): ", srcPreview);
        glDeleteShader(vertexShader);
        return false;
    }

    // Compile fragment shader
    GLuint fragmentShader = glCreateShader(GL_FRAGMENT_SHADER);
    const char* fSrc = fragmentSource.c_str();
    glShaderSource(fragmentShader, 1, &fSrc, nullptr);
    glCompileShader(fragmentShader);

    glGetShaderiv(fragmentShader, GL_COMPILE_STATUS, &success);
    if (!success) {
        char infoLog[2048];
        glGetShaderInfoLog(fragmentShader, 2048, nullptr, infoLog);
        EMBER_LOG_ERROR(shaderLabel, "Fragment shader compilation FAILED: ", infoLog);
        std::string srcPreview = fragmentSource.substr(0, 500);
        EMBER_LOG_ERROR(shaderLabel, "Fragment source (first 500 chars): ", srcPreview);
        glDeleteShader(vertexShader);
        glDeleteShader(fragmentShader);
        return false;
    }

    // Link program
    m_programID = glCreateProgram();
    glAttachShader(m_programID, vertexShader);
    glAttachShader(m_programID, fragmentShader);
    glLinkProgram(m_programID);

    glGetProgramiv(m_programID, GL_LINK_STATUS, &success);
    if (!success) {
        char infoLog[2048];
        glGetProgramInfoLog(m_programID, 2048, nullptr, infoLog);
        EMBER_LOG_ERROR(shaderLabel, "Shader program linking FAILED: ", infoLog);
        glDeleteProgram(m_programID);
        m_programID = 0;
        glDeleteShader(vertexShader);
        glDeleteShader(fragmentShader);
        return false;
    }

    glDeleteShader(vertexShader);
    glDeleteShader(fragmentShader);

    EMBER_LOG_INFO(shaderLabel, "Compiled successfully");
    return true;
}

std::string Shader::readFile(const std::string& filepath) {
    std::ifstream file(filepath);
    if (!file.is_open()) {
        EMBER_LOG_ERROR("Shader: Failed to open file: ", filepath);
        return "";
    }
    std::stringstream ss;
    ss << file.rdbuf();
    return ss.str();
}

std::shared_ptr<Shader> Shader::createDefaultShader() {
    static const char* vertexSrc = R"(
#version 330 core
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec2 aTexCoord;
layout(location = 3) in vec4 aColor;

uniform mat4 uModel;
uniform mat4 uView;
uniform mat4 uProjection;
uniform mat4 uLightSpaceMatrix;
// CSM: cascade light-space matrices (up to 4)
uniform mat4 uCascadeMatrices[4];
uniform int uNumCascades;

out vec3 FragPos;
out vec3 Normal;
out vec2 TexCoord;
out vec4 VertColor;
out vec4 FragPosLightSpace;
out vec4 FragPosViewSpace;

// Per-cascade light-space positions
out vec4 CascadePos[4];

void main() {
    vec4 worldPos = uModel * vec4(aPos, 1.0);
    FragPos = vec3(worldPos);
    Normal = mat3(transpose(inverse(uModel))) * aNormal;
    TexCoord = aTexCoord;
    VertColor = aColor;
    
    // Single-cascade (backward compat)
    FragPosLightSpace = uLightSpaceMatrix * worldPos;
    
    // View-space position for cascade selection
    FragPosViewSpace = uView * worldPos;
    
    // CSM cascade positions
    for (int i = 0; i < 4; i++) {
        if (i < uNumCascades) {
            CascadePos[i] = uCascadeMatrices[i] * worldPos;
        }
    }
    
    gl_Position = uProjection * uView * worldPos;
}
)";

    static const char* fragmentSrc = R"(
#version 330 core
in vec3 FragPos;
in vec3 Normal;
in vec2 TexCoord;
in vec4 VertColor;
in vec4 FragPosLightSpace;
in vec4 FragPosViewSpace;

in vec4 CascadePos[4];

uniform vec3 uAlbedo;
uniform sampler2D uAlbedoMap;
uniform bool uUseAlbedoMap;
uniform float uMetallic;
uniform float uRoughness;
uniform vec3 uLightDir;
uniform vec3 uLightColor;
uniform vec3 uViewPos;
uniform float uAmbient;

// Single-cascade shadow
uniform sampler2D uShadowMap;
uniform bool uShadowEnabled;
uniform float uShadowBias;

// CSM uniforms
uniform float uCascadeSplits;   // split[0]
uniform float uCascadeSplits1;  // split[1]
uniform float uCascadeSplits2;  // split[2]
uniform float uCascadeSplits3;  // split[3]
uniform int uNumCascades;

uniform sampler2D uShadowMap0;
uniform sampler2D uShadowMap1;
uniform sampler2D uShadowMap2;
uniform sampler2D uShadowMap3;

// Spot & point light uniforms
uniform vec3 uLightPos;
uniform float uLightFarPlane;
uniform int uLightType; // 0=directional, 1=spot, 2=point
uniform samplerCube uPointShadowMap;

out vec4 FragColor;

float shadowCalculation(vec4 fragPosLightSpace, float bias) {
    vec3 projCoords = fragPosLightSpace.xyz / fragPosLightSpace.w;
    projCoords = projCoords * 0.5 + 0.5;
    
    if (projCoords.z > 1.0 || projCoords.x > 1.0 || projCoords.x < 0.0 || projCoords.y > 1.0 || projCoords.y < 0.0)
        return 0.0;
    
    float currentDepth = projCoords.z;
    
    // PCF 3x3
    float shadow = 0.0;
    vec2 texelSize = 1.0 / textureSize(uShadowMap, 0);
    for(int x = -1; x <= 1; ++x) {
        for(int y = -1; y <= 1; ++y) {
            float pcfDepth = texture(uShadowMap, projCoords.xy + vec2(x, y) * texelSize).r;
            shadow += currentDepth - bias > pcfDepth ? 1.0 : 0.0;
        }
    }
    shadow /= 9.0;
    return shadow;
}

float cascadeShadowCalculation(sampler2D shadowMap, vec4 fragPosLightSpace, float bias) {
    vec3 projCoords = fragPosLightSpace.xyz / fragPosLightSpace.w;
    projCoords = projCoords * 0.5 + 0.5;
    
    if (projCoords.z > 1.0 || projCoords.x > 1.0 || projCoords.x < 0.0 || projCoords.y > 1.0 || projCoords.y < 0.0)
        return 0.0;
    
    float currentDepth = projCoords.z;
    
    float shadow = 0.0;
    vec2 texelSize = 1.0 / textureSize(shadowMap, 0);
    for(int x = -1; x <= 1; ++x) {
        for(int y = -1; y <= 1; ++y) {
            float pcfDepth = texture(shadowMap, projCoords.xy + vec2(x, y) * texelSize).r;
            shadow += currentDepth - bias > pcfDepth ? 1.0 : 0.0;
        }
    }
    shadow /= 9.0;
    return shadow;
}

void main() {
    vec3 albedo = uAlbedo * VertColor.rgb;
    if (uUseAlbedoMap) {
        vec3 texColor = texture(uAlbedoMap, TexCoord).rgb;
        albedo *= texColor;
    }
    
    vec3 norm = normalize(Normal);
    vec3 lightDir = normalize(-uLightDir);
    vec3 viewDir = normalize(uViewPos - FragPos);
    vec3 halfwayDir = normalize(lightDir + viewDir);
    
    // Diffuse
    float diff = max(dot(norm, lightDir), 0.0);
    vec3 diffuse = diff * uLightColor * albedo;
    
    // Specular (Blinn-Phong)
    float spec = pow(max(dot(norm, halfwayDir), 0.0), 32.0 / max(uRoughness, 0.01));
    vec3 specular = spec * uLightColor * mix(vec3(0.04), albedo, uMetallic);
    
    // Ambient
    vec3 ambient = uAmbient * albedo;
    
    // Shadow calculations
    float shadow = 0.0;
    if (uShadowEnabled) {
        if (uLightType == 2) {
            // Point light shadow - use cubemap
            vec3 fragToLight = FragPos - uLightPos;
            float currentDepth = length(fragToLight);
            float closestDepth = texture(uPointShadowMap, fragToLight).r;
            closestDepth *= uLightFarPlane;
            shadow = currentDepth - uShadowBias > closestDepth ? 1.0 : 0.0;
            // Simple PCF-like softening using offset directions
            vec3 sampleOffsetDirs[4] = vec3[](
                vec3(1,1,1), vec3(1,-1,1), vec3(-1,-1,1), vec3(-1,1,1)
            );
            float s = 0.0;
            for (int i = 0; i < 4; i++) {
                vec3 offsetDir = fragToLight + sampleOffsetDirs[i] * 0.05;
                float d = texture(uPointShadowMap, offsetDir).r * uLightFarPlane;
                s += currentDepth - uShadowBias > d ? 1.0 : 0.0;
            }
            shadow = (shadow + s / 4.0) * 0.5;
        } else if (uNumCascades > 0) {
            // CSM path (directional light with cascades)
            float viewZ = abs(FragPosViewSpace.z);
            float blendRegion = 2.0;
            
            float splits[4];
            splits[0] = uCascadeSplits;
            splits[1] = uCascadeSplits1;
            splits[2] = uCascadeSplits2;
            splits[3] = uCascadeSplits3;
            
            if (viewZ < splits[0] || uNumCascades == 1) {
                shadow = cascadeShadowCalculation(uShadowMap0, CascadePos[0], uShadowBias);
            } else if (viewZ < splits[1] || uNumCascades == 2) {
                float blend = clamp((splits[0] - viewZ + blendRegion) / blendRegion, 0.0, 1.0);
                float s0 = cascadeShadowCalculation(uShadowMap0, CascadePos[0], uShadowBias);
                float s1 = cascadeShadowCalculation(uShadowMap1, CascadePos[1], uShadowBias);
                shadow = mix(s1, s0, blend);
            } else if (viewZ < splits[2] || uNumCascades == 3) {
                float blend = clamp((splits[1] - viewZ + blendRegion) / blendRegion, 0.0, 1.0);
                float s1 = cascadeShadowCalculation(uShadowMap1, CascadePos[1], uShadowBias);
                float s2 = cascadeShadowCalculation(uShadowMap2, CascadePos[2], uShadowBias);
                shadow = mix(s2, s1, blend);
            } else {
                float blend = clamp((splits[2] - viewZ + blendRegion) / blendRegion, 0.0, 1.0);
                float s2 = cascadeShadowCalculation(uShadowMap2, CascadePos[2], uShadowBias);
                float s3 = cascadeShadowCalculation(uShadowMap3, CascadePos[3], uShadowBias);
                shadow = mix(s3, s2, blend);
            }
        } else {
            // Single-cascade or spot shadow
            shadow = shadowCalculation(FragPosLightSpace, uShadowBias);
        }
    }
    
    vec3 result = ambient + (1.0 - shadow) * (diffuse + specular);
    FragColor = vec4(result, VertColor.a);
}
)";

    auto shader = std::make_shared<Shader>();
    if (shader->compile(vertexSrc, fragmentSrc, "Default")) {
        EMBER_LOG_INFO("Default shader created successfully");
        return shader;
    }
    EMBER_LOG_ERROR("Failed to create default shader");
    return nullptr;
}

std::shared_ptr<Shader> Shader::createBasicShader() {
    static const char* vertexSrc = R"(
#version 330 core
layout(location = 0) in vec3 aPos;
layout(location = 3) in vec4 aColor;

uniform mat4 uMVP;

out vec4 VertColor;

void main() {
    VertColor = aColor;
    gl_Position = uMVP * vec4(aPos, 1.0);
}
)";

    static const char* fragmentSrc = R"(
#version 330 core
in vec4 VertColor;
out vec4 FragColor;

void main() {
    FragColor = VertColor;
}
)";

    auto shader = std::make_shared<Shader>();
    if (shader->compile(vertexSrc, fragmentSrc, "Basic")) {
        EMBER_LOG_INFO("Basic shader created successfully");
        return shader;
    }
    EMBER_LOG_ERROR("Failed to create basic shader");
    return nullptr;
}

std::shared_ptr<Shader> Shader::createDebugShader() {
    static const char* vertexSrc = R"(
#version 330 core
layout(location = 0) in vec3 aPos;

uniform mat4 uView;
uniform mat4 uProjection;

out vec3 FragPos;

void main() {
    FragPos = aPos;
    gl_Position = uProjection * uView * vec4(aPos, 1.0);
}
)";

    static const char* fragmentSrc = R"(
#version 330 core
in vec3 FragPos;

uniform vec3 uColor;
uniform float uAlpha;

out vec4 FragColor;

void main() {
    FragColor = vec4(uColor, uAlpha);
}
)";

    auto shader = std::make_shared<Shader>();
    if (shader->compile(vertexSrc, fragmentSrc, "Debug")) {
        EMBER_LOG_INFO("Debug shader created successfully");
        return shader;
    }
    EMBER_LOG_ERROR("Failed to create debug shader");
    return nullptr;
}

std::shared_ptr<Shader> Shader::createUIShader() {
    static const char* vertexSrc = R"(
#version 330 core
layout(location = 0) in vec3 aPos;
layout(location = 2) in vec2 aTexCoord;
layout(location = 3) in vec4 aColor;

uniform mat4 uProjection;

out vec2 TexCoord;
out vec4 VertColor;

void main() {
    TexCoord = aTexCoord;
    VertColor = aColor;
    gl_Position = uProjection * vec4(aPos, 1.0);
}
)";

    static const char* fragmentSrc = R"(
#version 330 core
in vec2 TexCoord;
in vec4 VertColor;

uniform sampler2D uTexture;
uniform bool uUseTexture;

out vec4 FragColor;

void main() {
    vec4 texColor = uUseTexture ? texture(uTexture, TexCoord) : vec4(1.0);
    FragColor = VertColor * texColor;
}
)";

    auto shader = std::make_shared<Shader>();
    if (shader->compile(vertexSrc, fragmentSrc, "UI")) {
        EMBER_LOG_INFO("UI shader created successfully");
        return shader;
    }
    EMBER_LOG_ERROR("Failed to create UI shader");
    return nullptr;
}

std::shared_ptr<Shader> Shader::createDepthShader() {
    static const char* vertexSrc = R"(
#version 330 core
layout(location = 0) in vec3 aPos;

uniform mat4 uLightSpaceMatrix;
uniform mat4 uModel;

void main() {
    gl_Position = uLightSpaceMatrix * uModel * vec4(aPos, 1.0);
}
)";

    static const char* fragmentSrc = R"(
#version 330 core

void main() {
    gl_FragDepth = gl_FragCoord.z;
}
)";

    auto shader = std::make_shared<Shader>();
    if (shader->compile(vertexSrc, fragmentSrc, "Depth")) {
        EMBER_LOG_INFO("Depth shader created successfully");
        return shader;
    }
    EMBER_LOG_ERROR("Failed to create depth shader");
    return nullptr;
}

std::shared_ptr<Shader> Shader::createSkyboxShader() {
    static const char* vertexSrc = R"(
#version 330 core
layout(location = 0) in vec3 aPos;

uniform mat4 uView;
uniform mat4 uProjection;

out vec3 WorldPos;

void main() {
    WorldPos = aPos;
    vec4 clipPos = uProjection * uView * vec4(aPos, 1.0);
    gl_Position = clipPos.xyww;
}
)";

    static const char* fragmentSrc = R"(
#version 330 core
in vec3 WorldPos;

uniform samplerCube uSkybox;
uniform vec4 uColor;
uniform bool uUseTexture;

out vec4 FragColor;

void main() {
    if (uUseTexture) {
        FragColor = texture(uSkybox, normalize(WorldPos));
    } else {
        FragColor = uColor;
    }
}
)";

    auto shader = std::make_shared<Shader>();
    if (shader->compile(vertexSrc, fragmentSrc, "Skybox")) {
        EMBER_LOG_INFO("Skybox shader created successfully");
        return shader;
    }
    EMBER_LOG_ERROR("Failed to create skybox shader");
    return nullptr;
}

} // namespace Ember
