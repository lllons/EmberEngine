#pragma once

#include <cstdint>
#include <vector>
#include <unordered_map>
#include <memory>
#include <bitset>
#include <array>
#include <cassert>
#include <functional>
#include <algorithm>
#include <set>
#include <string>
#include <mutex>
#include <fstream>

namespace Ember {

class Scene;
using Entity = uint32_t;
const Entity NULL_ENTITY = 0;
using ComponentType = uint8_t;
const ComponentType MAX_COMPONENTS = 32;
using ComponentMask = std::bitset<MAX_COMPONENTS>;

class IComponentPool {
public:
    virtual ~IComponentPool() = default;
    virtual void removeEntity(Entity entity) = 0;
    virtual bool hasEntity(Entity entity) const = 0;
};

template<typename T>
class ComponentPool : public IComponentPool {
public:
    void addEntity(Entity entity, const T& component) {
        if (m_entityToIndex.find(entity) != m_entityToIndex.end()) return;
        size_t newIndex = m_size;
        m_entityToIndex[entity] = newIndex;
        m_indexToEntity[newIndex] = entity;
        if (newIndex >= m_components.size()) {
            m_components.push_back(component);
        } else {
            m_components[newIndex] = component;
        }
        m_size++;
    }

    void removeEntity(Entity entity) override {
        auto it = m_entityToIndex.find(entity);
        if (it == m_entityToIndex.end()) return;
        size_t removedIndex = it->second;
        size_t lastIndex = m_size - 1;
        if (removedIndex != lastIndex) {
            m_components[removedIndex] = m_components[lastIndex];
            Entity lastEntity = m_indexToEntity[lastIndex];
            m_entityToIndex[lastEntity] = removedIndex;
            m_indexToEntity[removedIndex] = lastEntity;
        }
        m_entityToIndex.erase(it);
        m_indexToEntity.erase(lastIndex);
        m_size--;
    }

    bool hasEntity(Entity entity) const override {
        return m_entityToIndex.find(entity) != m_entityToIndex.end();
    }

    T& getComponent(Entity entity) {
        assert(hasEntity(entity) && "Entity does not have this component!");
        return m_components[m_entityToIndex[entity]];
    }

    const T& getComponent(Entity entity) const {
        assert(hasEntity(entity) && "Entity does not have this component!");
        auto it = m_entityToIndex.find(entity);
        return m_components.at(it->second);
    }

    size_t size() const { return m_size; }

private:
    std::vector<T> m_components;
    std::unordered_map<Entity, size_t> m_entityToIndex;
    std::unordered_map<size_t, Entity> m_indexToEntity;
    size_t m_size = 0;
};

class ComponentIDGenerator {
public:
    template<typename T>
    static ComponentType getID() {
        static ComponentType id = s_nextID++;
        return id;
    }
    static ComponentType getNextID() { return s_nextID; }
private:
    static ComponentType s_nextID;
};

class EntityComponentSystem {
public:
    EntityComponentSystem();
    ~EntityComponentSystem();

    Entity createEntity(const std::string& name = "");
    void destroyEntity(Entity entity);
    bool isEntityValid(Entity entity) const;
    const std::string& getEntityName(Entity entity) const;
    void setEntityName(Entity entity, const std::string& name);
    size_t getEntityCount() const { return m_entityCount; }
    std::vector<Entity> getAllEntities() const;

    template<typename T>
    T& addComponent(Entity entity, const T& component = T{}) {
        ComponentType typeID = ComponentIDGenerator::getID<T>();
        ensurePool<T>(typeID);
        auto pool = std::static_pointer_cast<ComponentPool<T>>(m_pools[typeID]);
        pool->addEntity(entity, component);
        m_entityMasks[entity].set(typeID);
        return pool->getComponent(entity);
    }

    template<typename T>
    void removeComponent(Entity entity) {
        ComponentType typeID = ComponentIDGenerator::getID<T>();
        if (m_pools.find(typeID) != m_pools.end()) {
            m_pools[typeID]->removeEntity(entity);
            m_entityMasks[entity].reset(typeID);
        }
    }

    template<typename T>
    T& getComponent(Entity entity) {
        ComponentType typeID = ComponentIDGenerator::getID<T>();
        assert(hasComponent<T>(entity) && "Entity does not have this component!");
        auto pool = std::static_pointer_cast<ComponentPool<T>>(m_pools[typeID]);
        return pool->getComponent(entity);
    }

    template<typename T>
    bool hasComponent(Entity entity) const {
        ComponentType typeID = ComponentIDGenerator::getID<T>();
        if (typeID >= MAX_COMPONENTS) return false;
        auto it = m_entityMasks.find(entity);
        if (it == m_entityMasks.end()) return false;
        return it->second.test(typeID);
    }

    template<typename T>
    std::vector<Entity> getEntitiesWith() {
        ComponentType typeID = ComponentIDGenerator::getID<T>();
        std::vector<Entity> result;
        for (auto& [entity, mask] : m_entityMasks) {
            if (mask.test(typeID)) result.push_back(entity);
        }
        return result;
    }

    template<typename... Types>
    std::vector<Entity> query() {
        ComponentMask required;
        (required.set(ComponentIDGenerator::getID<Types>()), ...);
        std::vector<Entity> result;
        for (auto& [entity, mask] : m_entityMasks) {
            if ((mask & required) == required) result.push_back(entity);
        }
        return result;
    }

    ComponentMask getEntityMask(Entity entity) const {
        auto it = m_entityMasks.find(entity);
        if (it != m_entityMasks.end()) return it->second;
        return ComponentMask();
    }

    void clear();
    void processDestructions();

private:
    template<typename T>
    void ensurePool(ComponentType typeID) {
        if (m_pools.find(typeID) == m_pools.end()) {
            m_pools[typeID] = std::make_shared<ComponentPool<T>>();
        }
    }

    std::unordered_map<Entity, ComponentMask> m_entityMasks;
    std::unordered_map<ComponentType, std::shared_ptr<IComponentPool>> m_pools;
    std::unordered_map<Entity, std::string> m_entityNames;
    std::vector<Entity> m_entities;
    std::vector<Entity> m_destructionQueue;
    Entity m_nextEntity = 1;
    size_t m_entityCount = 0;
};

class System {
public:
    virtual ~System() = default;
    virtual void init(EntityComponentSystem& ecs) { m_ecs = &ecs; }
    virtual void update(float deltaTime) = 0;
    virtual void shutdown() {}
    virtual const char* getName() const = 0;
protected:
    EntityComponentSystem* m_ecs = nullptr;
};

class Scene {
public:
    Scene(const std::string& name = "Untitled");
    ~Scene();
    const std::string& getName() const { return m_name; }
    void setName(const std::string& name) { m_name = name; }
    Entity createEntity(const std::string& name = "");
    void destroyEntity(Entity entity);
    Entity findEntityByName(const std::string& name) const;
    EntityComponentSystem& getECS() { return m_ecs; }
    const EntityComponentSystem& getECS() const { return m_ecs; }
    void addSystem(std::shared_ptr<System> system);
    void updateSystems(float deltaTime);
    void setParent(Entity child, Entity parent);
    Entity getParent(Entity entity) const;
    std::vector<Entity> getChildren(Entity entity) const;

    // ============ Serialization ============
    bool saveScene(const std::string& filepath);
    bool loadScene(const std::string& filepath);

    // ============ Prefab System ============
    bool savePrefab(const std::string& filepath, Entity entity);
    Entity instantiatePrefab(const std::string& filepath);

private:
    std::string m_name;
    EntityComponentSystem m_ecs;
    std::vector<std::shared_ptr<System>> m_systems;
    std::unordered_map<Entity, Entity> m_parentMap;
    std::unordered_map<Entity, std::vector<Entity>> m_childrenMap;

    // Serialization helpers
    void serializeEntity(std::ofstream& file, Entity entity);
    void serializeTransform(std::ofstream& file, Entity entity);
    void serializeMeshRenderer(std::ofstream& file, Entity entity);
    void serializeCamera(std::ofstream& file, Entity entity);
    void serializeLight(std::ofstream& file, Entity entity);
    void serializeRigidBody(std::ofstream& file, Entity entity);
    void serializeBoxCollider(std::ofstream& file, Entity entity);
    void serializeSphereCollider(std::ofstream& file, Entity entity);
    void serializeCapsuleCollider(std::ofstream& file, Entity entity);
    void serializeAudioSource(std::ofstream& file, Entity entity);
    void serializeParticleEmitter(std::ofstream& file, Entity entity);
    void serializeScript(std::ofstream& file, Entity entity);
    void serializeName(std::ofstream& file, Entity entity);
    void serializeTag(std::ofstream& file, Entity entity);
    void serializePrefab(std::ofstream& file, Entity entity);

    // Deserialization helpers
    void deserializeTransform(Entity entity, const std::unordered_map<std::string, std::string>& props);
    void deserializePrefab(Entity entity, const std::unordered_map<std::string, std::string>& props);
    void deserializeMeshRenderer(Entity entity, const std::unordered_map<std::string, std::string>& props);
    void deserializeCamera(Entity entity, const std::unordered_map<std::string, std::string>& props);
    void deserializeLight(Entity entity, const std::unordered_map<std::string, std::string>& props);
    void deserializeRigidBody(Entity entity, const std::unordered_map<std::string, std::string>& props);
    void deserializeBoxCollider(Entity entity, const std::unordered_map<std::string, std::string>& props);
    void deserializeSphereCollider(Entity entity, const std::unordered_map<std::string, std::string>& props);
    void deserializeCapsuleCollider(Entity entity, const std::unordered_map<std::string, std::string>& props);
    void deserializeAudioSource(Entity entity, const std::unordered_map<std::string, std::string>& props);
    void deserializeParticleEmitter(Entity entity, const std::unordered_map<std::string, std::string>& props);
    void deserializeScript(Entity entity, const std::unordered_map<std::string, std::string>& props);
    void deserializeName(Entity entity, const std::unordered_map<std::string, std::string>& props);
    void deserializeTag(Entity entity, const std::unordered_map<std::string, std::string>& props);

};

} // namespace Ember
