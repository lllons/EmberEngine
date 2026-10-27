#include "Engine/Audio/Sound.h"
#include "Engine/Core/Logging.h"
#include <fstream>
#include <cstring>
#include <cmath>

namespace Ember {

Sound::~Sound() {
    unload();
}

bool Sound::loadFromFile(const std::string& filepath) {
    unload();
    
    // Detect format from extension
    std::string ext = filepath.substr(filepath.find_last_of('.') + 1);
    
    if (ext == "wav" || ext == "WAV") {
        m_data = decodeWav(filepath);
    } else if (ext == "ogg" || ext == "OGG") {
        m_data = decodeOgg(filepath);
    } else {
        EMBER_LOG_ERROR("Unsupported audio format: ", ext);
        return false;
    }
    
    if (m_data.data.empty()) {
        EMBER_LOG_ERROR("Failed to load audio: ", filepath);
        return false;
    }
    
    m_loaded = true;
    EMBER_LOG_INFO("Loaded audio: ", filepath, " (", m_data.duration, "s)");
    return true;
}

bool Sound::loadFromMemory(const uint8_t* data, size_t size) {
    if (!data || size == 0) return false;
    
    m_data.data.assign(data, data + size);
    m_loaded = true;
    return true;
}

bool Sound::generateSine(float frequency, float duration, float amplitude) {
    unload();
    
    m_data.sampleRate = 44100;
    m_data.channels = 1;
    m_data.bitsPerSample = 16;
    m_data.duration = duration;
    
    uint32_t numSamples = static_cast<uint32_t>(m_data.sampleRate * duration);
    m_data.data.resize(numSamples * 2); // 16-bit samples
    
    int16_t* samples = reinterpret_cast<int16_t*>(m_data.data.data());
    float twoPi = 2.0f * 3.14159265f;
    
    for (uint32_t i = 0; i < numSamples; i++) {
        float t = static_cast<float>(i) / m_data.sampleRate;
        float value = amplitude * std::sin(twoPi * frequency * t);
        samples[i] = static_cast<int16_t>(value * 32767.0f);
    }
    
    m_loaded = true;
    EMBER_LOG_INFO("Generated sine wave: ", frequency, "Hz, ", duration, "s");
    return true;
}

bool Sound::generateWhiteNoise(float duration) {
    unload();
    
    m_data.sampleRate = 44100;
    m_data.channels = 1;
    m_data.bitsPerSample = 16;
    m_data.duration = duration;
    
    uint32_t numSamples = static_cast<uint32_t>(m_data.sampleRate * duration);
    m_data.data.resize(numSamples * 2);
    
    int16_t* samples = reinterpret_cast<int16_t*>(m_data.data.data());
    
    for (uint32_t i = 0; i < numSamples; i++) {
        float value = (static_cast<float>(std::rand()) / RAND_MAX) * 2.0f - 1.0f;
        samples[i] = static_cast<int16_t>(value * 32767.0f);
    }
    
    m_loaded = true;
    EMBER_LOG_INFO("Generated white noise: ", duration, "s");
    return true;
}

void Sound::unload() {
    m_data.data.clear();
    m_loaded = false;
}

AudioData Sound::decodeWav(const std::string& filepath) {
    AudioData audio;
    
    std::ifstream file(filepath, std::ios::binary);
    if (!file.is_open()) {
        EMBER_LOG_ERROR("Failed to open WAV file: ", filepath);
        return audio;
    }
    
    // Read RIFF header
    char header[44];
    file.read(header, 44);
    
    if (std::memcmp(header, "RIFF", 4) != 0 || std::memcmp(header + 8, "WAVE", 4) != 0) {
        EMBER_LOG_ERROR("Invalid WAV file: ", filepath);
        return audio;
    }
    
    // Parse WAV header
    audio.channels = *reinterpret_cast<uint16_t*>(header + 22);
    audio.sampleRate = *reinterpret_cast<uint32_t*>(header + 24);
    audio.bitsPerSample = *reinterpret_cast<uint16_t*>(header + 34);
    
    uint32_t dataSize = *reinterpret_cast<uint32_t*>(header + 40);
    audio.data.resize(dataSize);
    file.read(reinterpret_cast<char*>(audio.data.data()), dataSize);
    
    // Calculate duration
    uint32_t bytesPerSample = audio.bitsPerSample / 8;
    uint32_t totalSamples = dataSize / (bytesPerSample * audio.channels);
    audio.duration = static_cast<double>(totalSamples) / audio.sampleRate;
    
    return audio;
}

AudioData Sound::decodeOgg(const std::string& filepath) {
    AudioData audio;
    
    // OGG decoding would require libvorbis
    // For now, return empty data
    EMBER_LOG_WARN("OGG decoding not implemented: ", filepath);
    
    return audio;
}

} // namespace Ember
