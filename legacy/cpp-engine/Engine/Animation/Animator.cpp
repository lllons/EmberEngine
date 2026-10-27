#include "Engine/Animation/Animator.h"
#include <algorithm>
#include <cmath>

namespace Ember {

Math::Vec3 AnimationClip::interpolatePosition(int channelIndex, float time) const {
    if (channelIndex < 0 || channelIndex >= static_cast<int>(channels.size())) return Math::Vec3::zero();
    const auto& keys = channels[channelIndex].positionKeys;
    if (keys.empty()) return Math::Vec3::zero();
    if (keys.size() == 1) return keys[0].position;
    for (size_t i = 0; i < keys.size() - 1; i++) {
        if (time >= keys[i].time && time <= keys[i+1].time) {
            float t = (keys[i+1].time - keys[i].time) > 0.0f ? (time - keys[i].time) / (keys[i+1].time - keys[i].time) : 0.0f;
            return keys[i].position.lerp(keys[i+1].position, t);
        }
    }
    return keys.back().position;
}

Math::Quaternion AnimationClip::interpolateRotation(int channelIndex, float time) const {
    if (channelIndex < 0 || channelIndex >= static_cast<int>(channels.size())) return Math::Quaternion::identity();
    const auto& keys = channels[channelIndex].rotationKeys;
    if (keys.empty()) return Math::Quaternion::identity();
    if (keys.size() == 1) return keys[0].rotation;
    for (size_t i = 0; i < keys.size() - 1; i++) {
        if (time >= keys[i].time && time <= keys[i+1].time) {
            float t = (keys[i+1].time - keys[i].time) > 0.0f ? (time - keys[i].time) / (keys[i+1].time - keys[i].time) : 0.0f;
            return keys[i].rotation.slerp(keys[i+1].rotation, t);
        }
    }
    return keys.back().rotation;
}

Math::Vec3 AnimationClip::interpolateScale(int channelIndex, float time) const {
    if (channelIndex < 0 || channelIndex >= static_cast<int>(channels.size())) return Math::Vec3::one();
    const auto& keys = channels[channelIndex].scaleKeys;
    if (keys.empty()) return Math::Vec3::one();
    if (keys.size() == 1) return keys[0].scale;
    for (size_t i = 0; i < keys.size() - 1; i++) {
        if (time >= keys[i].time && time <= keys[i+1].time) {
            float t = (keys[i+1].time - keys[i].time) > 0.0f ? (time - keys[i].time) / (keys[i+1].time - keys[i].time) : 0.0f;
            return keys[i].scale.lerp(keys[i+1].scale, t);
        }
    }
    return keys.back().scale;
}

void Animator::addClip(const AnimationClip& clip) { m_clips.push_back(clip); }

void Animator::removeClip(const std::string& name) {
    m_clips.erase(std::remove_if(m_clips.begin(), m_clips.end(),
        [&name](const AnimationClip& c) { return c.name == name; }), m_clips.end());
}

const AnimationClip* Animator::getClip(const std::string& name) const {
    for (auto& clip : m_clips) { if (clip.name == name) return &clip; }
    return nullptr;
}

void Animator::play(const std::string& clipName, bool looping) {
    auto* clip = getClip(clipName);
    if (!clip) return;
    m_currentState.clip = clip;
    m_currentState.currentTime = 0.0f;
    m_currentState.playing = true;
    m_currentState.looping = looping;
    m_currentState.finished = false;
}

void Animator::stop() { m_currentState.playing = false; m_currentState.currentTime = 0.0f; }
void Animator::pause() { m_currentState.playing = false; }
void Animator::resume() { m_currentState.playing = true; }
void Animator::setSpeed(float speed) { m_currentState.speed = speed; }
void Animator::setWeight(float weight) { m_currentState.weight = weight; }
bool Animator::isPlaying() const { return m_currentState.playing && !m_currentState.finished; }
float Animator::getCurrentTime() const { return m_currentState.currentTime; }
const std::string& Animator::getCurrentClipName() const { static std::string empty; return m_currentState.clip ? m_currentState.clip->name : empty; }

void Animator::update(float deltaTime) {
    if (!m_currentState.playing || !m_currentState.clip) return;
    if (m_blending) { updateBlend(deltaTime); return; }
    m_currentState.currentTime += deltaTime * m_currentState.speed;
    if (m_currentState.currentTime >= m_currentState.clip->duration) {
        if (m_currentState.looping) {
            m_currentState.currentTime = std::fmod(m_currentState.currentTime, m_currentState.clip->duration);
        } else {
            m_currentState.currentTime = m_currentState.clip->duration;
            m_currentState.finished = true;
            m_currentState.playing = false;
        }
    }
    evaluatePose(*m_currentState.clip, m_currentState.currentTime);
    for (auto& evt : m_events) {
        if (!evt.triggered && m_currentState.currentTime >= evt.time) {
            evt.triggered = true;
            if (evt.callback) evt.callback(evt.name);
        }
    }
}

void Animator::updateBlend(float deltaTime) {
    m_blendElapsed += deltaTime;
    m_blendFactor = std::min(1.0f, m_blendElapsed / m_blendDuration);
    m_currentState.currentTime += deltaTime * m_currentState.speed;
    m_nextState.currentTime += deltaTime * m_nextState.speed;
    if (m_currentState.clip && m_nextState.clip) {
        blendPoses(*m_currentState.clip, *m_nextState.clip, m_blendFactor, m_currentState.currentTime, m_nextState.currentTime);
    }
    if (m_blendFactor >= 1.0f) { m_blending = false; m_currentState = m_nextState; }
}

void Animator::crossFade(const std::string& clipName, float fadeDuration) {
    auto* clip = getClip(clipName);
    if (!clip) return;
    m_nextState = AnimationState();
    m_nextState.clip = clip;
    m_nextState.playing = true;
    m_blendDuration = fadeDuration;
    m_blendElapsed = 0.0f;
    m_blending = true;
}

void Animator::addBone(const Bone& bone) { m_bones.push_back(bone); }

void Animator::evaluatePose(const AnimationClip& clip, float time) {
    m_boneTransforms.resize(m_bones.size());
    for (size_t i = 0; i < m_bones.size(); i++) {
        int ci = static_cast<int>(i);
        if (ci < static_cast<int>(clip.channels.size())) {
            Math::Vec3 pos = clip.interpolatePosition(ci, time);
            Math::Quaternion rot = clip.interpolateRotation(ci, time);
            Math::Vec3 scl = clip.interpolateScale(ci, time);
            m_bones[i].animatedTransform = Math::Mat4::translate(pos) * rot.toMat4() * Math::Mat4::scale(scl);
        }
        m_boneTransforms[i] = m_bones[i].animatedTransform * m_bones[i].inverseBindPose;
    }
}

void Animator::blendPoses(const AnimationClip& clipA, const AnimationClip& clipB, float alpha, float timeA, float timeB) {
    m_boneTransforms.resize(m_bones.size());
    for (size_t i = 0; i < m_bones.size(); i++) {
        int ci = static_cast<int>(i);
        Math::Vec3 posA = clipA.interpolatePosition(ci, timeA);
        Math::Quaternion rotA = clipA.interpolateRotation(ci, timeA);
        Math::Vec3 scaleA = clipA.interpolateScale(ci, timeA);
        Math::Vec3 posB = clipB.interpolatePosition(ci, timeB);
        Math::Quaternion rotB = clipB.interpolateRotation(ci, timeB);
        Math::Vec3 scaleB = clipB.interpolateScale(ci, timeB);
        Math::Vec3 pos = posA.lerp(posB, alpha);
        Math::Quaternion rot = rotA.slerp(rotB, alpha);
        Math::Vec3 scl = scaleA.lerp(scaleB, alpha);
        Math::Mat4 anim = Math::Mat4::translate(pos) * rot.toMat4() * Math::Mat4::scale(scl);
        m_boneTransforms[i] = anim * m_bones[i].inverseBindPose;
    }
}

void Animator::registerEvent(float time, const std::string& eventName, AnimationEventCallback callback) {
    m_events.push_back({time, eventName, std::move(callback), false});
}

} // namespace Ember
