# Event Tracker Library - Complete Documentation & Integration Guide

Welcome to the comprehensive documentation for the **Event Tracker** library. This guide covers every aspect of the library, including its internal architecture, API reference, configuration options, and framework-agnostic integration strategies.

---

## 1. Complete Library Properties Documentation

The library relies on various properties to configure behavior, manage state, and build payloads. Below is a complete reference of all configurable and internal properties.

### Configurable Properties (TrackerConfig)

| Property | Type | Required | Default | Purpose / When it is used |
| :--- | :--- | :--- | :--- | :--- |
| `apiUrl` | `string` | Yes | `''` | The backend endpoint where batch events are sent via POST request. Required to successfully upload events. |
| `batchSize` | `number` | No | `5` | The number of events to queue in `sessionStorage` before triggering a batch upload. Helps minimize network requests. |
| `flushIntervalMs` | `number` | No | `0` | If greater than 0, sets a timer to forcibly upload the queue at this interval (in milliseconds), even if `batchSize` isn't reached. |
| `maxRetries` | `number` | No | `3` | Maximum number of retry attempts if the HTTP upload request fails (e.g., network error). |
| `retryDelayMs` | `number` | No | `30000` | Wait time (in milliseconds) before attempting to re-upload a failed batch. |
| `eventQueueStorageKey`| `string` | No | `'user_event_tracking_queue'`| The `sessionStorage` key used to persist the event queue across page reloads. |
| `sessionHeaderKey` | `string` | No | `'X-Session-ID'` | The HTTP Header name used to pass the current session ID to the backend. |
| `additionalHeaders` | `object` | No | `{}` | Any extra HTTP headers to include in the upload request (e.g., `Authorization`, `X-Tenant-ID`). |
| `pageViewEventName` | `string` | No | `'screen_viewed'`| The default event name dispatched when a route/screen change is tracked. |
| `trackAttributeName`| `string` | No | `'data-track-id'`| The HTML attribute the auto-tracker listens for. If missing, it falls back to the element's `id`. |
| `getPageViewProperties`| `function` | No | `(route) => ({})` | A callback to dynamically attach custom properties to a page view event based on the route. |
| `extractDynamicProperties`| `function`| No | `(element, props, event) => {}`| A callback invoked when a tracked element is clicked. Allows injecting dynamic data (like `data-value`) into the event payload. |
| `getSessionId` | `function` | No | *(Reads from localStorage)* | Callback to retrieve the active session ID. Must return a string or null. |
| `buildPayload` | `function` | Yes | *(Generates standard schema)*| Formats the final event payload before queueing. Return `null` to drop the event. |
| `elementEventMap` | `object` | Yes | `{}` | A dictionary mapping target IDs to specific event names and static properties. |

### Internal State Properties

| Property | Type | Located In | Purpose |
| :--- | :--- | :--- | :--- |
| `isTracking` | `boolean` | `UserEventTracker` | Tracks if `start()` was called. Prevents duplicate initializations. |
| `isSessionEnded` | `boolean` | `UserEventTracker` | Prevents multiple session-expired events from firing consecutively. |
| `queue` | `array` | `EventQueue` | The in-memory array of events waiting to be batch-uploaded. |
| `isUploading` | `boolean` | `EventQueue` | Mutex flag to prevent overlapping upload requests. |
| `retryCount` | `number` | `EventQueue` | Tracks the current number of failed upload retries. |

---

## 2. Complete `/src` Folder Documentation

### 2.1 `src/index.js`
**Purpose:** The entry point of the library. It aggregates and exports the public API so consumers don't need to import internal files.
- **Exports:**
  - `UserEventTracker` (Class)
  - `DEFAULT_TRACKING_CONFIG` (Object)

### 2.2 `src/config.js`
**Purpose:** Defines the fallback defaults and structural expectations for the tracking configuration.
- **Exported Properties:**
  - `DEFAULT_TRACKING_CONFIG`: An object containing all the default configurations (like `batchSize: 5`, `retryDelayMs: 30000`, etc.).
- **Key Functions inside Config:**
  - `getSessionId()`: Safely attempts to read `X-Session-ID` from `localStorage`.
  - `buildPayload(eventName, properties)`: Wraps properties and adds an `occurredAtUtc` ISO string.

### 2.3 `src/event-tracker.js`
**Purpose:** The central controller of the library. Connects the queue, user interactivity, and page tracker together.
- **Class:** `UserEventTracker`

#### `constructor(config)`
**Parameters:** `config` (TrackerConfig, optional)
**Behavior:** Merges the provided config with `DEFAULT_TRACKING_CONFIG`. Initializes `EventQueue`, `UserInteractivity`, and `PageTracker`.

#### `start()`
**Parameters:** None | **Returns:** `void`
**Behavior:** Sets `isTracking` to true, calls `interactivity.start()` to listen to DOM events, and starts the `flushInterval` if configured.

#### `stop()`
**Parameters:** None | **Returns:** `void`
**Behavior:** Disables tracking, stops interactivity listeners, clears intervals, and immediately flushes any queued events to the backend.

#### `trackEvent(eventName, rawProperties = {})`
**Parameters:**
- `eventName` (string, required): Name of the event.
- `rawProperties` (object, optional, default `{}`): Event metadata.
**Behavior:** Resets `isSessionEnded`. Calls `buildPayload`. If payload is valid, passes it to the `EventQueue`.

#### `trackPageView(currentRoute, eventName = 'screen_viewed', properties = {})`
**Parameters:**
- `currentRoute` (string, required): The URL path.
- `eventName` (string, optional)
- `properties` (object, optional)
**Behavior:** Delegates to `PageTracker.trackScreenView()`.

#### `trackSessionExpired(eventName, endReason, message, properties = {})`
**Parameters:** Event details and reason for expiration.
**Behavior:** Tracks the expiration event and immediately triggers a queue flush. Ensures events aren't lost on logout.

### 2.4 `src/event-queue.js`
**Purpose:** Manages the storage, batching, and retrying of events. Uses `sessionStorage` for persistence to survive accidental page reloads.
- **Class:** `EventQueue`

#### `enqueue(event)`
Adds an event to the queue, persists to storage, and attempts to process the queue.

#### `processQueue(force = false)`
Checks if `queue.length >= batchSize` or if `force` is true. If so, triggers `uploadBatch()`.

#### `uploadBatch()`
Slices the batch, marks `isUploading = true`, and calls `uploadEvents()`. Handles Promise success (clears retry, processes next batch) or failure (adds back to queue, triggers `scheduleRetry()`).

#### `restoreQueue()` / `persistQueue()`
Reads from / Writes to `sessionStorage` using `eventQueueStorageKey`.

### 2.5 `src/page-tracker.js`
**Purpose:** Handles route change tracking and determines entry methods (direct load vs navigation).
- **Class:** `PageTracker`

#### `trackScreenView(currentRoute, eventName, properties)`
**Behavior:** Ignores routes containing `/login` or `/forgot-password`. Calculates `entryMethod` based on `previousRoute` state. Calls `eventTracker.trackEvent()`.

### 2.6 `src/upload.js`
**Purpose:** A pure utility file handling HTTP networking.

#### `uploadEvents(events, config)`
**Returns:** `Promise<any>`
**Behavior:** Uses `fetch` API. Injects `sessionHeaderKey` if `getSessionId()` returns a value. Sends a `POST` request with `keepalive: true`.

#### `flushEventsOnUnload(events, config)`
**Behavior:** Synchronous-safe upload for page unload. Uses `navigator.sendBeacon` if possible (and if no custom session headers are strictly required by CORS), otherwise falls back to `fetch` with `keepalive: true`.

### 2.7 `src/user-interactivity.js`
**Purpose:** Global DOM listener that automatically fires events based on element attributes without requiring manual tracking calls inside components.
- **Class:** `UserInteractivity`

#### `start()` / `stop()`
Attaches/removes global event listeners for `click` and `change` on the `document`.

#### `handleEvent(event)`
**Behavior:** Intercepts clicks, finds the closest element with `id` or `data-track-id`. Looks up the ID in `config.elementEventMap`. If a match is found, dynamically extracts text (label, button text) and calls `trackEvent`.

---

## 3. Complete Configuration Documentation

The library relies on a robust configuration object. Here is a comprehensive example of a production-ready tracking configuration:

```javascript
const TRACKING_CONFIG = {
  // 1. API Configuration
  apiUrl: 'https://api.mycompany.com/v1/tracking/batch',
  
  // 2. Batching & Queue Options
  batchSize: 10,             // Wait for 10 events before sending
  flushIntervalMs: 60000,    // Force send every 60 seconds
  eventQueueStorageKey: 'my_app_tracking_q',
  
  // 3. Retry Behavior
  maxRetries: 5,             // Try 5 times before dropping data
  retryDelayMs: 15000,       // Wait 15 seconds between retries
  
  // 4. Session & Authentication
  sessionHeaderKey: 'X-Session-ID',
  additionalHeaders: {
    'X-App-Version': '1.0.0'
  },
  getSessionId: () => {
    return localStorage.getItem('auth_session_id') || null;
  },

  // 5. Automatic Tracking Setup
  pageViewEventName: 'page_viewed',
  trackAttributeName: 'data-track-id', // Use data-track-id="xyz" in HTML
  
  // 6. Payload Formatting
  buildPayload: (eventName, properties) => {
    // Return null to conditionally drop events
    if (properties.ignoreTracking) return null;
    
    return {
      event: eventName,
      timestamp: new Date().toISOString(),
      url: window.location.href,
      data: properties
    };
  },
  
  getPageViewProperties: (route) => {
    return { section: route.split('/')[1] || 'home' };
  },

  extractDynamicProperties: (element, properties, event) => {
    // Grab dynamic values from inputs or datasets
    if (element.tagName === 'INPUT') {
      properties.inputValue = element.value;
    }
  },

  // 7. Event Mapping Dictionary
  elementEventMap: {
    'user_login': [
      { targetId: 'login-submit-btn', properties: { method: 'email' } }
    ],
    'nav_clicked': [
      { targetId: ['nav-home', 'nav-profile'], properties: { isMenu: true } }
    ]
  }
};
```

---

## 4. Technology-Wise Integration Guide

The library is completely framework-agnostic. Below are guides to integrate it into the four major web technologies.

### 4.1 Angular Integration

#### 1. Include/Install the Library
Install via NPM (if published) or copy the library into your `src/core/tracking` folder. Alternatively, you can include the CDN link in your `src/index.html` file inside the `<head>` tag:
```html
<script src="https://cdn.jsdelivr.net/gh/roshanpawar17/event-tracker@main/dist/event-tracker.umd.js"></script>
```

#### 2. Initialize the Tracker (Service)
Create a root-level service. Ensure initialization only happens in the browser context to prevent SSR (Server-Side Rendering) errors.

```typescript
// event-tracker.service.ts
import { Injectable, inject, PLATFORM_ID, OnDestroy } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { TRACKING_CONFIG } from '../config/tracking.config';

@Injectable({
  providedIn: 'root'
})
export class EventTrackerService implements OnDestroy {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly router = inject(Router);
  private tracker: any;

  constructor() {
    // Only initialize the tracker in the browser (important if using SSR)
    if (isPlatformBrowser(this.platformId)) {
      const EventTracker = (window as any).EventTracker;
      if (EventTracker) {
        this.tracker = new EventTracker.UserEventTracker(TRACKING_CONFIG);
        this.tracker.start();
        this.setupPageTracking();
      } else {
        console.warn('EventTracker not found on window. Ensure CDN script is loaded.');
      }
    }
  }

  /**
   * Tracks a manual custom event
   */
  trackEvent(eventName: string, properties: Record<string, any> = {}): void {
    if (this.tracker) {
      this.tracker.trackEvent(eventName, properties);
    }
  }

  /**
   * Tracks a session expiration/logout, instantly flushing the event queue
   */
  trackSessionExpired(eventName: string, endReason: string, message: string): void {
    if (this.tracker) {
      this.tracker.trackSessionExpired(eventName, endReason, message);
    }
  }

  /**
   * Automatically track screen views on Angular Route changes
   */
  private setupPageTracking() {
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd)
    ).subscribe((event: NavigationEnd) => {
      if (this.tracker) {
        this.tracker.trackPageView(event.urlAfterRedirects, 'screen_viewed', {});
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

#### 3. Add IDs to Target Elements
```html
<!-- login.component.html -->
<button data-track-id="login-submit-btn" (click)="login()">Login</button>
<button mat-raised-button color="primary" aria-label="Submit Time Entry" [disabled]="isSaving || timeLogFormGroup.invalid" (click)="createTimeEntry(true)">Save</button>

```

#### 4. App Initialization: Injected EventTrackerService into app.component.ts to ensure it automatically initializes and starts tracking screen changes when the application loads.

```typescript
// app.component.ts
import { Component, inject } from '@angular/core';
import { EventTrackerService } from './core/tracking/event-tracker.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  private readonly eventTrackerService = inject(EventTrackerService);
}
```

#### 5. Session Management & Explicit Tracking: (If need to integrate sessionId for analytics tracking)

1) Login: In login.component.ts, I updated the successful authentication block to establish a unique X-Session-ID (either from the backend or generating one via crypto.randomUUID()) to localStorage. I also explicitly fire a user_logged_in event.

```typescript
// login.component.ts
import { EventTrackerService } from '../core/services/event-tracker.service';

@Component({
    selector: 'app-login',
    templateUrl: './login.component.html',
    styleUrls: ['./login.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class LoginComponent implements OnInit {
  eventTrackerService = inject(EventTrackerService);

  authorizeUser(hrmsUser) {
    const data = {
      firstName: hrmsUser?.firstName,
      lastName: hrmsUser?.lastName,
      token: hrmsUser?.token,
    };
    // Authentication API call
    this.loginService.userAuth(data).subscribe({
      next: (response) => {
        if (response?.data) {
          const user = response.data.user;
          const UserData: UserInfo = {
            userId: user._id,
            email: user.emailAddress,
            firstName: user.firstName,
            lastName: user.lastName,
            hrmsUserId: user.hrmsUserId,
            token: response.data.token,
            redmineApiKey: '',
            jiraProjectsInfo: [],
            level: user.level,
            userLevelPermissions: response['data']['user'][
              'levelBasedPermissions'
            ].sort((a, b) => {
              return a.order - b.order;
            }),
          };
          
          // Generate Session ID 
          let sessionId = response?.data?.sessionId;
          if (!sessionId && window.crypto && window.crypto.randomUUID) {
            sessionId = window.crypto.randomUUID();
          } else if (!sessionId) {
            sessionId = new Date().getTime().toString();
          }
          localStorage.setItem('X-Session-ID', sessionId);
          
          this.userDetailsService.setUserData(UserData);
          this.eventTrackerService.trackEvent('user_logged_in', { role: user.level });
        }
      },
      error: (error) => {
        this.messageSnackbarService.showMessage(
          'Error: Please try again later.',
          SnackbarEnums.ERROR
        );
      },
      complete: () => {
        this.router.navigate([
          `/stt/${this.userDetailsService.userInfo.userLevelPermissions[0]['url']}`,
        ]);
      },
    });
  }
}

```

2) Logout: In user-details.service.ts, inside the setUserOnLogout method, I've ensured eventTracker.trackSessionExpired() is called and that the X-Session-ID gets cleaned up appropriately.

```typescript
// user-details.service.ts
import { EventTrackerService } from '../services/event-tracker.service';

@Injectable({
  providedIn: 'root',
})
export class UserDetailsService {
  private eventTracker = inject(EventTrackerService);

  setUserOnLogout() {
    this.eventTracker.trackSessionExpired(
      'session_ended', 
      'manual_logout', 
      'User logged out manually'
    );
    localStorage.removeItem('X-Session-ID');
    this.userInfo = undefined;
    localStorage.removeItem('ssiUser');
  }

}
```

#### 6. Added Tracking Configuration: Created src/app/core/config/tracking.config.ts configured precisely for your application, using environment.BACKEND_BASE_URL as the host.

```typescript
// traking.config.ts

import { environment } from '../../../environments/environment';

export const TRACKING_CONFIG = {
  // Backend API endpoint for receiving tracking batches
  apiUrl: environment.BACKEND_BASE_URL + 'services/app/UserEvent/UserEventTracking',
  
  // Batch processing settings
  batchSize: 5,
  
  // Session Header configuration
  sessionHeaderKey: 'X-Session-ID',
  getSessionId: () => localStorage.getItem('X-Session-ID'),

  extractDynamicProperties: (element: any, properties: any, event: Event) => {

    // Get dynamic properties from the element
    if (properties.chip_type !== undefined) {
      properties.chip_type = element.getAttribute('data-chip-type') || '';
    }
    if (properties.chip_value !== undefined) {
      const attr = element.getAttribute('data-chip-value');
      try { properties.chip_value = attr ? JSON.parse(attr) : []; } catch(e) { properties.chip_value = attr || []; }
    }
  }
  
  // Payload builder specific to the backend schema
  buildPayload: (eventName: string, properties: any) => ({
    eventName: eventName,
    occurredAtUtc: new Date().toISOString(),
    sessionId: localStorage.getItem('X-Session-ID') || undefined,
    route: window.location.pathname,
    screenVariant: 'ssi-time-tracker-web',
    properties: properties
  }),
  
  // Automatic mapping of DOM interactions to tracking events
  // Elements need a matching data-track-id (or default configured attribute)
  elementEventMap: {
    'login_submitted': [{ targetId: 'login-submit-btn', properties: {} }],
    'time_entry_saved': [{ targetId: 'save-time-entry-btn', properties: {} }],
    'test_button_clicked': [{ targetId: 'test-button', properties: { button: '' } }] // in button will get dynamic text only add property button:'' or card: '' or label: '' 
    // Add other generic mapped events here as needed
    "quick_filter_chip_clicked": [
      { targetId: "time-tracker-quick-filter-chip", properties: { chip_type: '', chip_value: [] } }
    ],
  }
};

```

#### 7. Get dynamic value using custom attribute-name

```html
<!-- build-list-new.component.html -->
<div [tourAnchor]="first ? 'quick-filter-chip' : null" class="quick-filter-chip flex-row align-items-center" 
      [id]="TargetId.QUICK_FILTER_CHIP"
      [attr.data-chip-type]="quickFilterGroups[key].title"
      [attr.data-chip-value]="getQuickFilterValuesJSON(key)"
      (click)="applyQuickFilter(key)"
      >
  <span class="chip-dot"></span>
  {{ quickFilterGroups[key].title }}
</div>
```

```typescript
// build-list-new.component.html
getQuickFilterValuesJSON(key: string): string {
  return JSON.stringify(this.quickFilterGroups[key]?.values || []);
}
```

#### 7.1 Get dynamic value using custom attribute-name

```typescript
// In Config will recieved data in traking.config.ts

export const TRACKING_CONFIG = {

  extractDynamicProperties: (element: any, properties: any, event: Event) => {

    // Get dynamic properties from the element
    if (properties.chip_type !== undefined) {
      properties.chip_type = element.getAttribute('data-chip-type') || '';
    }
    if (properties.chip_value !== undefined) {
      const attr = element.getAttribute('data-chip-value');
      try { properties.chip_value = attr ? JSON.parse(attr) : []; } catch(e) { properties.chip_value = attr || []; }
    }
  }
}
```

#### 8. Dynamic add/track event

```typescript
// build-list-result.component.ts

@Component({
  selector: 'app-build-list-results',
  templateUrl: './build-list-results.component.html',
  styleUrl: './build-list-results.component.scss'
})
export class BuildListResultsComponent {

  constructor(
    private eventTrackerService: EventTrackerService,
  ) {}

  onTabChange(tabIndex: number) {
    const previousIndex = this.index;
    if (previousIndex === tabIndex) return;
    this.index = tabIndex;
    
    const tabNames = ['Account', 'Contacts', 'Map'];
    const targetIds = [TargetId.ACCOUNT_TAB, TargetId.CONTACTS_TAB, TargetId.MAP_TAB];
    
    this.eventTrackerService.trackEvent(EventName.RESULTS_TAB_SWITCHED, {
      targetId: targetIds[tabIndex] || TargetId.ACCOUNT_TAB,
      to_tab: tabNames[tabIndex] || 'Account',
      from_tab: tabNames[previousIndex] || 'Account'
    });

    // Clear map filters but avoid triggering immediate searchMap if switching TO the map tab
    // to prevent MapComponent from crashing before Leaflet is initialized.
    this.clearMapFilters(previousIndex === 2);
  }
}
```

#### 9. Angular Integration AI Prompt
> "I have a framework-agnostic UserEventTracker library. Please create an Angular `EventTrackerService` (providedIn: 'root') that imports this library. It should instantiate the tracker with a custom configuration only if `isPlatformBrowser` is true. Hook into the Angular `Router` to call `tracker.trackPageView(url)` on `NavigationEnd`. Ensure `tracker.stop()` is called in `ngOnDestroy`. Update my HTML templates to include `data-track-id` attributes for all buttons and update the config's `elementEventMap` to match."

---

### 4.2 React Integration

#### 1. Include/Install the Library
Install via NPM (if published) or include the CDN link in your `public/index.html` file inside the `<head>` tag:
```html
<script src="https://cdn.jsdelivr.net/gh/roshanpawar17/event-tracker@main/dist/event-tracker.umd.js"></script>
```

#### 2. Added Tracking Configuration
Create `tracking.config.ts` configured for your application.

```typescript
// src/config/tracking.config.ts
export const TRACKING_CONFIG = {
  apiUrl: 'https://api.yourdomain.com/track',
  batchSize: 5,
  sessionHeaderKey: 'X-Session-ID',
  getSessionId: () => localStorage.getItem('X-Session-ID'),
  
  extractDynamicProperties: (element: any, properties: any, event: Event) => {
    if (properties.chip_type !== undefined) {
      properties.chip_type = element.getAttribute('data-chip-type') || '';
    }
    if (properties.chip_value !== undefined) {
      const attr = element.getAttribute('data-chip-value');
      try { properties.chip_value = attr ? JSON.parse(attr) : []; } catch(e) { properties.chip_value = attr || []; }
    }
  },

  buildPayload: (eventName: string, properties: any) => ({
    eventName,
    occurredAtUtc: new Date().toISOString(),
    sessionId: localStorage.getItem('X-Session-ID') || undefined,
    route: window.location.pathname,
    screenVariant: 'react-web-app',
    properties
  }),
  
  elementEventMap: {
    'login_submitted': [{ targetId: 'login-submit-btn', properties: {} }],
    'time_entry_saved': [{ targetId: 'save-time-entry-btn', properties: {} }],
    'quick_filter_chip_clicked': [
      { targetId: "time-tracker-quick-filter-chip", properties: { chip_type: '', chip_value: [] } }
    ]
  }
};
```

#### 3. Initialize the Tracker (Custom Hook & Context)

```tsx
// src/core/tracking/TrackingProvider.tsx
import React, { createContext, useEffect, useRef, useContext } from 'react';
import { useLocation } from 'react-router-dom';
import { TRACKING_CONFIG } from '../../config/tracking.config';

export const TrackingContext = createContext<any>(null);
export const useTracking = () => useContext(TrackingContext);

export const TrackingProvider = ({ children }: { children: React.ReactNode }) => {
  const trackerRef = useRef<any>(null);
  const location = useLocation();

  useEffect(() => {
    if (!trackerRef.current && typeof window !== 'undefined') {
      const EventTracker = (window as any).EventTracker;
      if (EventTracker) {
        trackerRef.current = new EventTracker.UserEventTracker(TRACKING_CONFIG);
        trackerRef.current.start();
      } else {
        console.warn('EventTracker not found on window. Ensure CDN script is loaded.');
      }
    }
    return () => {
      if (trackerRef.current) trackerRef.current.stop();
    };
  }, []);

  // React Router Page Tracking
  useEffect(() => {
    if (trackerRef.current) {
      trackerRef.current.trackPageView(location.pathname, 'screen_viewed', {});
    }
  }, [location]);

  return (
    <TrackingContext.Provider value={trackerRef.current}>
      {children}
    </TrackingContext.Provider>
  );
};
```

#### 4. App Initialization
Wrap your application with the provider in `App.tsx`:
```tsx
import { TrackingProvider } from './core/tracking/TrackingProvider';

function App() {
  return (
    <TrackingProvider>
      <YourAppComponents />
    </TrackingProvider>
  );
}
```

#### 5. Session Management & Explicit Tracking

**Login:**
```tsx
import { useTracking } from '../core/tracking/TrackingProvider';

export function Login() {
  const tracker = useTracking();

  const handleLogin = async () => {
    // Generate Session ID 
    let sessionId = '';
    if (window.crypto && window.crypto.randomUUID) {
      sessionId = window.crypto.randomUUID();
    } else {
      sessionId = new Date().getTime().toString();
    }
    localStorage.setItem('X-Session-ID', sessionId);
    
    if (tracker) {
      tracker.trackEvent('user_logged_in', { role: 'admin' });
    }
  };

  return <button onClick={handleLogin}>Login</button>;
}
```

**Logout:**
```tsx
import { useTracking } from '../core/tracking/TrackingProvider';

export function Logout() {
  const tracker = useTracking();

  const handleLogout = () => {
    if (tracker) {
      tracker.trackSessionExpired('session_ended', 'manual_logout', 'User logged out manually');
    }
    localStorage.removeItem('X-Session-ID');
  };

  return <button onClick={handleLogout}>Logout</button>;
}
```

#### 6. Get dynamic value using custom attribute-name
```tsx
export function FilterChip({ title, values }: { title: string, values: any[] }) {
  return (
    <div 
      id="time-tracker-quick-filter-chip"
      data-chip-type={title}
      data-chip-value={JSON.stringify(values)}
    >
      {title}
    </div>
  );
}
```

#### 7. Dynamic add/track event
```tsx
export function TabSwitcher() {
  const tracker = useTracking();
  
  const handleTabChange = (newTab: string, oldTab: string) => {
    if (tracker) {
      tracker.trackEvent('results_tab_switched', {
        to_tab: newTab,
        from_tab: oldTab
      });
    }
  };
  
  return <button onClick={() => handleTabChange('Map', 'Account')}>Switch to Map</button>;
}
```

#### 8. Adding Target IDs
```tsx
function LoginButton() {
  return <button data-track-id="login-submit-btn">Login</button>;
}
```

#### 9. React Integration AI Prompt
> "Create a React `TrackingProvider` component that wraps my application. Inside it, initialize `UserEventTracker` using a `useRef` and a `useEffect` hook to ensure it runs only on the client. Use React Router's `useLocation` hook inside another `useEffect` to trigger `trackPageView(location.pathname)` whenever the route changes. Provide the tracker instance via React Context. Also, review my components and add `data-track-id` attributes to interactive elements. Provide Login and Logout flows that update `X-Session-ID` in localStorage and trigger session tracking."

---

### 4.3 Vue Integration

#### 1. Include/Install the Library
Install via NPM (if published) or include the CDN link in your `public/index.html` (or `index.html`) file inside the `<head>` tag:
```html
<script src="https://cdn.jsdelivr.net/gh/roshanpawar17/event-tracker@main/dist/event-tracker.umd.js"></script>
```

#### 2. Added Tracking Configuration
```javascript
// src/config/tracking.config.js
export const TRACKING_CONFIG = {
  apiUrl: 'https://api.yourdomain.com/track',
  batchSize: 5,
  sessionHeaderKey: 'X-Session-ID',
  getSessionId: () => localStorage.getItem('X-Session-ID'),
  
  extractDynamicProperties: (element, properties, event) => {
    if (properties.chip_type !== undefined) {
      properties.chip_type = element.getAttribute('data-chip-type') || '';
    }
    if (properties.chip_value !== undefined) {
      const attr = element.getAttribute('data-chip-value');
      try { properties.chip_value = attr ? JSON.parse(attr) : []; } catch(e) { properties.chip_value = attr || []; }
    }
  },

  buildPayload: (eventName, properties) => ({
    eventName,
    occurredAtUtc: new Date().toISOString(),
    sessionId: localStorage.getItem('X-Session-ID') || undefined,
    route: window.location.pathname,
    screenVariant: 'vue-web-app',
    properties
  }),
  
  elementEventMap: {
    'login_submitted': [{ targetId: 'login-submit-btn', properties: {} }]
  }
};
```

#### 3. Initialize the Tracker (Vue Plugin)

```javascript
// src/core/tracking/tracking-plugin.js
import { TRACKING_CONFIG } from '../../config/tracking.config';

export default {
  install(app, { router }) {
    if (typeof window === 'undefined') return;

    const EventTracker = window.EventTracker;
    if (!EventTracker) {
      console.warn('EventTracker not found on window.');
      return;
    }

    const tracker = new EventTracker.UserEventTracker(TRACKING_CONFIG);
    tracker.start();

    // Vue Router Page Tracking
    if (router) {
      router.afterEach((to) => {
        tracker.trackPageView(to.fullPath, 'screen_viewed', {});
      });
    }

    // Make available globally
    app.config.globalProperties.$tracker = tracker;
    app.provide('tracker', tracker);

    // Cleanup
    const originalUnmount = app.unmount;
    app.unmount = function () {
      tracker.stop();
      originalUnmount.apply(app, arguments);
    };
  }
};
```

#### 4. Setup in `main.js` (App Initialization)
```javascript
import { createApp } from 'vue';
import router from './router';
import TrackingPlugin from './core/tracking/tracking-plugin';
import App from './App.vue';

const app = createApp(App);
app.use(router);
app.use(TrackingPlugin, { router });
app.mount('#app');
```

#### 5. Session Management & Explicit Tracking
**Login/Logout using Options API:**
```vue
<script>
export default {
  inject: ['tracker'],
  methods: {
    login() {
      const sessionId = window.crypto?.randomUUID ? window.crypto.randomUUID() : new Date().getTime().toString();
      localStorage.setItem('X-Session-ID', sessionId);
      if (this.tracker) {
        this.tracker.trackEvent('user_logged_in', { role: 'admin' });
      }
    },
    logout() {
      if (this.tracker) {
        this.tracker.trackSessionExpired('session_ended', 'manual_logout', 'User logged out');
      }
      localStorage.removeItem('X-Session-ID');
    }
  }
}
</script>
```

#### 6. Get dynamic value using custom attribute-name
```vue
<template>
  <div 
    id="time-tracker-quick-filter-chip"
    :data-chip-type="title"
    :data-chip-value="JSON.stringify(values)"
  >
    {{ title }}
  </div>
</template>
```

#### 7. Vue Integration AI Prompt
> "Create a Vue 3 Plugin that initializes a `UserEventTracker` in the browser environment. The plugin should accept the Vue Router instance as an option and use `router.afterEach()` to track page views. Provide the tracker instance via `app.provide` and attach it to `globalProperties`. Include Login and Logout logic to manage the `X-Session-ID` in localStorage, triggering `trackSessionExpired` appropriately."

---

### 4.4 Vanilla JavaScript Integration

#### 1. CDN / Global Scope Usage
If built using Vite/Webpack as a UMD or IIFE bundle, the library exposes a global variable.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <!-- Load from CDN -->
  <script src="https://cdn.jsdelivr.net/gh/roshanpawar17/event-trackermain/dist/event-tracker.umd.js"></script>
</head>
<body>
  <button id="login-submit-btn">Login</button>
  
  <div id="quick-filter-chip" data-chip-type="Status" data-chip-value='["Active"]'>Filter</div>

  <button id="logout-btn">Logout</button>

  <script>
    document.addEventListener("DOMContentLoaded", () => {
      // Access the global variable exposed by the bundle
      const EventTracker = window.EventTracker; 
      
      if (!EventTracker) {
        console.error("Tracker not loaded!");
        return;
      }

      const config = {
        apiUrl: 'https://api.yourdomain.com/track',
        batchSize: 5,
        sessionHeaderKey: 'X-Session-ID',
        getSessionId: () => localStorage.getItem('X-Session-ID'),
        
        extractDynamicProperties: (element, properties, event) => {
          if (properties.chip_type !== undefined) {
            properties.chip_type = element.getAttribute('data-chip-type') || '';
          }
          if (properties.chip_value !== undefined) {
            const attr = element.getAttribute('data-chip-value');
            try { properties.chip_value = attr ? JSON.parse(attr) : []; } catch(e) { properties.chip_value = attr || []; }
          }
        },

        buildPayload: (eventName, properties) => ({
          eventName,
          occurredAtUtc: new Date().toISOString(),
          sessionId: localStorage.getItem('X-Session-ID') || undefined,
          route: window.location.pathname,
          screenVariant: 'vanilla-web-app',
          properties
        }),
        
        elementEventMap: {
          'login_submitted': [{ targetId: 'login-submit-btn', properties: {} }],
          'quick_filter_chip_clicked': [{ targetId: "quick-filter-chip", properties: { chip_type: '', chip_value: [] } }]
        }
      };

      const tracker = new EventTracker.UserEventTracker(config);
      tracker.start();

      // Manual Page Tracking
      tracker.trackPageView(window.location.pathname, 'screen_viewed', {});

      // Session Management Logic
      document.getElementById('login-submit-btn').addEventListener('click', () => {
        const sessionId = window.crypto?.randomUUID ? window.crypto.randomUUID() : new Date().getTime().toString();
        localStorage.setItem('X-Session-ID', sessionId);
        tracker.trackEvent('user_logged_in', { role: 'admin' });
      });

      document.getElementById('logout-btn').addEventListener('click', () => {
        tracker.trackSessionExpired('session_ended', 'manual_logout', 'User logged out');
        localStorage.removeItem('X-Session-ID');
      });
      
      // Stop tracking on unload
      window.addEventListener('beforeunload', () => tracker.stop());
    });
  </script>
</body>
</html>
```

#### 2. Vanilla JS Integration AI Prompt
> "I am working on a Vanilla JS HTML page. Please add a `<script>` tag to load the `UserEventTracker` library via CDN. Write an initialization script inside `DOMContentLoaded` that configures the tracker (with payload builders and dynamic property extractors), starts it, and tracks the initial page view. Ensure Login and Logout handlers are wired up to update `X-Session-ID` in `localStorage` and clear it using `trackSessionExpired` on logout."

---

## 5. Library Architecture Overview

The library relies on a decoupled architecture where user interactions are abstracted away from network operations.

```text
Application (Angular/React/Vue/Vanilla)
    |
    v
UserEventTracker (Central Controller)
    |
    +-- Configuration (config.js)
    +-- Page Tracker (Route changes)
    +-- User Interactivity (DOM Listeners)
    |
    v
Event Queue (SessionStorage persistence & batching logic)
    |
    v
Upload (Fetch API & Navigator.sendBeacon)
    |
    v
Tracking API Backend
```

### Complete Event Lifecycle
1. **User Action:** A user clicks an element or navigates.
2. **Event Detection:** `user-interactivity.js` intercepts the click.
3. **Event Mapping:** Looks up the element's ID in `elementEventMap`.
4. **Event Creation:** Calls `trackEvent`, which executes `buildPayload`.
5. **Event Queue:** Payload is saved to `sessionStorage` in `event-queue.js`.
6. **Batching:** Checks if the array size hits `batchSize`.
7. **Upload:** `upload.js` sends the payload with the `X-Session-ID` header.

---

## 6. Recommended Integration Flow

To successfully integrate the library, follow this exact order:

1. **Install/include the library** (NPM or CDN).
2. **Create configuration** (`tracking.config.js`) with API URLs and session logic.
3. **Initialize `UserEventTracker`** within the framework root.
4. **Start tracking** by calling `tracker.start()`.
5. **Configure page tracking** by wiring up the framework's Router.
6. **Configure event mapping** by defining `elementEventMap`.
7. **Add target IDs** (`data-track-id`) to HTML elements.
8. **Test events locally** by clicking elements and checking the browser Console.
9. **Verify event queue** by checking the Application > SessionStorage tab in DevTools.
10. **Verify API requests** by watching the Network tab for successful uploads.
11. **Test session handling** by logging in and out, verifying the `X-Session-ID` header.
12. **Test termination** by reloading the page and ensuring remaining events fire.
13. **Build production bundle** and ensure no SSR issues.
14. **Deploy/publish** the library or application.

---

## 7. Troubleshooting

| Issue | Cause | Solution |
| :--- | :--- | :--- |
| **`window.UserEventTracker is not a constructor`** | The UMD global name is different from the class name. | Check `vite.config.js` for the `name` property. Access it via `window.MyLibName.UserEventTracker`. |
| **Events not being captured** | Missing `data-track-id` or mapping. | Ensure element has the ID and it exactly matches a key in `elementEventMap`. |
| **Events stuck in queue (No network)** | Batch size not reached or API URL missing. | Lower `batchSize` to 1 for testing. Verify `apiUrl` config. |
| **Duplicate events on route change** | Multiple router subscriptions. | Ensure Router listeners in React/Angular clean up on component unmount. |
| **Session ID is null** | `getSessionId` reads too early or wrong key. | Verify the auth system sets localStorage *before* the tracker starts. |
| **Data lost on page close** | `sendBeacon` failing due to payload size. | Keep batch size small. Ensure `flushEventsOnUnload` logic isn't blocked. |

---

## 8. API Reference Summary

| API | Type | Purpose | Parameters | Returns |
| :--- | :--- | :--- | :--- | :--- |
| `UserEventTracker` | Class | Main tracking instance | `(config: object)` | Instance |
| `start()` | Method | Starts DOM listeners & timers | None | `void` |
| `stop()` | Method | Stops listeners, flushes queue | None | `void` |
| `trackEvent()` | Method | Tracks a custom event manually| `(eventName: string, props: object)` | `void` |
| `trackPageView()` | Method | Tracks a screen view | `(route: string, eventName?: string, props?: object)`| `void` |
| `trackSessionExpired()` | Method | Flush queue on logout | `(eventName: string, reason: string, msg: string)`| `void` |
| `DEFAULT_TRACKING_CONFIG`| Object | Core defaults | N/A | Object |

---

*Documentation maintained for Event Tracker Library v1.x. Always inspect the source code `config.js` for the latest payload and property mappings.*

---

## 9. Github Deployment Guide: Standalone User Event Tracking Library

This guide outlines the exact step-by-step flow to extract your framework-agnostic `tracking/core/` folder, package it, and deploy it to **GitHub for testing and validation** before officially publishing it to an NPM registry. 

This approach allows you to verify that the library can be consumed by other projects via both **NPM package imports** (React, Angular, Vue) and **CDN Script tags** (Vanilla JS).

---

## Step 1: Create a New Standalone Project
You need to separate the core library from the Angular frontend.

1. Create a new folder outside of your Angular project:
   ```bash
   mkdir user-event-tracker
   cd user-event-tracker
   ```
2. Initialize a new Node project:
   ```bash
   npm init -y
   ```
3. Copy your core JavaScript tracking files into this new project:
   * Create a `src/` folder.
   * Copy `config.js`, `event-queue.js`, `event-tracker.js`, `page-tracker.js`, `upload.js`, `user-interactivity.js`, and `index.js` into this `src/` folder.

---

## Step 2: Install a Bundler (Vite)
We will use **Vite** to bundle the JavaScript library into different formats.

```bash
npm install -D vite
```

## Step 3: Configure Vite for "Library Mode"
Create a file named `vite.config.js` in the root of the project to generate both **ES** (NPM imports) and **UMD** (CDN scripts) formats.

```javascript
// vite.config.js
import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/index.js'),
      name: 'TrackingLibrary', // Exposes the library module to the window object via CDN
      fileName: (format) => `user-event-tracker.${format}.js`
    },
    rollupOptions: {
      external: [],
      output: {
        globals: {}
      }
    }
  }
});
```

---

## Step 4: Configure `package.json` for Distribution
Ensure NPM knows where to find the generated files. Update your `package.json`:

```json
{
  "name": "user-event-tracker",
  "version": "1.0.0",
  "main": "./dist/user-event-tracker.umd.js",
  "module": "./dist/user-event-tracker.es.js",
  "exports": {
    ".": {
      "import": "./dist/user-event-tracker.es.js",
      "require": "./dist/user-event-tracker.umd.js"
    }
  },
  "scripts": {
    "build": "vite build"
  }
}
```

---

## Step 5: Build for Production
Run the build script:
```bash
npm run build
```
Vite will create a `dist/` folder containing `user-event-tracker.es.js` and `user-event-tracker.umd.js`.

**CRITICAL GITHUB STEP:** By default, Node projects ignore the `dist/` folder. Because we are using GitHub to host the package for testing, **you must ensure `dist/` is committed to git.** If you have a `.gitignore` file, verify that `dist` is not listed inside it.

---

## Step 6: Deploying to GitHub

1. Initialize a git repository and commit your files:
   ```bash
   git init
   git add .
   git commit -m "Initial release of tracking library"
   ```
2. Create a new repository on GitHub (e.g., `your-org/user-event-tracker`).
3. Push your code to GitHub:
   ```bash
   git remote add origin https://github.com/your-org/user-event-tracker.git
   git branch -M main
   git push -u origin main
   ```

---

## Step 7: Testing Integration (Consuming the Library)

Now that the code is on GitHub, you can test both the Package Import and CDN approaches in completely different testing projects.

### Approach 1: Testing as an NPM Package (Angular / React / Vue)
You can install an NPM package directly from a GitHub repository URL instead of the NPM registry.

**1. Install the library in your test project:**
```bash
# Replace 'your-org' and 'user-event-tracker' with your actual GitHub details
npm install github:your-org/user-event-tracker
```

**2. Example Usage (React/Vue/Angular):**
```javascript
// Import it just like a normal NPM dependency
import { UserEventTracker } from 'user-event-tracker';

// Define the full configuration matching your core library expectations
const config = { 
  apiUrl: 'https://api.yourdomain.com/track',
  batchSize: 5,
  sessionHeaderKey: 'X-Session-ID',
  getSessionId: () => localStorage.getItem('X-Session-ID'),
  buildPayload: (eventName, properties) => ({
    eventName: eventName,
    occurredAtUtc: new Date().toISOString(),
    sessionId: localStorage.getItem('X-Session-ID') || undefined,
    route: window.location.pathname,
    screenVariant: 'test-app',
    properties: properties
  }),
  elementEventMap: {
    'test_button_clicked': [{ targetId: 'test-button', properties: {} }]
  }
};

// Create and initialize the tracker instance
const tracker = new UserEventTracker(config);
tracker.start();

// Track custom events programmatically
tracker.trackEvent('test_event', { property: 'value' });
```

### Approach 2: Testing via CDN Script Link (Vanilla HTML/JS)
You can use `jsDelivr` to automatically serve files directly from your GitHub repository as a high-speed CDN. This proves it works for zero-build environments.

**1. Example Usage (Vanilla HTML):**
Create an `index.html` file anywhere and include the following:

```html
<!DOCTYPE html>
<html>
<head>
  <!-- Load the UMD file directly from your GitHub repo using jsDelivr -->
  <!-- Format: https://cdn.jsdelivr.net/gh/USERNAME/REPO@BRANCH/PATH_TO_FILE -->
  <script src="https://cdn.jsdelivr.net/gh/your-org/user-event-tracker@main/dist/user-event-tracker.umd.js"></script>
</head>
<body>
  <!-- Element automatically tracked by elementEventMap -->
  <button data-track-id="test-button">Click Me to test Tracking</button>

  <script>
    // Define the full configuration matching your core library expectations
    const config = { 
      apiUrl: 'https://api.yourdomain.com/track',
      batchSize: 5,
      sessionHeaderKey: 'X-Session-ID',
      getSessionId: () => localStorage.getItem('X-Session-ID'),
      buildPayload: (eventName, properties) => ({
        eventName: eventName,
        occurredAtUtc: new Date().toISOString(),
        sessionId: localStorage.getItem('X-Session-ID') || undefined,
        route: window.location.pathname,
        screenVariant: 'cdn-test-app',
        properties: properties
      }),
      elementEventMap: {
        'test_button_clicked': [{ targetId: 'test-button', properties: { button: '' } }]
      }
    };
    
    // Because of the UMD format, 'TrackingLibrary' is available globally on the window object.
    // We instantiate the UserEventTracker class exported inside that module.
    const tracker = new window.TrackingLibrary.UserEventTracker(config);
    tracker.start();
  </script>
</body>
</html>
```

---

## Step 8: Troubleshooting GitHub Deployments

If you run into issues while testing the GitHub-hosted library, check the following:

* **Error: "Module not found" when importing in React/Angular**
  * **Cause:** The `dist/` folder was likely not pushed to GitHub.
  * **Fix:** Check your `.gitignore` in the tracking library repository. Ensure `dist/` is NOT ignored. Rebuild (`npm run build`), commit, and push. Then run `npm install` again in your test project.
* **Error: "window.UserEventTracker is not a constructor" in Vanilla HTML**
  * **Cause:** Vite bundles multiple exports (like `UserEventTracker` and `DEFAULT_TRACKING_CONFIG`) into a single global module object.
  * **Fix:** Ensure your `vite.config.js` sets `name: 'TrackingLibrary'`. Then in your HTML, call `new window.TrackingLibrary.UserEventTracker(config)`.
* **Changes aren't reflecting after pushing an update**
  * **NPM Cache:** When updating a GitHub package, NPM might cache the old version. Run `npm install github:your-org/user-event-tracker#main` to force pull the latest commit from the main branch.
  * **CDN Cache:** jsDelivr caches files aggressively. To test the very latest changes without waiting for the cache to clear, use the specific commit hash in the URL instead of `@main` (e.g., `.../user-event-tracker@a1b2c3d/dist/...`).

---

## 10. NPM Publish Deployment Guide: Standalone User Event Tracking Library

This guide outlines the exact step-by-step flow to extract your framework-agnostic `tracking/core/` folder from the Angular project, package it, and distribute it so it can be used both as an **NPM package** (for modern frameworks) and a **CDN Script** (for Vanilla HTML).

---

## Step 1: Create a New Standalone Project
You need to separate the core library from the Angular frontend so it has its own version control and build process.

1. Create a new folder outside of your Angular project:
   ```bash
   mkdir user-event-tracker
   cd user-event-tracker
   ```
2. Initialize a new Node project:
   ```bash
   npm init -y
   ```
3. Copy your core JavaScript tracking files into this new project:
   * Create a `src/` folder.
   * Copy `config.js`, `event-queue.js`, `event-tracker.js`, `page-tracker.js`, `upload.js`, `user-interactivity.js`, and `index.js` into this `src/` folder.

---

## Step 2: Install a Bundler (Vite)
We will use **Vite**, which is currently the fastest and easiest tool to bundle JavaScript libraries.

1. Install Vite as a dev dependency:
   ```bash
   npm install -D vite
   ```

## Step 3: Configure Vite for "Library Mode"
Vite needs to know that you are building a library for other developers, not a website.

1. Create a file named `vite.config.js` in the root of the new project.
2. Add the following configuration. This tells Vite to generate both an **ES** format (for NPM imports) and a **UMD** format (for CDN scripts).

```javascript
// vite.config.js
import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/index.js'),
      name: 'UserEventTracker', // The global variable name attached to the window object via CDN
      fileName: (format) => `user-event-tracker.${format}.js`
    },
    rollupOptions: {
      // If your library relied on external dependencies like lodash (it doesn't currently), you would list them here so they aren't bundled into your code.
      external: [],
      output: {
        globals: {}
      }
    }
  }
});
```

---

## Step 4: Configure `package.json` for Distribution
You must tell NPM where to find the generated files so that when developers install your package, their frameworks know which file to load.

Modify your `package.json` to include these fields:

```json
{
  "name": "@your-company/user-event-tracker",
  "version": "1.0.0",
  "description": "Framework-agnostic user event tracking library",
  "main": "./dist/user-event-tracker.umd.js",
  "module": "./dist/user-event-tracker.es.js",
  "unpkg": "./dist/user-event-tracker.umd.js",
  "exports": {
    ".": {
      "import": "./dist/user-event-tracker.es.js",
      "require": "./dist/user-event-tracker.umd.js"
    }
  },
  "scripts": {
    "build": "vite build"
  },
  "files": [
    "dist"
  ],
  "author": "Your Company",
  "license": "MIT"
}
```

---

## Step 5: Build the Library
Run the build script:
```bash
npm run build
```
Vite will create a `dist/` folder containing two files:
1. `user-event-tracker.es.js` (Optimized for React/Angular/Vue imports).
2. `user-event-tracker.umd.js` (Optimized for `<script>` tag inclusion).

---

## Step 6: Deployment (NPM Package Approach)
To allow projects to `npm install` your library, you need to publish it to a package registry (like NPM, GitHub Packages, or Azure Artifacts).

1. Log in to your NPM registry:
   ```bash
   npm login
   ```
2. Publish the package:
   ```bash
   npm publish --access public
   ```
   *(Note: If you use a private company registry, you will publish it there instead).*

**How Developers Use It:**
```bash
npm install @your-company/user-event-tracker
```
```javascript
import { UserEventTracker } from '@your-company/user-event-tracker';
const tracker = new UserEventTracker({ apiUrl: '...' });
tracker.start();
```

---

## Step 7: Deployment (CDN Script Tag Approach)

### Option A: Automatic CDN (The easiest way)
Once you publish your package to the public NPM registry (Step 6), it is **automatically available** on global CDN services like `unpkg` or `jsdelivr`. You don't have to do any extra work!

**How Developers Use It:**
```html
<!-- Loads the "unpkg" property defined in package.json (which points to the UMD file) -->
<script src="https://unpkg.com/@your-company/user-event-tracker@1.0.0"></script>

<script>
  // The 'name' property in vite.config.js exposes UserEventTracker globally
  const tracker = new window.UserEventTracker({ apiUrl: '...' });
  tracker.start();
</script>
```

### Option B: Manual CDN Hosting (AWS S3, Azure Blob, etc.)
If your package is private and you cannot publish to public NPM, you must manually host the `UMD` file.

1. Take the `dist/user-event-tracker.umd.js` file generated in Step 5.
2. Upload it to an AWS S3 Bucket, Azure Blob Storage, or your own web server.
3. Ensure the file has public read access.

**How Developers Use It:**
```html
<script src="https://your-company-storage.com/assets/user-event-tracker.umd.js"></script>

<script>
  const tracker = new window.UserEventTracker({ apiUrl: '...' });
  tracker.start();
</script>
```
