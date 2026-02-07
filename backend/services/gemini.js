const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Analyze ASL sign from video frames using Gemini's multimodal capabilities
 */
async function analyzeASLSign(currentFrame, previousFrames, conversationContext, vocabulary) {
  const model = genAI.getGenerativeModel({ 
    model: 'gemini-2.0-flash-exp',
    generationConfig: {
      temperature: 0.4,  // Lower = more consistent, higher = more creative
      topP: 0.8,
      topK: 40,
    }
  });
  
  // Build vocabulary reference string
  const vocabText = vocabulary.map(sign => {
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
  
  // Build conversation context string
  const contextText = conversationContext && conversationContext.length > 0
    ? conversationContext.slice(-5).map((c, i) => 
        `${i + 1}. "${c.sign}" (${Math.round(c.confidence * 100)}% confidence)`
      ).join(' → ')
    : "This is the first sign in the conversation.";
  
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

# CONVERSATION CONTEXT
Previous signs detected in this conversation:
${contextText}

# ANALYSIS REQUIREMENTS

## 1. SPATIAL ANALYSIS (CRITICAL - This is why we're using Gemini)
- Determine EXACT 3D hand position relative to body parts
  Example: "Hand is 12cm from chin, 5cm forward from face plane, 30° angle from vertical"
- Identify hand orientation in 3D space
  Example: "Palm facing 45° left, fingers pointing upward-forward at 20° from vertical"
- For two-handed signs: measure distance between hands
  Example: "Hands are 8cm apart, parallel orientation"
- NOTE: Describe position relative to BODY, not camera

## 2. TEMPORAL ANALYSIS (CRITICAL - This is why we need multiple frames)
- Track motion patterns across frames
  Example: "Frame 1: hand at chest. Frame 2: moved 3cm upward. Frame 3: reached chin. Motion complete."
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
  Example: "This is 'mother' not 'father' because: hand is at CHIN (15cm below forehead position). Vertical separation is clear - measured ~15cm lower."
- Reference the "Similar to" and "KEY DIFFERENCE" notes in vocabulary
- Be specific about what you observe that distinguishes signs

## 5. TEACHING/CORRECTION (Shows multimodal understanding)
- If sign is close but incorrect, provide specific correction
  Example: "Hand shape correct, but positioned at neck instead of chin. Move hand UP 5cm to properly sign 'mother'."
- Reference common mistakes from vocabulary

# YOUR RESPONSE FORMAT

You MUST respond with ONLY valid JSON (no markdown, no backticks, no explanation outside JSON):

{
  "detectedSign": "sign name from vocabulary OR null if unsure",
  "confidence": 0.85,
  "reasoning": "I observe [specific hand shape description], positioned at [exact 3D location with measurements], oriented [direction with angles]. The motion across frames shows [specific motion description]. This matches the '[SIGN]' sign because [list 3+ specific matching features]. I ruled out '[SIMILAR_SIGN]' because [specific observed difference with measurements].",
  
  "handShape": "detailed description: finger positions, thumb position, palm shape",
  "handLocation": "exact location: [body part] with measurements (e.g., '12cm from chin, 5cm forward')",
  "handOrientation": "palm facing [direction with angle], fingers pointing [direction with angle]",
  "motion": "static OR [type of motion]: direction, distance, speed, completion status",
  
  "spatialAnalysis": "Detailed 3D positioning with measurements: Hand is positioned [distance] from [body part], at [angle] from [reference plane]. Palm orientation: [angle] from [reference]. For two-handed: hands are [distance] apart, [relationship description].",
  
  "temporalAnalysis": "Motion tracking across frames: Frame 1: [position]. Frame 2: [new position], moved [direction] by [distance]. Frame 3: [final position]. Motion pattern: [linear/circular/oscillating], [complete/incomplete]. Duration: [fast/medium/slow].",
  
  "contextRelevance": "Based on previous signs '${conversationContext.map(c => c.sign).join(', ')}', this interpretation makes sense because [explain]. In ASL conversation flow, [explain pattern]. This suggests next sign might be [prediction].",
  
  "correction": null OR "Specific actionable feedback: '[WHAT'S WRONG]' - [SPECIFIC FIX with measurements]. Example: 'Hand is at neck level (observed) but should be at chin for this sign - move DOWN 5cm.'",
  
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

1. ✅ **Use MEASUREMENTS** - "12cm from chin" not "near chin"
2. ✅ **Show your work** - Explain WHY, don't just label
3. ✅ **Consider motion** - Static pose might be incomplete motion sign
4. ✅ **Use context** - Previous signs inform interpretation
5. ✅ **Be honest** - Low confidence + alternatives > wrong guess
6. ✅ **Teach** - Provide corrections to help user improve
7. ✅ **Differentiate clearly** - Explicitly state what distinguishes similar signs
8. ✅ **Only vocabulary** - Don't detect signs not in the list
9. ✅ **NO MARKDOWN** - Pure JSON only, no \`\`\`json or any formatting

# EXAMPLES OF GOOD VS BAD REASONING

❌ BAD: "Looks like sorry."
✅ GOOD: "Hand is in fist with thumb extended (ASL letter 'A'), positioned at center chest 10cm from body. Across 3 frames, hand moves in clockwise circular motion with ~8cm radius, completing 1.5 rotations. This matches 'sorry' sign because: (1) correct hand shape (fist+thumb, not flat hand), (2) correct location (over heart area), (3) circular motion present (not linear). I ruled out 'please' which also uses chest location, because 'please' requires FLAT hand, not fist - observed hand is clearly in fist configuration."

❌ BAD: "It's mother."
✅ GOOD: "Open palm with 5 fingers extended, thumb touching chin at midline, fingers pointing upward at 80° from horizontal. Position measured: hand contact point is at CHIN level (not forehead). This is 'mother' not 'father' because: vertical position is ~15cm BELOW where 'father' sign would be (forehead). The distinguishing feature is unambiguous - chin vs forehead placement creates clear vertical separation."

❌ BAD: "High confidence, it's 'hello'."
✅ GOOD: "Open palm at head level, 20cm from right temple. Motion analysis: Frame 1-3 shows hand oscillating side-to-side with ~10cm amplitude, 2 complete cycles. Palm remains facing forward throughout. This is 'hello' not 'goodbye' because: motion is SIDE-TO-SIDE oscillation (goodbye would show FINGERS FLEXING IN/OUT). The motion pattern is the key differentiator."

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
    let jsonText = text.trim();
    
    // Remove code blocks
    jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    
    // Remove any leading/trailing whitespace
    jsonText = jsonText.trim();
    
    // Parse JSON
    const analysis = JSON.parse(jsonText);
    
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