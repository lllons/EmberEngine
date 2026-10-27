#pragma once

#include <cstddef>
#include <cstdint>
#include <cstring>
#include <memory>
#include <vector>
#include <unordered_map>
#include <mutex>
#include <atomic>
#include <new>

namespace Ember {

// Memory statistics
struct MemoryStats {
    size_t totalAllocated = 0;
    size_t totalFreed = 0;
    size_t currentUsage = 0;
    size_t peakUsage = 0;
    size_t allocationCount = 0;
    size_t freeCount = 0;
};

// Custom allocator interface
class IAllocator {
public:
    virtual ~IAllocator() = default;
    virtual void* allocate(size_t size, size_t alignment = 8) = 0;
    virtual void deallocate(void* ptr) = 0;
    virtual size_t getAllocatedSize(void* ptr) const = 0;
    virtual size_t getCapacity() const = 0;
    virtual size_t getUsedMemory() const = 0;
};

// Pool allocator for fixed-size allocations
class PoolAllocator : public IAllocator {
public:
    PoolAllocator(size_t blockSize, size_t blockCount);
    ~PoolAllocator() override;

    void* allocate(size_t size, size_t alignment = 8) override;
    void deallocate(void* ptr) override;
    size_t getAllocatedSize(void* ptr) const override;
    size_t getCapacity() const override { return m_blockSize * m_blockCount; }
    size_t getUsedMemory() const override { return m_usedBlocks * m_blockSize; }

private:
    uint8_t* m_memory;
    size_t m_blockSize;
    size_t m_blockCount;
    size_t m_usedBlocks = 0;
    void* m_freeList = nullptr;
    std::mutex m_mutex;
};

// Linear/arena allocator for sequential allocations
class LinearAllocator : public IAllocator {
public:
    LinearAllocator(size_t size);
    ~LinearAllocator() override;

    void* allocate(size_t size, size_t alignment = 8) override;
    void deallocate(void* ptr) override; // No-op for linear allocator
    size_t getAllocatedSize(void* ptr) const override;
    size_t getCapacity() const override { return m_capacity; }
    size_t getUsedMemory() const override { return m_offset; }

    void reset() { m_offset = 0; } // Reset allocator

private:
    uint8_t* m_memory;
    size_t m_capacity;
    size_t m_offset = 0;
};

// Main memory manager
class MemoryManager {
public:
    static MemoryManager& get();

    void init();
    void shutdown();

    // Track allocations
    void trackAllocation(void* ptr, size_t size, const char* tag = "General");
    void trackDeallocation(void* ptr);

    // Get stats
    const MemoryStats& getStats() const { return m_stats; }
    void printStats() const;

    // Memory leak detection
    void reportLeaks() const;

    // Tag-based allocation tracking
    std::unordered_map<std::string, size_t> getAllocationsByTag() const;

    // Custom new/delete with tracking
    void* trackedAlloc(size_t size, const char* tag = "General");
    void trackedFree(void* ptr);

private:
    MemoryManager() = default;
    ~MemoryManager() = default;

    struct AllocationInfo {
        size_t size;
        const char* tag;
    };

    MemoryStats m_stats;
    std::unordered_map<void*, AllocationInfo> m_allocations;
    mutable std::mutex m_mutex;
    bool m_initialized = false;
};

} // namespace Ember

// Tagged allocation macros
#define EMBER_ALLOC(size) ::Ember::MemoryManager::get().trackedAlloc(size, __FUNCTION__)
#define EMBER_FREE(ptr) ::Ember::MemoryManager::get().trackedFree(ptr)
