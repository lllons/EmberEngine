#pragma once

#include <string>
#include <vector>
#include <cstdint>
#include <functional>
#include <memory>

namespace Ember {

enum class AudioFormat {
    Mono8,
    Mono16,
    Stereo8,
    Stereo16
};

struct AudioData {
    std::vector<uint8_t> data;
    uint32_t sampleRate = 44100;
    uint16_t channels = 2;
    uint16_t bitsPerSample = 16;
    double duration = 0.0;
};

class Sound {
public:
    Sound() = default;
    ~Sound();

    bool loadFromFile(const std::string& filepath);
    bool loadFromMemory(const uint8_t* data, size_t size);
    bool generateSine(float frequency, float duration, float amplitude = 0.5f);
    bool generateWhiteNoise(float duration);
    void unload();

    uint32_t getBufferID() const { return m_bufferID; }
    bool isLoaded() const { return m_loaded; }
    const AudioData& getAudioData() const { return m_data; }

    // Simple audio format detection
    static AudioData decodeWav(const std::string& filepath);
    static AudioData decodeOgg(const std::string& filepath);

private:
    uint32_t m_bufferID = 0;
    bool m_loaded = false;
    AudioData m_data;
};

} // namespace Ember
