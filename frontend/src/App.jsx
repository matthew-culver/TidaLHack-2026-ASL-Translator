// App.jsx
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
const BACKEND_URL = "http://138.197.97.151:3001";

// ✅ BLUE THEME
import bgBlue from "./assets/bg.png";
import robotBlue from "./assets/Robot_Blue.png";
import robotGreen from "./assets/Robot_Green.png";
import robotHeadBlue from "./assets/robot_head_blue.png";
import appLogoBlue from "./assets/Logo.png";
import logoUBlue from "./assets/Logo_U.png";
import signBlue from "./assets/sign.png";

// ✅ ORANGE THEME
import bgOrange from "./assets/bg-orange.png";
import robotOrange from "./assets/robot_orange.png";
import robotOrangeGreen from "./assets/robot_orange_green.png";
import robotHeadOrange from "./assets/robot_head_orange.png";
import appLogoOrange from "./assets/logo_orange.png";
import logoUOrange from "./assets/logo_u_orange.png";
import signOrange from "./assets/sign_orange.png";

// send video file/blob to backend
async function sendVideoToBackend(fileOrBlob, filename = "recording.webm") {
  const form = new FormData();
  form.append("video", fileOrBlob, filename);

  const res = await fetch(`${BACKEND_URL}/api/translate/video`, { method: "POST", body: form });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(txt || "Upload failed");
  }
  return res.json();
}

function PageFrame({ children }) {
  return <div className="min-h-screen w-full relative">{children}</div>;
}

/**
 * ✅ Smooth fade between theme backgrounds
 */
function FixedBackground({ bgSrc }) {
  return (
    <>
      <div className="fixed inset-0 -z-20 bg-black" />
      <div className="fixed inset-0 -z-10">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={bgSrc}
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28, ease: "easeInOut" }}
            style={{
              backgroundImage: `url(${bgSrc})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              backgroundRepeat: "no-repeat",
            }}
          />
        </AnimatePresence>
      </div>
    </>
  );
}

/** Glass UI helpers **/
function Card({ children, className = "", isOrange }) {
  // ✅ On orange theme: slightly darker translucent panel background
  const bg = isOrange ? "bg-black/28" : "bg-white/18";
  return (
    <div
      className={
        "overflow-hidden rounded-3xl border border-white/30 " +
        bg +
        " backdrop-blur-xl " +
        "shadow-[0_18px_55px_rgba(0,0,0,0.22)] " +
        className
      }
    >
      {children}
    </div>
  );
}

function Toast({ show, text, isOrange }) {
  return (
    <AnimatePresence>
      {show ? (
        <motion.div
          className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[9999]"
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.98 }}
          transition={{ duration: 0.18 }}
        >
          <div
            className="rounded-2xl border border-white/50 bg-white/18 backdrop-blur-xl px-4 py-2 shadow-[0_18px_55px_rgba(0,0,0,0.30)] text-sm"
            style={{ color: isOrange ? "white" : "#0f172a" }}
          >
            {text}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/** Shared Theme Toggle Button (same look everywhere, no background box) **/
function ThemeToggleButton({ onClick, imgSrc, alt = "Toggle theme", darkBlueShadow }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Toggle theme"
      aria-label="Toggle theme"
      className="p-0 bg-transparent border-0 outline-none focus:outline-none"
      style={{ WebkitTapHighlightColor: "transparent" }}
    >
      <div className="relative h-10 w-10">
        <AnimatePresence mode="wait" initial={false}>
          <motion.img
            key={imgSrc}
            src={imgSrc}
            alt={alt}
            draggable={false}
            className="
              h-10 w-10
              object-contain
              select-none
              transition-transform duration-150
              hover:scale-110
            "
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeInOut" }}
            style={{
              filter: `drop-shadow(0 0 10px ${darkBlueShadow}) drop-shadow(0 10px 18px rgba(2,32,88,0.45))`,
            }}
          />
        </AnimatePresence>
      </div>
    </button>
  );
}

/** More dramatic flow-in + zoom-out exit **/
const panelFlow = {
  initial: { opacity: 0, scale: 0.74, y: 70, rotateX: 14, filter: "blur(12px)" },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    rotateX: 0,
    filter: "blur(0px)",
    transition: { type: "spring", stiffness: 220, damping: 15, mass: 0.6 },
  },
  exit: {
    opacity: 0,
    scale: 0.82,
    y: 40,
    rotateX: 10,
    filter: "blur(10px)",
    transition: { duration: 0.22, ease: "easeInOut" },
  },
};

const headerFlow = {
  initial: { opacity: 0, scale: 0.9, y: 20, filter: "blur(8px)" },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { type: "spring", stiffness: 260, damping: 18, mass: 0.7 },
  },
  exit: { opacity: 0, scale: 0.92, y: 12, filter: "blur(8px)", transition: { duration: 0.18 } },
};

const stagger = {
  initial: {},
  animate: { transition: { staggerChildren: 0.12, delayChildren: 0.06 } },
  exit: { transition: { staggerChildren: 0.06, staggerDirection: -1 } },
};

/**
 * HOME
 * ✅ All theme-visible assets crossfade: Logo_U, Robot base, Eyes overlay, Sign, START glow
 * ✅ Theme toggle button matches main page (no box)
 */
function HomeScreen({ onStart, assets, isOrange, toggleTheme }) {
  const [starting, setStarting] = useState(false);

  const begin = () => {
    if (starting) return;
    setStarting(true);
    window.setTimeout(() => onStart(), 620);
  };

  // Press Enter / Space anywhere on the home screen to start
  useEffect(() => {
    const onKeyDown = (e) => {
      if (starting) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        begin();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [starting]);

  const darkBlueShadow = "rgba(2, 32, 88, 0.70)";

  const startGlowBlue = `
    0 0 10px rgba(56,189,248,1),
    0 0 26px rgba(56,189,248,0.95),
    0 0 60px rgba(56,189,248,0.75),
    0 0 110px rgba(56,189,248,0.55)
  `;
  const startGlowOrange = `
    0 0 10px rgba(251,146,60,1),
    0 0 26px rgba(251,146,60,0.95),
    0 0 60px rgba(251,146,60,0.75),
    0 0 110px rgba(251,146,60,0.55)
  `;

  const startDropBlue = "drop-shadow(0 0 22px rgba(56,189,248,0.95))";
  const startDropOrange = "drop-shadow(0 0 22px rgba(251,146,60,0.95))";

  return (
    <div className="fixed inset-0 overflow-hidden w-full flex items-center justify-center p-6">
      {/* ✅ Theme toggle (same as main page, no background box) */}
      <div className="absolute top-6 right-6 z-[80]">
        <ThemeToggleButton
          onClick={toggleTheme}
          imgSrc={assets.robotHead}
          alt="Toggle theme"
          darkBlueShadow={darkBlueShadow}
        />
      </div>

      <motion.div
        className="relative"
        initial={{ opacity: 0, y: 18, scale: 0.98, filter: "blur(8px)" }}
        animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
        exit={{ opacity: 0, transition: { duration: 0.18 } }}
        transition={{ type: "spring", stiffness: 220, damping: 16, mass: 0.7 }}
      >
        <motion.div
          className="relative select-none"
          initial={false}
          animate={
            starting
              ? { scale: 1.12, opacity: 0, rotateZ: -1.2, filter: "blur(10px)" }
              : { scale: 1, opacity: 1, rotateZ: 0, filter: "blur(0px)" }
          }
          transition={starting ? { duration: 0.52, ease: "easeInOut" } : { duration: 0.22 }}
        >
          {/* ✅ Logo_U behind robot — crossfade */}
          <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-18/32 w-[min(50vw,500px)] h-auto z-0">
            <AnimatePresence mode="wait" initial={false}>
              <motion.img
                key={assets.logoU}
                src={assets.logoU}
                alt=""
                draggable={false}
                className="w-full h-auto"
                initial={{ opacity: 0 }}
                animate={
                  starting
                    ? { opacity: 1, scale: 1.12, filter: "blur(6px)" }
                    : { opacity: 1, scale: 1.0, filter: "blur(0px)" }
                }
                exit={{ opacity: 0 }}
                transition={{ duration: 0.28, ease: "easeInOut" }}
                style={{
                  mixBlendMode: "screen",
                  filter: "drop-shadow(0 28px 90px rgba(0,0,0,0.35))",
                }}
              />
            </AnimatePresence>
          </div>

          {/* ✅ Robot base — crossfade on theme change */}
          <div className="relative z-20 w-[min(95vw,750px)]">
            <AnimatePresence mode="wait" initial={false}>
              <motion.img
                key={assets.robotBase}
                src={assets.robotBase}
                alt="Robot"
                draggable={false}
                className="w-full h-auto drop-shadow-[0_32px_110px_rgba(0,0,0,0.50)]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.22, ease: "easeInOut" }}
                style={{ transform: "translateY(-40px) translateX(-2.5px)" }}
              />
            </AnimatePresence>

            {/* ✅ Eyes overlay — crossfade AND still does "starting" fade-in */}
            <AnimatePresence mode="wait" initial={false}>
              <motion.img
                key={assets.robotEyes}
                src={assets.robotEyes}
                alt=""
                draggable={false}
                className="pointer-events-none absolute inset-0 z-30 w-full h-full"
                initial={{ opacity: 0 }}
                animate={{ opacity: starting ? 1 : 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.22, ease: "easeInOut" }}
                style={{ transform: "translateY(-40px) translateX(-2.5px)" }}
              />
            </AnimatePresence>

            {/* ✅ SIGN — crossfade */}
            <div
              className="pointer-events-none absolute left-1/2 -translate-x-1/2 z-40"
              style={{
                top: "41%",
                left: "56.5%",
                width: "13%",
                height: "14%",
                transform: "translate(-50%, -50px)",
              }}
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.img
                  key={assets.sign}
                  src={assets.sign}
                  alt=""
                  draggable={false}
                  className="w-full h-full object-contain"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.98 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.22, ease: "easeInOut" }}
                  style={{
                    filter:
                      "drop-shadow(0 0 2px rgba(0,0,0,0.9)) " +
                      "drop-shadow(0 0 10px rgba(0,0,0,0.55)) " +
                      "drop-shadow(0 18px 55px rgba(0,0,0,0.55))",
                  }}
                />
              </AnimatePresence>
            </div>
          </div>

          {/* ✅ START — crossfade glow between themes */}
          <div className="absolute left-1/2 -translate-x-29/64 z-50" style={{ bottom: "-34px" }}>
            <button
              type="button"
              onClick={begin}
              disabled={starting}
              className="bg-transparent border-0 outline-none focus:outline-none"
              style={{ WebkitTapHighlightColor: "transparent" }}
              aria-label="Start"
              title="Start"
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={isOrange ? "start-orange" : "start-blue"}
                  initial={{ opacity: 0 }}
                  animate={
                    starting
                      ? { opacity: 0.25, scale: 0.98, letterSpacing: "0.42em" }
                      : { opacity: 1, scale: 1, letterSpacing: "0.34em" }
                  }
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18, ease: "easeInOut" }}
                  className="uppercase font-semibold text-[clamp(32px,6.2vw,64px)]"
                  style={{
                    color: "white",
                    textShadow: isOrange ? startGlowOrange : startGlowBlue,
                    filter: isOrange ? startDropOrange : startDropBlue,
                  }}
                >
                  START
                </motion.div>
              </AnimatePresence>
            </button>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}

/**
 * ✅ Activity panel rendered in a portal
 * ✅ Uses useLayoutEffect to compute position BEFORE paint
 * ✅ Does not render until pos is ready → no snap / choppy animation
 */
function ActivityDropdown({ open, anchorRef, onClose, smallBtn, uiStats, isLiveTranslating, events, textColor, isOrange }) {
  const [pos, setPos] = useState(null);

  const computePos = () => {
    const el = anchorRef.current;
    if (!el) return null;

    const r = el.getBoundingClientRect();
    const width = window.innerWidth < 640 ? 340 : 380;

    const left = Math.min(window.innerWidth - width - 12, Math.max(12, r.right - width));
    const top = Math.min(window.innerHeight - 12, r.bottom + 10);

    return { top, left, width };
  };

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const p = computePos();
    if (p) setPos(p);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const update = () => {
      const p = computePos();
      if (p) setPos(p);
    };

    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);

    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);

    const onOutside = (e) => {
      const btn = anchorRef.current;
      if (btn && btn.contains(e.target)) return;
      onClose();
    };
    window.addEventListener("pointerdown", onOutside);

    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onOutside);
    };
  }, [open, onClose, anchorRef]);

  if (!open) return null;
  if (!pos) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="activity"
        className="fixed z-[99999]"
        style={{ top: pos.top, left: pos.left, width: pos.width }}
        initial={{ opacity: 0, y: 8, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.96 }}
        transition={{ duration: 0.16 }}
      >
        <Card className="p-4" isOrange={isOrange}>
          <div className="flex items-center justify-between">
            <div className="text-sm" style={{ color: textColor, opacity: 0.75 }}>
              Activity
            </div>
            <button type="button" onClick={onClose} className={smallBtn} style={{ color: textColor }}>
              Close
            </button>
          </div>

          <div className="mt-3 rounded-2xl bg-white/10 p-3">
            <div className="flex items-center justify-between text-xs" style={{ color: textColor, opacity: 0.75 }}>
              <div>Frames sent</div>
              <div style={{ color: textColor, fontWeight: 700 }}>{uiStats.frames}</div>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs" style={{ color: textColor, opacity: 0.75 }}>
              <div>Estimated FPS</div>
              <div style={{ color: textColor, fontWeight: 700 }}>{uiStats.fps || 0}</div>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs" style={{ color: textColor, opacity: 0.75 }}>
              <div>Status</div>
              <div style={{ color: textColor, fontWeight: 700 }}>{isLiveTranslating ? "LIVE" : "Idle"}</div>
            </div>
          </div>

          <div className="mt-3 space-y-2 max-h-[220px] overflow-auto pr-1">
            {events.length === 0 ? (
              <div className="text-sm" style={{ color: textColor, opacity: 0.6 }}>
                No events yet.
              </div>
            ) : (
              events.map((e, idx) => (
                <div key={idx} className="flex items-start justify-between gap-3 text-sm">
                  <div style={{ color: textColor }}>{e.label}</div>
                  <div className="text-xs whitespace-nowrap" style={{ color: textColor, opacity: 0.55 }}>
                    {e.ts}
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}

function AppScreen({ onHome, assets, toggleTheme, isOrange, textColor }) {
  const [videoSrc, setVideoSrc] = useState("");
  const [mode, setMode] = useState("idle"); // idle | camera

  const [confidence, setConfidence] = useState(0);
  const [outputText, setOutputText] = useState("");

  const [isSending, setIsSending] = useState(false);
  const [events, setEvents] = useState([]);

  const fileInputRef = useRef(null);
  const livePreviewRef = useRef(null);

  const streamRef = useRef(null);

  const confidencePct = Math.round(confidence * 100);
  const confidenceLabel = useMemo(() => `${confidencePct}%`, [confidencePct]);

  // Activity popup
  const [showActivity, setShowActivity] = useState(false);
  const activityBtnRef = useRef(null);

  // WS + live translation state
  const [isLiveTranslating, setIsLiveTranslating] = useState(false);
  const isLiveRef = useRef(false);

  useEffect(() => {
    isLiveRef.current = isLiveTranslating;
  }, [isLiveTranslating]);

  const wsRef = useRef(null);
  const canvasRef = useRef(null);
  const liveLoopRef = useRef(null);

  // performance stats (shown in activity)
  const statsRef = useRef({
    framesSent: 0,
    lastSentAt: 0,
    fpsEMA: 0,
    lastPartialAt: 0,
  });
  const [uiStats, setUiStats] = useState({ fps: 0, frames: 0 });

  // Camera enabled derived state
  const [cameraEnabled, setCameraEnabled] = useState(false);

  // toast
  const [toast, setToast] = useState({ show: false, text: "" });
  const toastTimerRef = useRef(null);

  const showToast = (text) => {
    setToast({ show: true, text });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast({ show: false, text: "" }), 1200);
  };

  const pushEvent = (label) =>
    setEvents((prev) => [{ label, ts: new Date().toLocaleTimeString() }, ...prev].slice(0, 10));

  useEffect(() => {
    const hasLiveTrack =
      !!streamRef.current && streamRef.current.getTracks().some((t) => t.readyState === "live");
    setCameraEnabled(hasLiveTrack && mode === "camera");
  }, [mode]);

  useEffect(() => {
    if (mode !== "camera") return;
    if (!livePreviewRef.current) return;
    if (!streamRef.current) return;
    livePreviewRef.current.srcObject = streamRef.current;
    livePreviewRef.current.play?.().catch(() => {});
  }, [mode, videoSrc]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      const s = statsRef.current;
      setUiStats({ fps: Math.round(s.fpsEMA * 10) / 10, frames: s.framesSent });
    }, 600);
    return () => clearInterval(id);
  }, []);

  const pickUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (videoSrc) URL.revokeObjectURL(videoSrc);
    const url = URL.createObjectURL(file);
    setVideoSrc(url);
    setMode("idle");

    setIsSending(true);
    setOutputText("Uploading…");
    pushEvent(`Selected upload: ${file.name}`);

    try {
      pushEvent("Sending to backend…");
      const data = await sendVideoToBackend(file, file.name);
      setOutputText(data.text || "(No text returned)");
      pushEvent("Translation received ✅");
      showToast("Translation received");
    } catch (err) {
      setOutputText(`Upload error: ${err.message}`);
      pushEvent("Upload failed ❌");
      showToast("Upload failed");
    } finally {
      setIsSending(false);
    }

    e.target.value = "";
  };

  const stopLiveTranslation = () => {
    isLiveRef.current = false;
    setIsLiveTranslating(false);

    if (liveLoopRef.current) {
      clearTimeout(liveLoopRef.current);
      liveLoopRef.current = null;
    }
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {}
      wsRef.current = null;
    }

    setOutputText("Live translation stopped.");
    pushEvent("Live translation stopped");
    showToast("Live translation stopped");
  };

  const disableCamera = () => {
    if (isLiveTranslating) stopLiveTranslation();

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (livePreviewRef.current) livePreviewRef.current.srcObject = null;

    setMode("idle");
    setCameraEnabled(false);
    pushEvent("Camera disabled");
    showToast("Camera disabled");
  };

  const enableCamera = async () => {
    if (videoSrc) {
      URL.revokeObjectURL(videoSrc);
      setVideoSrc("");
    }

    if (streamRef.current) {
      const hasLiveTrack = streamRef.current.getTracks().some((t) => t.readyState === "live");
      if (!hasLiveTrack) streamRef.current = null;
    }

    try {
      const stream =
        streamRef.current ?? (await navigator.mediaDevices.getUserMedia({ video: true, audio: false }));
      streamRef.current = stream;

      setMode("camera");
      setCameraEnabled(true);
      pushEvent("Camera enabled");
      showToast("Camera enabled");
    } catch (err) {
      console.error(err);
      setMode("idle");
      setCameraEnabled(false);
      setOutputText("Could not access camera/microphone. Check permissions and try again.");
      pushEvent("Camera error ❌");
      showToast("Camera permission error");
    }
  };

  const toggleCamera = () => {
    if (cameraEnabled) disableCamera();
    else enableCamera();
  };

  const startLiveTranslation = async () => {
    // ✅ Unlock audio autoplay on the same user gesture
    try {
      const a = new Audio();
      a.muted = true;
      await a.play();
      a.pause();
      a.src = "";
    } catch (e) {
      console.warn("Audio unlock failed:", e);
    }
    if (!livePreviewRef.current || !canvasRef.current) {
      setOutputText("Enable camera first.");
      return;
    }
    if (!cameraEnabled) {
      setOutputText("Enable camera first.");
      return;
    }
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;

    setOutputText("Connecting to live translation…");
    pushEvent("Connecting to live translation…");
    showToast("Connecting…");

    statsRef.current.framesSent = 0;
    statsRef.current.fpsEMA = 0;
    statsRef.current.lastSentAt = 0;
    statsRef.current.lastPartialAt = 0;

    if (liveLoopRef.current) {
      clearTimeout(liveLoopRef.current);
      liveLoopRef.current = null;
    }
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {}
      wsRef.current = null;
    }

    const proto = location.protocol === "https:" ? "wss" : "ws";
    const wsHost = "138.197.97.151:3001"; 

    const ws = new WebSocket(`${proto}://${wsHost}/ws`);
    wsRef.current = ws;

    const connectTimeout = setTimeout(() => {
      if (wsRef.current === ws && ws.readyState !== WebSocket.OPEN) {
        setOutputText("Live translation failed to connect (timeout). Check WS route (/ws) and server logs.");
        pushEvent("WS connect timeout ❌");
        showToast("WS timeout");
        try {
          ws.close();
        } catch {}
      }
    }, 4000);

    ws.onopen = async () => {
      clearTimeout(connectTimeout);

      isLiveRef.current = true;
      setIsLiveTranslating(true);
      setOutputText("Live translation started…");
      pushEvent("Live translation started");
      showToast("Live started");

      const video = livePreviewRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });

      const waitForVideoReady = async () => {
        if (video.videoWidth > 0 && video.videoHeight > 0) return true;
        for (let i = 0; i < 20; i++) {
          await new Promise((r) => setTimeout(r, 50));
          if (video.videoWidth > 0 && video.videoHeight > 0) return true;
        }
        return false;
      };

      const ready = await waitForVideoReady();
      if (!ready) {
        setOutputText("Camera stream not ready yet (no video dimensions). Try again after a second.");
        pushEvent("Video not ready ❌");
        showToast("Video not ready");
        stopLiveTranslation();
        return;
      }

      const FPS = 2;
      const intervalMs = Math.round(1000 / FPS);

      const loop = () => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        if (!isLiveRef.current) return;

        const w = video.videoWidth || 640;
        const h = video.videoHeight || 480;

        const targetW = 300;
        const targetH = Math.max(1, Math.round((h / w) * targetW));

        canvas.width = targetW;
        canvas.height = targetH;

        ctx.drawImage(video, 0, 0, targetW, targetH);

        const jpegDataUrl = canvas.toDataURL("image/jpeg", 0.55);
        const base64 = jpegDataUrl.split(",")[1];

        const now = performance.now();
        const s = statsRef.current;
        if (s.lastSentAt) {
          const instFps = 1000 / Math.max(1, now - s.lastSentAt);
          s.fpsEMA = s.fpsEMA ? s.fpsEMA * 0.8 + instFps * 0.2 : instFps;
        }
        s.lastSentAt = now;
        s.framesSent += 1;

        const payload = { type: "frame", imageFrame: base64, image: base64 };

        try {
          wsRef.current.send(JSON.stringify(payload));
        } catch (e) {
          console.error("WS send failed", e);
          setOutputText("Live translation send failed. Connection may have dropped.");
          pushEvent("WS send failed ❌");
          showToast("Send failed");
          stopLiveTranslation();
          return;
        }

        liveLoopRef.current = setTimeout(loop, intervalMs);
      };

      loop();
    };

    ws.onmessage = (evt) => {
      let msg;
      try {
        msg = JSON.parse(evt.data);
      } catch {
        console.warn("WS non-JSON message:", evt.data);
        setOutputText(String(evt.data));
        return;
      }

      if (msg.type === "partial" || msg.type === "result") {
        setOutputText(msg.text ?? "");
        if (msg.throttled) pushEvent("Throttling (Gemini limits)");
        if (typeof msg.confidence === "number") setConfidence(msg.confidence);
        statsRef.current.lastPartialAt = performance.now();

        // ✅ speak only on real "result" messages that have actual text
        if (msg.type === "result" && msg.text && msg.text.trim()) {
          playTTS(msg.text);
        }
      } else if (msg.type === "error") {
        setOutputText(`Live error: ${msg.message || "Unknown error"}`);
        pushEvent("Backend error ❌");
        showToast("Backend error");
      } else {
        if (msg.text) setOutputText(msg.text);
      }
    };

    ws.onerror = (e) => {
      console.error("WS error", e);
      setOutputText("Live translation connection error. Check WS route (/ws) and server logs.");
      pushEvent("WS error ❌");
      showToast("WS error");
    };

    ws.onclose = (e) => {
      console.log("WS closed", e.code, e.reason);

      if (isLiveRef.current) {
        setOutputText(`Live translation disconnected (code ${e.code}${e.reason ? `: ${e.reason}` : ""}).`);
        pushEvent("WS closed ❌");
        showToast("Disconnected");
      }

      isLiveRef.current = false;
      setIsLiveTranslating(false);

      if (liveLoopRef.current) {
        clearTimeout(liveLoopRef.current);
        liveLoopRef.current = null;
      }

      if (wsRef.current === ws) wsRef.current = null;
    };
  };

  // Clear ONLY the text output (do not touch uploaded videoSrc)
  const clear = () => {
    setConfidence(0);
    setOutputText("");
    pushEvent("Cleared text");
    showToast("Cleared");
  };

  const copyText = async () => {
    const text = outputText ?? "";
    if (!text.trim()) return showToast("Nothing to copy");

    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      pushEvent("Copied translation ✅");
      showToast("Copied");
    } catch {
      showToast("Copy failed");
    }
  };
    // --- TTS autoplay unlock ---
    const [audioEnabled, setAudioEnabled] = useState(false);
    const audioRef = useRef(null);
    const lastSpokenRef = useRef("");

    const enableAudio = async () => {
      setAudioEnabled(true);
      try {
        // prime the audio system (must be user-initiated)
        const a = new Audio();
        a.muted = true;
        await a.play().catch(() => {});
        a.pause();
      } catch {}
      pushEvent("🔊 Audio enabled");
      showToast("Audio enabled");
    };

    const playTTS = async (text) => {
      if (!audioEnabled) return; // ✅ required for autoplay rules
      if (!text || !text.trim()) return;

      const clean = text.trim();
      if (clean === lastSpokenRef.current) return; // ✅ dedupe repeats
      lastSpokenRef.current = clean;

      try {
        const response = await fetch(`${BACKEND_URL}/api/tts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: clean,
            voiceId: "21m00Tcm4TlvDq8ikWAM",
          }),
        });

        if (!response.ok) {
          const err = await response.text();
          console.error("TTS failed:", err);
          pushEvent("🔇 TTS failed");
          showToast("TTS failed");
          return;
        }

        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);

        if (!audioRef.current) audioRef.current = new Audio();
        const audio = audioRef.current;

        audio.src = audioUrl;
        audio.onended = () => URL.revokeObjectURL(audioUrl);

        await audio.play().catch((e) => {
          console.error("audio.play() failed:", e);
        });

        pushEvent("🔊 Played audio");
      } catch (err) {
        console.error("TTS error:", err);
        pushEvent("TTS error ❌");
      }
    };

  const handleHome = () => {
    if (isLiveTranslating) stopLiveTranslation();
    if (cameraEnabled) disableCamera();
    if (videoSrc) URL.revokeObjectURL(videoSrc);
    onHome();
  };

  const r = 34;
  const c = 2 * Math.PI * r;
  const dash = (confidencePct / 100) * c;

  const darkBlueShadow = "rgba(2, 32, 88, 0.70)";

  const iconBtn =
    "rounded-2xl border border-white/50 bg-white/18 backdrop-blur-xl hover:bg-white/24 " +
    "px-4 py-2 transition " +
    "shadow-[0_10px_26px_rgba(2,32,88,0.55)]";

  const smallBtn =
    "text-xs rounded-xl border border-white/50 bg-white/18 backdrop-blur-xl px-3 py-2 hover:bg-white/24 transition";

  const primaryBtn =
    "w-full h-[74px] rounded-2xl border border-white/50 bg-white/18 backdrop-blur-xl " +
    "hover:bg-white/24 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-3 " +
    "shadow-[0_10px_24px_rgba(0,0,0,0.12)] flex flex-col items-center justify-center";

  const innerPane = isOrange
    ? "rounded-2xl bg-black/20 shadow-[0_10px_24px_rgba(0,0,0,0.22)] overflow-hidden"
    : "rounded-2xl bg-white/10 shadow-[0_10px_24px_rgba(0,0,0,0.10)] overflow-hidden";

  // ✅ Fix: translation textbox not transparent in orange theme
  const translationPane = isOrange
    ? "rounded-2xl border border-white/60 bg-white/20 backdrop-blur-sm shadow-[0_14px_36px_rgba(0,0,0,0.35)] overflow-hidden"
    : "rounded-2xl border border-white/50 bg-white/45 shadow-[0_10px_24px_rgba(0,0,0,0.10)] overflow-hidden";

  // ✅ orange glow behind app logo for visibility in orange theme
  const logoGlow = isOrange
    ? {
        filter:
          "drop-shadow(0 0 10px rgba(251,146,60,0.95)) drop-shadow(0 0 26px rgba(251,146,60,0.75)) drop-shadow(0 14px 55px rgba(251,146,60,0.45))",
      }
    : {
        filter: "drop-shadow(0 14px 45px rgba(0,0,0,0.18))",
      };

  // ✅ confidence ring color toggles (blue -> orange)
  const ringColor = isOrange ? "#FB923C" : "#0EA5E9";

  return (
    <div className="relative min-h-screen w-full" style={{ color: textColor }}>
      <canvas ref={canvasRef} className="hidden" />
      <Toast show={toast.show} text={toast.text} isOrange={isOrange} />

      <ActivityDropdown
        open={showActivity}
        anchorRef={activityBtnRef}
        onClose={() => setShowActivity(false)}
        smallBtn={smallBtn}
        uiStats={uiStats}
        isLiveTranslating={isLiveTranslating}
        events={events}
        textColor={textColor}
        isOrange={isOrange}
      />

      <motion.div
        className="relative z-10 h-[calc(100vh-0.5rem)] sm:h-[calc(100vh-0.75rem)] overflow-hidden rounded-[44px] p-3 sm:p-4"
        variants={stagger}
        initial="initial"
        animate="animate"
        exit="exit"
      >
        {/* HEADER */}
        <motion.div variants={headerFlow} className="flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={handleHome}
            title="Go to home"
            aria-label="Go to home"
            className="p-0 bg-transparent border-0 outline-none focus:outline-none"
            style={{ WebkitTapHighlightColor: "transparent" }}
          >
            <div className="relative h-12 sm:h-14 w-auto" style={logoGlow}>
              <AnimatePresence mode="wait" initial={false}>
                <motion.img
                  key={assets.appLogo}
                  src={assets.appLogo}
                  alt="USign Home"
                  draggable={false}
                  className="
                    h-12 sm:h-14
                    w-auto
                    object-contain
                    select-none
                    transition-transform duration-150
                    hover:scale-105
                    active:scale-95
                  "
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.22, ease: "easeInOut" }}
                />
              </AnimatePresence>
            </div>
          </button>

          <div className="relative flex items-center gap-3">
            <button
              ref={activityBtnRef}
              type="button"
              onClick={() => setShowActivity((v) => !v)}
              className={iconBtn}
              title="Activity"
              aria-label="Activity"
              style={{
                filter: `drop-shadow(0 10px 20px ${darkBlueShadow})`,
                color: textColor,
              }}
            >
              <span className="text-sm font-medium" style={{ color: textColor, opacity: 0.85 }}>
                Activity
              </span>
            </button>

            {/* ✅ Theme toggle (same component) */}
            <ThemeToggleButton
              onClick={toggleTheme}
              imgSrc={assets.robotHead}
              alt="Toggle theme"
              darkBlueShadow={darkBlueShadow}
            />
          </div>
        </motion.div>

        {/* MAIN GRID */}
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-12 gap-4 h-[calc(100%-4.25rem)] min-h-0">
          {/* LEFT PANEL */}
          <motion.div variants={panelFlow} className="lg:col-span-8 h-full">
            <Card className="h-full" isOrange={isOrange}>
              <div className="p-4 h-full flex flex-col min-h-0 gap-4">
                <div className={"relative flex-none " + innerPane} style={{ height: "clamp(320px, 62vh, 520px)" }}>
                  <div className="absolute top-3 left-3 z-10">
                    <div className="rounded-full border border-white/50 bg-white/20 backdrop-blur-xl px-3 py-1 text-xs">
                      {mode === "camera" ? (
                        <span className="text-emerald-900 font-semibold">LIVE</span>
                      ) : videoSrc ? (
                        <span className="text-indigo-900 font-semibold">PLAYBACK</span>
                      ) : (
                        <span className="font-semibold" style={{ color: textColor, opacity: 0.75 }}>
                          IDLE
                        </span>
                      )}
                    </div>
                  </div>

                  <AnimatePresence>
                    {isSending && (
                      <motion.div
                        className="absolute inset-0 bg-white/25 backdrop-blur-md flex items-center justify-center z-20"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                      >
                        <div className="w-[70%] max-w-md">
                          <div className="text-sm mb-2 font-medium" style={{ color: textColor, opacity: 0.85 }}>
                            Sending…
                          </div>
                          <div className="h-2 rounded-full bg-white/40 overflow-hidden">
                            <motion.div
                              className="h-full bg-sky-400/90"
                              initial={{ x: "-60%" }}
                              animate={{ x: "120%" }}
                              transition={{ duration: 1.1, repeat: Infinity, ease: "linear" }}
                              style={{ width: "40%" }}
                            />
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {videoSrc ? (
                    <video key={videoSrc} src={videoSrc} controls className="h-full w-full object-contain" />
                  ) : mode === "camera" ? (
                    <>
                      <motion.div
                        className="absolute inset-0 pointer-events-none opacity-25"
                        animate={{ backgroundPositionY: ["0%", "100%"] }}
                        transition={{ duration: 2.0, repeat: Infinity, ease: "linear" }}
                        style={{
                          backgroundImage:
                            "linear-gradient(to bottom, rgba(255,255,255,0.0), rgba(255,255,255,0.18), rgba(255,255,255,0.0))",
                          backgroundSize: "100% 40%",
                        }}
                      />
                      <video
                        key="live"
                        ref={livePreviewRef}
                        autoPlay
                        muted
                        playsInline
                        className="h-full w-full object-cover pointer-events-none"
                      />
                    </>
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-center px-6">
                      <div>
                        <div className="font-semibold text-lg" style={{ color: textColor }}>
                          Upload Media or Enable Camera
                        </div>
                        <div className="mt-2 text-sm" style={{ color: textColor, opacity: 0.75 }}>
                          Your preview appears here
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={pickUpload} />

                <div className="pt-4 border-t border-white/20">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-stretch">
                    <motion.button whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }} type="button" onClick={toggleCamera} className={primaryBtn}>
                      <div className="font-semibold text-center" style={{ color: textColor }}>
                        {cameraEnabled ? "Disable camera" : "Enable camera"}
                      </div>
                      <div className="text-xs text-center mt-1" style={{ color: textColor, opacity: 0.75 }}>
                        {cameraEnabled ? "Stop preview" : "Live preview"}
                      </div>
                    </motion.button>

                    <div className="relative group h-full">
                      {isLiveTranslating ? (
                        <motion.button whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }} type="button" onClick={stopLiveTranslation} className={primaryBtn}>
                          <div className="font-semibold text-center" style={{ color: textColor }}>
                            Stop live translation
                          </div>
                          <div className="text-xs text-center mt-1" style={{ color: textColor, opacity: 0.75 }}>
                            End real-time processing
                          </div>
                        </motion.button>
                      ) : (
                        <motion.button
                          whileHover={{ y: -2 }}
                          whileTap={{ scale: 0.98 }}
                          type="button"
                          onClick={startLiveTranslation}
                          disabled={!cameraEnabled}
                          className={primaryBtn}
                        >
                          <div className="font-semibold text-center" style={{ color: textColor }}>
                            Start live translation
                          </div>
                          <div className="text-xs text-center mt-1" style={{ color: textColor, opacity: 0.75 }}>
                            Real-time ASL → text
                          </div>
                        </motion.button>
                      )}

                      {!cameraEnabled && !isLiveTranslating && (
                        <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-2 -translate-y-full opacity-0 group-hover:opacity-100 transition">
                          <div
                            className="text-xs rounded-xl border border-white/50 bg-white/18 backdrop-blur-xl px-3 py-2 shadow-[0_10px_24px_rgba(0,0,0,0.18)] whitespace-nowrap"
                            style={{ color: textColor, opacity: 0.85 }}
                          >
                            enable camera to start live translation
                          </div>
                        </div>
                      )}
                    </div>

                    <motion.button
                      whileHover={{ y: -2 }}
                      whileTap={{ scale: 0.98 }}
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className={primaryBtn}
                    >
                      <div className="font-semibold text-center" style={{ color: textColor }}>
                        Upload video
                      </div>
                      <div className="text-xs text-center mt-1" style={{ color: textColor, opacity: 0.75 }}>
                        Select from device
                      </div>
                    </motion.button>
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>

          {/* RIGHT PANEL */}
          <motion.div variants={panelFlow} className="lg:col-span-4 flex flex-col gap-4 h-full min-h-0">
            <Card className="p-4" isOrange={isOrange}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm" style={{ color: textColor, opacity: 0.75 }}>
                    Confidence
                  </div>
                  <div className="text-xl font-semibold" style={{ color: textColor }}>
                    {confidenceLabel}
                  </div>
                </div>

                <svg width="78" height="78" viewBox="0 0 86 86">
                  <circle cx="43" cy="43" r={34} stroke="rgba(255,255,255,0.18)" strokeWidth="10" fill="none" />
                  <motion.circle
                    cx="43"
                    cy="43"
                    r={34}
                    stroke={ringColor}
                    strokeWidth="10"
                    fill="none"
                    strokeLinecap="round"
                    strokeDasharray={`${dash} ${c - dash}`}
                    transform="rotate(-90 43 43)"
                    initial={false}
                    animate={{ strokeDasharray: `${dash} ${c - dash}` }}
                    transition={{ type: "spring", stiffness: 120, damping: 18 }}
                  />
                </svg>
              </div>

              <div className="mt-2 text-xs" style={{ color: textColor, opacity: 0.7 }}>
              </div>
            </Card>

            <Card className="p-4 flex-1 min-h-0 flex flex-col" isOrange={isOrange}>
              <div className="flex items-center justify-between">
                <div className="text-sm" style={{ color: textColor, opacity: 0.75 }}>
                  Translation
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={copyText}
                    className="text-xs rounded-xl border border-white/50 bg-white/18 backdrop-blur-xl px-3 py-2 hover:bg-white/24 transition"
                    style={{ color: textColor }}
                  >
                    Copy text
                  </button>
                  <button
                    type="button"
                    onClick={clear}
                    className="text-xs rounded-xl border border-white/50 bg-white/18 backdrop-blur-xl px-3 py-2 hover:bg-white/24 transition"
                    style={{ color: textColor }}
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className={"mt-4 flex-1 min-h-0 p-4 " + translationPane}>
                <div className="h-full min-h-0 overflow-auto pr-1">
                  {outputText ? (
                    <div className="leading-relaxed text-base whitespace-pre-wrap" style={{ color: textColor }}>
                      {outputText}
                    </div>
                  ) : (
                    <div className="text-base" style={{ color: textColor, opacity: 0.55 }}>
                      Translation output will appear here…
                    </div>
                  )}
                </div>
              </div>
            </Card>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}

export default function SignApp() {
  const [screen, setScreen] = useState("home");

  // ✅ theme: "blue" | "orange"
  const [theme, setTheme] = useState("blue");
  const isOrange = theme === "orange";

  // ✅ all "black" text should become white on orange theme
  const textColor = isOrange ? "white" : "#0f172a";

  const toggleTheme = () => setTheme((t) => (t === "blue" ? "orange" : "blue"));

  const assets = useMemo(() => {
    return isOrange
      ? {
          bg: bgOrange,
          robotBase: robotOrange,
          robotEyes: robotOrangeGreen,
          robotHead: robotHeadOrange,
          logoU: logoUOrange,
          sign: signOrange,
          appLogo: appLogoOrange,
        }
      : {
          bg: bgBlue,
          robotBase: robotBlue,
          robotEyes: robotGreen,
          robotHead: robotHeadBlue,
          logoU: logoUBlue,
          sign: signBlue,
          appLogo: appLogoBlue,
        };
  }, [isOrange]);

  // ✅ enforce no scroll while on home, restore otherwise
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = screen === "home" ? "hidden" : "auto";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [screen]);

  return (
    <PageFrame>
      <FixedBackground bgSrc={assets.bg} />

      <AnimatePresence mode="wait" initial={false}>
        {screen === "home" ? (
          <motion.div
            key="home"
            className="relative min-h-screen w-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.18 } }}
            exit={{ opacity: 0, transition: { duration: 0.18 } }}
          >
            <HomeScreen assets={assets} isOrange={isOrange} toggleTheme={toggleTheme} onStart={() => setScreen("app")} />
          </motion.div>
        ) : (
          <motion.div
            key="app"
            className="relative min-h-screen w-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.12 } }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
          >
            <AppScreen
              assets={assets}
              toggleTheme={toggleTheme}
              isOrange={isOrange}
              textColor={textColor}
              onHome={() => setScreen("home")}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </PageFrame>
  );
}
