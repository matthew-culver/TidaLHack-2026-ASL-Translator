const express = require("express");
const router = express.Router();

// Node 22 has global fetch; if yours doesn't, install node-fetch and import it.
router.post("/", async (req, res) => {
  try {
    const { text, voiceId } = req.body;

    if (!text || !String(text).trim()) {
      return res.status(400).json({ success: false, error: "text is required" });
    }

    const VOICE = voiceId || process.env.ELEVENLABS_VOICE_ID;
    if (!VOICE) {
      return res.status(500).json({ success: false, error: "Missing ELEVENLABS_VOICE_ID" });
    }
    if (!process.env.ELEVENLABS_API_KEY) {
      return res.status(500).json({ success: false, error: "Missing ELEVENLABS_API_KEY" });
    }

    const url = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE}`;

    const r = await fetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": process.env.ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg"
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.5, similarity_boost: 0.8 }
      })
    });

    if (!r.ok) {
      const errText = await r.text();
      return res.status(500).json({ success: false, error: errText });
    }

    const audioArrayBuf = await r.arrayBuffer();
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");
    res.send(Buffer.from(audioArrayBuf));
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
