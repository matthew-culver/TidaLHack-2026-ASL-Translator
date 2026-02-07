import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * SIGN – Combined style
 * - Title screen uses your title.jpeg sketch as the full background.
 *   The chest area is an invisible (but clickable) hotspot.
 * - Main page uses a clean, black UI (no sketch background) with upload + record.
 *
 * Setup (Vite):
 * 1) Create: src/assets/
 * 2) Put your image there and name it exactly:
 *    - src/assets/title.jpeg
 */

import titleImg from "./assets/title.jpeg";

//send video file to backend and get translation response (placeholder for now)
async function sendVideoToBackend(file) {
  const form = new FormData();
  form.append("video", file);

  const res = await fetch("/api/translate", {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(txt || "Upload failed");
  }

  return res.json();
}


function PageFrame({ children }) {
  return (
    <div className="min-h-screen w-full bg-black text-neutral-50 flex items-center justify-center p-6">
      <div className="w-full max-w-6xl">{children}</div>
    </div>
  );
}

function ImageStage({ src, children }) {
  // Your sketch is ~4:3
  return (
    <div className="relative w-full aspect-[4/3] overflow-hidden rounded-3xl border border-neutral-800 bg-black shadow-[0_0_0_1px_rgba(255,255,255,0.06)]">
      <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
      {children}
    </div>
  );
}

function InvisibleHotspot({ label, rect, onClick }) {
  const style = {
    left: `${rect.left}%`,
    top: `${rect.top}%`,
    width: `${rect.width}%`,
    height: `${rect.height}%`,
  };
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="absolute bg-transparent focus:outline-none focus:ring-2 focus:ring-cyan-300/40 rounded-2xl"
      style={style}
    />
  );
}

const HOTSPOTS = {
  // Adjust if needed: percentage rect over the chest area in title.jpeg
  titleEnter: { left: 41.5, top: 35.0, width: 17.0, height: 14.0 },
};

function TitleScreen({ onEnter }) {
  return (
    <ImageStage src={titleImg}>
      {/* Invisible but clickable */}
      <InvisibleHotspot label="Enter SIGN" rect={HOTSPOTS.titleEnter} onClick={onEnter} />

      {/* Optional helper text (remove if you want 100% clean title) */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-white/70">
        Click the chest to start
      </div>
    </ImageStage>
  );
}

function NeonText({ children, className = "" }) {
  return (
    <div
      className={
        "text-cyan-200 drop-shadow-[0_0_14px_rgba(34,211,238,0.18)] " + className
      }
    >
      {children}
    </div>
  );
}

function Card({ children, className = "" }) {
  return (
    <div
      className={
        "rounded-3xl border border-neutral-800 bg-neutral-950/70 shadow-[0_0_0_1px_rgba(255,255,255,0.04)] " +
        className
      }
    >
      {children}
    </div>
  );
}

function AppScreen({ onBack }) {
  const [videoSrc, setVideoSrc] = useState("");
  const [mode, setMode] = useState("idle"); // idle | camera
  const [isRecording, setIsRecording] = useState(false);

  const [confidence, setConfidence] = useState(0.98);
  const [outputText, setOutputText] = useState("");

  const fileInputRef = useRef(null);
  const livePreviewRef = useRef(null);

  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);

  const confidenceLabel = useMemo(() => `${Math.round(confidence * 100)}%`, [confidence]);


  useEffect(() => {
    if (mode !== "camera") return;
    if (!livePreviewRef.current) return;
    if (!streamRef.current) return;

    livePreviewRef.current.srcObject = streamRef.current;

    // Some browsers need an explicit play() to render frames
    livePreviewRef.current.play?.().catch(() => {});
  }, [mode, videoSrc]);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (videoSrc) URL.revokeObjectURL(videoSrc);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (videoSrc) URL.revokeObjectURL(videoSrc);
    const url = URL.createObjectURL(file);
    setVideoSrc(url);

    // show preview immediately (keep this)
    setConfidence(0.98);
    setOutputText("Uploading…");

    // NEW: send to backend
    try {
      const data = await sendVideoToBackend(file);
      setOutputText(data.text || "(No text returned)");
    } catch (err) {
      setOutputText(`Upload error: ${err.message}`);
    }

    e.target.value = "";
  };

  const enableCamera = async () => {
    // Switch UI from recorded playback back to live preview
    if (videoSrc) {
      URL.revokeObjectURL(videoSrc);
      setVideoSrc("");
    }

    // If we have a stream but it’s dead, discard it
    if (streamRef.current) {
      const hasLiveTrack = streamRef.current
        .getTracks()
        .some((t) => t.readyState === "live");

      if (!hasLiveTrack) {
        streamRef.current = null;
      }
    }

    try {
      const stream =
        streamRef.current ??
        (await navigator.mediaDevices.getUserMedia({ video: true, audio: true }));

      streamRef.current = stream;
      setMode("camera");
      setOutputText("Camera enabled. You can start recording now.");
    } catch (err) {
      console.error(err);
      setOutputText("Could not access camera/microphone. Check permissions and try again.");
      setMode("idle");
    }
  };


  const startRecording = () => {
    if (!streamRef.current) {
      setOutputText("Enable camera first.");
      return;
    }

    try {
      chunksRef.current = [];
      const recorder = new MediaRecorder(streamRef.current, {
        mimeType: "video/webm;codecs=vp8,opus",
      });

      recorderRef.current = recorder;
      recorder.ondataavailable = (evt) => {
        if (evt.data && evt.data.size > 0) chunksRef.current.push(evt.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        const url = URL.createObjectURL(blob);
        if (videoSrc) URL.revokeObjectURL(videoSrc);
        setVideoSrc(url);
        
        if (livePreviewRef.current) {
          livePreviewRef.current.srcObject = null;
        }

        setMode("idle");
        setConfidence(0.98);
        setOutputText("(Preview) Recorded video saved. Send this blob to your backend for translation.");
      };

      recorder.start(250);
      setIsRecording(true);
      setOutputText("Recording… perform the sign(s), then stop.");
    } catch (err) {
      console.error(err);
      setOutputText("Recording failed. Your browser may not support MediaRecorder with this codec.");
    }
  };

  const stopRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
    setIsRecording(false);
  };

  const clear = () => {
    if (videoSrc) URL.revokeObjectURL(videoSrc);
    setVideoSrc("");
    setConfidence(0.98);
    setOutputText("");
  };

  return (
    <div className="w-full">
      <div className="flex items-center justify-between gap-4">
        <div>
          <NeonText className="text-2xl sm:text-3xl font-semibold">SIGN</NeonText>
          <div className="text-neutral-400 text-sm mt-1">Upload a video or record live</div>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="rounded-2xl border border-neutral-800 px-4 py-2 hover:bg-neutral-900/50 text-sm"
        >
          Back
        </button>
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Video */}
        <Card className="lg:col-span-8 p-4 sm:p-6">
          <div className="aspect-video rounded-2xl border border-neutral-800 bg-neutral-900/40 overflow-hidden flex items-center justify-center">
            {videoSrc ? (
              <video
                key={videoSrc}
                src={videoSrc}
                controls
                className="h-full w-full object-contain"
              />
            ) : mode === "camera" ? (
              <video
                key="live"
                ref={livePreviewRef}
                autoPlay
                muted
                playsInline
                className="h-full w-full object-cover pointer-events-none"
              />
            ) : (
              <div className="text-center px-6">
                <NeonText className="text-lg font-semibold">Upload Media</NeonText>
                <NeonText className="text-lg font-semibold">Record Video</NeonText>
                <div className="mt-2 text-sm text-neutral-400">Use the buttons below</div>
              </div>
            )}
          </div>

          <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={pickUpload} />

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-2xl border border-cyan-300/35 bg-cyan-300/5 hover:bg-cyan-300/10 px-4 py-3"
            >
              <NeonText className="font-semibold text-center">Upload video</NeonText>
            </button>

            <button
              type="button"
              onClick={enableCamera}
              className="rounded-2xl border border-neutral-800 bg-neutral-900/40 hover:bg-neutral-900/60 px-4 py-3"
            >
              <div className="text-center">
                <NeonText className="font-semibold">Enable camera</NeonText>
                <div className="text-xs text-neutral-400 mt-0.5">Required for recording</div>
              </div>
            </button>

            {isRecording ? (
              <button
                type="button"
                onClick={stopRecording}
                className="rounded-2xl border border-red-400/40 bg-red-400/10 hover:bg-red-400/15 px-4 py-3"
              >
                <div className="text-center">
                  <div className="font-semibold text-red-200">Stop recording</div>
                  <div className="text-xs text-neutral-300 mt-0.5">Save as preview</div>
                </div>
              </button>
            ) : (
              <button
                type="button"
                onClick={startRecording}
                disabled={mode !== "camera"}
                className="rounded-2xl border border-cyan-300/35 bg-cyan-300/5 hover:bg-cyan-300/10 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-3"
                title={mode !== "camera" ? "Enable camera first" : "Start recording"}
              >
                <div className="text-center">
                  <NeonText className="font-semibold">Start recording</NeonText>
                  <div className="text-xs text-neutral-400 mt-0.5">
                    {mode !== "camera" ? "Enable camera first" : "Record from webcam"}
                  </div>
                </div>
              </button>
            )}
          </div>

          <div className="mt-3 flex items-center justify-between">
            <div className="text-xs text-neutral-400">{mode === "camera" ? "Camera ready" : "Camera off"}</div>
            <button
              type="button"
              onClick={clear}
              className="text-xs rounded-xl border border-neutral-800 px-3 py-2 hover:bg-neutral-900/50"
            >
              Clear
            </button>
          </div>
        </Card>

        {/* Right: Confidence + Text */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          <Card className="p-5 sm:p-6">
            <NeonText className="text-lg font-semibold">Confidence: {confidenceLabel}</NeonText>
            <div className="mt-2 text-xs text-neutral-400">Placeholder until you wire up inference.</div>
          </Card>

          <Card className="p-5 sm:p-6 flex-1">
            <NeonText className="text-lg font-semibold">Text</NeonText>
            <div className="mt-3 rounded-2xl border border-neutral-800 bg-neutral-900/30 p-4 min-h-[180px]">
              {outputText ? (
                <div className="text-neutral-100 leading-relaxed text-sm">{outputText}</div>
              ) : (
                <div className="text-neutral-500 text-sm">Translation output will appear here…</div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function SignApp() {
  const [screen, setScreen] = useState("title"); // title | app

  return (
    <PageFrame>
      {screen === "title" ? (
        <TitleScreen onEnter={() => setScreen("app")} />
      ) : (
        <AppScreen onBack={() => setScreen("title")} />
      )}
    </PageFrame>
  );
}
