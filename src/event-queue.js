import { uploadEvents, flushEventsOnUnload } from './upload.js';

export class EventQueue {
  constructor(config) {
    this.config = config;
    this.queue = [];
    this.isUploading = false;
    this.retryCount = 0;
    this.retryTimeout = null;
    this.STORAGE_KEY = config?.eventQueueStorageKey || 'user_event_tracking_queue';
    
    this.restoreQueue();
    this.setupUnloadHandler();
  }

  enqueue(event) {
    this.queue.push(event);
    this.persistQueue();
    this.processQueue();
  }

  processQueue(force = false) {
    if (this.isUploading || this.queue.length === 0) return;

    if (this.queue.length >= this.config.batchSize || force) {
      this.uploadBatch();
    }
  }

  uploadBatch() {
    const batch = this.queue.slice(0, this.config.batchSize);
    this.queue = this.queue.slice(batch.length);
    this.persistQueue();

    this.isUploading = true;
    
    uploadEvents(batch, this.config).then(() => {
      this.isUploading = false;
      this.retryCount = 0;
      if (this.retryTimeout) {
        clearTimeout(this.retryTimeout);
        this.retryTimeout = null;
      }
      if (this.queue.length >= this.config.batchSize) {
        this.processQueue();
      }
    }).catch(err => {
      console.warn('[Tracker] Failed to upload events', err);
      this.isUploading = false;
      
      if (this.retryCount < this.config.maxRetries) {
        this.retryCount++;
        this.queue = [...batch, ...this.queue];
        this.persistQueue();
        this.scheduleRetry();
      } else {
        console.error('[Tracker] Max retries reached. Events lost.');
        this.retryCount = 0;
        if (this.queue.length >= this.config.batchSize) {
          this.processQueue();
        }
      }
    });
  }

  scheduleRetry() {
    if (this.retryTimeout) return;
    this.retryTimeout = setTimeout(() => {
      this.retryTimeout = null;
      this.processQueue(true);
    }, this.config.retryDelayMs);
  }

  restoreQueue() {
    if (typeof sessionStorage !== 'undefined') {
      try {
        const stored = sessionStorage.getItem(this.STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            this.queue = [...parsed, ...this.queue];
            sessionStorage.removeItem(this.STORAGE_KEY);
          }
        }
      } catch (e) {
        console.error('Failed to restore tracking queue', e);
      }
    }
  }

  persistQueue() {
    if (typeof sessionStorage !== 'undefined') {
      try {
        sessionStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.queue));
      } catch (e) {
        console.error('Failed to persist tracking queue', e);
      }
    }
  }

  setupUnloadHandler() {
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        this.flushAndClear();
      });
    }
  }

  flushAndClear() {
    if (this.queue.length > 0) {
      flushEventsOnUnload(this.queue, this.config);
      this.queue = [];
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem(this.STORAGE_KEY);
      }
    }
  }

  destroy() {
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
      this.retryTimeout = null;
    }
  }
}
