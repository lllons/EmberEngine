#pragma once

#include "Engine/Math/Math.h"
#include <vector>
#include <string>
#include <memory>
#include <functional>
#include <cstdint>

namespace Ember {

struct Bone {
    int id = -1;
    std::string name;
    int parentIndex = -1;
    Math::Mat4 localTransform = Math::Mat4::identity();
    Math::Mat4 inverseBindPose = Math::Mat4::identity();
    Math::Mat4 animatedTransform = Math::Mat4::identity();
};

struct PositionKeyframe { float time; Math::Vec3 position; };
struct RotationKeyframe { float time; Math::Quaternion rotation; };
struct ScaleKeyframe { float time; Math::Vec3 scale; };

struct AnimationChannel {
    int boneIndex = -1;
    std::vector<PositionKeyframe> positionKeys;
    std::vector<RotationKeyframe> rotationKeys;
    std::vector<ScaleKeyframe> scaleKeys;
};

struct AnimationClip {
    std::string name;
    float duration = 0.0f;
    float ticksPerSecond = 25.0f;
    std::vector<AnimationChannel> channels;
    Math::Vec3 interpolatePosition(int channelIndex, float time) const;
    Math::Quaternion interpolateRotation(int channelIndex, float time) const;
    Math::Vec3 interpolateScale(int channelIndex, float time) const;
};

struct AnimationState {
    const AnimationClip* clip = nullptr;
    float currentTime = 0.0f, speed = 1.0f, weight = 1.0f;
    bool playing = false, looping = true, finished = false;
};

class Animator {
public:
    Animator() = default;
    ~Animator() = default;

    void addClip(const AnimationClip& clip);
    void removeClip(const std::string& name);
    const AnimationClip* getClip(const std::string& name) const;
    const std::vector<AnimationClip>& getClips() const { return m_clips; }

    void play(const std::string& clipName, bool looping = true);
    void stop();
    void pause();
    void resume();
    void setSpeed(float speed);
    void setWeight(float weight);
    void update(float deltaTime);
    void updateBlend(float deltaTime);
    bool isPlaying() const;
    float getCurrentTime() const;
    const std::string& getCurrentClipName() const;

    const std::vector<Math::Mat4>& getBoneTransforms() const { return m_boneTransforms; }
    size_t getBoneCount() const { return m_bones.size(); }
    void addBone(const Bone& bone);
    void crossFade(const std::string& clipName, float fadeDuration);

    using AnimationEventCallback = std::function<void(const std::string&)>;
    void registerEvent(float time, const std::string& eventName, AnimationEventCallback callback);
    void clearEvents() { m_events.clear(); }

private:
    void evaluatePose(const AnimationClip& clip, float time);
    void blendPoses(const AnimationClip& clipA, const AnimationClip& clipB, float alpha, float timeA, float timeB);

    std::vector<AnimationClip> m_clips;
    std::vector<Bone> m_bones;
    std::vector<Math::Mat4> m_boneTransforms;
    AnimationState m_currentState, m_nextState;
    float m_blendFactor = 0.0f, m_blendDuration = 0.0f, m_blendElapsed = 0.0f;
    bool m_blending = false;

    struct AnimEvent {
        float time;
        std::string name;
        AnimationEventCallback callback;
        bool triggered = false;
    };
    std::vector<AnimEvent> m_events;
};

} // namespace Ember
