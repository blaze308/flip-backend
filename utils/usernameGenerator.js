/**
 * Username Generator Utility
 * Generates TikTok-style usernames for phone authentication users
 */

// Cool adjectives for username generation
const adjectives = [
  "cool",
  "epic",
  "super",
  "mega",
  "ultra",
  "pro",
  "ace",
  "star",
  "fire",
  "ice",
  "neon",
  "cyber",
  "pixel",
  "nova",
  "zen",
  "flux",
  "vibe",
  "wave",
  "glow",
  "spark",
  "bolt",
  "dash",
  "swift",
  "flash",
  "ghost",
  "shadow",
  "mystic",
  "cosmic",
  "lunar",
  "solar",
  "royal",
  "elite",
  "prime",
  "alpha",
  "beta",
  "gamma",
  "delta",
  "omega",
  "turbo",
  "nitro",
  "hyper",
  "max",
  "plus",
  "x",
  "neo",
  "retro",
];

// Fun nouns for username generation
const nouns = [
  "user",
  "player",
  "gamer",
  "ninja",
  "warrior",
  "hero",
  "legend",
  "master",
  "chief",
  "captain",
  "pilot",
  "rider",
  "hunter",
  "seeker",
  "creator",
  "builder",
  "maker",
  "artist",
  "dancer",
  "singer",
  "dreamer",
  "explorer",
  "adventurer",
  "traveler",
  "wanderer",
  "phoenix",
  "dragon",
  "tiger",
  "wolf",
  "eagle",
  "falcon",
  "hawk",
  "lion",
  "panther",
  "shark",
  "dolphin",
  "whale",
  "fox",
  "bear",
  "storm",
  "thunder",
  "lightning",
  "comet",
  "meteor",
  "galaxy",
  "planet",
  "star",
  "moon",
  "sun",
  "ocean",
  "mountain",
  "forest",
];

/**
 * Generate a random username using timestamp-based approach
 * Format: adjective + noun + timestamp_suffix
 * Example: cooluser123456, epicninja789012
 */
function generateFromTimestamp(timestamp = new Date()) {
  // Use milliseconds since epoch for uniqueness
  const timeString = timestamp.getTime().toString();

  // Take last 6 digits for shorter suffix
  const suffix = timeString.substring(timeString.length - 6);

  // Random adjective and noun
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];

  return `${adjective}${noun}${suffix}`;
}

/**
 * Generate a random username using date-based approach
 * Format: adjective + noun + YYMMDD + random_digits
 * Example: cooluser250125, epicninja250125
 */
function generateFromDate(date = new Date()) {
  // Format: YYMMDD
  const year = (date.getFullYear() % 100).toString().padStart(2, "0");
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  const dateString = `${year}${month}${day}`;

  // Add 2 random digits for uniqueness
  const randomDigits = Math.floor(Math.random() * 100)
    .toString()
    .padStart(2, "0");

  // Random adjective and noun
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];

  return `${adjective}${noun}${dateString}${randomDigits}`;
}

/**
 * Generate a TikTok-style username
 * Format: user + random_numbers (6-8 digits)
 * Example: user123456, user78901234
 */
function generateTikTokStyle() {
  // Generate 6-8 digit number
  const digitCount = 6 + Math.floor(Math.random() * 3); // 6, 7, or 8 digits
  const maxNumber = Math.pow(10, digitCount) - 1;
  const minNumber = Math.pow(10, digitCount - 1);

  const number =
    minNumber + Math.floor(Math.random() * (maxNumber - minNumber));

  return `user${number}`;
}

/**
 * Generate a username with phone number suffix
 * Format: user + last_4_digits_of_phone + random_digits
 * Example: user1234567, user987654321
 */
function generateFromPhone(phoneNumber) {
  // Extract digits from phone number
  const digits = phoneNumber.replace(/[^\d]/g, "");

  // Get last 4 digits of phone number
  const phoneSuffix =
    digits.length >= 4
      ? digits.substring(digits.length - 4)
      : digits.padStart(4, "0");

  // Add 2-3 random digits
  const randomDigits = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0");

  return `user${phoneSuffix}${randomDigits}`;
}

/**
 * Generate multiple username suggestions
 */
function generateSuggestions(options = {}) {
  const { count = 5, phoneNumber, signupDate } = options;
  const suggestions = [];

  for (let i = 0; i < count; i++) {
    switch (i % 4) {
      case 0:
        suggestions.push(generateTikTokStyle());
        break;
      case 1:
        suggestions.push(generateFromTimestamp(signupDate));
        break;
      case 2:
        suggestions.push(generateFromDate(signupDate));
        break;
      case 3:
        if (phoneNumber) {
          suggestions.push(generateFromPhone(phoneNumber));
        } else {
          suggestions.push(generateTikTokStyle());
        }
        break;
    }
  }

  // Remove duplicates and return
  return [...new Set(suggestions)];
}

/**
 * Check if a username is available
 */
async function isUsernameAvailable(username, User) {
  try {
    const existingUser = await User.findOne({
      "profile.username": username,
      deletedAt: null,
    });
    return !existingUser;
  } catch (error) {
    console.error("Error checking username availability:", error);
    return false;
  }
}

/**
 * Generate a guaranteed unique username by adding suffix if needed
 */
async function generateUniqueUsername(options = {}, User) {
  const { phoneNumber, signupDate } = options;
  let baseUsername = generateTikTokStyle();

  // Try the base username first
  if (await isUsernameAvailable(baseUsername, User)) {
    return baseUsername;
  }

  // If not available, try with different suffixes
  for (let i = 1; i <= 10; i++) {
    const modifiedUsername = `${baseUsername}_${i}`;
    if (await isUsernameAvailable(modifiedUsername, User)) {
      return modifiedUsername;
    }
  }

  // Fallback: generate completely new username
  return generateFromTimestamp(signupDate);
}

/**
 * Generate username for phone authentication users
 * This is the main function to use for phone auth users
 */
async function generatePhoneAuthUsername(
  phoneNumber,
  User,
  signupDate = new Date()
) {
  try {
    // Try different generation methods until we find an available username
    const methods = [
      () => generateTikTokStyle(),
      () => generateFromPhone(phoneNumber),
      () => generateFromTimestamp(signupDate),
      () => generateFromDate(signupDate),
    ];

    for (const method of methods) {
      const username = method();
      if (await isUsernameAvailable(username, User)) {
        return username;
      }
    }

    // If all methods fail, use the unique generator
    return await generateUniqueUsername({ phoneNumber, signupDate }, User);
  } catch (error) {
    console.error("Error generating phone auth username:", error);
    // Fallback to timestamp-based username
    return generateFromTimestamp(signupDate);
  }
}

module.exports = {
  generateFromTimestamp,
  generateFromDate,
  generateTikTokStyle,
  generateFromPhone,
  generateSuggestions,
  isUsernameAvailable,
  generateUniqueUsername,
  generatePhoneAuthUsername,
};
