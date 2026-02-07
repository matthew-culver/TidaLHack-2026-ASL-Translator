require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const multer = require('multer');


// Import routes
const translateRoute = require('./routes/translate');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: "http://localhost:5173",
  credentials: true,
}));
app.use(express.json({ limit: '50mb' })); // Large limit for base64 images
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Multer setup for handling video uploads
const upload = multer({ storage: multer.memoryStorage() });
app.post("/api/translate", upload.single("video"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No video uploaded" });
  }

  // Placeholder response for now
  res.json({
    text: "Got your video ✅ (placeholder translation)",
    filename: req.file.originalname,
    size: req.file.size,
  });
});


// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// Routes
app.use('/api/translate', translateRoute);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'ASL Translator API is running',
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// Health checkpoint for frontend proxy
app.get("/health", (req, res) => {
  res.json({ ok: true });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📡 API endpoint: http://localhost:${PORT}/api/translate`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await mongoose.connection.close();
  console.log('MongoDB connection closed');
  process.exit(0);
});