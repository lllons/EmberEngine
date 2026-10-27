#pragma once

#include <vector>
#include <queue>
#include <thread>
#include <mutex>
#include <condition_variable>
#include <future>
#include <functional>
#include <atomic>
#include <memory>

namespace Ember {

class ThreadPool {
public:
    explicit ThreadPool(size_t numThreads = 0);
    ~ThreadPool();

    // Non-copyable, non-movable
    ThreadPool(const ThreadPool&) = delete;
    ThreadPool& operator=(const ThreadPool&) = delete;
    ThreadPool(ThreadPool&&) = delete;
    ThreadPool& operator=(ThreadPool&&) = delete;

    // Submit a task and get a future
    template<typename F, typename... Args>
    auto submit(F&& f, Args&&... args) -> std::future<decltype(f(args...))> {
        using return_type = decltype(f(args...));

        auto task = std::make_shared<std::packaged_task<return_type()>>(
            std::bind(std::forward<F>(f), std::forward<Args>(args)...)
        );

        std::future<return_type> result = task->get_future();
        {
            std::unique_lock<std::mutex> lock(m_mutex);
            if (m_stopping) {
                throw std::runtime_error("submit() called on stopped ThreadPool");
            }
            m_tasks.emplace([task]() { (*task)(); });
        }
        m_condition.notify_one();
        return result;
    }

    // Submit a void task
    template<typename F, typename... Args>
    void submitVoid(F&& f, Args&&... args) {
        auto task = std::bind(std::forward<F>(f), std::forward<Args>(args)...);
        {
            std::unique_lock<std::mutex> lock(m_mutex);
            if (m_stopping) {
                throw std::runtime_error("submitVoid() called on stopped ThreadPool");
            }
            m_tasks.emplace(std::move(task));
        }
        m_condition.notify_one();
    }

    // Wait for all tasks to complete
    void waitAll();

    // Get number of pending tasks
    size_t getPendingTaskCount() const;

    // Get number of threads
    size_t getThreadCount() const { return m_workers.size(); }

    // Get number of active (busy) threads
    size_t getActiveThreadCount() const { return m_activeThreads.load(); }

    // Check if all tasks are done
    bool allTasksComplete() const { return m_pendingTasks.load() == 0 && m_activeThreads.load() == 0; }

    // Shutdown the thread pool
    void shutdown();

    // Static helpers
    static unsigned int getHardwareThreadCount();
    static ThreadPool& get(); // Global instance

private:
    void workerLoop();

    std::vector<std::thread> m_workers;
    std::queue<std::function<void()>> m_tasks;

    mutable std::mutex m_mutex;
    std::condition_variable m_condition;
    std::condition_variable m_completionCondition;
    bool m_stopping = false;

    std::atomic<size_t> m_activeThreads{0};
    std::atomic<size_t> m_pendingTasks{0};
};

} // namespace Ember
