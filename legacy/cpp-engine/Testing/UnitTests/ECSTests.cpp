#include "Engine/Core/ECS.h"
#include "Engine/Core/Components.h"
#include "Engine/Core/Logging.h"
#include <cassert>
#include <iostream>
#include <string>

using namespace Ember;
using namespace Ember::Math;

struct TestComponent {
    float value = 0.0f;
};

void testEntityCreation() {
    EntityComponentSystem ecs;
    Entity e1 = ecs.createEntity("TestEntity1");
    Entity e2 = ecs.createEntity("TestEntity2");
    assert(e1 != NULL_ENTITY);
    assert(e2 != NULL_ENTITY);
    assert(e1 != e2);
    assert(ecs.getEntityCount() == 2);
    std::cout << "  [PASS] Entity creation\n";
}

void testEntityDestruction() {
    EntityComponentSystem ecs;
    Entity e1 = ecs.createEntity("Entity1");
    Entity e2 = ecs.createEntity("Entity2");
    Entity e3 = ecs.createEntity("Entity3");
    assert(ecs.getEntityCount() == 3);
    ecs.destroyEntity(e2);
    ecs.processDestructions();
    assert(ecs.getEntityCount() == 2);
    assert(!ecs.isEntityValid(e2));
    std::cout << "  [PASS] Entity destruction\n";
}

void testEntityNames() {
    EntityComponentSystem ecs;
    Entity e1 = ecs.createEntity("MyEntity");
    assert(ecs.getEntityName(e1) == "MyEntity");
    ecs.setEntityName(e1, "RenamedEntity");
    assert(ecs.getEntityName(e1) == "RenamedEntity");
    std::cout << "  [PASS] Entity names\n";
}

void testComponentAddRemove() {
    EntityComponentSystem ecs;
    Entity e1 = ecs.createEntity("Test");
    TestComponent tc; tc.value = 42.0f;
    ecs.addComponent<TestComponent>(e1, tc);
    assert(ecs.hasComponent<TestComponent>(e1));
    auto& retrieved = ecs.getComponent<TestComponent>(e1);
    assert(std::abs(retrieved.value - 42.0f) < 1e-6f);
    ecs.removeComponent<TestComponent>(e1);
    assert(!ecs.hasComponent<TestComponent>(e1));
    std::cout << "  [PASS] Component add/remove\n";
}

void testMultipleComponents() {
    EntityComponentSystem ecs;
    Entity e1 = ecs.createEntity("Test");
    ecs.addComponent<Transform>(e1);
    ecs.addComponent<MeshRenderer>(e1);
    assert(ecs.hasComponent<Transform>(e1));
    assert(ecs.hasComponent<MeshRenderer>(e1));
    auto& transform = ecs.getComponent<Transform>(e1);
    transform.position = Math::Vec3(1, 2, 3);
    auto& retrieved = ecs.getComponent<Transform>(e1);
    assert(std::abs(retrieved.position.x - 1.0f) < EPSILON);
    assert(std::abs(retrieved.position.y - 2.0f) < EPSILON);
    assert(std::abs(retrieved.position.z - 3.0f) < EPSILON);
    std::cout << "  [PASS] Multiple components\n";
}

void testGetEntitiesWith() {
    EntityComponentSystem ecs;
    Entity e1 = ecs.createEntity("WithTransform");
    Entity e2 = ecs.createEntity("WithoutTransform");
    Entity e3 = ecs.createEntity("WithTransform2");
    ecs.addComponent<Transform>(e1);
    ecs.addComponent<MeshRenderer>(e1);
    ecs.addComponent<Transform>(e3);
    auto entities = ecs.getEntitiesWith<Transform>();
    assert(entities.size() == 2);
    std::cout << "  [PASS] Get entities with component\n";
}

void testQuery() {
    EntityComponentSystem ecs;
    Entity e1 = ecs.createEntity("Both");
    Entity e2 = ecs.createEntity("TransformOnly");
    Entity e3 = ecs.createEntity("Both2");
    ecs.addComponent<Transform>(e1);
    ecs.addComponent<MeshRenderer>(e1);
    ecs.addComponent<Transform>(e2);
    ecs.addComponent<Transform>(e3);
    ecs.addComponent<MeshRenderer>(e3);
    auto entities = ecs.query<Transform, MeshRenderer>();
    assert(entities.size() == 2);
    std::cout << "  [PASS] Query with multiple components\n";
}

void testSceneCreation() {
    Scene scene("TestScene");
    assert(scene.getName() == "TestScene");
    Entity e1 = scene.createEntity("Entity1");
    Entity e2 = scene.createEntity("Entity2");
    assert(scene.getECS().getEntityCount() == 2);
    Entity found = scene.findEntityByName("Entity1");
    assert(found == e1);
    std::cout << "  [PASS] Scene creation\n";
}

void testSceneHierarchy() {
    Scene scene("TestScene");
    Entity parent = scene.createEntity("Parent");
    Entity child = scene.createEntity("Child");
    scene.setParent(child, parent);
    assert(scene.getParent(child) == parent);
    auto children = scene.getChildren(parent);
    assert(children.size() == 1);
    assert(children[0] == child);
    std::cout << "  [PASS] Scene hierarchy\n";
}

int main() {
    Logger::get().init("ecs_test.log");

    std::cout << "========================================\n";
    std::cout << "  EmberEngine ECS Unit Tests\n";
    std::cout << "========================================\n\n";

    std::cout << "Entity Tests:\n";
    testEntityCreation();
    testEntityDestruction();
    testEntityNames();

    std::cout << "\nComponent Tests:\n";
    testComponentAddRemove();
    testMultipleComponents();
    testGetEntitiesWith();
    testQuery();

    std::cout << "\nScene Tests:\n";
    testSceneCreation();
    testSceneHierarchy();

    std::cout << "\n========================================\n";
    std::cout << "  All ECS tests PASSED!\n";
    std::cout << "========================================\n";

    return 0;
}
