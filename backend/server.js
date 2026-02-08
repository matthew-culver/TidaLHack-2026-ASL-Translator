require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const multer = require('multer');
const crypto = require("crypto");
const { analyzeASLSign } = require("./services/gemini");
const { getVocabulary, saveTranslation } = require("./services/mongodb");
console.log('🔑 Loaded API Key:', process.env.GEMINI_API_KEY?.substring(0, 20) + '...');


// Import routes
const translateRoute = require('./routes/translate');
const ttsRoute = require("./routes/tts");


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
app.use("/api/tts", ttsRoute);

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

  const sessionId = `ws-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  // state
  let previousFrames = []; // data URLs
  let conversationContext = [];
  let lastGood = null;

  // cost/safety controls
  const MIN_CALL_MS = 650;          // Gemini max ~1.5 calls/sec (tune: 500–900)
  const DUP_TTL_MS = 2500;          // if frame unchanged recently, reuse last output
  const MAX_PREV_FRAMES = 2;        // send 2 prev + current
  const MAX_FRAME_BUFFER = 6;       // keep recent frames for future prevs

  let lastGeminiAt = 0;
  let lastHash = null;
  let lastHashAt = 0;
  let inFlight = false;

  const hashBase64 = (b64) =>
    crypto.createHash("sha1").update(b64).digest("hex");

  ws.on("message", async (msg) => {
    try {
      const data = JSON.parse(msg.toString());
      if (data.type !== "frame") return;

      const base64 = data.image || data.imageFrame;
      if (!base64) {
        ws.send(JSON.stringify({ type: "error", message: "Missing base64 in image/imageFrame" }));
        return;
      }

      // 1) Dedupe: same exact JPEG repeatedly → reuse last result
      const h = hashBase64(base64);
      const now = Date.now();

      if (lastHash && lastHash === h && (now - lastHashAt) < DUP_TTL_MS) {
        if (lastGood) {
          ws.send(JSON.stringify({
            type: "result",
            text: lastGood.text,
            confidence: lastGood.confidence,
            skipped: true
          }));
        }
        return;
      }
      lastHash = h;
      lastHashAt = now;

      // 2) Rate limit: don’t call Gemini too often
      if ((now - lastGeminiAt) < MIN_CALL_MS) {
        // optional: still echo lastGood to feel responsive
        if (lastGood) {
          ws.send(JSON.stringify({
            type: "partial",
            text: lastGood.text,
            confidence: lastGood.confidence,
            skipped: true
          }));
        }
        return;
      }

      // 3) In-flight lock: never stack calls
      if (inFlight) return;
      inFlight = true;
      lastGeminiAt = now;

      const imageFrame = `data:image/jpeg;base64,${base64}`;
      const prev = previousFrames.slice(-MAX_PREV_FRAMES);

      // vocab is cached in mongodb.js (30s TTL), so this is fine
      const vocabulary = await getVocabulary();

      const analysis = await analyzeASLSign(
        imageFrame,
        prev,
        conversationContext,
        vocabulary,
        sessionId
      );

      // update buffers
      previousFrames.push(imageFrame);
      if (previousFrames.length > MAX_FRAME_BUFFER) previousFrames = previousFrames.slice(-MAX_FRAME_BUFFER);

      if (analysis?.detectedSign) {
        conversationContext.push({ sign: analysis.detectedSign, confidence: analysis.confidence || 0 });
        if (conversationContext.length > 12) conversationContext = conversationContext.slice(-12);
      }

      // save (optional, for trail / history)
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
        frameCount: prev.length + 1
      });

      // format a fast-to-read message
      const label = analysis.detectedSign ?? "Unknown";
      const conf = typeof analysis.confidence === "number" ? analysis.confidence : 0;
      const textOut =
        `${label} (${Math.round(conf * 100)}%)\n\n` +
        (analysis.reasoning || "") +
        (analysis.correction ? `\n\nCorrection: ${analysis.correction}` : "");

      lastGood = { text: textOut, confidence: conf };

      ws.send(JSON.stringify({
        type: "result",
        text: textOut,
        confidence: conf,
        candidates: analysis.candidates,
        stageA: analysis.stageA
      }));

    } catch (e) {
      console.error("WS handler error:", e);
      ws.send(JSON.stringify({ type: "error", message: e.message }));
    } finally {
      inFlight = false;
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