# Deployment Guide: Standalone User Event Tracking Library

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

