require('dotenv').config();
const mongoose = require('mongoose');
const SignVocabulary = require('./models/SignVocabulary');

const signs = [
  {
    signName: "hello",
    description: "Open hand with palm facing out, wave side to side at head level",
    handShape: "open palm, fingers together",
    location: "head level, near temple",
    motion: "side to side wave, 2-3 oscillations",
    orientation: "palm facing forward",
    similarSigns: ["hi", "goodbye"],
    commonMistakes: [
      "Hand too low - should be at head level not chest",
      "Fingers spread - should be together",
      "Too fast - slow, clear wave"
    ]
  },
  {
    signName: "mother",
    description: "Open hand, thumb touches chin, fingers pointing up",
    handShape: "open palm, all 5 fingers extended",
    location: "chin",
    motion: "static, thumb taps chin twice",
    orientation: "palm facing left (for right hand)",
    similarSigns: ["father"],
    commonMistakes: [
      "Hand on cheek instead of chin - move lower",
      "Thumb side of hand instead of thumb tip"
    ]
  },
  {
    signName: "father",
    description: "Open hand, thumb touches forehead, fingers pointing up",
    handShape: "open palm, all 5 fingers extended",
    location: "forehead",
    motion: "static, thumb taps forehead twice",
    orientation: "palm facing left (for right hand)",
    similarSigns: ["mother"],
    differenceFromSimilar: "Same as mother but on forehead instead of chin - vertical distance about 15cm higher",
    commonMistakes: [
      "Hand on temple instead of center forehead",
      "Too close to mother position - needs clear separation"
    ]
  },
  {
    signName: "thank you",
    description: "Flat hand starts at chin/lips, moves forward and down",
    handShape: "flat hand, fingers together",
    location: "starts at chin, moves forward",
    motion: "outward and downward arc",
    orientation: "palm starts facing you, rotates to face down",
    similarSigns: ["good"],
    commonMistakes: [
      "Starting too low - must start at chin/mouth",
      "No motion - must move forward"
    ]
  },
  {
    signName: "sorry",
    description: "Fist with thumb out, circles on chest over heart",
    handShape: "fist with extended thumb (letter 'A' in ASL)",
    location: "center of chest",
    motion: "circular motion, clockwise",
    orientation: "knuckles facing body",
    similarSigns: ["please"],
    differenceFromSimilar: "Uses fist with thumb (unlike 'please' which uses flat hand)",
    commonMistakes: [
      "Linear motion - must be circular",
      "Wrong location - must be over heart area",
      "Using flat hand - must use fist with thumb"
    ]
  },
  {
    signName: "yes",
    description: "Fist nods up and down like a head nodding",
    handShape: "fist (like letter 'S')",
    location: "in front of body at shoulder height",
    motion: "up and down nodding motion at wrist",
    orientation: "knuckles facing forward",
    similarSigns: [],
    commonMistakes: [
      "Moving whole arm - motion should be from wrist only"
    ]
  },
  {
    signName: "no",
    description: "Index and middle finger close to thumb, like snapping",
    handShape: "index and middle finger extended, others closed",
    location: "in front of body",
    motion: "fingers close down to thumb in snapping motion",
    orientation: "palm facing forward",
    similarSigns: [],
    commonMistakes: [
      "Wrong fingers - must use index and middle, not all fingers"
    ]
  },
  {
    signName: "please",
    description: "Flat hand circles on chest",
    handShape: "flat hand, fingers together",
    location: "center of chest",
    motion: "circular motion clockwise",
    orientation: "palm facing body",
    similarSigns: ["sorry"],
    differenceFromSimilar: "Uses flat hand not fist (unlike 'sorry' which uses fist with thumb)",
    commonMistakes: [
      "Using fist - must use flat hand",
      "Too small circles - make them larger and clearer"
    ]
  },
  {
    signName: "help",
    description: "Fist on flat palm, both hands lift up together",
    handShape: "one fist, one flat palm",
    location: "fist sits on top of flat palm in front of body",
    motion: "both hands lift upward together",
    orientation: "fist on top, palm facing up",
    similarSigns: [],
    commonMistakes: [
      "Hands not touching - fist must rest on palm",
      "Moving separately - must move together"
    ]
  },
  {
    signName: "good",
    description: "Flat hand at chin moves down to other hand",
    handShape: "both hands flat",
    location: "starts at chin, ends with one hand on top of other",
    motion: "top hand moves down to meet bottom hand",
    orientation: "both palms facing up at end",
    similarSigns: ["thank you"],
    differenceFromSimilar: "Ends with both hands together (unlike 'thank you' which goes forward)",
    commonMistakes: [
      "Not starting at chin - must touch chin first",
      "Hands not meeting - must end stacked"
    ]
  },
  {
    signName: "bad",
    description: "Flat hand at chin, rotates down and away sharply",
    handShape: "flat hand",
    location: "starts at chin",
    motion: "flips down and away from face",
    orientation: "palm starts facing you, ends facing down",
    similarSigns: [],
    commonMistakes: [
      "Too slow - motion should be quick/sharp",
      "Not starting at chin"
    ]
  },
  {
    signName: "how are you",
    description: "Both fists knuckles together, roll forward, then point at person",
    handShape: "starts with fists, ends pointing",
    location: "in front of chest",
    motion: "three parts: fists together, roll forward, point",
    orientation: "knuckles touching at start",
    isPhrase: true,
    similarSigns: [],
    commonMistakes: [
      "Missing the rolling motion",
      "Not pointing at end"
    ]
  },
  {
    signName: "goodbye",
    description: "Open hand, palm facing out, fingers fold down and up (like a wave)",
    handShape: "open palm",
    location: "head level or higher",
    motion: "fingers bend down to palm and back up, repeated",
    orientation: "palm facing forward",
    similarSigns: ["hello"],
    differenceFromSimilar: "Fingers fold in and out (unlike 'hello' which waves side to side)",
    commonMistakes: [
      "Waving side to side - that's hello, not goodbye",
      "Not bending fingers - must flex fingers"
    ]
  }
];

async function seedDatabase() {
  try {
    console.log('🌱 Starting database seed...');
    console.log('📡 Connecting to MongoDB...');
    
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    console.log('🗑️ Clearing existing signs...');
    const deleted = await SignVocabulary.deleteMany({});
    console.log(`   Deleted ${deleted.deletedCount} existing signs`);
    
    console.log('📝 Inserting new signs...');
    const inserted = await SignVocabulary.insertMany(signs);
    console.log(`   Inserted ${inserted.length} signs`);
    
    console.log('\n✅ DATABASE SEEDED SUCCESSFULLY!\n');
    console.log('Signs in vocabulary:');
    signs.forEach((sign, i) => {
      console.log(`  ${i + 1}. ${sign.signName}`);
    });
    console.log('');
    
    await mongoose.connection.close();
    console.log('👋 MongoDB connection closed');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ SEEDING FAILED:', error);
    process.exit(1);
  }
}

seedDatabase();
```

---

## **How Everything Works Together**
[User opens website]
        ↓
[Frontend starts, creates session]
        ↓
POST /api/translate/session/start
        ↓
routes/translate.js → createSession()
        ↓
mongodb.js → Creates new TranslationSession document
        ↓
Returns sessionId to frontend
        ↓
        
[User clicks "Start Translation"]
        ↓
[WebcamCapture captures frame every 500ms]
        ↓
[App.jsx receives frame, adds to buffer (keeps last 3)]
        ↓
POST /api/translate
  Body: {
    imageFrame: "base64...",
    previousFrames: ["base64...", "base64..."],
    sessionId: "uuid",
    conversationContext: [{sign: "hello", ...}]
  }
        ↓
routes/translate.js receives request
        ↓
mongodb.js → getVocabulary() → Fetches all signs
        ↓
gemini.js → analyzeASLSign()
        ├─ Builds prompt with vocabulary + context
        ├─ Converts base64 to Gemini image format
        ├─ Sends to Gemini API with multiple frames
        ├─ Gemini analyzes spatial + temporal + context
        └─ Returns JSON analysis
        ↓
routes/translate.js receives Gemini result
        ↓
mongodb.js → saveTranslation() → Saves to session
        ↓
Returns JSON to frontend:
  {
    success: true,
    translation: {
      detectedSign: "mother",
      confidence: 0.87,
      reasoning: "...",
      spatialAnalysis: "...",
      correction: null,
      ...
    }
  }
        ↓
[Frontend displays result]
        ↓
[Loop repeats every 500ms]```