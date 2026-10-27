#include "Engine/Core/EventSystem.h"

namespace Ember {

EventSystem& EventSystem::get() {
    static EventSystem instance;
    return instance;
}

void EventSystem::init() {
    m_queue.clear();
}

void EventSystem::shutdown() {
    m_queue.clear();
    m_dispatcher.clear();
}

void EventSystem::queueEvent(std::shared_ptr<Event> event) {
    m_queue.push(event);
}

void EventSystem::processEvents() {
    while (!m_queue.empty()) {
        auto event = m_queue.pop();
        if (event) {
            m_dispatcher.dispatch(*event);
        }
    }
}

} // namespace Ember
