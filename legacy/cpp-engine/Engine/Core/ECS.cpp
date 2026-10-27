#include "Engine/Core/ECS.h"
#include "Engine/Core/Logging.h"
#include "Engine/Core/Components.h"
#include <algorithm>

#include <fstream>
#include <sstream>

namespace Ember {

ComponentType ComponentIDGenerator::s_nextID = 0;

EntityComponentSystem::EntityComponentSystem() = default;
EntityComponentSystem::~EntityComponentSystem() = default;

Entity EntityComponentSystem::createEntity(const std::string& name) {
    Entity entity = m_nextEntity++;
    m_entityMasks[entity] = ComponentMask();
    m_entityNames[entity] = name.empty() ? "Entity_" + std::to_string(entity) : name;
    m_entities.push_back(entity);
    m_entityCount++;
    return entity;
}

void EntityComponentSystem::destroyEntity(Entity entity) {
    m_destructionQueue.push_back(entity);
}

bool EntityComponentSystem::isEntityValid(Entity entity) const {
    return m_entityMasks.find(entity) != m_entityMasks.end();
}

const std::string& EntityComponentSystem::getEntityName(Entity entity) const {
    static const std::string empty = "";
    auto it = m_entityNames.find(entity);
    return it != m_entityNames.end() ? it->second : empty;
}

void EntityComponentSystem::setEntityName(Entity entity, const std::string& name) {
    m_entityNames[entity] = name;
}

std::vector<Entity> EntityComponentSystem::getAllEntities() const {
    return m_entities;
}

void EntityComponentSystem::clear() {
    m_entityMasks.clear();
    m_entityNames.clear();
    m_entities.clear();
    m_destructionQueue.clear();
    m_entityCount = 0;
}

void EntityComponentSystem::processDestructions() {
    for (Entity entity : m_destructionQueue) {
        for (auto& [typeID, pool] : m_pools) {
            pool->removeEntity(entity);
        }
        m_entityMasks.erase(entity);
        m_entityNames.erase(entity);
        m_entities.erase(
            std::remove(m_entities.begin(), m_entities.end(), entity),
            m_entities.end());
        m_entityCount--;
    }
    m_destructionQueue.clear();
}

// ============ Scene ============
Scene::Scene(const std::string& name) : m_name(name) {
    EMBER_LOG_INFO("Scene created: ", name);
}

Scene::~Scene() {
    EMBER_LOG_INFO("Scene destroyed: ", m_name);
}

Entity Scene::createEntity(const std::string& name) {
    return m_ecs.createEntity(name);
}

void Scene::destroyEntity(Entity entity) {
    m_ecs.destroyEntity(entity);
    m_parentMap.erase(entity);
    m_childrenMap.erase(entity);
}

Entity Scene::findEntityByName(const std::string& name) const {
    for (Entity entity : m_ecs.getAllEntities()) {
        if (m_ecs.getEntityName(entity) == name) {
            return entity;
        }
    }
    return NULL_ENTITY;
}

void Scene::addSystem(std::shared_ptr<System> system) {
    system->init(m_ecs);
    m_systems.push_back(system);
}

void Scene::updateSystems(float deltaTime) {
    for (auto& system : m_systems) {
        system->update(deltaTime);
    }
    m_ecs.processDestructions();
}

void Scene::setParent(Entity child, Entity parent) {
    auto oldParentIt = m_parentMap.find(child);
    if (oldParentIt != m_parentMap.end()) {
        Entity oldParent = oldParentIt->second;
        auto& oldChildren = m_childrenMap[oldParent];
        oldChildren.erase(std::remove(oldChildren.begin(), oldChildren.end(), child), oldChildren.end());
    }
    m_parentMap[child] = parent;
    m_childrenMap[parent].push_back(child);
}

Entity Scene::getParent(Entity entity) const {
    auto it = m_parentMap.find(entity);
    return it != m_parentMap.end() ? it->second : NULL_ENTITY;
}

std::vector<Entity> Scene::getChildren(Entity entity) const {
    auto it = m_childrenMap.find(entity);
    return it != m_childrenMap.end() ? it->second : std::vector<Entity>();
}

// ============================================================================
// Scene Serialization
// ============================================================================

bool Scene::saveScene(const std::string& filepath) {
    std::ofstream file(filepath);
    if (!file.is_open()) {
        EMBER_LOG_ERROR("Failed to open scene file for writing: ", filepath);
        return false;
    }

    // Write header
    file << "EmberScene v1.0\n";
    file << "sceneName " << m_name << "\n";
    file << "entityCount " << m_ecs.getEntityCount() << "\n";
    file << "\n";

    // Write each entity
    auto entities = m_ecs.getAllEntities();
    for (Entity entity : entities) {
        serializeEntity(file, entity);
        file << "\n";
    }

    EMBER_LOG_INFO("Scene saved to ", filepath, " (", entities.size(), " entities)");
    return true;
}

void Scene::serializeEntity(std::ofstream& file, Entity entity) {
    file << "entity " << entity << " " << m_ecs.getEntityName(entity) << "\n";

    // Parent hierarchy
    auto parentIt = m_parentMap.find(entity);
    Entity parent = (parentIt != m_parentMap.end()) ? parentIt->second : NULL_ENTITY;
    file << "parent " << parent << "\n";

    // Serialize each component type the entity has
    serializeTransform(file, entity);
    serializeMeshRenderer(file, entity);
    serializeCamera(file, entity);
    serializeLight(file, entity);
    serializeRigidBody(file, entity);
    serializeBoxCollider(file, entity);
    serializeSphereCollider(file, entity);
    serializeCapsuleCollider(file, entity);
    serializeAudioSource(file, entity);
    serializeParticleEmitter(file, entity);
    serializeScript(file, entity);
    serializeName(file, entity);
    serializeTag(file, entity);

    file << "end\n";
}

void Scene::serializeTransform(std::ofstream& file, Entity entity) {
    if (!m_ecs.hasComponent<Transform>(entity)) return;
    auto& t = m_ecs.getComponent<Transform>(entity);
    file << "Transform: "
         << t.position.x << " " << t.position.y << " " << t.position.z << " "
         << t.rotation.x << " " << t.rotation.y << " " << t.rotation.z << " " << t.rotation.w << " "
         << t.scale.x << " " << t.scale.y << " " << t.scale.z << "\n";
}

void Scene::serializeMeshRenderer(std::ofstream& file, Entity entity) {
    if (!m_ecs.hasComponent<MeshRenderer>(entity)) return;
    auto& mr = m_ecs.getComponent<MeshRenderer>(entity);
    file << "MeshRenderer: "
         << (mr.mesh ? "1" : "0") << " "
         << (mr.material ? "1" : "0") << " "
         << mr.castShadows << " "
         << mr.receiveShadows << " "
         << mr.enabled << "\n";
    if (mr.material) {
        auto albedo = mr.material->getAlbedo();
        file << "MaterialProps: "
             << albedo.x << " " << albedo.y << " " << albedo.z << " "
             << mr.material->getRoughness() << " "
             << mr.material->getMetallic() << "\n";
    }
}

void Scene::serializeCamera(std::ofstream& file, Entity entity) {
    if (!m_ecs.hasComponent<CameraComponent>(entity)) return;
    auto& cam = m_ecs.getComponent<CameraComponent>(entity);
    file << "CameraComponent: "
         << (int)cam.projectionType << " "
         << cam.fov << " "
         << cam.aspect << " "
         << cam.nearPlane << " "
         << cam.farPlane << " "
         << cam.orthoSize << " "
         << cam.priority << " "
         << cam.primary << " "
         << cam.enabled << "\n";
}

void Scene::serializeLight(std::ofstream& file, Entity entity) {
    if (!m_ecs.hasComponent<LightComponent>(entity)) return;
    auto& l = m_ecs.getComponent<LightComponent>(entity);
    file << "LightComponent: "
         << (int)l.type << " "
         << l.color.x << " " << l.color.y << " " << l.color.z << " "
         << l.intensity << " "
         << l.range << " "
         << l.constant << " "
         << l.linear << " "
         << l.quadratic << " "
         << l.innerCutoff << " "
         << l.outerCutoff << " "
         << l.castShadows << " "
         << l.shadowBias << " "
         << l.shadowResolution << " "
         << l.enabled << "\n";
}

void Scene::serializeRigidBody(std::ofstream& file, Entity entity) {
    if (!m_ecs.hasComponent<RigidBodyComponent>(entity)) return;
    auto& rb = m_ecs.getComponent<RigidBodyComponent>(entity);
    file << "RigidBodyComponent: "
         << (int)rb.bodyType << " "
         << rb.mass << " "
         << rb.linearDrag << " "
         << rb.angularDrag << " "
         << rb.useGravity << " "
         << rb.isKinematic << " "
         << rb.enabled << " "
         << rb.linearVelocity.x << " " << rb.linearVelocity.y << " " << rb.linearVelocity.z << " "
         << rb.angularVelocity.x << " " << rb.angularVelocity.y << " " << rb.angularVelocity.z << "\n";
}

void Scene::serializeBoxCollider(std::ofstream& file, Entity entity) {
    if (!m_ecs.hasComponent<BoxColliderComponent>(entity)) return;
    auto& bc = m_ecs.getComponent<BoxColliderComponent>(entity);
    file << "BoxColliderComponent: "
         << bc.size.x << " " << bc.size.y << " " << bc.size.z << " "
         << bc.offset.x << " " << bc.offset.y << " " << bc.offset.z << " "
         << bc.isTrigger << " "
         << bc.friction << " "
         << bc.bounciness << " "
         << bc.enabled << "\n";
}

void Scene::serializeSphereCollider(std::ofstream& file, Entity entity) {
    if (!m_ecs.hasComponent<SphereColliderComponent>(entity)) return;
    auto& sc = m_ecs.getComponent<SphereColliderComponent>(entity);
    file << "SphereColliderComponent: "
         << sc.radius << " "
         << sc.offset.x << " " << sc.offset.y << " " << sc.offset.z << " "
         << sc.isTrigger << " "
         << sc.friction << " "
         << sc.bounciness << " "
         << sc.enabled << "\n";
}

void Scene::serializeCapsuleCollider(std::ofstream& file, Entity entity) {
    if (!m_ecs.hasComponent<CapsuleColliderComponent>(entity)) return;
    auto& cc = m_ecs.getComponent<CapsuleColliderComponent>(entity);
    file << "CapsuleColliderComponent: "
         << cc.radius << " "
         << cc.height << " "
         << cc.offset.x << " " << cc.offset.y << " " << cc.offset.z << " "
         << cc.isTrigger << " "
         << cc.friction << " "
         << cc.bounciness << " "
         << cc.enabled << "\n";
}

void Scene::serializeAudioSource(std::ofstream& file, Entity entity) {
    if (!m_ecs.hasComponent<AudioSourceComponent>(entity)) return;
    auto& a = m_ecs.getComponent<AudioSourceComponent>(entity);
    file << "AudioSourceData: "
         << a.volume << " "
         << a.pitch << " "
         << a.loop << " "
         << a.spatialized << " "
         << a.minDistance << " "
         << a.maxDistance << " "
         << a.playOnStart << " "
         << a.enabled << "\n";
    file << "AudioSourceClip: " << a.clipPath << "\n";
}

void Scene::serializeParticleEmitter(std::ofstream& file, Entity entity) {
    if (!m_ecs.hasComponent<ParticleEmitterComponent>(entity)) return;
    auto& p = m_ecs.getComponent<ParticleEmitterComponent>(entity);
    file << "ParticleEmitterComponent: "
         << p.maxParticles << " "
         << p.emissionRate << " "
         << p.lifetime << " "
         << p.startVelocityMin.x << " " << p.startVelocityMin.y << " " << p.startVelocityMin.z << " "
         << p.startVelocityMax.x << " " << p.startVelocityMax.y << " " << p.startVelocityMax.z << " "
         << p.startSizeMin << " "
         << p.startSizeMax << " "
         << p.startColor.x << " " << p.startColor.y << " " << p.startColor.z << " " << p.startColor.w << " "
         << p.endColor.x << " " << p.endColor.y << " " << p.endColor.z << " " << p.endColor.w << " "
         << p.loop << " "
         << p.enabled << "\n";
}

void Scene::serializeScript(std::ofstream& file, Entity entity) {
    if (!m_ecs.hasComponent<ScriptComponent>(entity)) return;
    auto& s = m_ecs.getComponent<ScriptComponent>(entity);
    file << "ScriptData: " << s.enabled << "\n";
    file << "ScriptName: " << s.scriptName << "\n";
}

void Scene::serializeName(std::ofstream& file, Entity entity) {
    if (!m_ecs.hasComponent<NameComponent>(entity)) return;
    auto& n = m_ecs.getComponent<NameComponent>(entity);
    file << "NameComponent: " << n.name << "\n";
}

void Scene::serializeTag(std::ofstream& file, Entity entity) {
    if (!m_ecs.hasComponent<Tag>(entity)) return;
    auto& t = m_ecs.getComponent<Tag>(entity);
    file << "Tag: "
         << t.layer << " "
         << t.tagID << "\n";
    file << "TagName: " << t.name << "\n";
}

// ============================================================================
// Scene Deserialization
// ============================================================================

bool Scene::loadScene(const std::string& filepath) {
    std::ifstream file(filepath);
    if (!file.is_open()) {
        EMBER_LOG_ERROR("Failed to open scene file for reading: ", filepath);
        return false;
    }

    // Clear the existing scene
    m_ecs.clear();
    m_parentMap.clear();
    m_childrenMap.clear();
    m_systems.clear();

    std::string line;
    std::getline(file, line); // Header

    // Read scene name
    std::getline(file, line);
    if (line.substr(0, 9) == "sceneName") {
        m_name = line.substr(10);
    }

    // Read entity count (informational)
    std::getline(file, line);

    // Temporary storage for entities and their parents
    struct EntityData {
        std::string name;
        std::unordered_map<std::string, std::string> componentProps;
    };
    std::unordered_map<Entity, EntityData> entityData;
    std::vector<Entity> entities;

    // Parse each entity block
    while (std::getline(file, line)) {
        if (line.substr(0, 7) == "entity ") {
            EntityData data;
            Entity entity = 0;

            // Parse entity line: "entity ID Name"
            std::istringstream entityLine(line.substr(7));
            std::string idStr, name;
            entityLine >> idStr;
            entity = (Entity)std::stoull(idStr);
            // Read the rest of the line as the name
            std::getline(entityLine, name);
            if (!name.empty() && name[0] == ' ') name = name.substr(1);
            data.name = name;

            // Parse component lines until "end"
            while (std::getline(file, line)) {
                if (line == "end") break;
                if (file.eof()) {
                    EMBER_LOG_ERROR("Truncated scene file: missing 'end' marker for entity ", entity);
                    return false;
                }

                // Parse key-value like "Transform: x y z ..."
                auto colonPos = line.find(": ");
                if (colonPos == std::string::npos) {
                    // Could be a simple key-value
                    auto spacePos = line.find(' ');
                    if (spacePos != std::string::npos) {
                        std::string key = line.substr(0, spacePos);
                        std::string value = line.substr(spacePos + 1);
                        data.componentProps[key] = value;
                    }
                    continue;
                }

                std::string key = line.substr(0, colonPos);
                std::string value = line.substr(colonPos + 2);
                data.componentProps[key] = value;
            }

            entityData[entity] = data;
            entities.push_back(entity);
        }
    }

    // Track entity ID mapping from file IDs to new IDs
    std::unordered_map<Entity, Entity> idMap;

    // First pass: create all entities
    for (Entity oldEntity : entities) {
        auto& data = entityData[oldEntity];
        Entity newEntity = m_ecs.createEntity(data.name);
        idMap[oldEntity] = newEntity;
    }

    // Second pass: set parent relationships (stored in componentProps during parsing)
    for (Entity oldEntity : entities) {
        auto& data = entityData[oldEntity];
        Entity newEntity = idMap[oldEntity];
        auto parentProp = data.componentProps.find("parent");
        if (parentProp != data.componentProps.end()) {
            Entity parentId = (Entity)std::stoull(parentProp->second);
            if (parentId != NULL_ENTITY) {
                auto parentIt = idMap.find(parentId);
                if (parentIt != idMap.end()) {
                    setParent(newEntity, parentIt->second);
                }
            }
        }
    }

    // Third pass: deserialize components
    for (Entity oldEntity : entities) {
        auto& data = entityData[oldEntity];
        Entity newEntity = idMap[oldEntity];

        deserializeTransform(newEntity, data.componentProps);
        deserializeMeshRenderer(newEntity, data.componentProps);
        deserializeCamera(newEntity, data.componentProps);
        deserializeLight(newEntity, data.componentProps);
        deserializeRigidBody(newEntity, data.componentProps);
        deserializeBoxCollider(newEntity, data.componentProps);
        deserializeSphereCollider(newEntity, data.componentProps);
        deserializeCapsuleCollider(newEntity, data.componentProps);
        deserializeAudioSource(newEntity, data.componentProps);
        deserializeParticleEmitter(newEntity, data.componentProps);
        deserializeScript(newEntity, data.componentProps);
        deserializeName(newEntity, data.componentProps);
        deserializeTag(newEntity, data.componentProps);
        deserializePrefab(newEntity, data.componentProps);
    }

    EMBER_LOG_INFO("Scene loaded from ", filepath, " (", entities.size(), " entities)");
    return true;
}

// ============================================================================
// Prefab System
// ============================================================================

bool Scene::savePrefab(const std::string& filepath, Entity entity) {
    if (!m_ecs.isEntityValid(entity)) {
        EMBER_LOG_ERROR("Cannot save prefab: invalid entity ", entity);
        return false;
    }

    std::ofstream file(filepath);
    if (!file.is_open()) {
        EMBER_LOG_ERROR("Failed to open prefab file for writing: ", filepath);
        return false;
    }

    // Write prefab header
    file << "EmberPrefab v1.0\n";
    file << "prefabName " << m_ecs.getEntityName(entity) << "\n";
    file << "\n";

    // Write the entity block using existing serialization helpers
    // Use the scene serialization format but only for this entity
    file << "entity " << entity << " " << m_ecs.getEntityName(entity) << "\n";
    file << "parent 0\n";

    serializeTransform(file, entity);
    serializeMeshRenderer(file, entity);
    serializeCamera(file, entity);
    serializeLight(file, entity);
    serializeRigidBody(file, entity);
    serializeBoxCollider(file, entity);
    serializeSphereCollider(file, entity);
    serializeCapsuleCollider(file, entity);
    serializeAudioSource(file, entity);
    serializeParticleEmitter(file, entity);
    serializeScript(file, entity);
    serializeName(file, entity);
    serializeTag(file, entity);
    // Do NOT serialize PrefabComponent in prefab files - that data belongs to instances, not templates

    file << "end\n";

    EMBER_LOG_INFO("Prefab saved to ", filepath, " for entity '", m_ecs.getEntityName(entity), "'");
    return true;
}

Entity Scene::instantiatePrefab(const std::string& filepath) {
    std::ifstream file(filepath);
    if (!file.is_open()) {
        EMBER_LOG_ERROR("Failed to open prefab file: ", filepath);
        return NULL_ENTITY;
    }

    std::string line;
    std::getline(file, line); // Header: "EmberPrefab v1.0"

    // Read prefab name
    std::getline(file, line);
    std::string prefabName = "Prefab";
    if (line.substr(0, 10) == "prefabName") {
        prefabName = line.substr(11);
    }

    // Skip blank line
    std::getline(file, line);

    // Parse entity blocks (same format as scene)
    std::unordered_map<std::string, std::string> componentProps;
    Entity tempEntity = 0;
    std::string entityName;

    while (std::getline(file, line)) {
        if (line.substr(0, 7) == "entity ") {
            // Parse entity line
            std::istringstream entityLine(line.substr(7));
            std::string idStr;
            entityLine >> idStr;
            tempEntity = (Entity)std::stoull(idStr);
            std::getline(entityLine, entityName);
            if (!entityName.empty() && entityName[0] == ' ') entityName = entityName.substr(1);
        } else if (line == "end") {
            break;
        } else {
            // Parse key-value
            auto colonPos = line.find(": ");
            if (colonPos != std::string::npos) {
                std::string key = line.substr(0, colonPos);
                std::string value = line.substr(colonPos + 2);
                componentProps[key] = value;
            } else {
                auto spacePos = line.find(' ');
                if (spacePos != std::string::npos) {
                    std::string key = line.substr(0, spacePos);
                    std::string value = line.substr(spacePos + 1);
                    componentProps[key] = value;
                }
            }
        }
    }

    // Create a new entity from the prefab data
    std::string newName = prefabName;
    Entity newEntity = m_ecs.createEntity(newName);

    // Add PrefabComponent to track the source
    PrefabComponent prefabComp;
    prefabComp.prefabPath = filepath;
    prefabComp.prefabName = prefabName;
    prefabComp.prefabID = (uint64_t)std::hash<std::string>{}(filepath);
    prefabComp.instantiated = true;
    m_ecs.addComponent<PrefabComponent>(newEntity, prefabComp);

    // Deserialize components using existing helpers
    deserializeTransform(newEntity, componentProps);
    deserializeMeshRenderer(newEntity, componentProps);
    deserializeCamera(newEntity, componentProps);
    deserializeLight(newEntity, componentProps);
    deserializeRigidBody(newEntity, componentProps);
    deserializeBoxCollider(newEntity, componentProps);
    deserializeSphereCollider(newEntity, componentProps);
    deserializeCapsuleCollider(newEntity, componentProps);
    deserializeAudioSource(newEntity, componentProps);
    deserializeParticleEmitter(newEntity, componentProps);
    deserializeScript(newEntity, componentProps);
    deserializeName(newEntity, componentProps);
    deserializeTag(newEntity, componentProps);

    EMBER_LOG_INFO("Instantiated prefab '", prefabName, "' from ", filepath);
    return newEntity;
}

// Forward declaration for parseFloats
static std::vector<float> parseFloats(const std::string& str);

// ============ Prefab Serialization Helpers ============

void Scene::serializePrefab(std::ofstream& file, Entity entity) {
    if (!m_ecs.hasComponent<PrefabComponent>(entity)) return;
    auto& p = m_ecs.getComponent<PrefabComponent>(entity);
    file << "PrefabComponent: "
         << p.prefabID << " "
         << p.instantiated << " "
         << p.breakPrefab << "\n";
    file << "PrefabPath: " << p.prefabPath << "\n";
    file << "PrefabName: " << p.prefabName << "\n";
}

void Scene::deserializePrefab(Entity entity, const std::unordered_map<std::string, std::string>& props) {
    auto it = props.find("PrefabComponent");
    if (it == props.end()) return;
    auto vals = parseFloats(it->second);
    if (vals.size() < 3) return;

    PrefabComponent p;
    auto pathIt = props.find("PrefabPath");
    if (pathIt != props.end()) p.prefabPath = pathIt->second;
    auto nameIt = props.find("PrefabName");
    if (nameIt != props.end()) p.prefabName = nameIt->second;
    p.prefabID = (uint64_t)vals[0];
    p.instantiated = vals[1] > 0.5f;
    p.breakPrefab = vals[2] > 0.5f;
    m_ecs.addComponent<PrefabComponent>(entity, p);
}

// Helper: parse space-separated float values from a string
static std::vector<float> parseFloats(const std::string& str) {
    std::vector<float> result;
    std::istringstream stream(str);
    float val;
    while (stream >> val) {
        result.push_back(val);
    }
    return result;
}

void Scene::deserializeTransform(Entity entity, const std::unordered_map<std::string, std::string>& props) {
    auto it = props.find("Transform");
    if (it == props.end()) return;
    auto vals = parseFloats(it->second);
    if (vals.size() < 10) return;
    Transform t;
    t.position = Math::Vec3(vals[0], vals[1], vals[2]);
    t.rotation = Math::Quaternion(vals[3], vals[4], vals[5], vals[6]);
    t.scale = Math::Vec3(vals[7], vals[8], vals[9]);
    m_ecs.addComponent<Transform>(entity, t);
}

void Scene::deserializeMeshRenderer(Entity entity, const std::unordered_map<std::string, std::string>& props) {
    auto it = props.find("MeshRenderer");
    if (it == props.end()) return;
    auto vals = parseFloats(it->second);
    if (vals.size() < 5) return;
    MeshRenderer mr;
    // For now, we don't serialize actual mesh/material pointers - they need to be re-created
    mr.mesh = nullptr; // Will need asset resolution
    mr.material = nullptr;
    mr.castShadows = vals[2] > 0.5f;
    mr.receiveShadows = vals[3] > 0.5f;
    mr.enabled = vals[4] > 0.5f;

    // Check for material properties
    auto matIt = props.find("MaterialProps");
    if (matIt != props.end()) {
        auto matVals = parseFloats(matIt->second);
        if (matVals.size() >= 5) {
            mr.material = Material::createDefault();
            mr.material->setAlbedo(Math::Vec3(matVals[0], matVals[1], matVals[2]));
            mr.material->setRoughness(matVals[3]);
            mr.material->setMetallic(matVals[4]);
        }
    }

    m_ecs.addComponent<MeshRenderer>(entity, mr);
}

void Scene::deserializeCamera(Entity entity, const std::unordered_map<std::string, std::string>& props) {
    auto it = props.find("CameraComponent");
    if (it == props.end()) return;
    auto vals = parseFloats(it->second);
    if (vals.size() < 9) return;
    CameraComponent cam;
    cam.projectionType = (CameraComponent::Projection)(int)vals[0];
    cam.fov = vals[1];
    cam.aspect = vals[2];
    cam.nearPlane = vals[3];
    cam.farPlane = vals[4];
    cam.orthoSize = vals[5];
    cam.priority = (int)vals[6];
    cam.primary = vals[7] > 0.5f;
    cam.enabled = vals[8] > 0.5f;
    m_ecs.addComponent<CameraComponent>(entity, cam);
}

void Scene::deserializeLight(Entity entity, const std::unordered_map<std::string, std::string>& props) {
    auto it = props.find("LightComponent");
    if (it == props.end()) return;
    auto vals = parseFloats(it->second);
    if (vals.size() < 17) return;
    LightComponent l;
    l.type = (LightComponent::Type)(int)vals[0];
    l.color = Math::Vec3(vals[1], vals[2], vals[3]);
    l.intensity = vals[4];
    l.range = vals[5];
    l.constant = vals[6];
    l.linear = vals[7];
    l.quadratic = vals[8];
    l.innerCutoff = vals[9];
    l.outerCutoff = vals[10];
    l.castShadows = vals[11] > 0.5f;
    l.shadowBias = vals[12];
    l.shadowResolution = (int)vals[13];
    l.enabled = vals[14] > 0.5f;
    m_ecs.addComponent<LightComponent>(entity, l);
}

void Scene::deserializeRigidBody(Entity entity, const std::unordered_map<std::string, std::string>& props) {
    auto it = props.find("RigidBodyComponent");
    if (it == props.end()) return;
    auto vals = parseFloats(it->second);
    if (vals.size() < 13) return;
    RigidBodyComponent rb;
    rb.bodyType = (RigidBodyComponent::BodyType)(int)vals[0];
    rb.mass = vals[1];
    rb.linearDrag = vals[2];
    rb.angularDrag = vals[3];
    rb.useGravity = vals[4] > 0.5f;
    rb.isKinematic = vals[5] > 0.5f;
    rb.enabled = vals[6] > 0.5f;
    rb.linearVelocity = Math::Vec3(vals[7], vals[8], vals[9]);
    rb.angularVelocity = Math::Vec3(vals[10], vals[11], vals[12]);
    m_ecs.addComponent<RigidBodyComponent>(entity, rb);
}

void Scene::deserializeBoxCollider(Entity entity, const std::unordered_map<std::string, std::string>& props) {
    auto it = props.find("BoxColliderComponent");
    if (it == props.end()) return;
    auto vals = parseFloats(it->second);
    if (vals.size() < 10) return;
    BoxColliderComponent bc;
    bc.size = Math::Vec3(vals[0], vals[1], vals[2]);
    bc.offset = Math::Vec3(vals[3], vals[4], vals[5]);
    bc.isTrigger = vals[6] > 0.5f;
    bc.friction = vals[7];
    bc.bounciness = vals[8];
    bc.enabled = vals[9] > 0.5f;
    m_ecs.addComponent<BoxColliderComponent>(entity, bc);
}

void Scene::deserializeSphereCollider(Entity entity, const std::unordered_map<std::string, std::string>& props) {
    auto it = props.find("SphereColliderComponent");
    if (it == props.end()) return;
    auto vals = parseFloats(it->second);
    if (vals.size() < 7) return;
    SphereColliderComponent sc;
    sc.radius = vals[0];
    sc.offset = Math::Vec3(vals[1], vals[2], vals[3]);
    sc.isTrigger = vals[4] > 0.5f;
    sc.friction = vals[5];
    sc.bounciness = vals[6];
    sc.enabled = vals[7] > 0.5f;
    m_ecs.addComponent<SphereColliderComponent>(entity, sc);
}

void Scene::deserializeCapsuleCollider(Entity entity, const std::unordered_map<std::string, std::string>& props) {
    auto it = props.find("CapsuleColliderComponent");
    if (it == props.end()) return;
    auto vals = parseFloats(it->second);
    if (vals.size() < 9) return;
    CapsuleColliderComponent cc;
    cc.radius = vals[0];
    cc.height = vals[1];
    cc.offset = Math::Vec3(vals[2], vals[3], vals[4]);
    cc.isTrigger = vals[5] > 0.5f;
    cc.friction = vals[6];
    cc.bounciness = vals[7];
    cc.enabled = vals[8] > 0.5f;
    m_ecs.addComponent<CapsuleColliderComponent>(entity, cc);
}

void Scene::deserializeAudioSource(Entity entity, const std::unordered_map<std::string, std::string>& props) {
    auto it = props.find("AudioSourceData");
    if (it == props.end()) return;
    auto vals = parseFloats(it->second);
    if (vals.size() < 8) return;

    AudioSourceComponent a;
    a.clipPath = "";
    auto clipIt = props.find("AudioSourceClip");
    if (clipIt != props.end()) {
        a.clipPath = clipIt->second;
    }
    a.volume = vals[0];
    a.pitch = vals[1];
    a.loop = vals[2] > 0.5f;
    a.spatialized = vals[3] > 0.5f;
    a.minDistance = vals[4];
    a.maxDistance = vals[5];
    a.playOnStart = vals[6] > 0.5f;
    a.enabled = vals[7] > 0.5f;
    m_ecs.addComponent<AudioSourceComponent>(entity, a);
}

void Scene::deserializeParticleEmitter(Entity entity, const std::unordered_map<std::string, std::string>& props) {
    auto it = props.find("ParticleEmitterComponent");
    if (it == props.end()) return;
    auto vals = parseFloats(it->second);
    if (vals.size() < 21) return;
    ParticleEmitterComponent p;
    p.maxParticles = (int)vals[0];
    p.emissionRate = vals[1];
    p.lifetime = vals[2];
    p.startVelocityMin = Math::Vec3(vals[3], vals[4], vals[5]);
    p.startVelocityMax = Math::Vec3(vals[6], vals[7], vals[8]);
    p.startSizeMin = vals[9];
    p.startSizeMax = vals[10];
    p.startColor = Math::Vec4(vals[11], vals[12], vals[13], vals[14]);
    p.endColor = Math::Vec4(vals[15], vals[16], vals[17], vals[18]);
    p.loop = vals[19] > 0.5f;
    p.enabled = vals[20] > 0.5f;
    m_ecs.addComponent<ParticleEmitterComponent>(entity, p);
}

void Scene::deserializeScript(Entity entity, const std::unordered_map<std::string, std::string>& props) {
    auto it = props.find("ScriptData");
    if (it == props.end()) return;
    auto vals = parseFloats(it->second);
    if (vals.size() < 1) return;

    ScriptComponent s;
    s.scriptName = "";
    auto nameIt = props.find("ScriptName");
    if (nameIt != props.end()) {
        s.scriptName = nameIt->second;
    }
    s.enabled = vals[0] > 0.5f;
    m_ecs.addComponent<ScriptComponent>(entity, s);
}

void Scene::deserializeName(Entity entity, const std::unordered_map<std::string, std::string>& props) {
    auto it = props.find("NameComponent");
    if (it == props.end()) return;
    NameComponent n;
    n.name = it->second; // The value is the name string directly
    m_ecs.addComponent<NameComponent>(entity, n);
}

void Scene::deserializeTag(Entity entity, const std::unordered_map<std::string, std::string>& props) {
    auto it = props.find("Tag");
    if (it == props.end()) return;
    auto vals = parseFloats(it->second);
    if (vals.size() < 2) return;

    Tag t;
    t.name = "";
    auto nameIt = props.find("TagName");
    if (nameIt != props.end()) {
        t.name = nameIt->second;
    }
    t.layer = (uint32_t)vals[0];
    t.tagID = (uint32_t)vals[1];
    m_ecs.addComponent<Tag>(entity, t);
}

} // namespace Ember
