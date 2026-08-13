export function uploadEvents(events, config) {
  if (!events || events.length === 0) return Promise.resolve();

  const sessionId = config.getSessionId ? config.getSessionId() : null;
  const headers = {
    'Content-Type': 'application/json',
    ...(config?.additionalHeaders || {})
  };
  
  if (sessionId && config?.sessionHeaderKey) {
    headers[config.sessionHeaderKey] = sessionId;
  }

  return fetch(config.apiUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(events),
    keepalive: true
  }).then(response => {
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json().catch(() => ({}));
  });
}

export function flushEventsOnUnload(events, config) {
  if (!events || events.length === 0) return;

  const payload = JSON.stringify(events);
  const sessionId = config.getSessionId ? config.getSessionId() : null;
  
  const headers = { 
    'Content-Type': 'application/json',
    ...(config?.additionalHeaders || {})
  };
  
  if (sessionId && config?.sessionHeaderKey) {
    headers[config.sessionHeaderKey] = sessionId;
  }

  const blob = new Blob([payload], { type: 'application/json' });

  if (typeof navigator !== 'undefined' && navigator.sendBeacon && !sessionId) {
    navigator.sendBeacon(config.apiUrl, blob);
  } else if (typeof fetch !== 'undefined') {
    fetch(config.apiUrl, {
      method: 'POST',
      headers,
      body: payload,
      keepalive: true
    }).catch(console.error);
  }
}
