const mongoose = require('mongoose');

const translationSchema = new mongoose.Schema({
  timestamp: {
    type: Date,
    default: Date.now
  },
  detectedSign: String,
  confidence: Number,
  reasoning: String,
  handShape: String,
  handLocation: String,
  handOrientation: String,
  motion: String,
  spatialAnalysis: String,
  temporalAnalysis: String,
  contextRelevance: String,
  correction: String,
  alternativeSigns: [{
    sign: String,
    confidence: Number,
    reason: String
  }],
  differentiationNotes: String,
  frameCount: Number
});

const translationSessionSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    unique: true
  },
  translations: [translationSchema],
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastActivity: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('TranslationSession', translationSessionSchema);