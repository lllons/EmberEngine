#include "Engine/Engine.h"
#include "Engine/Core/Components.h"
#include "Engine/Rendering/Renderer.h"
#include "Engine/Rendering/Mesh.h"
#include "Engine/Rendering/Material.h"
#include "Engine/Rendering/Camera.h"
#include "Engine/Physics/PhysicsWorld.h"
#include "Engine/Audio/AudioSystem.h"
#include "Engine/Animation/Animator.h"
#include "Engine/Scripting/ScriptEngine.h"
#include "Engine/AssetPipeline/AssetManager.h"
#include "Engine/UI/UIEngine.h"
#include "Engine/Platform/Platform.h"
#include "Editor/Editor.h"
#include <iostream>
#include <cmath>
#include <algorithm>
#include <cctype>
#include <cstdlib>
#include <cstring>
#include <string>

// ============ Game Application ============
class EmberApp : public Ember::Application {
public:
    EmberApp() : Application(Ember::AppConfig{"EmberEngine", 1280, 720, false, true, 60}) {}

    void onInit() override {
        EMBER_LOG_INFO("=== EmberApp initialized ===");

        // Initialize ECS
        m_scene = std::make_unique<Ember::Scene>("MainScene");

        // Create camera entity
        Ember::Entity camera = m_scene->createEntity("MainCamera");
        m_scene->getECS().addComponent<Ember::Transform>(camera, {Ember::Math::Vec3(0, 2, 5)});
        m_scene->getECS().addComponent<Ember::CameraComponent>(camera);

        // Create directional light
        Ember::Entity light = m_scene->createEntity("DirectionalLight");
        auto& lightTransform = m_scene->getECS().addComponent<Ember::Transform>(light);
        lightTransform.rotate(-30.0f, 45.0f, 0.0f);
        auto& lightComp = m_scene->getECS().addComponent<Ember::LightComponent>(light);
        lightComp.type = Ember::LightComponent::Directional;
        lightComp.intensity = 1.5f;
        lightComp.color = Ember::Math::Vec3(1.0f, 0.98f, 0.92f);

        // Create a ground plane
        Ember::Entity ground = m_scene->createEntity("Ground");
        m_scene->getECS().addComponent<Ember::Transform>(ground, {Ember::Math::Vec3(0, -0.5f, 0), Ember::Math::Quaternion::identity(), Ember::Math::Vec3(10.0f, 1.0f, 10.0f)});
        auto& groundRenderer = m_scene->getECS().addComponent<Ember::MeshRenderer>(ground);
        groundRenderer.mesh = Ember::Mesh::createCube(1.0f);
        groundRenderer.material = Ember::Material::createDefault();
        groundRenderer.material->setAlbedo(Ember::Math::Vec3(0.3f, 0.3f, 0.35f));

        // Create a test cube
        Ember::Entity cube = m_scene->createEntity("TestCube");
        m_scene->getECS().addComponent<Ember::Transform>(cube, {Ember::Math::Vec3(0, 0, 0)});
        auto& cubeRenderer = m_scene->getECS().addComponent<Ember::MeshRenderer>(cube);
        cubeRenderer.mesh = Ember::Mesh::createCube(1.0f);
        cubeRenderer.material = Ember::Material::createDefault();
        cubeRenderer.material->setAlbedo(Ember::Math::Vec3(0.8f, 0.2f, 0.2f));
        cubeRenderer.material->setRoughness(0.3f);
        cubeRenderer.material->setMetallic(0.8f);

        // Create a test sphere
        Ember::Entity sphere = m_scene->createEntity("TestSphere");
        m_scene->getECS().addComponent<Ember::Transform>(sphere, {Ember::Math::Vec3(2.5f, 0.5f, 0)});
        auto& sphereRenderer = m_scene->getECS().addComponent<Ember::MeshRenderer>(sphere);
        sphereRenderer.mesh = Ember::Mesh::createSphere(0.5f, 16, 32);
        sphereRenderer.material = Ember::Material::createDefault();
        sphereRenderer.material->setAlbedo(Ember::Math::Vec3(0.1f, 0.4f, 0.8f));
        sphereRenderer.material->setRoughness(0.1f);
        sphereRenderer.material->setMetallic(0.5f);

        EMBER_LOG_INFO("Created entities with meshes and materials");

        // Initialize editor
        m_editor = std::make_unique<Ember::Editor>();
        m_editor->init();
        m_editor->setScene(m_scene.get());

        // Initialize subsystems
        m_physics = std::make_unique<Ember::PhysicsWorld>();
        m_physics->init();

        m_animator = std::make_unique<Ember::Animator>();
        
        EMBER_LOG_INFO("Created {} entities", m_scene->getECS().getEntityCount());
    }

    void onUpdate(float deltaTime) override {
        // Key state tracking for undo/redo (actual dispatch happens in Editor::render via EmberGUI input)
        // Only update scene when in Playing mode (not Paused, not Editing)
        bool shouldUpdate = !m_editor || m_editor->getMode() == Ember::Editor::EditorMode::Playing;

        if (shouldUpdate) {
            // Rotate the cube and orbit the sphere
            auto entities = m_scene->getECS().getEntitiesWith<Ember::MeshRenderer>();
            for (auto entity : entities) {
                auto& transform = m_scene->getECS().getComponent<Ember::Transform>(entity);
                std::string name = m_scene->getECS().getEntityName(entity);
                if (name == "TestCube") {
                    transform.rotate(deltaTime * 30.0f, deltaTime * 15.0f, 0.0f);
                }
                if (name == "TestSphere") {
                    transform.position.x = 2.5f * std::cos((float)getElapsedTime() * 0.5f);
                    transform.position.z = 2.5f * std::sin((float)getElapsedTime() * 0.5f);
                }
            }

            // Update physics
            if (m_physics) m_physics->step(deltaTime);

            // Update animation
            if (m_animator) m_animator->update(deltaTime);

            // Update scene systems
            if (m_scene) m_scene->updateSystems(deltaTime);
        }
    }

    void onRender() override {
        auto& renderer = Ember::Renderer::get();

        // Set up the camera from the scene's primary camera
        auto cameras = m_scene->getECS().query<Ember::CameraComponent, Ember::Transform>();
        if (!cameras.empty()) {
            Ember::Entity camEntity = cameras[0];
            auto& camTransform = m_scene->getECS().getComponent<Ember::Transform>(camEntity);
            auto& camComp = m_scene->getECS().getComponent<Ember::CameraComponent>(camEntity);
            
            // Create a camera object for rendering
            Ember::Camera renderCam;
            renderCam.setPosition(camTransform.position);
            renderCam.setRotation(camTransform.rotation);
            renderCam.setFOV(camComp.fov);
            renderCam.setNearPlane(camComp.nearPlane);
            renderCam.setFarPlane(camComp.farPlane);

            // Render into the Scene View panel when it is docked, so the 3D
            // view sits inside the editor instead of behind the panels.
            Ember::Math::Vec2 viewRectPos, viewRectSize;
            bool useScenePanel = m_editor &&
                m_editor->getDockManager().getPanelContentRect("SceneView", viewRectPos, viewRectSize);

            if (useScenePanel) {
                renderer.setSceneViewport((int)viewRectPos.x, (int)viewRectPos.y,
                                          (int)viewRectSize.x, (int)viewRectSize.y);
                renderCam.setAspect(viewRectSize.x / std::max(viewRectSize.y, 1.0f));
            } else {
                renderCam.setAspect((float)renderer.getWindowWidth() /
                                    (float)std::max(renderer.getWindowHeight(), 1u));
            }

            // Render the scene
            renderer.renderScene(*m_scene, renderCam);
            renderer.setSceneViewport(0, 0, 0, 0);
            
            // Draw debug grid
            renderer.drawDebugGrid(10.0f, 10, Ember::Math::Vec3(0, -0.5f, 0));
        }
        
        // Render editor overlay
        if (m_editor) {
            m_editor->render();
        }

        static int frameCounter = 0;
        frameCounter++;
        if (frameCounter % 120 == 0) {
            EMBER_LOG_DEBUG("Frame {}: {} entities, {} draw calls, FPS: {}",
                frameCounter, m_scene->getECS().getEntityCount(), renderer.getDrawCallCount(), getFPS());
        }
    }
    void onFileDrop(const std::string& filePath) override {
        EMBER_LOG_INFO("File dropped: {}", filePath);
        Ember::Editor::importFile(filePath);
    }

    void onShutdown() override {
        EMBER_LOG_INFO("=== EmberApp shutting down ===");
        if (m_editor) m_editor->shutdown();
        m_scene.reset();
        m_physics.reset();
        m_animator.reset();
        m_editor.reset();
    }

private:
    std::unique_ptr<Ember::Scene> m_scene;
    std::unique_ptr<Ember::PhysicsWorld> m_physics;
    std::unique_ptr<Ember::Animator> m_animator;
    std::unique_ptr<Ember::Editor> m_editor;
};

// ============ Entry Point ============
Ember::Application* Ember::createApplication() {
    return new EmberApp();
}

int main(int argc, char* argv[]) {
    // Optional automated capture: --screenshot <file.ppm> [--frames N]
    std::string screenshotPath;
    int screenshotFrame = 15;
    for (int i = 1; i < argc; ++i) {
        if (std::strcmp(argv[i], "--screenshot") == 0 && i + 1 < argc) {
            screenshotPath = argv[++i];
        } else if (std::strcmp(argv[i], "--frames") == 0 && i + 1 < argc) {
            screenshotFrame = std::atoi(argv[++i]);
        }
    }

    std::cout << "========================================" << std::endl;
    std::cout << "  EmberEngine v" << EMBER_VERSION_STRING << std::endl;
    std::cout << "  A Professional 3D Game Engine" << std::endl;
    std::cout << "========================================" << std::endl;

    try {
        Ember::Application* app = Ember::createApplication();
        if (!screenshotPath.empty()) {
            app->requestScreenshot(screenshotPath, screenshotFrame);
        }
        app->run();
        delete app;
    } catch (const std::exception& e) {
        EMBER_LOG_FATAL("Fatal error: {}", e.what());
        std::cerr << "Fatal error: " << e.what() << std::endl;
        return 1;
    }

    std::cout << "EmberEngine shut down successfully." << std::endl;
    return 0;
}
