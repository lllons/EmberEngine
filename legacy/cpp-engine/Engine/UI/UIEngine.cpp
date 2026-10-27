#include "Engine/UI/UIEngine.h"
#include "Engine/Core/Logging.h"

namespace Ember {

UIEngine& UIEngine::get() { static UIEngine instance; return instance; }
bool UIEngine::init() { m_initialized = true; EMBER_LOG_INFO("UIEngine initialized (stub)"); return true; }
void UIEngine::shutdown() { m_initialized = false; }
void UIEngine::render() {}
void UIEngine::newFrame() {}
void UIEngine::showDemoWindow(bool* show) { (void)show; }

} // namespace Ember
