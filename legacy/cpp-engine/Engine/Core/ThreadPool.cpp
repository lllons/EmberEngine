#include "Engine/Core/ThreadPool.h"
#include "Engine/Core/Logging.h"
#include <algorithm>

namespace Ember {

ThreadPool::ThreadPool(size_t numThreads) {
    if (numThreads == 0) {
        numThreads = std::max(1u, std::thread::hardware_concurrency() - 1);
    }

    EMBER_LOG_INFO("ThreadPool: Creating {} worker threads", numThreads);

    for (size_t i = 0; i < numThreads; i++) {
        m_workers.emplace_back([this] { workerLoop(); });
    }
}

ThreadPool::~ThreadPool() {
    shutdown();
}

void ThreadPool::workerLoop() {
    while (true) {
        std::function<void()> task;
        {
            std::unique_lock<std::mutex> lock(m_mutex);
            m_condition.wait(lock, [this] {
                return m_stopping || !m_tasks.empty();
            });

            if (m_stopping && m_tasks.empty()) return;

            task = std::move(m_tasks.front());
            m_tasks.pop();
        }

        m_activeThreads++;
        m_pendingTasks--;
        task();
        m_activeThreads--;

        // Notify waiters that all tasks might be done
        m_completionCondition.notify_all();
    }
}

void ThreadPool::waitAll() {
    std::unique_lock<std::mutex> lock(m_mutex);
    m_completionCondition.wait(lock, [this] {
        return m_tasks.empty() && m_activeThreads.load() == 0;
    });
}

size_t ThreadPool::getPendingTaskCount() const {
    return m_pendingTasks.load();
}

void ThreadPool::shutdown() {
    {
        std::unique_lock<std::mutex> lock(m_mutex);
        m_stopping = true;
    }
    m_condition.notify_all();

    for (auto& worker : m_workers) {
        if (worker.joinable()) {
            worker.join();
        }
    }
    m_workers.clear();

    EMBER_LOG_INFO("ThreadPool shutdown");
}

unsigned int ThreadPool::getHardwareThreadCount() {
    return std::max(1u, std::thread::hardware_concurrency());
}

ThreadPool& ThreadPool::get() {
    static ThreadPool instance;
    return instance;
}

} // namespace Ember
