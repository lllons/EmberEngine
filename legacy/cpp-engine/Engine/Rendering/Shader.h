#pragma once

#include <string>
#include <cstdint>
#include <memory>
#include <unordered_map>

namespace Ember {

enum class ShaderType { Vertex, Fragment, Geometry, TessControl, TessEval, Compute };

class Shader {
public:
    Shader() = default;
    ~Shader();

    bool loadFromFile(const std::string& vertexPath, const std::string& fragmentPath);
    bool loadFromSource(const std::string& vertexSource, const std::string& fragmentSource);
    void unload();
    void bind() const;
    void unbind() const;

    uint32_t getID() const { return m_programID; }
    bool isBound() const { return m_bound; }

    void setInt(const std::string& name, int value);
    void setFloat(const std::string& name, float value);
    void setVec2(const std::string& name, float x, float y);
    void setVec3(const std::string& name, float x, float y, float z);
    void setVec4(const std::string& name, float x, float y, float z, float w);
    void setMat3(const std::string& name, const float* data);
    void setMat4(const std::string& name, const float* data);

    int getUniformLocation(const std::string& name);
    bool compile(const std::string& vertexSource, const std::string& fragmentSource, const std::string& name = "");

    // Built-in shader factories
    static std::shared_ptr<Shader> createDefaultShader();
    static std::shared_ptr<Shader> createBasicShader();
    static std::shared_ptr<Shader> createDebugShader();
    static std::shared_ptr<Shader> createUIShader();
    static std::shared_ptr<Shader> createSkyboxShader();
    static std::shared_ptr<Shader> createDepthShader();

private:
    std::string readFile(const std::string& filepath);
    uint32_t m_programID = 0;
    mutable bool m_bound = false;
    mutable std::unordered_map<std::string, int> m_uniformCache;
};

} // namespace Ember
