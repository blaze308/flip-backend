# Backend Setup for Deep Linking

## 🎯 Overview

This guide shows how to configure your Node.js/Express backend to serve the deep linking web files.

---

## 📁 Files to Copy

Copy these files from `flip/web/` to your backend:

```
backend/
├── web/
│   ├── .well-known/
│   │   ├── assetlinks.json
│   │   └── apple-app-site-association
│   ├── index.html
│   ├── favicon.png
│   ├── manifest.json
│   └── icons/
│       ├── Icon-192.png
│       ├── Icon-512.png
│       ├── Icon-maskable-192.png
│       └── Icon-maskable-512.png
```

---

## 🔧 Express.js Configuration

Add this to your `backend/server.js`:

```javascript
const express = require('express');
const path = require('path');
const app = express();

// ... your existing middleware ...

// ============================================
// DEEP LINKING CONFIGURATION
// ============================================

// Serve static files from web directory
app.use(express.static(path.join(__dirname, 'web')));

// Serve Android App Links verification file
app.get('/.well-known/assetlinks.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.sendFile(path.join(__dirname, 'web/.well-known/assetlinks.json'));
});

// Serve iOS Universal Links verification file
app.get('/.well-known/apple-app-site-association', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.sendFile(path.join(__dirname, 'web/.well-known/apple-app-site-association'));
});

// Deep link routes - redirect to index.html for client-side handling
const deepLinkRoutes = ['/post/:id', '/reel/:id', '/user/:id', '/profile/:id'];

deepLinkRoutes.forEach(route => {
  app.get(route, (req, res) => {
    res.sendFile(path.join(__dirname, 'web/index.html'));
  });
});

// ============================================
// YOUR EXISTING API ROUTES
// ============================================

// ... your existing routes ...

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🔗 Deep linking enabled at:`);
  console.log(`   - https://flip-backend-mnpg.onrender.com/.well-known/assetlinks.json`);
  console.log(`   - https://flip-backend-mnpg.onrender.com/.well-known/apple-app-site-association`);
});
```

---

## 📝 Alternative: Separate Routes File

If you prefer to keep routes organized, create `backend/routes/deeplinks.js`:

```javascript
const express = require('express');
const path = require('path');
const router = express.Router();

// Serve Android App Links verification
router.get('/.well-known/assetlinks.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.sendFile(path.join(__dirname, '../web/.well-known/assetlinks.json'));
});

// Serve iOS Universal Links verification
router.get('/.well-known/apple-app-site-association', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.sendFile(path.join(__dirname, '../web/.well-known/apple-app-site-association'));
});

// Deep link routes
const deepLinkPaths = ['/post/:id', '/reel/:id', '/user/:id', '/profile/:id'];

deepLinkPaths.forEach(path => {
  router.get(path, (req, res) => {
    res.sendFile(path.join(__dirname, '../web/index.html'));
  });
});

module.exports = router;
```

Then in `server.js`:
```javascript
const deepLinkRoutes = require('./routes/deeplinks');

// Static files
app.use(express.static(path.join(__dirname, 'web')));

// Deep linking routes
app.use(deepLinkRoutes);
```

---

## 🔍 Verify Setup

After deploying, test these URLs:

```bash
# 1. Test Android verification file
curl https://flip-backend-mnpg.onrender.com/.well-known/assetlinks.json

# Expected: JSON response with package name and fingerprint

# 2. Test iOS verification file
curl https://flip-backend-mnpg.onrender.com/.well-known/apple-app-site-association

# Expected: JSON response with appID and paths

# 3. Test post route
curl https://flip-backend-mnpg.onrender.com/post/test123

# Expected: HTML content of index.html

# 4. Test reel route
curl https://flip-backend-mnpg.onrender.com/reel/test456

# Expected: HTML content of index.html
```

---

## 🚨 Important Notes

### 1. Route Order Matters

Place deep linking routes **BEFORE** catch-all routes:

```javascript
// ✅ CORRECT ORDER
app.use(express.static('web'));
app.get('/.well-known/*', ...);
app.get('/post/:id', ...);
app.get('/reel/:id', ...);
app.use('/api', apiRoutes);  // API routes
app.get('*', notFoundHandler);  // Catch-all (404)

// ❌ WRONG ORDER
app.get('*', notFoundHandler);  // This catches everything!
app.get('/post/:id', ...);  // Never reached
```

### 2. CORS Headers

If needed, add CORS headers for verification files:

```javascript
app.get('/.well-known/assetlinks.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.sendFile(path.join(__dirname, 'web/.well-known/assetlinks.json'));
});
```

### 3. Cache Headers

For verification files, you might want to set cache headers:

```javascript
app.get('/.well-known/assetlinks.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
  res.sendFile(path.join(__dirname, 'web/.well-known/assetlinks.json'));
});
```

---

## 📦 Render.com Specific Configuration

If deploying to Render.com, ensure your `render.yaml` includes:

```yaml
services:
  - type: web
    name: flip-backend
    env: node
    buildCommand: npm install
    startCommand: node server.js
    envVars:
      - key: NODE_ENV
        value: production
```

---

## 🔐 Security Considerations

### 1. Validate Post IDs

In your API routes, validate post IDs:

```javascript
app.get('/api/posts/:postId', async (req, res) => {
  const { postId } = req.params;
  
  // Validate post ID format
  if (!postId || postId.length > 100) {
    return res.status(400).json({ error: 'Invalid post ID' });
  }
  
  // ... fetch post from database ...
});
```

### 2. Rate Limiting

Add rate limiting to prevent abuse:

```javascript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

app.use('/api/', limiter);
```

### 3. HTTPS Only

Ensure your server redirects HTTP to HTTPS:

```javascript
app.use((req, res, next) => {
  if (req.header('x-forwarded-proto') !== 'https' && process.env.NODE_ENV === 'production') {
    res.redirect(`https://${req.header('host')}${req.url}`);
  } else {
    next();
  }
});
```

---

## 🧪 Testing Locally

### 1. Start your backend:
```bash
cd backend
npm start
```

### 2. Test endpoints:
```bash
# Test verification file
curl http://localhost:3000/.well-known/assetlinks.json

# Test post route
curl http://localhost:3000/post/test123

# Should return HTML content
```

### 3. Test with ngrok (for mobile testing):
```bash
# Install ngrok: https://ngrok.com/
ngrok http 3000

# Use the ngrok URL for testing:
# https://abc123.ngrok.io/post/test123
```

---

## 📊 Monitoring

Add logging for deep link requests:

```javascript
app.get(['/post/:id', '/reel/:id'], (req, res) => {
  const { id } = req.params;
  const userAgent = req.get('User-Agent');
  
  console.log(`🔗 Deep link accessed: ${req.path}`);
  console.log(`   ID: ${id}`);
  console.log(`   User-Agent: ${userAgent}`);
  console.log(`   IP: ${req.ip}`);
  
  res.sendFile(path.join(__dirname, 'web/index.html'));
});
```

---

## 🚀 Deployment Checklist

Before deploying:

- [ ] Web files copied to backend
- [ ] SHA-256 fingerprint added to assetlinks.json
- [ ] Routes configured in server.js
- [ ] Static file serving enabled
- [ ] HTTPS redirect configured
- [ ] Tested locally with curl
- [ ] Committed to Git
- [ ] Deployed to Render
- [ ] Tested production URLs

---

## 🔄 Update Process

When updating deep linking:

1. Update files in `flip/web/`
2. Copy updated files to `backend/web/`
3. Commit changes
4. Deploy to Render
5. Test verification files are accessible
6. Test deep links with ADB

---

## 📝 Example Complete server.js

Here's a minimal complete example:

```javascript
const express = require('express');
const path = require('path');
const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files for deep linking
app.use(express.static(path.join(__dirname, 'web')));

// Verification files
app.get('/.well-known/assetlinks.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.sendFile(path.join(__dirname, 'web/.well-known/assetlinks.json'));
});

app.get('/.well-known/apple-app-site-association', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.sendFile(path.join(__dirname, 'web/.well-known/apple-app-site-association'));
});

// Deep link routes
app.get(['/post/:id', '/reel/:id', '/user/:id', '/profile/:id'], (req, res) => {
  res.sendFile(path.join(__dirname, 'web/index.html'));
});

// API routes
app.use('/api', require('./routes/api'));

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
```

---

## 🆘 Troubleshooting

### Issue: 404 on verification files

**Check:**
1. Files exist in `backend/web/.well-known/`
2. Routes are defined before catch-all routes
3. Static file serving is enabled
4. File paths are correct

### Issue: HTML not served for deep links

**Check:**
1. Routes are defined correctly
2. `index.html` exists in `backend/web/`
3. Path.join is using correct directory
4. No conflicting API routes

### Issue: MIME type errors

**Solution:**
```javascript
app.get('/.well-known/assetlinks.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.sendFile(...);
});
```

---

## ✅ Success Indicators

You'll know it's working when:

1. ✅ `curl` returns JSON for verification files
2. ✅ `curl` returns HTML for post/reel routes
3. ✅ No 404 errors in browser
4. ✅ Android App Links verification passes
5. ✅ Deep links open app on mobile device

---

**Test Command:**
```bash
curl https://flip-backend-mnpg.onrender.com/.well-known/assetlinks.json
```

Should return JSON, not 404!

