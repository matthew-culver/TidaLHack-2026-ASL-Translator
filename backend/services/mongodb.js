let vocabCache = null;
let vocabCacheAt = 0;
const VOCAB_TTL_MS = 30_000; // 30 seconds

const SignVocabulary = require('../models/SignVocabulary');
const TranslationSession = require('../models/TranslationSession');
async function saveJudgeTrail(sessionId, entry) {
  try {
    return await TranslationSession.updateOne(
      { sessionId },
      {
        $push: { judgeTrail: entry },
        $set: { lastActivity: new Date() }
      },
      { upsert: true }
    );
  } catch (error) {
    console.error("Error saving judge trail:", error);
    throw error;
  }
}

/**
 * Get all signs from vocabulary
 */
async function getVocabulary({ forceRefresh = false } = {}) {
  try {
    const now = Date.now();

    if (!forceRefresh && vocabCache && (now - vocabCacheAt) < VOCAB_TTL_MS) {
      return vocabCache;
    }

    const signs = await SignVocabulary.find().lean();
    vocabCache = signs;
    vocabCacheAt = now;
    return signs;
  } catch (error) {
    console.error('Error fetching vocabulary:', error);
    throw error;
  }
}

/**
 * Save translation result to session
 */
async function saveTranslation(sessionId, translationData) {
  try {
    const result = await TranslationSession.findOneAndUpdate(
      { sessionId: sessionId },
      {
        $push: { translations: translationData },
        $set: { lastActivity: new Date() }
      },
      { 
        upsert: true,  // Create if doesn't exist
        new: true 
      }
    );
    return result;
  } catch (error) {
    console.error('Error saving translation:', error);
    throw error;
  }
}

/**
 * Create new session
 */
async function createSession(sessionId) {
  try {
    const session = new TranslationSession({
      sessionId: sessionId,
      translations: []
    });
    await session.save();
    return session;
  } catch (error) {
    console.error('Error creating session:', error);
    throw error;
  }
}

/**
 * Get session by ID
 */
async function getSession(sessionId) {
  try {
    const session = await TranslationSession.findOne({ sessionId }).lean();
    return session;
  } catch (error) {
    console.error('Error fetching session:', error);
    throw error;
  }
}

module.exports = {
  getVocabulary,
  saveTranslation,
  createSession,
  getSession,
  saveJudgeTrail
};