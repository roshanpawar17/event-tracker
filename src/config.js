export const DEFAULT_TRACKING_CONFIG = {
  apiUrl: '',
  batchSize: 5,
  flushIntervalMs: 0,
  maxRetries: 3,
  retryDelayMs: 30000,
  
  eventQueueStorageKey: 'user_event_tracking_queue',
  sessionHeaderKey: 'X-Session-ID',
  additionalHeaders: {},
  pageViewEventName: 'screen_viewed',
  trackAttributeName: 'data-track-id',
  getPageViewProperties: (route) => ({}),
  extractDynamicProperties: (element, properties, event) => {},
  getSessionId: () => {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem('X-Session-ID');
    }
    return null;
  },

  buildPayload: (eventName, properties) => {
    return {
      eventName,
      occurredAtUtc: new Date().toISOString(),
      properties
    };
  },

  elementEventMap: {}
};
