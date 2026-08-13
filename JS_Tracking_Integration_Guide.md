# User Event Tracking – Core Library & Integration Guide

## 1. Overview

This documentation provides a comprehensive guide for the framework-agnostic User Event Tracking library. The library is designed to reliably track user interactions and page views, queue them efficiently, and batch upload them to a centralized tracking API, regardless of the underlying frontend framework (Angular, React, Vue, Vanilla JS).

### Overall Architecture and Data Flow

The tracking library uses a modular approach where the event generation logic (DOM interactions, route changes, custom events) is decoupled from the queueing and networking logic.

**Data Flow:**
1. **Event Generation:** User interacts with the UI, navigates to a new page, or a custom application event is fired.
2. **Event Tracker:** The interaction is captured by `user-interactivity.js` or `page-tracker.js`, mapped to a standard format, and pushed to `event-tracker.js`.
3. **Queueing:** `event-tracker.js` enriches the event (timestamp, properties) and stores it in `event-queue.js`.
4. **Batching & Uploading:** Once the queue reaches a defined batch size, or upon browser exit/flush, `upload.js` sends the queued events to the configured tracking API.
5. **Session Handling:** The active Session ID is attached to the payload and HTTP headers for tracking user sessions across requests.

### Core Objectives
* Framework-agnostic core logic that can be reused across any web application.
* Standardized event queues and automatic batching to reduce network load.
* Centralized mapping of UI elements to event names without hardcoding inside components.
* Robust session handling during login, logout, and unexpected browser closures.

---

## 2. Core Library Structure

The core library is self-contained in standard JavaScript and does not have external dependencies (no Angular, React, or Vue specific code).

```text
tracking/core/
├── config.js
├── event-queue.js
├── event-tracker.js
├── index.js
├── page-tracker.js
├── upload.js
└── user-interactivity.js
```

### 2.1 `config.js`

**Purpose:** Defines the default configuration for the core tracking library (`DEFAULT_TRACKING_CONFIG`). Applications can override these defaults by passing a configuration object during initialization.

**Structure & Options:**
* **API Configuration:** `apiUrl` (where to send the POST request).
* **Batch Configuration:** `batchSize` (number of events to queue before uploading).
* **Retry Configuration:** `maxRetries` (attempts for failed uploads), `retryDelayMs` (delay between retries).
* **Queue Configuration:** `eventQueueStorageKey` (localStorage key for persisting the queue), `flushIntervalMs` (optional time-based flush).
* **Session Configuration:** `sessionHeaderKey` (header name for the Session ID), `getSessionId` (callback function to retrieve the current session ID).
* **Payload Builder:** `buildPayload` (callback function to format the final event object).
* **Event Configuration:** `pageViewEventName` (default name for page view events).
* **Automatic Tracking Configuration:** `trackAttributeName` (attribute used to identify trackable elements), `extractDynamicProperties` (callback to get dynamic properties from elements).

**Example Application Override:**
```js
const trackingConfig = {
  // Required Application-Specific Configurations
  apiUrl: 'https://api.example.com/tracking',
  getSessionId: () => localStorage.getItem('X-Session-ID'),
  
  // Optional Core Overrides
  batchSize: 5,
  maxRetries: 3,
  retryDelayMs: 30000
};
```
*(Note: Values such as `apiUrl` and `getSessionId` must be correctly mapped to your application's actual implementation, as they differ per project).*

---

## 3. `tracking.config.ts`

For framework-specific implementations like Angular, an application-level configuration file (`tracking.config.ts`) acts as the bridge between the application environment and the core JavaScript library.

**Why it exists:** It keeps the core library generic while providing environment-specific API URLs, specific DOM-to-event mappings (`elementEventMap`), and custom payload formatting tailored to the application's user schema.

**Structure:**
* **Environment Injection:** Uses `environment.apiUrl` to define the endpoint dynamically.
* **Session Configuration:** Implements the logic to fetch the Session ID from localStorage or cookies (e.g., via `sessionHeaderKey`).
* **Event Mapping (`elementEventMap`):** Defines the exact DOM target IDs mapped to standardized tracking event names.
* **Property Extraction:** Implements `extractDynamicProperties` to pull contextual data (like `data-chip-value`) from DOM elements into event properties.
* **Payload Builder:** `buildPayload` implementation providing context like `userId`, `sessionId`, and base properties.

**Example Structure:**
```ts
export const TRACKING_CONFIG = {
  apiUrl: environment.BACKEND_BASE_URL + '/api/services/app/UserEvent/UserEventTracking',
  batchSize: 5,
  maxRetries: 3,
  sessionHeaderKey: 'X-Session-ID',
  getSessionId: () => localStorage.getItem('X-Session-ID'),
  buildPayload: (eventName, properties) => { /* formats event */ },
  elementEventMap: {
    'button_clicked': [{ targetId: 'save-button', properties: {} }]
  }
};
```
*(Note: The exact keys must remain aligned with the configuration object expected by `config.js` in the core library).*

---

## 4. Core Files

### 4.1 `event-queue.js`

**Purpose:** Responsible for temporarily storing tracking events before they are uploaded. This acts as a buffer to allow batching and prevents data loss if a network request fails.

**Responsibilities:**
* **Event Insertion:** Pushing new events into the internal array.
* **Queue Persistence:** Syncing the queue to `localStorage` (or `sessionStorage`) so that un-uploaded events survive a page reload or browser crash.
* **Queue Restoration:** Loading previously persisted events upon initialization.
* **Batch Extraction:** Retrieving the oldest N events (based on `batchSize`) to be sent to the API.
* **Queue Clearing:** Removing successfully uploaded batches from the queue and updating storage.
* **Flush Behavior:** Ensuring remaining events are processed immediately when the application terminates (`flushAndClear`).

**Conceptual API:**
```js
eventQueue.enqueue(payload);     // Adds an event and persists
eventQueue.processQueue();       // Checks batch size and uploads
eventQueue.flushAndClear();      // Wipes the queue entirely after immediate upload
```

**Expected Flow:**
```text
User Action
    ↓
Event Tracker
    ↓
Event Queue (Persisted to Storage)
    ↓
Batch Size Reached
    ↓
Upload Triggered
    ↓
API Request
```
*(If the API request fails, the batch is returned to the queue and retried according to the retry configuration).*

---

### 4.2 `event-tracker.js`

**Purpose:** The primary engine (`UserEventTracker` class) that manages event generation, applies core configuration, formats the event payload, and interacts with the queue.

**Responsibilities:**
* **Tracker Initialization:** Takes the merged configuration (default + application overrides).
* **Module Instantiation:** Internally sets up `EventQueue`, `UserInteractivity`, and `PageTracker`.
* **Generic Event Tracking:** Accepts raw event names and properties from the application.
* **Event Payload Formatting:** Calls the application's `buildPayload` callback to attach user IDs, session IDs, timestamps, and route information.
* **Queue Interaction:** Pushes fully formatted events to the `event-queue`.
* **Session Handling:** Exposes `trackSessionExpired` for explicit session termination handling.

**Exported Class `UserEventTracker` Methods:**

* **`start()`**
  * **Purpose:** Starts the tracker, enables DOM interactivity listeners, and optionally starts the flush interval.
* **`stop()`**
  * **Purpose:** Stops tracking, cleans up listeners, and flushes the queue immediately.
* **`trackEvent(eventName, rawProperties = {})`**
  * **Purpose:** Tracks a custom event.
* **`trackPageView(currentRoute, eventName = 'screen_viewed', properties = {})`**
  * **Purpose:** Tracks a screen/page view navigation.
* **`trackSessionExpired(eventName, endReason, message, properties = {})`**
  * **Purpose:** Specialized method for when a session expires or logout occurs, which also flushes the queue immediately.

*Note: Applications should rely on `UserEventTracker` public methods and never directly manipulate `EventQueue`.*

---

### 4.3 `page-tracker.js`

**Purpose:** Responsible for tracking screen views, page navigations, and router transitions.

**Responsibilities:**
* **Route Detection:** Tracks the current and previous route to analyze user flow.
* **Framework Integration:** Operates transparently behind the `UserEventTracker.trackPageView()` method, keeping framework router logic safely within the application's adapter service.

---

### 4.4 `upload.js`

**Purpose:** Handles the actual HTTP communication with the tracking API backend.

**Responsibilities:**
* **API Request Creation:** Formats the queued batch into an HTTP POST request using `fetch`.
* **Headers:** Attaches content-type and, critically, the `X-Session-ID` authentication/tracking header based on configuration.
* **Payload Format:** Structures the outgoing payload containing the batch of events.
* **Success/Failure Handling:** Resolves or rejects the network call.
* **Retry Behavior:** If a request fails, it handles retry backoff before ultimately pushing failed events back to the queue.

---

### 4.5 `user-interactivity.js`

**Purpose:** Automatically tracks DOM interactions without requiring manual event tracking calls inside individual components.

**Responsibilities:**
* **Event Delegation:** Attaches a single global listener to the `document` for clicks and changes when `UserEventTracker.start()` is called.
* **Element Identification:** Uses a configurable HTML attribute (e.g., `data-track-id`) to identify elements.
* **`ELEMENT_EVENT_MAP`:** Looks up the interacted element's ID against a configured dictionary to determine the correct `eventName` and standard `properties`.
* **Dynamic Property Extraction:** If configured, pulls additional data attributes from the element (e.g., `data-chip-value`).

---

### 4.6 `index.js`

**Purpose:** The public entry point for the core library. Framework-specific adapters should only import from `index.js` to ensure the internal file structure can be refactored safely.

**Exported API:**
* `UserEventTracker`: The main tracking class.
* `DEFAULT_TRACKING_CONFIG`: The fallback configurations.

**Example Usage:**
```js
import { UserEventTracker } from './core/tracking/core/index.js';
import { TRACKING_CONFIG } from './tracking.config.js';

const tracker = new UserEventTracker(TRACKING_CONFIG);
tracker.start();
```

---

## 5. Angular Integration (`event-tracker.service.ts`)

**Purpose:** Acts as the thin adapter between the Angular dependency injection system and the core vanilla JavaScript tracking library.

**Architecture Flow:**
```text
Angular Application
        ↓
EventTrackerService (Angular Injectable)
        ↓
UserEventTracker (index.js)
        ↓
Tracking API
```

**Responsibilities:**
* **Initialization:** Instantiates `UserEventTracker` using `TRACKING_CONFIG` and calls `start()`. Must only run in the browser (using `isPlatformBrowser`).
* **Router Integration:** Subscribes to Angular's `Router` (`NavigationEnd` events) and calls `tracker.trackPageView()`.
* **Lifecycle Management:** Hooks into `ngOnDestroy` to call `tracker.stop()`.
* **Exposing APIs:** Provides strongly typed wrappers around `trackEvent` and `trackSessionExpired` for Angular components.

**Example Service Implementation:**
```ts
import { Injectable, inject, PLATFORM_ID, OnDestroy } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs';
import { UserEventTracker } from '../core/index.js';
import { TRACKING_CONFIG } from '../tracking.config';

@Injectable({
  providedIn: 'root'
})
export class EventTrackerService implements OnDestroy {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly router = inject(Router);
  private tracker: any;

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this.tracker = new UserEventTracker(TRACKING_CONFIG);
      this.tracker.start();
      this.setupPageTracking();
    }
  }

  trackEvent(eventName: string, properties: Record<string, any> = {}): void {
    if (this.tracker) {
      this.tracker.trackEvent(eventName, properties);
    }
  }

  trackSessionExpired(eventName: string, endReason: string, message: string): void {
    if (this.tracker) {
      this.tracker.trackSessionExpired(eventName, endReason, message);
    }
  }

  private setupPageTracking() {
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd)
    ).subscribe((event: NavigationEnd) => {
      if (this.tracker) {
        const eventName = TRACKING_CONFIG.pageViewEventName || 'screen_viewed';
        const properties = TRACKING_CONFIG.getPageViewProperties ? TRACKING_CONFIG.getPageViewProperties(event.urlAfterRedirects) : {};
        this.tracker.trackPageView(event.urlAfterRedirects, eventName, properties);
      }
    });
  }

  ngOnDestroy() {
    if (this.tracker) {
      this.tracker.stop();
    }
  }
}
```

---

## 6. Session ID Management

Session IDs are critical for grouping related events to a single user login session.

**Expected Lifecycle:**
```text
Login via Authentication Service
  ↓
Backend returns Session ID
  ↓
Application stores Session ID (localStorage/cookies)
  ↓
Use Session ID for Tracking (via getSessionId config)
  ↓
Browser/tab revisit (Reuse valid Session ID)
  ↓
Backend session expires / User clicks Logout
  ↓
Call tracker.trackSessionExpired() -> Flushes queued events immediately
  ↓
Remove Session ID from storage
```

**Responsibilities:**
* The core library **does not** create or manage the lifecycle of the session ID.
* The application provides a `getSessionId()` callback in the configuration.
* The core library ensures this ID is attached to every tracking event and is sent as a header (e.g., `X-Session-ID`) via `upload.js` based on `sessionHeaderKey` configuration.
* **Important:** During logout, the framework adapter must call `tracker.trackSessionExpired()` *before* clearing the Session ID from storage to ensure final events are attributed to the correct session.

---

## 7. Event Tracking Flow Overview

**Standard Flow:**
```text
User Interaction
      ↓
user-interactivity.js (detects data-track-id)
      ↓
Event Mapping (ELEMENT_EVENT_MAP)
      ↓
event-tracker.js (trackEvent called)
      ↓
Event Object Creation (buildPayload applies SessionId/Timestamp)
      ↓
event-queue.js (stores in localStorage)
      ↓
Queue Size Check (is size >= batchSize?)
      ↓
Batch Ready (events extracted from queue)
      ↓
upload.js (HTTP POST with X-Session-ID header)
      ↓
Tracking API
      ↓
Success (remove batch from event-queue.js)
```

**Failure Flow:**
```text
Upload Failed (e.g., Network Error)
      ↓
Retry mechanism in upload.js
      ↓
Retry Successful?
   ↙           ↘
 Yes            No (Max retries reached)
 ↓               ↓
Clear Batch    Preserve Batch in event-queue.js (will retry on next event/load)
```

---

## 8. Integrating Into Another Project

Because the core is framework-agnostic, it can be dropped into any project.

### Step 1 – Copy/Install the Core Library
Copy the `tracking/core/` folder into your project.

### Step 2 – Provide Configuration
Create an application-level configuration (`tracking.config.js` or `.ts`) defining the API URL, batch size, and `buildPayload` logic.

### Step 3 – Initialize Trackers
Use `index.js` to import the `UserEventTracker` class. Do not import internal files directly. Ensure it only runs in the browser.

```js
import { UserEventTracker } from './tracking/core/index.js';
import { trackingConfig } from './tracking.config.js';

const tracker = new UserEventTracker(trackingConfig);
tracker.start();
```

### Step 4 – Configure Session ID
Ensure your auth system stores the session token where `appConfig.getSessionId()` can retrieve it.

### Step 5 – Verify API Upload
Use network dev tools to verify that events queue properly and upload when `batchSize` is hit, and that the payload structure matches backend expectations.

---

## 9. Framework-Specific Integration Examples

### React

Create a custom hook or Provider.

```tsx
// src/tracking/useTracking.js
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { UserEventTracker } from './core/index.js';
import { trackingConfig } from './tracking.config';

export function useTracking() {
  const trackerRef = useRef(null);
  const location = useLocation();

  useEffect(() => {
    if (!trackerRef.current && typeof window !== 'undefined') {
      trackerRef.current = new UserEventTracker(trackingConfig);
      trackerRef.current.start();
    }
    
    return () => {
      if (trackerRef.current) {
        trackerRef.current.stop();
      }
    };
  }, []);

  useEffect(() => {
    if (trackerRef.current) {
      trackerRef.current.trackPageView(location.pathname);
    }
  }, [location]);

  return {
    trackEvent: (eventName, properties) => trackerRef.current?.trackEvent(eventName, properties),
    trackSessionExpired: (eventName, endReason, message) => trackerRef.current?.trackSessionExpired(eventName, endReason, message)
  };
}
```

### Vue

Create a Vue Plugin.

```js
// src/tracking/vue-plugin.js
import { UserEventTracker } from './core/index.js';
import { trackingConfig } from './tracking.config';

export default {
  install(app, options) {
    if (typeof window !== 'undefined') {
      const tracker = new UserEventTracker(trackingConfig);
      tracker.start();

      options.router.afterEach((to) => {
        tracker.trackPageView(to.fullPath);
      });

      app.provide('tracker', tracker);

      // Unmount hook if needed globally, usually bounded to app unmount
      app.unmount = (function (originalUnmount) {
        return function () {
          tracker.stop();
          originalUnmount.apply(this, arguments);
        };
      })(app.unmount);
    }
  }
}
```

### Vanilla JavaScript

```html
<script type="module">
  import { UserEventTracker } from './tracking/core/index.js';
  import { trackingConfig } from './tracking.config.js';

  const tracker = new UserEventTracker(trackingConfig);
  tracker.start();

  // Manual tracking
  document.getElementById('save-button').addEventListener('click', () => {
    tracker.trackEvent('button_clicked', { targetId: 'save-button' });
  });

  window.addEventListener('beforeunload', () => {
    tracker.stop();
  });
</script>
```

---

## 10. Integration Rules & Best Practices

1. **Do not duplicate core logic:** Framework adapters should be as thin as possible. Never recreate batching or queueing in an Angular Service or React Hook.
2. **Use `index.js`:** Applications should only consume the `UserEventTracker` class exported from `index.js`.
3. **Queue Encapsulation:** Do not directly modify `event-queue.js` arrays from application components.
4. **Configuration over Hardcoding:** Do not hardcode API URLs, event names, or DOM selectors in the core logic. Everything must be passed via the config object.
5. **Standardized Schemas:** Keep the event schema consistent. Do not create different payload structures for different frameworks interacting with the same backend.
6. **Browser Only Execution:** Ensure `new UserEventTracker()` only executes on the client-side/browser. Check platform identity if using SSR (e.g. Angular Universal or Next.js).

---

## 11. Troubleshooting

* **`unknown-button` or untracked clicks:**
  * Check if the DOM element has the correct `data-track-id` (or custom configured `trackAttributeName`).
  * Verify the ID exists in the `ELEMENT_EVENT_MAP` configuration.
  * Ensure `tracker.start()` was actually called.
* **Events remain in queue (No API calls):**
  * Verify `apiUrl` is correct.
  * Check if `batchSize` is set too high and hasn't been reached.
  * Ensure the Session ID is valid (some APIs reject payloads missing authentication).
* **Duplicate events:**
  * Ensure the tracker isn't being instantiated multiple times (e.g., provided at the Component level instead of Root level in Angular).
  * Ensure Router subscriptions don't stack up without unsubscribing.
* **Session ID missing:**
  * Check if `getSessionId()` correctly accesses `localStorage` or `sessionStorage`.
  * Ensure the backend authentication flow sets the storage variable *before* the first tracking event fires.

---

## 12. Testing Checklist

Before deploying an integration, verify:
- [ ] Core library initializes without console errors.
- [ ] `ELEMENT_EVENT_MAP` accurately captures designated clicks.
- [ ] Router navigations successfully log page views without duplicates.
- [ ] Events accumulate in `localStorage` (`eventQueueStorageKey`).
- [ ] When `batchSize` is reached, an HTTP POST occurs.
- [ ] HTTP Request contains the correct `X-Session-ID` header and payload format.
- [ ] Failed network requests preserve the queue and retry properly.
- [ ] Logging out immediately calls `tracker.trackSessionExpired()` and clears the session.

---

## 13. Architecture Principle

```text
                 ┌─────────────────────┐
                 │  Angular / React /  │
                 │  Vue / Vanilla JS   │
                 └──────────┬──────────┘
                            │
                     Framework Adapter
                            │
                 ┌──────────▼──────────┐
                 │  UserEventTracker   │
                 └──────────┬──────────┘
                            │
             ┌──────────────▼──────────────┐
             │        event-queue.js       │
             └──────────────┬──────────────┘
                            │
                     Batch Available
                            │
                 ┌──────────▼──────────┐
                 │     upload.js       │
                 └──────────┬──────────┘
                            │
                 ┌──────────▼──────────┐
                 │   Tracking API      │
                 └─────────────────────┘
```
The core library owns the tracking behavior. Framework integrations strictly provide the application lifecycle hooks and custom data mapping.

---

## 14. AI Prompt for Integrating the User Event Tracker

When asking an AI or another developer to integrate this library into a new project, use the following prompt context to ensure they follow architectural guidelines:

```text
You are an expert software architect.

I have an existing framework-agnostic User Event Tracking core library located at `tracking/core/`.
Core files:
- config.js
- event-queue.js
- event-tracker.js
- index.js
- page-tracker.js
- upload.js
- user-interactivity.js

I need to integrate this existing tracking library into the current project.
Target technology/framework: [ANGULAR / REACT / VUE / VANILLA JS]

Project requirements:
1. Inspect the existing project structure.
2. Identify the application's routing/navigation mechanism, authentication/logout lifecycle, and session handling.
3. Do not duplicate the core tracking logic. Reuse the existing JavaScript files.
4. Use the `UserEventTracker` class exported from `index.js` as the public entry point.
5. Instantiate `new UserEventTracker(config)` and call `tracker.start()`.
6. Create only a thin framework-specific adapter/service. Keep framework-specific code outside the core library.
7. Ensure tracking logic only initializes in the browser/client-side environment.

Configuration:
- Do not hardcode API URLs, Session IDs, or environment values.
- Create an application-level configuration file compatible with config.js.

Session handling:
- Generate/receive the session ID according to existing auth implementation.
- Reuse a valid session ID, and ensure it is removed on logout.
- Call `tracker.trackSessionExpired()` during logout or session expiry to flush remaining events.
- Send the session ID using the configured header (e.g., X-Session-ID).

Event tracking & mapping:
- Use `tracker.trackEvent()`, `tracker.trackPageView()`, and let internal core logic handle queues and uploads.
- Add missing mappings to ELEMENT_EVENT_MAP. Avoid hardcoded target IDs.

Implementation requirements:
- Inspect actual implementations of core files before writing code. Use actual exported functions and parameters.
- Provide a summary of files created/modified, configurations applied, and integration details.
- Verify no duplicate listeners, batch upload works, session handling is robust, and existing app behavior is unaffected.
```
