# Deployment Guide: Standalone User Event Tracking Library

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

