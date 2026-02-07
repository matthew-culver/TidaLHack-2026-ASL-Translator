const mongoose = require('mongoose');

const signVocabularySchema = new mongoose.Schema({
  signName: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  description: {
    type: String,
    required: true
  },
  handShape: String,
  location: String,
  motion: String,
  orientation: String,
  similarSigns: [String],
  differenceFromSimilar: String,
  commonMistakes: [String],
  isPhrase: {
    type: Boolean,
    default: false
  },
  referenceImageUrl: String,
  videoExampleUrl: String,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('SignVocabulary', signVocabularySchema);