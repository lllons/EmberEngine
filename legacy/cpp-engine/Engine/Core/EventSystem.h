#pragma once

#include <functional>
#include <unordered_map>
#include <vector>
#include <queue>
#include <mutex>
#include <memory>
#include <any>
#include <typeindex>

namespace Ember {

// Base event class
class Event {
public:
    virtual ~Event() = default;
    virtual const char* getName() const = 0;
    bool handled = false;
};

// Event categories (bitmask)
enum EventCategory {
    None = 0,
    EventCategoryApplication = 1 << 0,
    EventCategoryInput = 1 << 1,
    EventCategoryKeyboard = 1 << 2,
    EventCategoryMouse = 1 << 3,
    EventCategoryController = 1 << 4,
    EventCategoryWindow = 1 << 5,
    EventCategoryPhysics = 1 << 6,
    EventCategoryAudio = 1 << 7,
    EventCategoryRendering = 1 << 8
};

// Event dispatcher
class EventDispatcher {
public:
    using EventCallback = std::function<void(Event&)>;

    template<typename T>
    using EventFn = std::function<void(T&)>;

    // Register a callback for a specific event type
    template<typename T>
    void subscribe(EventFn<T> callback) {
        auto typeId = std::type_index(typeid(T));
        m_listeners[typeId].push_back([callback](Event& event) {
            if (event.handled) return;
            callback(static_cast<T&>(event));
        });
    }

    // Dispatch an event to all registered listeners
    void dispatch(Event& event) {
        auto typeId = std::type_index(typeid(event));
        auto it = m_listeners.find(typeId);
        if (it != m_listeners.end()) {
            for (auto& callback : it->second) {
                callback(event);
                if (event.handled) break;
            }
        }
    }

    // Clear all listeners
    void clear() {
        m_listeners.clear();
    }

    // Remove listeners for a specific event type
    template<typename T>
    void unsubscribe() {
        auto typeId = std::type_index(typeid(T));
        m_listeners.erase(typeId);
    }

private:
    std::unordered_map<std::type_index, std::vector<EventCallback>> m_listeners;
};

// Event queue for deferred processing
class EventQueue {
public:
    void push(std::shared_ptr<Event> event) {
        std::lock_guard<std::mutex> lock(m_mutex);
        m_queue.push(event);
    }

    bool empty() const {
        std::lock_guard<std::mutex> lock(m_mutex);
        return m_queue.empty();
    }

    std::shared_ptr<Event> pop() {
        std::lock_guard<std::mutex> lock(m_mutex);
        if (m_queue.empty()) return nullptr;
        auto event = m_queue.front();
        m_queue.pop();
        return event;
    }

    size_t size() const {
        std::lock_guard<std::mutex> lock(m_mutex);
        return m_queue.size();
    }

    void clear() {
        std::lock_guard<std::mutex> lock(m_mutex);
        while (!m_queue.empty()) {
            m_queue.pop();
        }
    }

private:
    std::queue<std::shared_ptr<Event>> m_queue;
    mutable std::mutex m_mutex;
};

// Global event system
class EventSystem {
public:
    static EventSystem& get();

    void init();
    void shutdown();

    // Subscribe to events
    template<typename T>
    void subscribe(std::function<void(T&)> callback) {
        m_dispatcher.subscribe<T>(callback);
    }

    // Dispatch event immediately
    template<typename T>
    void dispatch(T& event) {
        m_dispatcher.dispatch(event);
    }

    // Queue event for deferred processing
    void queueEvent(std::shared_ptr<Event> event);

    // Process all queued events
    void processEvents();

    // Clear all subscriptions
    void clear() { m_dispatcher.clear(); }

private:
    EventSystem() = default;
    ~EventSystem() = default;

    EventDispatcher m_dispatcher;
    EventQueue m_queue;
};

} // namespace Ember
