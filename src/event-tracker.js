import { EventQueue } from './event-queue.js';
import { UserInteractivity } from './user-interactivity.js';
import { PageTracker } from './page-tracker.js';
import { DEFAULT_TRACKING_CONFIG } from './config.js';

export class UserEventTracker {
  constructor(config = {}) {
    this.config = { ...DEFAULT_TRACKING_CONFIG, ...config };
    this.queue = new EventQueue(this.config);
    this.interactivity = new UserInteractivity(this.config, this);
    this.pageTracker = new PageTracker(this);
    this.isTracking = false;
    this.isSessionEnded = false;
    
    this.flushInterval = null;
  }

  start() {
    if (this.isTracking || !this.config.apiUrl) return;
    this.isTracking = true;
    
    this.interactivity.start();
    
    if (this.config.flushIntervalMs) {
      this.flushInterval = setInterval(() => {
        this.queue.processQueue(true);
      }, this.config.flushIntervalMs);
    }
  }

  stop() {
    if (!this.isTracking) return;
    this.isTracking = false;
    
    this.interactivity.stop();
    
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    
    this.queue.flushAndClear();
  }

  trackEvent(eventName, rawProperties = {}) {
    if (!this.isTracking) return;
    this.isSessionEnded = false; // Reset flag on normal events
    
    const payload = this.config.buildPayload(eventName, rawProperties);
    
    // Allow application to drop events by returning null from buildPayload
    if (!payload) return;

    this.queue.enqueue(payload);
  }
  
  trackPageView(currentRoute, eventName = 'screen_viewed', properties = {}) {
    this.pageTracker.trackScreenView(currentRoute, eventName, properties);
  }
  
  trackSessionExpired(eventName, endReason, message, properties = {}) {
    if (this.isSessionEnded) return;

    const defaultPayload = this.config.buildPayload(eventName, {
      endReason: endReason,
      message: message || 'Session expired',
      ...properties
    });
    
    this.isSessionEnded = true;
    
    // Even if the application drops the session_ended event,
    // we must flush any remaining events from the queue.
    if (defaultPayload) {
      this.queue.enqueue(defaultPayload);
    }
    
    this.queue.flushAndClear();
  }
}
