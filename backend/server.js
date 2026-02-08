//server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const multer = require('multer');
const crypto = require("crypto");
const { analyzeASLSign } = require("./services/gemini");
const { getVocabulary, saveTranslation } = require("./services/mongodb");
// ✅ Vocabulary cache (prevents Mongo query every frame)
let vocabCache = { at: 0, data: null };
const VOCAB_TTL_MS = 60_000; // 60s; bump to 5min if vocab doesn't change
let quotaExhausted = false;

async function getVocabularyCached() {
  const now = Date.now();
  if (vocabCache.data && (now - vocabCache.at) < VOCAB_TTL_MS) return vocabCache.data;
  const data = await getVocabulary();
  vocabCache = { at: now, data };
  return data;
}

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
app.post("/api/translate/frames", async (req, res) => {
  try {
    const frames = req.body.frames;
    if (!Array.isArray(frames) || frames.length === 0) {
      return res.status(400).json({ error: "frames[] required" });
    }

    const sessionId = `upload-${Date.now()}`;
    const vocabulary = await getVocabularyCached();

    const currentFrame = frames[frames.length - 1];
    const prev = frames.slice(0, -1).slice(-2);

    const analysis = await analyzeASLSign(
      currentFrame,
      prev,
      [],        // conversationContext
      vocabulary,
      sessionId
    );

    const label = analysis.detectedSign ?? "Unknown";
    const conf = typeof analysis.confidence === "number" ? analysis.confidence : 0;

    res.json({
      text: `${label} (${Math.round(conf * 100)}%)\n\n${analysis.reasoning || ""}`,
      confidence: conf,
      analysis
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});


// Multer setup for handling video uploads
const upload = multer({ storage: multer.memoryStorage() });
app.post("/api/translate/video", upload.single("video"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No video uploaded" });
  }

  // Placeholder response for now
  res.json({
    text: "Video received ✅  (live mode uses Gemini in real time — use the camera button)",
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
  let latestBase64 = null;
  let processing = false;
  // cooldown when Gemini rate-limits / quota hits
  let cooldownUntil = 0;
  const COOLDOWN_MS = 20_000; // 20 seconds


  // cost/safety controls
  const MIN_CALL_MS = 2500;          // Gemini max ~1.5 calls/sec (tune: 500–900)
  const DUP_TTL_MS = 2500;          // if frame unchanged recently, reuse last output
  const MAX_PREV_FRAMES = 2;        // send 2 prev + current
  const MAX_FRAME_BUFFER = 6;       // keep recent frames for future prevs

  let lastGeminiAt = 0;
  let lastHash = null;
  let lastHashAt = 0;
  let inFlight = false;

  const hashBase64 = (b64) =>
    crypto.createHash("sha1").update(b64).digest("hex");

  ws.on("message", (msg) => {
  let data;
  try {
    data = JSON.parse(msg.toString());
  } catch {
    return;
  }
  if (data.type !== "frame") return;
  console.log("📩 frame received", { bytes: msg.length });

  const base64 = data.image || data.imageFrame;
  if (!base64) return;

  latestBase64 = base64;
  if (!processing) processLoop();
});

async function processLoop() {
  processing = true;

  while (latestBase64) {
    const base64 = latestBase64;
    latestBase64 = null;

    // ✅ Everything below is basically your old handler body,
    // but operating on "base64" rather than parsing msg again.

    let locked = false;
    try {
      const now = Date.now();

      // cooldown check
      if (now < cooldownUntil) {
        ws.send(JSON.stringify({
          type: "partial",
          text: lastGood ? lastGood.text : "Throttling (Gemini limit hit)…",
          confidence: lastGood ? lastGood.confidence : 0,
          skipped: true,
          throttled: true,
          status: "throttling"
        }));
        return;
      }


      const h = hashBase64(base64);

      // dedupe
      if (lastHash && lastHash === h && (now - lastHashAt) < DUP_TTL_MS) {
        ws.send(JSON.stringify({
          type: "partial",
          text: lastGood ? lastGood.text : "Frame unchanged…",
          confidence: lastGood ? lastGood.confidence : 0,
          skipped: true
        }));
        return;
      }

      lastHash = h;
      lastHashAt = now;

      // rate limit
      if ((now - lastGeminiAt) < MIN_CALL_MS) {
        ws.send(JSON.stringify({
          type: "partial",
          text: lastGood ? lastGood.text : "Waiting to query Gemini…",
          confidence: lastGood ? lastGood.confidence : 0,
          skipped: true
        }));
        return;
      }


      if (inFlight) continue;
      inFlight = true;
      locked = true;
      lastGeminiAt = now;

      const imageFrame = `data:image/jpeg;base64,${base64}`;
      const prev = previousFrames.slice(-MAX_PREV_FRAMES);

      const vocabulary = await getVocabularyCached();
      console.log("🤖 calling Gemini", { prevFrames: prev.length });

      const analysis = await analyzeASLSign(imageFrame, prev, conversationContext, vocabulary, sessionId);

      console.log("✅ Gemini returned", { sign: analysis?.detectedSign, conf: analysis?.confidence });

      previousFrames.push(imageFrame);
      if (previousFrames.length > MAX_FRAME_BUFFER) previousFrames = previousFrames.slice(-MAX_FRAME_BUFFER);

      if (analysis?.detectedSign) {
        conversationContext.push({ sign: analysis.detectedSign, confidence: analysis.confidence || 0 });
        if (conversationContext.length > 12) conversationContext = conversationContext.slice(-12);
      }

      // fire-and-forget save (from A2)
      saveTranslation(sessionId, {
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
      }).catch((e) => console.warn("saveTranslation failed:", e.message));

      const label = typeof analysis?.detectedSign === "string" ? analysis.detectedSign : null;
      const conf = typeof analysis?.confidence === "number" ? analysis.confidence : 0;

      const translationText = label || "";
      lastGood = { text: translationText, confidence: conf };

      ws.send(JSON.stringify({
        type: "result",
        text: translationText,
        confidence: conf,
        analysis: {
          detectedSign: analysis?.detectedSign ?? null,
          confidence: conf,
          candidates: analysis?.candidates,
          stageA: analysis?.stageA,
          reasoning: analysis?.reasoning,
          correction: analysis?.correction
        }
      }));
    } catch (e) {
      const msg = String(e?.message || e);
      // Daily quota exhausted: stop trying for this WS session
      if (msg.includes("GEMINI_DAILY_QUOTA_EXHAUSTED")) {
        quotaExhausted = true;
        ws.send(JSON.stringify({
          type: "error",
          message: "Gemini daily quota exhausted (free tier, per-project). Live translation paused."
        }));
        return;
      }

      const isRateLimit =
        msg.includes("429") ||
        msg.toLowerCase().includes("quota") ||
        msg.toLowerCase().includes("rate limit") ||
        msg.toLowerCase().includes("resource has been exhausted");

      if (isRateLimit) {
        cooldownUntil = Date.now() + COOLDOWN_MS;
        ws.send(JSON.stringify({
          type: "partial",
          text: lastGood ? lastGood.text : "",
          confidence: lastGood ? lastGood.confidence : 0,
          skipped: true,
          throttled: true,
          status: "throttling"
        }));
      } else {
        ws.send(JSON.stringify({ type: "error", message: msg }));
      }
    } finally {
      if (locked) inFlight = false;
    }
  }

  processing = false;
}

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