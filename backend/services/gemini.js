//gemini.js
const { GoogleGenerativeAI } = require('@google/generative-ai');
// ✅ Model cache so we don't recreate clients/models on every frame
const modelCache = new Map(); // apiKey -> model

function getModelForKey(apiKey) {
  if (modelCache.has(apiKey)) return modelCache.get(apiKey);

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: { temperature: 0.4, topP: 0.8, topK: 40 }
  });

  modelCache.set(apiKey, model);
  return model;
}

// ✅ Load all API keys
const API_KEYS = [
  process.env.GEMINI_API_KEY_1,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
  process.env.GEMINI_API_KEY_4,
  process.env.GEMINI_API_KEY_5,
  process.env.GEMINI_API_KEY_6,
  process.env.GEMINI_API_KEY_7,
  process.env.GEMINI_API_KEY_8,
  process.env.GEMINI_API_KEY_9,
  process.env.GEMINI_API_KEY_10,
  process.env.GEMINI_API_KEY_11,
  process.env.GEMINI_API_KEY_12,
  process.env.GEMINI_API_KEY_13,
  process.env.GEMINI_API_KEY_14,
  process.env.GEMINI_API_KEY_15,
].filter(Boolean); // Remove undefined keys

let currentKeyIndex = 0;

function getNextKey() {
  const key = API_KEYS[currentKeyIndex];
  currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
  return key;
}

function rotateToNextKey() {
  console.log(`🔄 Rotating from key ${currentKeyIndex} to key ${(currentKeyIndex + 1) % API_KEYS.length}`);
  currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
}

console.log(`📦 Loaded ${API_KEYS.length} Gemini API keys for rotation`);
const stageACache = new Map();
const STAGEA_TTL_MS = 30_000;

// Removes ```json fences and trims
function stripCodeFences(text) {
  return (text || "")
    .trim()
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();
}

// Extract the first JSON object from a string using bracket balancing.
// Works even if the model includes extra text before/after.
function extractFirstJSONObject(text) {
  const s = stripCodeFences(text);

  const start = s.indexOf("{");
  if (start === -1) throw new Error("No JSON object start '{' found in model response.");

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < s.length; i++) {
    const ch = s[i];

    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === "{") depth++;
    if (ch === "}") depth--;

    if (depth === 0) {
      return s.slice(start, i + 1);
    }
  }

  throw new Error("Unterminated JSON object in model response.");
}

function normStr(x) {
  return String(x || "").toLowerCase();
}

function scoreSignWithFeatures(sign, features) {
  const hay = normStr(
    `${sign.signName} ${sign.description} ${sign.handShape} ${sign.location} ${sign.motion} ${sign.orientation} ` +
    `${(sign.similarSigns || []).join(" ")} ${sign.differenceFromSimilar || ""} ${(sign.commonMistakes || []).join(" ")}`
  );

  let score = 0;

  // Candidate labels are strongest hints
  for (const lab of (features.candidateLabels || [])) {
    if (normStr(sign.signName) === normStr(lab)) score += 6;
    else if (hay.includes(normStr(lab))) score += 2;
  }

  // Keywords
  for (const k of (features.handShapeKeywords || [])) {
    if (hay.includes(normStr(k))) score += 3;
  }
  for (const k of (features.locationKeywords || [])) {
    if (hay.includes(normStr(k))) score += 2;
  }
  for (const k of (features.motionKeywords || [])) {
    if (hay.includes(normStr(k))) score += 2;
  }

  return score;
}

function shortlistVocabulary(vocabulary, features, limit = 7) {
  const ranked = (vocabulary || [])
    .map(sign => ({ sign, score: scoreSignWithFeatures(sign, features) }))
    .sort((a, b) => b.score - a.score);

  // Prefer scored > 0
  const positive = ranked.filter(r => r.score > 0).slice(0, limit).map(r => r.sign);

  // Fallback if nothing matched (e.g., blurry frame)
  if (positive.length > 0) return positive;

  // fallback: just take first N to avoid empty vocabText
  return ranked.slice(0, Math.min(limit, ranked.length)).map(r => r.sign);
}


/**
 * Stage A: Extract compact features from frames 
 * Returns small JSON used to shortlist candidates server-side.
 */
async function extractASLFeatures(model, currentFrame, previousFrames, contextSigns) {
  const prompt = `
You are analyzing ASL frames from a webcam.

Return ONLY valid JSON (no markdown, no backticks).
Do NOT guess centimeters. Use HH/SW or normalized coords if you mention magnitude.

JSON schema:
{
  "handShapeKeywords": ["..."],
  "locationKeywords": ["..."],
  "motionKeywords": ["..."],
  "candidateLabels": ["..."],
  "confidence": 0.0
}

Rules:
- handShapeKeywords: short phrases like "fist", "thumb extended", "flat hand", "index+middle extended"
- locationKeywords: short phrases like "chin", "forehead", "center chest", "head level"
- motionKeywords: short phrases like "circular", "side-to-side wave", "finger flex", "tap", "up-down nod"
- candidateLabels: 3-5 likely labels (single words) based on what you see; if unsure, return []
- confidence: 0..1 for your own certainty in these features

Conversation context (previous detected signs): ${contextSigns || "(none)"}
`;

  const imageParts = [];

  // Previous frames first
  for (const f of (previousFrames || [])) {
    imageParts.push({
      inlineData: {
        mimeType: "image/jpeg",
        data: f.replace(/^data:image\/\w+;base64,/, "")
      }
    });
  }

  // Current frame last
  imageParts.push({
    inlineData: {
      mimeType: "image/jpeg",
      data: currentFrame.replace(/^data:image\/\w+;base64,/, "")
    }
  });

  const result = await model.generateContent([prompt, ...imageParts]);
  const raw = result.response.text();

  let features;
  try {
    const jsonText = extractFirstJSONObject(raw);
    features = JSON.parse(jsonText);
  } catch (e) {
    console.error("JSON parse failed. Raw model output:", raw);
    throw e;
  }

  return {
    handShapeKeywords: Array.isArray(features.handShapeKeywords) ? features.handShapeKeywords : [],
    locationKeywords: Array.isArray(features.locationKeywords) ? features.locationKeywords : [],
    motionKeywords: Array.isArray(features.motionKeywords) ? features.motionKeywords : [],
    candidateLabels: Array.isArray(features.candidateLabels) ? features.candidateLabels : [],
    confidence: typeof features.confidence === "number" ? features.confidence : 0
  };
}

// Analyze ASL sign from video frames using Gemini's multimodal capabilities
async function analyzeASLSign(currentFrame, previousFrames, conversationContext, vocabulary, sessionKey) {
  const apiKey = API_KEYS[currentKeyIndex];
  const model = getModelForKey(apiKey);  
  // Build vocabulary reference string -- COMMENTED TEMPORARILY
  // const vocabText = vocabulary.map(sign => {
  //   let text = `\n${sign.signName.toUpperCase()}:
  // Description: ${sign.description}
  // Hand shape: ${sign.handShape}
  // Location: ${sign.location}
  // Motion: ${sign.motion}
  // Orientation: ${sign.orientation}`;
    
  //   if (sign.similarSigns && sign.similarSigns.length > 0) {
  //     text += `\n  ⚠️ Similar to: ${sign.similarSigns.join(', ')}`;
  //     if (sign.differenceFromSimilar) {
  //       text += `\n  🔑 KEY DIFFERENCE: ${sign.differenceFromSimilar}`;
  //     }
  //   }
    
  //   if (sign.commonMistakes && sign.commonMistakes.length > 0) {
  //     text += `\n  ❌ Common mistakes: ${sign.commonMistakes.join('; ')}`;
  //   }
    
  //   return text;
  // }).join('\n---');
  
  // Build conversation context string
  const contextText = conversationContext && conversationContext.length > 0
    ? conversationContext.slice(-5).map((c, i) => 
        `${i + 1}. "${c.sign}" (${Math.round(c.confidence * 100)}% confidence)`
      ).join(' → ')
    : "This is the first sign in the conversation.";
    const contextSigns = (conversationContext || []).map(c => c.sign).join(', ');
  const key = sessionKey || "no-session";
  const now = Date.now();

  let features;
  const cached = stageACache.get(key);

  if (cached && (now - cached.at) < STAGEA_TTL_MS) {
    features = cached.features;
  } else {
    features = await extractASLFeatures(model, currentFrame, previousFrames || [], contextSigns);
    stageACache.set(key, { at: now, features });

    // prevent unbounded growth
    if (stageACache.size > 500) {
      for (const [k, v] of stageACache) {
        if ((now - v.at) > 30_000) stageACache.delete(k);
      }
    }
  }

  console.log("Stage A features:", features);

  const candidates = shortlistVocabulary(vocabulary, features, 7);

  if (!candidates || candidates.length === 0) {
    return {
      detectedSign: null,
      confidence: 0,
      reasoning: "No candidate signs available (shortlist empty).",
      handShape: "unknown",
      handLocation: "unknown",
      handOrientation: "unknown",
      motion: "unknown",
      spatialAnalysis: "Shortlist empty",
      temporalAnalysis: "Shortlist empty",
      contextRelevance: "Shortlist empty",
      correction: null,
      alternativeSigns: [],
      differentiationNotes: "No candidates to compare"
    };
  }
  console.log("📌 Candidate signs:", candidates.map(s => s.signName));
  
  const vocabText = candidates.map(sign => {
    let text = `\n${sign.signName.toUpperCase()}:
    Description: ${sign.description}
    Hand shape: ${sign.handShape}
    Location: ${sign.location}
    Motion: ${sign.motion}
    Orientation: ${sign.orientation}`;

    if (sign.similarSigns && sign.similarSigns.length > 0) {
      text += `\n  ⚠️ Similar to: ${sign.similarSigns.join(', ')}`;
      if (sign.differenceFromSimilar) {
        text += `\n  🔑 KEY DIFFERENCE: ${sign.differenceFromSimilar}`;
      }
    }

    if (sign.commonMistakes && sign.commonMistakes.length > 0) {
      text += `\n  ❌ Common mistakes: ${sign.commonMistakes.join('; ')}`;
    }

    return text;
  }).join('\n---');


  // THE PROMPT 
  const prompt = `You are an expert ASL interpreter analyzing webcam frames for a hackathon demo showcasing Gemini's spatial reasoning and temporal analysis.

VOCABULARY (detect from these only):
${vocabText}

PREVIOUS SIGNS: ${contextText}

Analyze frames (oldest→newest, last is current) and return ONLY JSON (no markdown):

{
  "detectedSign": "sign name OR null",
  "confidence": 0.85,
  "reasoning": "I see [hand shape] at [location]. Motion: [description]. This is '[SIGN]' because: [key features]. Not '[SIMILAR]' because: [specific difference].",
  "handShape": "finger/thumb/palm positions",
  "handLocation": "using HH (head-height) or SW (shoulder-width) units",
  "handOrientation": "palm/finger direction",
  "motion": "type and pattern using HH/SW",
  "spatialAnalysis": "3D positioning with body-relative measurements",
  "temporalAnalysis": "frame-by-frame motion tracking",
  "contextRelevance": "how previous signs inform this",
  "correction": null OR "specific feedback",
  "alternativeSigns": [{"sign":"name","confidence":0.1,"reason":"why less likely"}],
  "differentiationNotes": "explicit differences from similar signs"
}

CRITICAL: 
- Mother vs Father: VERTICAL POSITION is key (chin vs forehead, ~0.25 HH difference)
- Hello vs Goodbye: MOTION TYPE is key (side-to-side wave vs finger flexing)
- Use HH/SW units, not centimeters
- Track motion across all frames
- Explain WHY you chose this sign over similar ones
- Only detect from vocabulary or return null`;

  try {
    // Prepare image parts for Gemini
    const imageParts = [];
    
    // Add previous frames (if exist)
    if (previousFrames && previousFrames.length > 0) {
      for (const frame of previousFrames) {
        imageParts.push({
          inlineData: {
            mimeType: 'image/jpeg',
            data: frame.replace(/^data:image\/\w+;base64,/, '')
          }
        });
      }
    }
    
    // Add current frame last
    imageParts.push({
      inlineData: {
        mimeType: 'image/jpeg',
        data: currentFrame.replace(/^data:image\/\w+;base64,/, '')
      }
    });
    
    console.log(`📸 Analyzing ${imageParts.length} frames with Gemini...`);
    
    // Call Gemini API
    const result = await model.generateContent([prompt, ...imageParts]);
    const response = await result.response;
    const text = response.text();
    
    console.log('🤖 Gemini raw response:', text.substring(0, 200) + '...');
    
    // Clean up response - remove markdown if present
    let analysis;
    try {
      const jsonText = extractFirstJSONObject(text);
      analysis = JSON.parse(jsonText);
      if (typeof analysis.detectedSign === "string") {
        const s = analysis.detectedSign.trim().toLowerCase();
        if (s === "null" || s === "none" || s === "") analysis.detectedSign = null;
      }

    } catch (e) {
      console.error('❌ JSON parse failed. Raw:', text);
      throw e;
    }

    
    // Validate required fields
    const requiredFields = ['detectedSign', 'confidence', 'reasoning'];
    for (const field of requiredFields) {
      if (!analysis.hasOwnProperty(field)) {
        throw new Error(`Missing required field: ${field}`);
      }
    }
    
    console.log(`✅ Detected: ${analysis.detectedSign} (${Math.round(analysis.confidence * 100)}%)`);
    analysis.candidates = candidates.map(s => s.signName);
    analysis.stageA = features;

    return analysis;
    
  } catch (error) {
    console.error('❌ Gemini API error:', error);
    
    // Check if quota/rate limit error
    const msg = String(error?.message || error);
    const isQuotaError = 
      msg.includes('429') ||
      msg.includes('quota') ||
      msg.toLowerCase().includes('rate limit') ||
      msg.toLowerCase().includes('resource has been exhausted');
    
    if (isQuotaError) {
      // 🔥 If this is the FREE TIER per-project-per-day quota, rotating keys won't help.
      const isDailyProjectQuota =
        msg.includes("generate_content_free_tier_requests") ||
        msg.includes("GenerateRequestsPerDayPerProjectPerModel-FreeTier");

      if (isDailyProjectQuota) {
        const err = new Error("GEMINI_DAILY_QUOTA_EXHAUSTED");
        err.code = "GEMINI_DAILY_QUOTA_EXHAUSTED";
        throw err;
      }

      // Otherwise it might be per-key / per-minute style throttling: rotation can help
      if (API_KEYS.length > 1) {
        console.log("⚠️ Rate/quota hit. Rotating key...");
        rotateToNextKey();
        return analyzeASLSign(currentFrame, previousFrames, conversationContext, vocabulary, sessionKey);
      }
    }

    
    throw error;
  }
  
}

module.exports = { analyzeASLSign };