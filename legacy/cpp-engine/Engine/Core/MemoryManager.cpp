#include "Engine/Core/MemoryManager.h"
#include "Engine/Core/Logging.h"
#include <cstdlib>
#include <cstring>
#include <algorithm>

namespace Ember {

PoolAllocator::PoolAllocator(size_t blockSize, size_t blockCount)
    : m_blockSize(std::max(blockSize, sizeof(void*)))
    , m_blockCount(blockCount)
{
    m_memory = static_cast<uint8_t*>(std::malloc(m_blockSize * m_blockCount));
    if (!m_memory) { return; }
    m_freeList = m_memory;
    uint8_t* current = m_memory;
    for (size_t i = 0; i < m_blockCount - 1; i++) {
        *reinterpret_cast<void**>(current) = current + m_blockSize;
        current += m_blockSize;
    }
    *reinterpret_cast<void**>(current) = nullptr;
}

PoolAllocator::~PoolAllocator() { std::free(m_memory); }

void* PoolAllocator::allocate(size_t size, size_t alignment) {
    (void)alignment;
    if (size > m_blockSize) return nullptr;
    std::lock_guard<std::mutex> lock(m_mutex);
    if (!m_freeList) return nullptr;
    void* block = m_freeList;
    m_freeList = *reinterpret_cast<void**>(block);
    m_usedBlocks++;
    return block;
}

void PoolAllocator::deallocate(void* ptr) {
    if (!ptr) return;
    std::lock_guard<std::mutex> lock(m_mutex);
    *reinterpret_cast<void**>(ptr) = m_freeList;
    m_freeList = ptr;
    m_usedBlocks--;
}

size_t PoolAllocator::getAllocatedSize(void* ptr) const { (void)ptr; return m_blockSize; }

LinearAllocator::LinearAllocator(size_t size) : m_capacity(size) {
    m_memory = static_cast<uint8_t*>(std::malloc(m_capacity));
}

LinearAllocator::~LinearAllocator() { std::free(m_memory); }

void* LinearAllocator::allocate(size_t size, size_t alignment) {
    size_t alignedOffset = (m_offset + alignment - 1) & ~(alignment - 1);
    if (alignedOffset + size > m_capacity) return nullptr;
    void* ptr = m_memory + alignedOffset;
    m_offset = alignedOffset + size;
    return ptr;
}

void LinearAllocator::deallocate(void* ptr) { (void)ptr; }
size_t LinearAllocator::getAllocatedSize(void* ptr) const { (void)ptr; return 0; }

MemoryManager& MemoryManager::get() { static MemoryManager instance; return instance; }

void MemoryManager::init() {
    std::lock_guard<std::mutex> lock(m_mutex);
    m_stats = MemoryStats();
    m_allocations.clear();
    m_initialized = true;
    EMBER_LOG_INFO("MemoryManager initialized");
}

void MemoryManager::shutdown() {
    std::lock_guard<std::mutex> lock(m_mutex);
    reportLeaks();
    m_allocations.clear();
    m_initialized = false;
}

void* MemoryManager::trackedAlloc(size_t size, const char* tag) {
    void* ptr = std::malloc(size);
    if (ptr) { trackAllocation(ptr, size, tag); }
    return ptr;
}

void MemoryManager::trackedFree(void* ptr) {
    if (ptr) { trackDeallocation(ptr); std::free(ptr); }
}

void MemoryManager::trackAllocation(void* ptr, size_t size, const char* tag) {
    std::lock_guard<std::mutex> lock(m_mutex);
    m_allocations[ptr] = {size, tag};
    m_stats.totalAllocated += size;
    m_stats.currentUsage += size;
    m_stats.allocationCount++;
    m_stats.peakUsage = std::max(m_stats.peakUsage, m_stats.currentUsage);
}

void MemoryManager::trackDeallocation(void* ptr) {
    std::lock_guard<std::mutex> lock(m_mutex);
    auto it = m_allocations.find(ptr);
    if (it != m_allocations.end()) {
        m_stats.totalFreed += it->second.size;
        m_stats.currentUsage -= it->second.size;
        m_stats.freeCount++;
        m_allocations.erase(it);
    }
}

void MemoryManager::printStats() const {
    std::lock_guard<std::mutex> lock(m_mutex);
    EMBER_LOG_INFO("=== Memory Stats ===");
    EMBER_LOG_INFO("  Current Usage: ", m_stats.currentUsage, " bytes");
    EMBER_LOG_INFO("  Peak Usage: ", m_stats.peakUsage, " bytes");
    EMBER_LOG_INFO("  Allocations: ", m_stats.allocationCount);
}

void MemoryManager::reportLeaks() const {
    std::lock_guard<std::mutex> lock(m_mutex);
    if (m_allocations.empty()) return;
    EMBER_LOG_WARN("=== Memory Leaks Detected ===");
    for (const auto& [ptr, info] : m_allocations) {
        EMBER_LOG_WARN("  Leak: ", info.size, " bytes (tag: ", info.tag, ")");
    }
}

std::unordered_map<std::string, size_t> MemoryManager::getAllocationsByTag() const {
    std::lock_guard<std::mutex> lock(m_mutex);
    std::unordered_map<std::string, size_t> result;
    for (const auto& [ptr, info] : m_allocations) { result[info.tag] += info.size; }
    return result;
}

} // namespace Ember
