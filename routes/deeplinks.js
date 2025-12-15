const express = require("express");
const Post = require("../models/Post");
const User = require("../models/User");
const router = express.Router();

/**
 * Deep Link Routes for Rich Link Previews
 * These routes serve HTML pages with Open Graph meta tags for social sharing
 */

/**
 * @route   GET /.well-known/assetlinks.json
 * @desc    Serve Android app links configuration for deep linking
 *          Required for Android App Links verification
 *          When user clicks a link, Android will verify this file to open the app
 * @access  Public
 */
router.get("/.well-known/assetlinks.json", (req, res) => {
  console.log(
    "📱 Android App Links config requested from:",
    req.ip,
    "User-Agent:",
    req.get("User-Agent")
  );

  const assetlinks = [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: "ancientplustech.ancient.flip",
        // This SHA256 fingerprint must match the app's signing certificate
        sha256_cert_fingerprints: [
          "60:A4:63:12:61:2E:73:53:C5:D9:84:43:B3:38:12:14:2C:F6:F2:0D:0F:CA:60:D7:46:46:C7:C8:95:18:71:91",
        ],
      },
    },
  ];

  // Set correct content type
  res.set("Content-Type", "application/json");
  res.json(assetlinks);
});

/**
 * @route   GET /.well-known/apple-app-site-association
 * @desc    Serve iOS app links configuration for deep linking
 *          Required for Universal Links verification
 *          When user clicks a link, iOS will verify this file to open the app
 * @access  Public
 */
router.get("/.well-known/apple-app-site-association", (req, res) => {
  console.log(
    "🍎 iOS App Site Association requested from:",
    req.ip,
    "User-Agent:",
    req.get("User-Agent")
  );

  const appSiteAssociation = {
    applinks: {
      apps: [],
      details: [
        {
          // Replace TEAM_ID with your actual Apple Team ID from Apple Developer Account
          appID: "TEAM_ID.ancientplustech.ancient.flip",
          // These paths will be handled by the app instead of the browser
          paths: ["/post/*", "/reel/*", "/user/*", "/profile/*"],
        },
      ],
    },
  };

  // Set correct content type
  res.set("Content-Type", "application/json");
  res.json(appSiteAssociation);
});

/**
 * @route   GET /post/:postId
 * @desc    Serve post deep link with Open Graph meta tags
 * @access  Public
 */
router.get("/post/:postId", async (req, res) => {
  try {
    const { postId } = req.params;
    console.log("📱 Fetching post with ID:", postId);

    // Fetch post data - try by ID first, then by custom ID field
    let post = await Post.findById(postId);

    // If not found by MongoDB ID, try finding by custom post ID
    if (!post) {
      post = await Post.findOne({ id: postId });
    }

    if (!post) {
      console.log("❌ Post not found with ID:", postId);
      return res.status(404).send(generateErrorPage("Post not found"));
    }
    
    console.log("✅ Post found:", post._id);

    // Get author name from the post data
    const authorName = post.username || post.author?.displayName || post.author?.name || "Unknown User";
    const content = post.content || post.caption || "";
    const imageUrl = post.images?.[0] || post.thumbnail || post.profileImage || "";
    const appUrl = process.env.APP_URL || "https://flip.app";

    const html = generateOpenGraphHTML({
      title: `${authorName} on Flip`,
      description: content.substring(0, 200) || "Check out this post on Flip!",
      image: imageUrl,
      url: `${appUrl}/post/${postId}`,
      type: "article",
      appName: "Flip",
      appStoreUrl:
        process.env.APP_STORE_URL || "https://apps.apple.com/app/flip",
      playStoreUrl:
        process.env.PLAY_STORE_URL ||
        "https://play.google.com/store/apps/details?id=com.flip.app",
    });

    res.send(html);
  } catch (error) {
    console.error("Error serving post deep link:", error);
    res.status(500).send(generateErrorPage("Failed to load post"));
  }
});

/**
 * @route   GET /reel/:reelId
 * @desc    Serve reel deep link with Open Graph meta tags
 * @access  Public
 */
router.get("/reel/:reelId", async (req, res) => {
  try {
    const { reelId } = req.params;

    // Fetch reel/post data (assuming reels are stored as posts with video)
    const reel = await Post.findById(reelId).populate(
      "author",
      "displayName profile.username photoURL"
    );

    if (!reel) {
      return res.status(404).send(generateErrorPage("Reel not found"));
    }

    const authorName =
      reel.author.displayName ||
      reel.author.profile?.username ||
      "Unknown User";
    const caption = reel.content || "";
    const videoUrl = reel.video || "";
    const thumbnailUrl = reel.thumbnail || reel.author.photoURL || "";
    const appUrl = process.env.APP_URL || "https://flip.app";

    const html = generateOpenGraphHTML({
      title: `${authorName}'s Reel on Flip`,
      description:
        caption.substring(0, 200) || "Watch this amazing reel on Flip!",
      image: thumbnailUrl,
      video: videoUrl,
      url: `${appUrl}/reel/${reelId}`,
      type: "video.other",
      appName: "Flip",
      appStoreUrl:
        process.env.APP_STORE_URL || "https://apps.apple.com/app/flip",
      playStoreUrl:
        process.env.PLAY_STORE_URL ||
        "https://play.google.com/store/apps/details?id=com.flip.app",
    });

    res.send(html);
  } catch (error) {
    console.error("Error serving reel deep link:", error);
    res.status(500).send(generateErrorPage("Failed to load reel"));
  }
});

/**
 * @route   GET /user/:userId
 * @desc    Serve user profile deep link with Open Graph meta tags
 * @access  Public
 */
router.get("/user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    // Fetch user data
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).send(generateErrorPage("User not found"));
    }

    const username = user.profile?.username || user.displayName || "User";
    const bio = user.profile?.bio || "";
    const profileImage = user.photoURL || "";
    const appUrl = process.env.APP_URL || "https://flip.app";

    const html = generateOpenGraphHTML({
      title: `@${username} on Flip`,
      description:
        bio.substring(0, 200) || `Check out @${username}'s profile on Flip!`,
      image: profileImage,
      url: `${appUrl}/user/${userId}`,
      type: "profile",
      appName: "Flip",
      appStoreUrl:
        process.env.APP_STORE_URL || "https://apps.apple.com/app/flip",
      playStoreUrl:
        process.env.PLAY_STORE_URL ||
        "https://play.google.com/store/apps/details?id=com.flip.app",
    });

    res.send(html);
  } catch (error) {
    console.error("Error serving user deep link:", error);
    res.status(500).send(generateErrorPage("Failed to load profile"));
  }
});

/**
 * Generate HTML with Open Graph meta tags
 */
function generateOpenGraphHTML(options) {
  const {
    title,
    description,
    image,
    video,
    url,
    type,
    appName,
    appStoreUrl,
    playStoreUrl,
  } = options;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    
    <!-- Primary Meta Tags -->
    <title>${escapeHtml(title)}</title>
    <meta name="title" content="${escapeHtml(title)}">
    <meta name="description" content="${escapeHtml(description)}">
    
    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="${type}">
    <meta property="og:url" content="${url}">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:image" content="${image}">
    <meta property="og:site_name" content="${appName}">
    ${video ? `<meta property="og:video" content="${video}">` : ""}
    
    <!-- Twitter -->
    <meta property="twitter:card" content="${
      video ? "player" : "summary_large_image"
    }">
    <meta property="twitter:url" content="${url}">
    <meta property="twitter:title" content="${escapeHtml(title)}">
    <meta property="twitter:description" content="${escapeHtml(description)}">
    <meta property="twitter:image" content="${image}">
    ${video ? `<meta property="twitter:player" content="${video}">` : ""}
    
    <!-- App Links -->
    <meta property="al:ios:url" content="flip://open?url=${encodeURIComponent(
      url
    )}">
    <meta property="al:ios:app_store_id" content="YOUR_APP_STORE_ID">
    <meta property="al:ios:app_name" content="${appName}">
    <meta property="al:android:url" content="flip://open?url=${encodeURIComponent(
      url
    )}">
    <meta property="al:android:package" content="com.flip.app">
    <meta property="al:android:app_name" content="${appName}">
    <meta property="al:web:url" content="${url}">
    
    <!-- Redirect to app immediately -->
    <script>
        // Detect mobile device
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
        const isAndroid = /Android/i.test(navigator.userAgent);
        
        if (isMobile) {
            // Use standard deep link format with path structure
            // Extract the path from the current URL (e.g., /post/123 from ${url})
            const currentPath = new URL('${url}').pathname;
            
            // Try to open the app with direct path format
            // The app will handle flip://post/123 or flip://reel/456
            const deepLink = 'flip://' + currentPath;
            
            // Create a hidden iframe to attempt opening the app
            // This is more reliable than window.location.href
            const iframe = document.createElement('iframe');
            iframe.src = deepLink;
            iframe.style.display = 'none';
            document.body.appendChild(iframe);
            
            // Also try direct navigation as fallback
            window.location.href = deepLink;
            
            // If app is not installed, show download buttons after 2.5 seconds
            setTimeout(() => {
                // Check if page is still visible (app didn't open)
                if (document.hidden === false) {
                    // Optionally redirect to store
                    // Uncomment if you want auto-redirect:
                    // if (isIOS) {
                    //     window.location.href = '${appStoreUrl}';
                    // } else if (isAndroid) {
                    //     window.location.href = '${playStoreUrl}';
                    // }
                }
            }, 2500);
        } else {
            // Desktop - show preview
            console.log('Desktop browser detected, showing preview');
        }
    </script>
    
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            padding: 20px;
        }
        .container {
            text-align: center;
            max-width: 600px;
        }
        .logo {
            font-size: 48px;
            font-weight: bold;
            margin-bottom: 20px;
        }
        .title {
            font-size: 24px;
            margin-bottom: 10px;
        }
        .description {
            font-size: 16px;
            opacity: 0.9;
            margin-bottom: 30px;
        }
        .buttons {
            display: flex;
            gap: 15px;
            justify-content: center;
            flex-wrap: wrap;
        }
        .btn {
            padding: 12px 24px;
            border-radius: 8px;
            text-decoration: none;
            font-weight: 600;
            display: inline-block;
            transition: transform 0.2s;
        }
        .btn:hover {
            transform: translateY(-2px);
        }
        .btn-primary {
            background: white;
            color: #667eea;
        }
        .btn-secondary {
            background: rgba(255, 255, 255, 0.2);
            color: white;
            border: 2px solid white;
        }
        .preview-image {
            max-width: 100%;
            border-radius: 12px;
            margin: 20px 0;
            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">🎬 ${appName}</div>
        <h1 class="title">${escapeHtml(title)}</h1>
        <p class="description">${escapeHtml(description)}</p>
        ${
          image
            ? `<img src="${image}" alt="Preview" class="preview-image" onerror="this.style.display='none'">`
            : ""
        }
        <div class="buttons">
            <a href="${appStoreUrl}" class="btn btn-primary">📱 Download on iOS</a>
            <a href="${playStoreUrl}" class="btn btn-primary">🤖 Download on Android</a>
        </div>
    </div>
</body>
</html>
`;
}

/**
 * Generate error page
 */
function generateErrorPage(message) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Error - Flip</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            text-align: center;
            padding: 20px;
        }
        .container {
            max-width: 400px;
        }
        h1 {
            font-size: 48px;
            margin-bottom: 20px;
        }
        p {
            font-size: 18px;
            opacity: 0.9;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>😕</h1>
        <p>${escapeHtml(message)}</p>
        <p>Please try again or download the Flip app.</p>
    </div>
</body>
</html>
`;
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

module.exports = router;
