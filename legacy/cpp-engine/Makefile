# EmberEngine - 3D Game Engine Build System
# Uses g++ (GNU C++ Compiler)

# Compiler
CXX = g++
CXXFLAGS = -std=c++17 -Wall -Wextra -O2 -g -I. -fno-lto

# Directories
SRC_DIR = .
BUILD_DIR = build
BIN_DIR = bin

# Source files - Engine Core
ENGINE_CORE_SRC = \
	Engine/Core/Application.cpp \
	Engine/Core/Logging.cpp \
	Engine/Core/EventSystem.cpp \
	Engine/Core/MemoryManager.cpp \
	Engine/Core/Timer.cpp \
	Engine/Core/Config.cpp \
	Engine/Core/FileSystem.cpp \
	Engine/Core/ThreadPool.cpp

# Source files - Engine Math
ENGINE_MATH_SRC = \
	Engine/Math/Math.cpp

# Source files - Engine Rendering
ENGINE_RENDER_SRC = \
	Engine/Rendering/Renderer.cpp \
	Engine/Rendering/Shader.cpp \
	Engine/Rendering/Mesh.cpp \
	Engine/Rendering/Material.cpp \
	Engine/Rendering/Texture.cpp \
	Engine/Rendering/Camera.cpp \
	Engine/Rendering/Light.cpp \
	Engine/Rendering/FrameBuffer.cpp \
	Engine/Rendering/GL.cpp

# Source files - Engine Physics
ENGINE_PHYSICS_SRC = \
	Engine/Physics/PhysicsWorld.cpp \
	Engine/Physics/RigidBody.cpp

# Source files - Engine Audio
ENGINE_AUDIO_SRC = \
	Engine/Audio/AudioSystem.cpp \
	Engine/Audio/Sound.cpp

# Source files - Engine UI
ENGINE_UI_SRC = \
	Engine/UI/UIEngine.cpp \
	Engine/UI/DockManager.cpp

# Source files - Engine ECS
ENGINE_ECS_SRC = \
	Engine/Core/ECS.cpp

# Source files - Engine Animation
ENGINE_ANIM_SRC = \
	Engine/Animation/Animator.cpp

# Source files - Engine Asset Pipeline
ENGINE_ASSET_SRC = \
	Engine/AssetPipeline/AssetManager.cpp

# Source files - Engine Scripting
ENGINE_SCRIPT_SRC = \
	Engine/Scripting/ScriptEngine.cpp

# Source files - Engine Platform
ENGINE_PLATFORM_SRC = \
	Engine/Platform/Platform.cpp

# Source files - GUI
GUI_SRC = \
	GUI/EmberGUI.cpp

# Source files - Editor
EDITOR_SRC = \
	Editor/Editor.cpp

# Source files - Main
MAIN_SRC = \
	main.cpp

# All source files
ALL_SRC = $(ENGINE_CORE_SRC) $(ENGINE_MATH_SRC) $(ENGINE_RENDER_SRC) $(ENGINE_PHYSICS_SRC) $(ENGINE_AUDIO_SRC) $(ENGINE_UI_SRC) $(ENGINE_ECS_SRC) $(ENGINE_ANIM_SRC) $(ENGINE_ASSET_SRC) $(ENGINE_SCRIPT_SRC) $(ENGINE_PLATFORM_SRC) $(GUI_SRC) $(EDITOR_SRC) $(MAIN_SRC)

# Object files
ALL_OBJ = $(patsubst %.cpp,$(BUILD_DIR)/%.o,$(ALL_SRC))

# Output
TARGET = $(BIN_DIR)/EmberEngine

# Platform detection
UNAME_S := $(shell uname -s)
ifeq ($(UNAME_S),Linux)
	LIBS = -lpthread -ldl -lGL -lGLU -lX11 -lXrandr -lXinerama -lXcursor -lXi -lm
endif
ifeq ($(UNAME_S),Darwin)
	LIBS = -lpthread -framework OpenGL -framework Cocoa -framework IOKit -framework CoreVideo
endif
# Windows/MSYS2
ifeq ($(OS),Windows_NT)
	LIBS = -lpthread -lgdi32 -lopengl32 -lglu32 -luser32 -lkernel32 -lshell32
endif

# Default target
all: directories $(TARGET)
	@echo "=== EmberEngine build complete ==="

# Create directories
directories:
	@mkdir -p $(BUILD_DIR)/Engine/Core
	@mkdir -p $(BUILD_DIR)/Engine/Math
	@mkdir -p $(BUILD_DIR)/Engine/Rendering
	@mkdir -p $(BUILD_DIR)/Engine/Physics
	@mkdir -p $(BUILD_DIR)/Engine/Audio
	@mkdir -p $(BUILD_DIR)/Engine/UI
	@mkdir -p $(BUILD_DIR)/Engine/Scripting
	@mkdir -p $(BUILD_DIR)/Engine/Animation
	@mkdir -p $(BUILD_DIR)/Engine/AssetPipeline
	@mkdir -p $(BUILD_DIR)/Engine/Platform
	@mkdir -p $(BUILD_DIR)/Editor
	@mkdir -p $(BUILD_DIR)/GUI
	@mkdir -p $(BIN_DIR)

# Link
$(TARGET): $(ALL_OBJ)
	@echo "Linking $(TARGET)..."
	$(CXX) $(ALL_OBJ) -o $(TARGET) $(LIBS)
	@echo "Link successful!"

# Compile patterns
$(BUILD_DIR)/%.o: %.cpp
	@echo "Compiling $<..."
	$(CXX) $(CXXFLAGS) -c $< -o $@

# Clean
clean:
	@echo "Cleaning build artifacts..."
	rm -rf $(BUILD_DIR) $(BIN_DIR)
	@echo "Clean complete."

# Rebuild
rebuild: clean all

# Run
run: all
	./$(TARGET)

# Debug build
debug: CXXFLAGS = -std=c++17 -Wall -Wextra -O0 -g3 -DDEBUG -I.
debug: clean all

# Release build
release: CXXFLAGS = -std=c++17 -Wall -Wextra -O3 -DNDEBUG -I.
release: clean all

.PHONY: all clean rebuild run debug release directories
