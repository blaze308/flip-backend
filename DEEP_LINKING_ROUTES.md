# Deep Linking Backend Routes Setup

## ✅ What Was Added

Two new routes have been added to `routes/deeplinks.js` to serve the app links configuration files required for deep linking to work on mobile devices.

## 📍 Routes Created

### 1. Android App Links Configuration
**Endpoint:** `GET /.well-known/assetlinks.json`
**Content-Type:** `application/json`

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "ancientplustech.ancient.flip",
    "sha256_cert_fingerprints": [
      "60:A4:63:12:61:2E:73:53:C5:D9:84:43:B3:38:12:14:2C:F6:F2:0D:0F:CA:60:D7:46:46:C7:C8:95:18:71:91"
    ]
  }
}]
```

**Why:** Android uses this file to verify that your app is allowed to handle URLs from your domain.

### 2. iOS Universal Links Configuration
**Endpoint:** `GET /.well-known/apple-app-site-association`
**Content-Type:** `application/json`

```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "TEAM_ID.ancientplustech.ancient.flip",
        "paths": ["/post/*", "/reel/*", "/user/*", "/profile/*"]
      }
    ]
  }
}
```

**Why:** iOS uses this file to verify that your app is allowed to handle Universal Links from your domain.

## 🚀 How It Works

### Flow for User Clicking a Shared Link:

1. **User receives link:** `https://flip-backend-mnpg.onrender.com/post/abc123`
2. **User clicks link on mobile**
3. **Device verification (Android):**
   - Android downloads `/.well-known/assetlinks.json`
   - Verifies the domain and certificate fingerprint match
   - If verified ✅ → Opens app with deep link
   - If not verified ❌ → Opens in browser instead
4. **Device verification (iOS):**
   - iOS downloads `/.well-known/apple-app-site-association`
   - Verifies the domain and app ID match
   - If verified ✅ → Opens app with deep link
   - If not verified ❌ → Opens in browser instead

## ⚠️ Important: Configuration Required

### For Android:
The SHA256 certificate fingerprint in `assetlinks.json` MUST match your app's signing certificate.

To get your app's SHA256 fingerprint:
```bash
# For debug key
keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android

# For release key
keytool -list -v -keystore /path/to/your/release.keystore -alias your_alias
```

The fingerprint shown will look like: `AA:BB:CC:DD:...` - this is what should be in the JSON.

### For iOS:
Replace `TEAM_ID` with your actual Apple Team ID from [Apple Developer Account](https://developer.apple.com/account/)

Your Team ID is found here:
1. Go to https://developer.apple.com/account/
2. Click "Membership" on the left sidebar
3. Look for "Team ID" in the section

Then update the `assetlinks.json` file with your actual Team ID.

## 🧪 Testing the Routes

### Test Android Configuration:
```bash
curl -i https://flip-backend-mnpg.onrender.com/.well-known/assetlinks.json
```

Expected response: `200 OK` with the JSON content

### Test iOS Configuration:
```bash
curl -i https://flip-backend-mnpg.onrender.com/.well-known/apple-app-site-association
```

Expected response: `200 OK` with the JSON content

## 🔍 Verify on Real Device

### Android Device:
```bash
adb logcat | grep "applinks"
# You should see verification logs when opening a link
```

### iOS Device:
Open the shared link in Safari on an iOS device with your app installed. The app should open automatically.

## 📊 Current Deep Link Routes

| Route | Purpose | Status |
|-------|---------|--------|
| `GET /.well-known/assetlinks.json` | Android verification | ✅ Active |
| `GET /.well-known/apple-app-site-association` | iOS verification | ✅ Active |
| `GET /post/:postId` | Post deep link | ✅ Active |
| `GET /reel/:reelId` | Reel deep link | ✅ Active |
| `GET /user/:userId` | User profile deep link | ✅ Active |

## 🔗 Link Format Examples

When user shares a post, these links are generated:
```
https://flip-backend-mnpg.onrender.com/post/abc123?author=username&utm_source=share&utm_medium=app
```

## 📝 Server Integration

The routes are automatically mounted in `server.js`:
```javascript
// Deep link routes (public, no auth required) - must be before API routes
app.use("/", deepLinkRoutes);
```

This means they're accessible at the root path of your backend.

## 🆘 Troubleshooting

### Links not opening the app?
1. ✅ Verify the `.well-known/assetlinks.json` endpoint returns status 200
2. ✅ Verify the `.well-known/apple-app-site-association` endpoint returns status 200
3. ✅ Check that the SHA256 fingerprint matches your app's certificate (Android)
4. ✅ Check that Team ID is correct (iOS)
5. ✅ Wait 24-48 hours for Apple to cache the configuration (iOS)

### Getting 404 errors?
1. Make sure the backend is deployed
2. Verify the routes are added to `routes/deeplinks.js`
3. Verify the routes are imported in `server.js` with `app.use("/", deepLinkRoutes)`

### Getting 403 errors?
Check if CORS or security middleware is blocking `.well-known` routes. These should be public.

## 📚 Additional Resources

- [Android App Links](https://developer.android.com/training/app-links)
- [iOS Universal Links](https://developer.apple.com/ios/universal-links/)
- [Deep Linking Best Practices](https://en.wikipedia.org/wiki/Deep_linking)
