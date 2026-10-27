#include "Engine/Audio/AudioSystem.h"
#include "Engine/Core/Logging.h"
#include <algorithm>

namespace Ember {

// Sound class methods are defined in Sound.cpp

AudioSystem& AudioSystem::get() { static AudioSystem instance; return instance; }

bool AudioSystem::init() { m_initialized = true; EMBER_LOG_INFO("AudioSystem initialized (stub)"); return true; }
void AudioSystem::shutdown() { m_sources.clear(); m_sourceMap.clear(); m_initialized = false; }

void AudioSystem::setListenerPosition(const Math::Vec3& p) { (void)p; }
void AudioSystem::setListenerOrientation(const Math::Vec3& f, const Math::Vec3& u) { (void)f; (void)u; }
void AudioSystem::setListenerVelocity(const Math::Vec3& v) { (void)v; }
void AudioSystem::setMasterVolume(float v) { m_masterVolume = v; }
void AudioSystem::setMuted(bool m) { m_muted = m; }

uint32_t AudioSystem::playSound(const std::shared_ptr<Sound>& sound, const std::string& name) {
    if (!sound) return 0;
    uint32_t id = m_nextSourceID++;
    AudioSource src; src.sourceID = id; src.name = name; src.state = AudioState::Playing;
    m_sourceMap[id] = m_sources.size(); m_sources.push_back(src);
    return id;
}

void AudioSystem::stopSound(uint32_t id) { auto* s = getSource(id); if (s) s->state = AudioState::Stopped; }
void AudioSystem::pauseSound(uint32_t id) { auto* s = getSource(id); if (s) s->state = AudioState::Paused; }
void AudioSystem::resumeSound(uint32_t id) { auto* s = getSource(id); if (s) s->state = AudioState::Playing; }
void AudioSystem::stopAllSounds() { for (auto& s : m_sources) s.state = AudioState::Stopped; }
void AudioSystem::setVolume(uint32_t id, float v) { auto* s = getSource(id); if (s) s->volume = v; }
void AudioSystem::setPitch(uint32_t id, float v) { auto* s = getSource(id); if (s) s->pitch = v; }
void AudioSystem::setLooping(uint32_t id, bool v) { auto* s = getSource(id); if (s) s->looping = v; }
void AudioSystem::setPosition(uint32_t id, const Math::Vec3& v) { auto* s = getSource(id); if (s) s->position = v; }
void AudioSystem::setVelocity(uint32_t id, const Math::Vec3& v) { auto* s = getSource(id); if (s) s->velocity = v; }
void AudioSystem::setSpatialization(uint32_t id, bool v) { auto* s = getSource(id); if (s) s->spatialized = v; }
void AudioSystem::setMinDistance(uint32_t id, float v) { auto* s = getSource(id); if (s) s->minDistance = v; }
void AudioSystem::setMaxDistance(uint32_t id, float v) { auto* s = getSource(id); if (s) s->maxDistance = v; }

AudioState AudioSystem::getSoundState(uint32_t id) const {
    auto it = m_sourceMap.find(id);
    return (it != m_sourceMap.end()) ? m_sources[it->second].state : AudioState::Stopped;
}

bool AudioSystem::isSoundPlaying(uint32_t id) const { return getSoundState(id) == AudioState::Playing; }
void AudioSystem::playMusic(const std::string& f, bool l) { (void)f; (void)l; }
void AudioSystem::stopMusic() {}
void AudioSystem::setMusicVolume(float v) { m_musicVolume = v; }
void AudioSystem::setSFXVolume(float v) { m_sfxVolume = v; }
void AudioSystem::setMusicVolumeCategory(float v) { m_musicVolume = v; }
void AudioSystem::update() {
    m_sources.erase(std::remove_if(m_sources.begin(), m_sources.end(), [](const AudioSource& s) { return s.state == AudioState::Stopped && !s.looping; }), m_sources.end());
}

AudioSource* AudioSystem::getSource(uint32_t id) {
    auto it = m_sourceMap.find(id);
    return (it != m_sourceMap.end()) ? &m_sources[it->second] : nullptr;
}

} // namespace Ember
