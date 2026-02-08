const express = require('express');
const router = express.Router();
const { analyzeASLSign } = require('../services/gemini');
const { getVocabulary, saveTranslation, createSession, getSession } = require('../services/mongodb');
const { v4: uuidv4 } = require('uuid');
const shortlistCache = new Map();
const SHORTLIST_TTL_MS = 2000; // 2 seconds


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