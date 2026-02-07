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
app.post("/api/translate/video", upload.single("video"), async (req, res) => {
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

const http = require("http");
const WebSocket = require("ws");

// instead of app.listen(...)
const server = http.createServer(app);

const wss = new WebSocket.Server({ server, path: "/ws" });

wss.on("connection", (ws) => {
  console.log("✅ WS client connected");

  ws.on("message", async (msg) => {
    try {
      const data = JSON.parse(msg.toString());

      if (data.type === "frame") {
        // data.image is base64 JPEG (no data:image/... prefix)
        const jpegBuffer = Buffer.from(data.image, "base64");

        // TODO: run your real inference here (pose/model/etc.)
        // For now: placeholder "live" response
        ws.send(
          JSON.stringify({
            type: "partial",
            text: "Live translating… (placeholder)",
            confidence: 0.87,
          })
        );
      }
    } catch (e) {
      ws.send(JSON.stringify({ type: "error", message: e.message }));
    }
  });

  ws.on("close", () => console.log("❌ WS client disconnected"));
});

// Start server
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📡 API endpoint: http://localhost:${PORT}/api/translate`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await mongoose.connection.close();
  console.log('MongoDB connection closed');
  process.exit(0);
});