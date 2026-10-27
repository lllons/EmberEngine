@echo off
echo ========================================
echo   EmberEngine Build System
echo ========================================

set CXX=g++
set CXXFLAGS=-std=c++17 -Wall -Wextra -O2 -g -I.
set LIBS=-lopengl32 -lglu32 -lgdi32 -luser32 -lkernel32 -lshell32 -lcomdlg32 -lole32 -lcomctl32 -loleaut32

if not exist "build" mkdir build
if not exist "build\Engine" mkdir build\Engine
if not exist "build\Engine\Core" mkdir build\Engine\Core
if not exist "build\Engine\Math" mkdir build\Engine\Math
if not exist "build\Engine\Rendering" mkdir build\Engine\Rendering
if not exist "build\Engine\Physics" mkdir build\Engine\Physics
if not exist "build\Engine\Audio" mkdir build\Engine\Audio
if not exist "build\Engine\UI" mkdir build\Engine\UI
if not exist "build\Engine\Scripting" mkdir build\Engine\Scripting
if not exist "build\Engine\Animation" mkdir build\Engine\Animation
if not exist "build\Engine\AssetPipeline" mkdir build\Engine\AssetPipeline
if not exist "build\Engine\Platform" mkdir build\Engine\Platform
if not exist "build\Editor" mkdir build\Editor
if not exist "build\GUI" mkdir build\GUI
if not exist "bin" mkdir bin

echo Compiling Engine Core...
%CXX% %CXXFLAGS% -c Engine/Core/Application.cpp -o build/Engine/Core/Application.o
if errorlevel 1 goto :error
%CXX% %CXXFLAGS% -c Engine/Core/Logging.cpp -o build/Engine/Core/Logging.o
if errorlevel 1 goto :error
%CXX% %CXXFLAGS% -c Engine/Core/EventSystem.cpp -o build/Engine/Core/EventSystem.o
if errorlevel 1 goto :error
%CXX% %CXXFLAGS% -c Engine/Core/MemoryManager.cpp -o build/Engine/Core/MemoryManager.o
if errorlevel 1 goto :error
%CXX% %CXXFLAGS% -c Engine/Core/Timer.cpp -o build/Engine/Core/Timer.o
if errorlevel 1 goto :error
%CXX% %CXXFLAGS% -c Engine/Core/Config.cpp -o build/Engine/Core/Config.o
if errorlevel 1 goto :error
%CXX% %CXXFLAGS% -c Engine/Core/FileSystem.cpp -o build/Engine/Core/FileSystem.o
if errorlevel 1 goto :error
%CXX% %CXXFLAGS% -c Engine/Core/ThreadPool.cpp -o build/Engine/Core/ThreadPool.o
if errorlevel 1 goto :error
%CXX% %CXXFLAGS% -c Engine/Core/ECS.cpp -o build/Engine/Core/ECS.o
if errorlevel 1 goto :error

echo Compiling Engine Math...
%CXX% %CXXFLAGS% -c Engine/Math/Math.cpp -o build/Engine/Math/Math.o
if errorlevel 1 goto :error

echo Compiling Engine Rendering...
%CXX% %CXXFLAGS% -c Engine/Rendering/Renderer.cpp -o build/Engine/Rendering/Renderer.o
if errorlevel 1 goto :error
%CXX% %CXXFLAGS% -c Engine/Rendering/Shader.cpp -o build/Engine/Rendering/Shader.o
if errorlevel 1 goto :error
%CXX% %CXXFLAGS% -c Engine/Rendering/Mesh.cpp -o build/Engine/Rendering/Mesh.o
if errorlevel 1 goto :error
%CXX% %CXXFLAGS% -c Engine/Rendering/Material.cpp -o build/Engine/Rendering/Material.o
if errorlevel 1 goto :error
%CXX% %CXXFLAGS% -c Engine/Rendering/Texture.cpp -o build/Engine/Rendering/Texture.o
if errorlevel 1 goto :error
%CXX% %CXXFLAGS% -c Engine/Rendering/Camera.cpp -o build/Engine/Rendering/Camera.o
if errorlevel 1 goto :error
%CXX% %CXXFLAGS% -c Engine/Rendering/Light.cpp -o build/Engine/Rendering/Light.o
if errorlevel 1 goto :error
%CXX% %CXXFLAGS% -c Engine/Rendering/FrameBuffer.cpp -o build/Engine/Rendering/FrameBuffer.o
if errorlevel 1 goto :error
%CXX% %CXXFLAGS% -c Engine/Rendering/GL.cpp -o build/Engine/Rendering/GL.o
if errorlevel 1 goto :error

echo Compiling Engine Physics...
%CXX% %CXXFLAGS% -c Engine/Physics/PhysicsWorld.cpp -o build/Engine/Physics/PhysicsWorld.o
if errorlevel 1 goto :error
%CXX% %CXXFLAGS% -c Engine/Physics/RigidBody.cpp -o build/Engine/Physics/RigidBody.o
if errorlevel 1 goto :error

echo Compiling Engine Audio...
%CXX% %CXXFLAGS% -c Engine/Audio/AudioSystem.cpp -o build/Engine/Audio/AudioSystem.o
if errorlevel 1 goto :error
%CXX% %CXXFLAGS% -c Engine/Audio/Sound.cpp -o build/Engine/Audio/Sound.o
if errorlevel 1 goto :error

echo Compiling Engine UI...
%CXX% %CXXFLAGS% -c Engine/UI/UIEngine.cpp -o build/Engine/UI/UIEngine.o
if errorlevel 1 goto :error
%CXX% %CXXFLAGS% -c Engine/UI/DockManager.cpp -o build/Engine/UI/DockManager.o
if errorlevel 1 goto :error

echo Compiling Engine Animation...
%CXX% %CXXFLAGS% -c Engine/Animation/Animator.cpp -o build/Engine/Animation/Animator.o
if errorlevel 1 goto :error

echo Compiling Engine Asset Pipeline...
%CXX% %CXXFLAGS% -c Engine/AssetPipeline/AssetManager.cpp -o build/Engine/AssetPipeline/AssetManager.o
if errorlevel 1 goto :error

echo Compiling Engine Scripting...
%CXX% %CXXFLAGS% -c Engine/Scripting/ScriptEngine.cpp -o build/Engine/Scripting/ScriptEngine.o
if errorlevel 1 goto :error

echo Compiling Engine Platform...
%CXX% %CXXFLAGS% -c Engine/Platform/Platform.cpp -o build/Engine/Platform/Platform.o
if errorlevel 1 goto :error

echo Compiling GUI...
%CXX% %CXXFLAGS% -c GUI/EmberGUI.cpp -o build/GUI/EmberGUI.o
if errorlevel 1 goto :error

echo Compiling Editor...
%CXX% %CXXFLAGS% -c Editor/Editor.cpp -o build/Editor/Editor.o
if errorlevel 1 goto :error

echo Compiling Main...
%CXX% %CXXFLAGS% -c main.cpp -o build/main.o
if errorlevel 1 goto :error

echo Linking...
%CXX% -fuse-ld=lld build/Engine/Core/Application.o build/Engine/Core/Logging.o build/Engine/Core/EventSystem.o build/Engine/Core/MemoryManager.o build/Engine/Core/Timer.o build/Engine/Core/Config.o build/Engine/Core/FileSystem.o build/Engine/Core/ThreadPool.o build/Engine/Core/ECS.o build/Engine/Math/Math.o build/Engine/Rendering/Renderer.o build/Engine/Rendering/Shader.o build/Engine/Rendering/Mesh.o build/Engine/Rendering/Material.o build/Engine/Rendering/Texture.o build/Engine/Rendering/Camera.o build/Engine/Rendering/Light.o build/Engine/Rendering/FrameBuffer.o build/Engine/Rendering/GL.o build/Engine/Physics/PhysicsWorld.o build/Engine/Physics/RigidBody.o build/Engine/Audio/AudioSystem.o build/Engine/Audio/Sound.o build/Engine/UI/UIEngine.o build/Engine/UI/DockManager.o build/Engine/Animation/Animator.o build/Engine/AssetPipeline/AssetManager.o build/Engine/Scripting/ScriptEngine.o build/Engine/Platform/Platform.o build/GUI/EmberGUI.o build/Editor/Editor.o build/main.o -o bin/EmberEngine.exe %LIBS%
if errorlevel 1 goto :error

echo ========================================
echo   Build Successful!
echo ========================================
echo Run: bin\EmberEngine.exe
goto :end

:error
echo ========================================
echo   BUILD FAILED!
echo ========================================
exit /b 1

:end
