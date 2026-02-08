//translate.js
const express = require('express');
const router = express.Router();
const { analyzeASLSign } = require('../services/gemini');
const { getVocabulary, saveTranslation, createSession, getSession, saveJudgeTrail } = require('../services/mongodb');

const { v4: uuidv4 } = require('uuid');
const crypto = require("crypto");
const lastFrameHashBySession = new Map();
const LAST_HASH_TTL_MS = 10_000;
const lastGoodTranslationBySession = new Map();

/**
 * POST /api/translate
 * Main translation endpoint
 */
router.post('/', async (req, res) => {
  try {
    const { 
      imageFrame, 
      previousFrames, 
      sessionId, 
      conversationContext 
    } = req.body;
    
    // Validate input
    if (!imageFrame) {
      return res.status(400).json({
        success: false,
        error: 'imageFrame is required'
      });
    }
    // Basic dedupe: if same exact base64 arrives repeatedly, skip Gemini
    const key = sessionId || "no-session";

    // hash the base64 string (cheap enough)
    const base64 = imageFrame.replace(/^data:image\/\w+;base64,/, "");
    const h = crypto.createHash("sha1").update(base64).digest("hex");

    const prev = lastFrameHashBySession.get(key);
    const now = Date.now();

    if (prev && prev.hash === h && (now - prev.at) < LAST_HASH_TTL_MS) {
      const last = lastGoodTranslationBySession.get(key);
      return res.json({
        success: true,
        translation: last || {
          detectedSign: null,
          confidence: 0,
          reasoning: "Frame unchanged; skipped Gemini to save latency/cost.",
          handShape: "unknown",
          handLocation: "unknown",
          handOrientation: "unknown",
          motion: "static",
          spatialAnalysis: "Skipped (duplicate frame)",
          temporalAnalysis: "Skipped (duplicate frame)",
          contextRelevance: "Skipped (duplicate frame)",
          correction: null,
          alternativeSigns: [],
          differentiationNotes: "Skipped (duplicate frame)"
        },
        skipped: true,
        timestamp: new Date().toISOString()
      });
    }
    lastFrameHashBySession.set(key, { hash: h, at: now });
    if (lastFrameHashBySession.size > 500) {
      for (const [k, v] of lastFrameHashBySession) {
        if ((now - v.at) > LAST_HASH_TTL_MS) lastFrameHashBySession.delete(k);
      }
    }


    
    console.log(`\n🔄 Translation request for session: ${sessionId}`);
    console.log(`📊 Context: ${conversationContext?.length || 0} previous signs`);
    console.log(`🎞️ Frames: ${(previousFrames?.length || 0) + 1} total`);
    
    // Get vocabulary from database
    const vocabulary = await getVocabulary();
    console.log(`📚 Loaded ${vocabulary.length} signs from vocabulary`);
    
    // Call Gemini for analysis
    const analysis = await analyzeASLSign(
      imageFrame,
      previousFrames || [],
      conversationContext || [],
      vocabulary,
      sessionId || "no-session"
    );
    lastGoodTranslationBySession.set(key, analysis);

    
    // Save translation to database (if we have a session)
    if (sessionId) {
      await saveTranslation(sessionId, {
        timestamp: new Date(),
        detectedSign: analysis.detectedSign,
        confidence: analysis.confidence,
        reasoning: analysis.reasoning,
        handShape: analysis.handShape,
        handLocation: analysis.handLocation,
        handOrientation: analysis.handOrientation,
        motion: analysis.motion,
        spatialAnalysis: analysis.spatialAnalysis,
        temporalAnalysis: analysis.temporalAnalysis,
        contextRelevance: analysis.contextRelevance,
        correction: analysis.correction,
        alternativeSigns: analysis.alternativeSigns,
        differentiationNotes: analysis.differentiationNotes,
        frameCount: (previousFrames?.length || 0) + 1
      });
      await saveJudgeTrail(sessionId, {
        t: new Date().toISOString(),
        sign: analysis.detectedSign,
        conf: analysis.confidence,
        why: (analysis.reasoning || "").slice(0, 140),
        candidates: analysis.candidates || [],
        skipped: false
      });
      console.log(`💾 Saved translation to session ${sessionId}`);
    }
    
    // Return result
    res.json({
      success: true,
      translation: analysis,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Translation error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/translate/session/start
 * Create new translation session
 */
router.post('/session/start', async (req, res) => {
  try {
    const sessionId = uuidv4();
    await createSession(sessionId);
    
    console.log(`✨ Created new session: ${sessionId}`);
    
    res.json({
      success: true,
      sessionId: sessionId,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error creating session:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/translate/session/:sessionId
 * Get session history
 */
router.get('/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = await getSession(sessionId);
    
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }
    
    res.json({
      success: true,
      session: session
    });
  } catch (error) {
    console.error('Error fetching session:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/translate/vocabulary
 * Get all available signs
 */
router.get('/vocabulary', async (req, res) => {
  try {
    const vocabulary = await getVocabulary();
    
    res.json({
      success: true,
      signs: vocabulary,
      count: vocabulary.length
    });
  } catch (error) {
    console.error('Error fetching vocabulary:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;