# 🎯 Experience Points (XP) System Guide

## Overview
The XP system rewards users for various activities in the app. MVP users receive **2x XP boost** on all activities.

## How to Award XP

Use the `addExperience()` method on any User model instance:

```javascript
await user.addExperience(50); // Adds 50 XP (or 100 XP if user has MVP)
```

## Recommended XP Values by Activity

### **Social Activities**
- ✅ **Create Post**: 10 XP
- ✅ **Like Post**: 2 XP
- ✅ **Comment on Post**: 5 XP
- ✅ **Share Post**: 8 XP
- ✅ **Follow User**: 5 XP
- ✅ **Get Followed**: 3 XP

### **Live Streaming**
- ✅ **Start Live Stream**: 20 XP
- ✅ **Complete 30min Stream**: 50 XP
- ✅ **Complete 1hr Stream**: 100 XP
- ✅ **Receive Gift**: 5-50 XP (based on gift value)
- ✅ **Send Gift**: 3 XP

### **Chat & Messaging**
- ✅ **Send Message**: 1 XP
- ✅ **Voice Call (per minute)**: 2 XP
- ✅ **Video Call (per minute)**: 3 XP

### **Engagement**
- ✅ **Daily Login**: 10 XP
- ✅ **Complete Profile**: 50 XP
- ✅ **Upload Story**: 8 XP
- ✅ **View Story**: 1 XP

### **Premium Actions**
- ✅ **Purchase VIP**: 100 XP
- ✅ **Purchase MVP**: 150 XP
- ✅ **Become Guardian**: 200 XP

## Implementation Examples

### Example 1: Award XP for Creating a Post
```javascript
// In routes/posts.js
router.post("/", authenticateToken, requireSyncedUser, async (req, res) => {
  try {
    // ... create post logic ...
    
    // Award XP
    await req.user.addExperience(10);
    
    res.json({ success: true, post });
  } catch (error) {
    // ... error handling ...
  }
});
```

### Example 2: Award XP for Completing a Live Stream
```javascript
// In routes/live.js
router.post("/:liveId/end", authenticateToken, requireSyncedUser, async (req, res) => {
  try {
    const liveStream = await LiveStream.findById(req.params.liveId);
    
    // Calculate duration
    const durationMinutes = moment(Date.now()).diff(moment(liveStream.createdAt), 'minutes');
    
    // Award XP based on duration
    let xp = 20; // Base XP for starting
    if (durationMinutes >= 60) {
      xp += 100; // 1 hour bonus
    } else if (durationMinutes >= 30) {
      xp += 50; // 30 min bonus
    }
    
    await req.user.addExperience(xp);
    
    res.json({ success: true });
  } catch (error) {
    // ... error handling ...
  }
});
```

### Example 3: Award XP for Receiving a Gift
```javascript
// In routes/gifts.js or socket events
router.post("/send", authenticateToken, requireSyncedUser, async (req, res) => {
  try {
    // ... gift sending logic ...
    
    // Award XP to sender
    await req.user.addExperience(3);
    
    // Award XP to receiver (based on gift value)
    const receiver = await User.findById(req.body.receiverId);
    const xpForReceiver = Math.min(Math.floor(gift.weight / 100), 50); // Max 50 XP
    await receiver.addExperience(xpForReceiver);
    
    res.json({ success: true });
  } catch (error) {
    // ... error handling ...
  }
});
```

## MVP 2x Boost

The `addExperience()` method automatically checks if the user has an active MVP subscription and applies the 2x multiplier:

```javascript
// User without MVP
await user.addExperience(50); // Adds 50 XP

// User with MVP
await user.addExperience(50); // Adds 100 XP (2x boost)
```

## Checking XP

To check a user's current XP:

```javascript
const currentXP = user.gamification.experiencePoints;
console.log(`User has ${currentXP} XP`);
```

## Level System (Future Enhancement)

You can implement a level system based on XP thresholds:

```javascript
function calculateLevel(xp) {
  const levels = [
    { level: 1, xp: 0 },
    { level: 2, xp: 100 },
    { level: 3, xp: 300 },
    { level: 4, xp: 600 },
    { level: 5, xp: 1000 },
    // ... more levels
  ];
  
  for (let i = levels.length - 1; i >= 0; i--) {
    if (xp >= levels[i].xp) {
      return levels[i].level;
    }
  }
  return 1;
}
```

## Notes

- XP is stored in `user.gamification.experiencePoints`
- XP is always positive (cannot be negative)
- MVP boost is applied automatically
- XP persists across sessions
- Consider adding XP rewards to your app's UI to gamify user engagement

## TODO: Implement XP Rewards

Add `await user.addExperience(xp)` calls to the following routes:

1. ✅ **Posts**: Create, Like, Comment
2. ✅ **Live Streaming**: Start, End, Gift
3. ✅ **Social**: Follow, Message
4. ✅ **Daily Login**: Auth route
5. ✅ **Profile**: Complete profile

---

**Remember**: The more activities you reward with XP, the more engaged your users will be! 🎮

