# Authentication Middleware Guide

## 🔐 Primary Authentication System: JWT

**USE THIS FOR ALL NEW ROUTES:** `authenticateJWT` from `jwtAuth.js`

```javascript
const { authenticateJWT } = require("../middleware/jwtAuth");

router.get("/your-endpoint", authenticateJWT, async (req, res) => {
  // req.user contains the full user object from database
  // req.tokenPayload contains JWT payload
});
```

### Why JWT Authentication?

- ✅ **Consistent**: All Flutter app requests use JWT tokens
- ✅ **Secure**: Custom tokens with refresh capability
- ✅ **Controlled**: We manage token lifecycle
- ✅ **Complete**: Provides full user object in `req.user`

## 🚫 Legacy System: Firebase Tokens

**AVOID UNLESS NECESSARY:** `authenticateToken` from `auth.js`

This is only for:

- Token exchange endpoints (`/api/token/exchange`)
- Firebase-specific operations
- Legacy routes being migrated

## 📋 Migration Checklist

When updating existing routes:

1. Change `authenticateToken` → `authenticateJWT`
2. Remove `requireSyncedUser` (JWT already loads user)
3. Import from `jwtAuth.js` instead of `auth.js`
4. Test with Flutter app JWT tokens

## 🔄 Token Flow

1. **Login**: Firebase → `/api/token/exchange` → JWT tokens
2. **API Calls**: Flutter sends JWT → `authenticateJWT` validates
3. **Refresh**: Automatic via `TokenAuthService`

## 📝 Examples

### ✅ Correct (JWT)

```javascript
const { authenticateJWT } = require("../middleware/jwtAuth");
router.get("/users/following", authenticateJWT, async (req, res) => {
  const { user } = req; // Full user object available
});
```

### ❌ Incorrect (Firebase)

```javascript
const { authenticateToken, requireSyncedUser } = require("../middleware/auth");
router.get(
  "/endpoint",
  authenticateToken,
  requireSyncedUser,
  async (req, res) => {
    // Don't use this pattern for new routes
  }
);
```
