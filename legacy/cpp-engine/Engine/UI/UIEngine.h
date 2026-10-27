#pragma once

#include <string>
#include <cstdint>

namespace Ember {

class UIEngine {
public:
    static UIEngine& get();

    bool init();
    void shutdown();
    void render();
    void newFrame();

    // State
    bool isInitialized() const { return m_initialized; }

    // Demo/test functionality
    void showDemoWindow(bool* show = nullptr);

    bool m_initialized = false;
};

} // namespace Ember
