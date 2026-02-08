const { GoogleGenerativeAI } = require('@google/generative-ai');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const stageACache = new Map();
const STAGEA_TTL_MS = 2000;

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
    console.error("Stage A JSON parse failed. Raw model output:", raw);
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

/**
 * Analyze ASL sign from video frames using Gemini's multimodal capabilities
 */
async function analyzeASLSign(currentFrame, previousFrames, conversationContext, vocabulary, sessionKey) {
  const model = genAI.getGenerativeModel({ 
    model: 'gemini-2.5-flash',
    generationConfig: {
      temperature: 0.4,  // Lower = more consistent, higher = more creative
      topP: 0.8,
      topK: 40,
    }
  });
  
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
  const cacheKey = `${conversationContext?.sessionId || ""}`; // if you don't have sessionId here, see note below
  const key = sessionKey || "no-session";
  const now = Date.now();

  let features;
  const cached = stageACache.get(key);

  if (cached && (now - cached.at) < STAGEA_TTL_MS) {
    features = cached.features;
  } else {
    features = await extractASLFeatures(model, currentFrame, previousFrames || [], contextSigns);
    stageACache.set(key, { at: now, features });
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


  // THE PROMPT - This is where the magic happens
  const prompt = `You are an expert ASL (American Sign Language) interpreter with deep understanding of spatial reasoning, hand positioning, and temporal motion analysis. You are analyzing live video frames from a webcam to detect and interpret ASL signs in real-time.

# CRITICAL CONTEXT
This is a HACKATHON PROJECT showcasing Gemini's unique capabilities:
- Your spatial reasoning (3D hand position analysis)
- Your temporal understanding (motion across frames)
- Your context awareness (conversation flow)
- Your ability to explain your reasoning (not just label)

**The judges need to see you THINKING, not just outputting labels.**

# YOUR TASK
Analyze the sequence of video frames showing someone signing in ASL. You will receive:
1. Previous frames (for motion context) - OLDEST to NEWEST
2. Current frame (the latest moment) - LAST IMAGE

# VOCABULARY YOU CAN RECOGNIZE
Only detect signs from this list:
${vocabText}
Allowed labels: ${candidates.map(s => s.signName).join(", ")}
This is a SHORTLIST. You MUST choose detectedSign ONLY from this shortlist, or null if unsure.

# CONVERSATION CONTEXT
Previous signs detected in this conversation:
${contextText}

# ANALYSIS REQUIREMENTS

## 1. SPATIAL ANALYSIS (CRITICAL)
You MUST use measurement formats that are realistic from a single RGB camera:
- Use normalized image coordinates (0..1): "handCenter: (x=0.62, y=0.41)"
- Use relative body units when possible:
  - HH = head-height units (distance divided by head bounding-box height)
  - SW = shoulder-width units (distance divided by shoulder width, if visible)
Examples:
- "Hand is ~0.20 HH below forehead, ~0.10 SW to the right of face midline"
- "Hand is at chin level (±0.05 HH), slightly forward toward camera (inferred from foreshortening)"
Orientation:
- Use qualitative or approximate angles ONLY when clearly visible:
  "palm facing camera", "palm facing left", "fingers pointing up-right"
Do NOT invent centimeters. If scale is unknown, state measurements in HH/SW or normalized coords.


## 2. TEMPORAL ANALYSIS (CRITICAL - This is why we need multiple frames)
- Track motion patterns across frames
  Example: "Frame 1: hand at chest. Frame 2: moved ~0.10 HH upward. Frame 3: reached chin level. Motion complete."
- Determine if sign is static or motion-based
- Identify motion type: linear, circular, oscillating, tapping
- Note if motion is complete or in-progress

## 3. CONTEXT AWARENESS (CRITICAL - This shows reasoning)
- Consider previous signs in conversation
  Example: "After 'how are you' question, thumbs up likely means 'good' not just generic approval"
- Use ASL grammar patterns
  Example: "Question signs often come with raised eyebrows"
- Predict likely next signs

## 4. DIFFERENTIATION (CRITICAL - This proves accuracy)
- When sign looks similar to others, EXPLICITLY explain differences
  Example: "This is 'mother' not 'father' because: hand is at CHIN (~0.25 HH below forehead). Vertical separation is clear - measured ~0.25 HH lower."
- Reference the "Similar to" and "KEY DIFFERENCE" notes in vocabulary
- Be specific about what you observe that distinguishes signs

## 5. TEACHING/CORRECTION (Shows multimodal understanding)
- If sign is close but incorrect, provide specific correction
  Example: "Hand shape correct, but positioned at neck instead of chin. Move hand UP ~0.08 HH to properly sign 'mother'."
- Reference common mistakes from vocabulary

# YOUR RESPONSE FORMAT

You MUST respond with ONLY valid JSON (no markdown, no backticks, no explanation outside JSON):

{
  "detectedSign": "sign name from vocabulary OR null if unsure",
  "confidence": 0.85,
  "reasoning": "I observe [specific hand shape], positioned at [body-relative location using HH/SW + normalized coords], oriented [qualitative direction]. The motion across frames shows [motion description using normalized or relative units]. This matches '[SIGN]' because [3+ matching features]. I ruled out '[SIMILAR_SIGN]' because [specific observed difference using HH/SW or normalized coords].",
  
  "handShape": "detailed description: finger positions, thumb position, palm shape",
  "handLocation": "location using realistic units: include normalized coords (x,y in 0..1) and/or relative body units (HH=head-height, SW=shoulder-width). Example: 'chin level (~0.05 HH), handCenter(x=0.52,y=0.44), ~0.10 SW right of midline'",
  "handOrientation": "orientation described qualitatively (or rough estimate only if obvious): e.g., 'palm facing camera', 'palm facing left', 'fingers pointing up-right'",
  "motion": "static OR motion description: direction + magnitude using HH/SW or normalized coords, speed (fast/medium/slow), and completion status (complete/in-progress)",
  
  "spatialAnalysis": "3D-ish positioning using realistic camera-derived measurements: include handCenter(x,y) normalized (0..1), relative landmark position in HH/SW, and qualitative depth cues if any (e.g., foreshortening). For two-handed signs include relative separation in SW or normalized units and whether hands are parallel/symmetric.",
  
  "temporalAnalysis": "Motion tracking across frames: Frame 1: [position]. Frame 2: [new position], moved [direction] by [distance]. Frame 3: [final position]. Motion pattern: [linear/circular/oscillating], [complete/incomplete]. Duration: [fast/medium/slow].",
  
  "contextRelevance": "Based on previous signs '${contextSigns}', this interpretation makes sense because [explain]. In ASL conversation flow, [explain pattern]. This suggests next sign might be [prediction].",

  "correction": null OR "Specific actionable feedback: '[WHAT'S WRONG]' - [SPECIFIC FIX with measurements]. Example: 'Hand is at neck level (observed) but should be at chin for this sign - move DOWN ~0.08 HH.'",
  
  "alternativeSigns": [
    {
      "sign": "alternative possibility from vocabulary",
      "confidence": 0.12,
      "reason": "Could match because [features], but less likely because [specific observed difference]"
    }
  ],
  
  "differentiationNotes": "If similar signs exist: I can definitively tell this is '[DETECTED]' not '[SIMILAR]' because: [list 2-3 specific observed differences with measurements]. Most critical distinguishing feature: [most obvious difference]."
}

# CRITICAL RULES

1. Use REALISTIC measurements:
   - normalized coords (0..1) and HH/SW units
   - avoid centimeters unless the system is explicitly calibrated
2. **Show your work** - Explain WHY, don't just label
3. **Consider motion** - Static pose might be incomplete motion sign
4. **Use context** - Previous signs inform interpretation
5. **Be honest** - Low confidence + alternatives > wrong guess
6. **Teach** - Provide corrections to help user improve
7. **Differentiate clearly** - Explicitly state what distinguishes similar signs
8. **Only vocabulary** - Don't detect signs not in the list
9. **NO MARKDOWN** - Pure JSON only, no \`\`\`json or any formatting

# EXAMPLES OF GOOD VS BAD REASONING

❌ BAD: "Looks like sorry."
✅ GOOD: "Hand is in fist with thumb extended (ASL letter 'A'), positioned at center chest ~0.15 SW in front of torso (inferred). Across 3 frames, hand moves in clockwise circular motion with ~0.08 SW circular radius, completing 1.5 rotations. This matches 'sorry' sign because: (1) correct hand shape (fist+thumb, not flat hand), (2) correct location (over heart area), (3) circular motion present (not linear). I ruled out 'please' which also uses chest location, because 'please' requires FLAT hand, not fist - observed hand is clearly in fist configuration."

❌ BAD: "It's mother."
✅ GOOD: "Open palm with 5 fingers extended, thumb touching chin at midline, fingers pointing mostly upward (slightly forward). Position measured: hand contact point is at CHIN level (not forehead). This is 'mother' not 'father' because: vertical position is ~0.25 HH lower where 'father' sign would be (forehead). The distinguishing feature is unambiguous - chin vs forehead placement creates clear vertical separation."

❌ BAD: "High confidence, it's 'hello'."
✅ GOOD: "Open palm at head level, handCenter near right temple, x≈0.70,y≈0.25 (~0.05-0.10 HH from temple region). Motion analysis: Frame 1-3 shows hand oscillating side-to-side with ~0.12 SW amplitude, 2 complete cycles. Palm remains facing forward throughout. This is 'hello' not 'goodbye' because: motion is SIDE-TO-SIDE oscillation (goodbye would show FINGERS FLEXING IN/OUT). The motion pattern is the key differentiator."

# NOW ANALYZE

The images are provided in order: oldest frames first, current frame last.
Frame 1 → Frame 2 → Frame 3 (current)

Remember: Show the judges your spatial reasoning, temporal understanding, and context awareness. Make Gemini's unique capabilities obvious through detailed analysis.`;

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
    } catch (e) {
      console.error("❌ Stage C JSON parse failed. Raw model output:", text);
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
    
    return analysis;
    
  } catch (error) {
    console.error('❌ Gemini API error:', error);
    
    // Return error response in expected format
    return {
      detectedSign: null,
      confidence: 0,
      reasoning: `Analysis failed: ${error.message}`,
      handShape: "unknown - error occurred",
      handLocation: "unknown - error occurred",
      handOrientation: "unknown - error occurred",
      motion: "unknown - error occurred",
      spatialAnalysis: "Error during analysis - unable to process frames",
      temporalAnalysis: "Error during analysis - unable to track motion",
      contextRelevance: "Error during analysis - context unavailable",
      correction: null,
      alternativeSigns: [],
      differentiationNotes: "Error prevented differentiation analysis"
    };
  }
}

module.exports = { analyzeASLSign };