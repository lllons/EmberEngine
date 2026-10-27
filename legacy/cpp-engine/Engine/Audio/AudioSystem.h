#pragma once

#include "Engine/Audio/Sound.h"
#include "Engine/Math/Math.h"
#include <memory>
#include <string>
#include <vector>
#include <unordered_map>
#include <functional>

namespace Ember {

enum class AudioState {
    Stopped,
    Playing,
    Paused
};

struct AudioSource {
    uint32_t sourceID = 0;
    uint32_t bufferID = 0;
    AudioState state = AudioState::Stopped;
    float volume = 1.0f;
    float pitch = 1.0f;
    bool looping = false;
    Math::Vec3 position = Math::Vec3::zero();
    Math::Vec3 velocity = Math::Vec3::zero();
    bool spatialized = false;
    float minDistance = 1.0f;
    float maxDistance = 100.0f;
    float rolloffFactor = 1.0f;
    std::string name;
};

class AudioSystem {
public:
    static AudioSystem& get();

    bool init();
    void shutdown();

    // Listener
    void setListenerPosition(const Math::Vec3& position);
    void setListenerOrientation(const Math::Vec3& forward, const Math::Vec3& up);
    void setListenerVelocity(const Math::Vec3& velocity);

    // Master controls
    void setMasterVolume(float volume);
    float getMasterVolume() const { return m_masterVolume; }
    void setMuted(bool muted);
    bool isMuted() const { return m_muted; }

    // Sound management
    uint32_t playSound(const std::shared_ptr<Sound>& sound, const std::string& name = "");
    void stopSound(uint32_t sourceID);
    void pauseSound(uint32_t sourceID);
    void resumeSound(uint32_t sourceID);
    void stopAllSounds();

    // Sound properties
    void setVolume(uint32_t sourceID, float volume);
    void setPitch(uint32_t sourceID, float pitch);
    void setLooping(uint32_t sourceID, bool loop);
    void setPosition(uint32_t sourceID, const Math::Vec3& position);
    void setVelocity(uint32_t sourceID, const Math::Vec3& velocity);
    void setSpatialization(uint32_t sourceID, bool spatialized);
    void setMinDistance(uint32_t sourceID, float distance);
    void setMaxDistance(uint32_t sourceID, float distance);

    // Query
    AudioState getSoundState(uint32_t sourceID) const;
    bool isSoundPlaying(uint32_t sourceID) const;

    // Music
    void playMusic(const std::string& filepath, bool loop = true);
    void stopMusic();
    void setMusicVolume(float volume);
    float getMusicVolume() const { return m_musicVolume; }

    // Category volumes
    void setSFXVolume(float volume);
    void setMusicVolumeCategory(float volume);

    // Update (call each frame)
    void update();

private:
    AudioSystem() = default;
    ~AudioSystem() = default;

    void cleanUpSources();
    AudioSource* getSource(uint32_t id);

    bool m_initialized = false;
    float m_masterVolume = 1.0f;
    float m_musicVolume = 0.7f;
    float m_sfxVolume = 1.0f;
    bool m_muted = false;

    std::vector<AudioSource> m_sources;
    std::unordered_map<uint32_t, size_t> m_sourceMap;
    uint32_t m_nextSourceID = 1;

    // Music
    uint32_t m_musicSourceID = 0;
};

} // namespace Ember
