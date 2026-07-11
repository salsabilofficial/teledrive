import EventEmitter from 'events';

class JobQueue extends EventEmitter {
  constructor(concurrency = 2) {
    super();
    this.concurrency = concurrency;
    this.queue = [];
    this.active = 0;
    this.activeJobs = new Map();
    this.jobIndex = new Set();
    this.paused = false;
    this.stats = {
      added: 0,
      completed: 0,
      failed: 0,
      retried: 0,
      skippedDuplicate: 0
    };
  }

  hasJob(name) {
    return this.jobIndex.has(name) || this.activeJobs.has(name);
  }

  add(name, fn, options = {}) {
    if (!name || typeof fn !== 'function') {
      throw new Error('Queue job requires a name and async function');
    }

    if (this.hasJob(name)) {
      this.stats.skippedDuplicate++;
      return null;
    }

    const job = {
      id: Math.random().toString(36).substring(2, 9),
      name,
      fn,
      priority: options.priority || 0,
      maxRetries: options.maxRetries ?? 3,
      attempts: 0,
      addedAt: new Date(),
      status: 'pending',
      delayMs: options.delayMs || 0
    };

    this.queue.push(job);
    this.jobIndex.add(job.name);
    this.stats.added++;
    this.queue.sort((a, b) => b.priority - a.priority);

    console.log(`[Queue] Job added: "${name}" (ID: ${job.id}, total queue: ${this.queue.length})`);
    this._processNext();
    return job.id;
  }

  async _processNext() {
    if (this.paused) return;
    if (this.active >= this.concurrency || this.queue.length === 0) return;

    const job = this.queue.shift();
    if (!job) return;

    this.jobIndex.delete(job.name);
    this.activeJobs.set(job.name, job);
    this.active++;
    job.status = 'running';
    job.attempts++;

    console.log(`[Queue] Running job "${job.name}" (ID: ${job.id}, Attempt ${job.attempts}/${job.maxRetries})`);

    try {
      await job.fn();
      job.status = 'completed';
      this.stats.completed++;
      console.log(`[Queue] ✅ Job "${job.name}" (ID: ${job.id}) completed successfully`);
      this.emit('completed', job.id);
    } catch (err) {
      console.error(`[Queue] ❌ Job "${job.name}" (ID: ${job.id}) failed:`, err.message);

      if (job.attempts < job.maxRetries) {
        job.status = 'retrying';
        this.stats.retried++;
        const delay = Math.min(Math.pow(2, job.attempts) * 1000, 30000);
        console.log(`[Queue] Rescheduling job "${job.name}" (ID: ${job.id}) in ${delay}ms...`);

        setTimeout(() => {
          job.status = 'pending';
          this.activeJobs.delete(job.name);
          this.queue.push(job);
          this.jobIndex.add(job.name);
          this.queue.sort((a, b) => b.priority - a.priority);
          this._processNext();
        }, delay);

        return;
      }

      job.status = 'failed';
      this.stats.failed++;
      console.error(`[Queue] 💀 Job "${job.name}" (ID: ${job.id}) permanently failed after max retries.`);
      this.emit('failed', job.id, err);
    } finally {
      if (job.status !== 'retrying') {
        this.activeJobs.delete(job.name);
      }
      this.active--;
      this._processNext();
    }
  }

  pause() {
    this.paused = true;
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    this._processNext();
  }

  clearPending(prefix = '') {
    const before = this.queue.length;
    const kept = [];

    for (const job of this.queue) {
      if (prefix && !job.name.startsWith(prefix)) {
        kept.push(job);
        continue;
      }
      this.jobIndex.delete(job.name);
    }

    this.queue = prefix ? kept : [];
    return before - this.queue.length;
  }

  getQueueStats() {
    return {
      active: this.active,
      pending: this.queue.length,
      paused: this.paused,
      activeJobNames: Array.from(this.activeJobs.keys()),
      ...this.stats
    };
  }

  getJobs(limit = 100) {
    return [
      ...Array.from(this.activeJobs.values()),
      ...this.queue
    ].slice(0, limit).map(j => ({
      id: j.id,
      name: j.name,
      priority: j.priority,
      status: j.status,
      attempts: j.attempts,
      addedAt: j.addedAt
    }));
  }
}

export const bgQueue = new JobQueue(2);
