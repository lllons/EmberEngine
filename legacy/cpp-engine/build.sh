#!/bin/bash
set -e

CXX=g++
CXXFLAGS="-std=c++17 -Wall -Wextra -O2 -g -I."
LIBS="-lopengl32 -lglu32 -lgdi32 -luser32 -lkernel32 -lshell32 -lcomdlg32 -lole32 -lcomctl32 -loleaut32"

# Create build directories
mkdir -p build/Engine/Core build/Engine/Math build/Engine/Rendering build/Engine/Physics build/Engine/Audio build/Engine/UI build/Engine/Scripting build/Engine/Animation build/Engine/AssetPipeline build/Engine/Platform build/Editor build/GUI bin

# Compile function
compile() {
    local src=$1
    local obj=${src%.cpp}.o
    echo "Compiling $src..."
    $CXX $CXXFLAGS -c "$src" -o "build/$obj"
}

# Engine Core
compile Engine/Core/Application.cpp
compile Engine/Core/Logging.cpp
compile Engine/Core/EventSystem.cpp
compile Engine/Core/MemoryManager.cpp
compile Engine/Core/Timer.cpp
compile Engine/Core/Config.cpp
compile Engine/Core/FileSystem.cpp
compile Engine/Core/ThreadPool.cpp
compile Engine/Core/ECS.cpp

# Engine Math
compile Engine/Math/Math.cpp

# Engine Rendering
compile Engine/Rendering/Renderer.cpp
compile Engine/Rendering/Shader.cpp
compile Engine/Rendering/Mesh.cpp
compile Engine/Rendering/Material.cpp
compile Engine/Rendering/Texture.cpp
compile Engine/Rendering/Camera.cpp
compile Engine/Rendering/Light.cpp
compile Engine/Rendering/FrameBuffer.cpp
compile Engine/Rendering/GL.cpp

# Engine Physics
compile Engine/Physics/PhysicsWorld.cpp
compile Engine/Physics/RigidBody.cpp

# Engine Audio
compile Engine/Audio/AudioSystem.cpp
compile Engine/Audio/Sound.cpp

# Engine UI
compile Engine/UI/UIEngine.cpp
compile Engine/UI/DockManager.cpp

# Engine Animation
compile Engine/Animation/Animator.cpp

# Engine Asset Pipeline
compile Engine/AssetPipeline/AssetManager.cpp

# Engine Scripting
compile Engine/Scripting/ScriptEngine.cpp

# Engine Platform
compile Engine/Platform/Platform.cpp

# GUI
compile GUI/EmberGUI.cpp

# Editor
compile Editor/Editor.cpp

# Main
compile main.cpp

# Generate response file for linking
find build -name "*.o" -type f > bin/link_response.txt
echo "$LIBS" | tr ' ' '\n' | grep -v '^$' >> bin/link_response.txt

# Link using lld (LLVM linker) to avoid GNU ld section limit (ld returned 5)
echo "Linking EmberEngine with lld..."
$CXX -fuse-ld=lld -std=c++17 -O2 -g @bin/link_response.txt -o bin/EmberEngine.exe

echo "========================================"
echo "  Build Successful!"
echo "========================================"
echo "Run: bin/EmberEngine.exe"
