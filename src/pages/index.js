import { useState, useRef, useEffect } from "react";
import Head from "next/head";

const NAMES = ["Pedro", "Sarah", "Davi", "Kira", "Gustavo", "Nathally"];
const ACTIVITIES = [
  "Conversação 1",
  "Conversação 2",
  "Tradução",
  "Diagramação",
  "Vocabulário",
  "Gramática",
];
const REEL_HEIGHT = 480;
const SLOT_HEIGHT = REEL_HEIGHT / NAMES.length; // 80px each
const SESSION_KEY = "activity-assignments";
const FM_KEY = "activity-fm"; // friendly-friend mode flag

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Helpers for sessionStorage (no libraries) ──────────────────
function loadSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw); // { text: string[], settled: bool[] }
  } catch {
    return null;
  }
}

function saveSession(text, settled) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ text, settled }));
  } catch {
    /* quota exceeded or private mode — silently ignore */
  }
}

function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

function loadFM() {
  try {
    const stored = sessionStorage.getItem(FM_KEY);
    return stored === null ? true : stored === "true"; // default ON
  } catch {
    return true;
  }
}
function saveFM(val) {
  try {
    sessionStorage.setItem(FM_KEY, String(val));
  } catch {
    /* ignore */
  }
}

export default function Home() {
  // Lazy initialisers read sessionStorage once on first render (SSR-safe)
  const [displayedText, setDisplayedText] = useState(() => {
    const saved = loadSession();
    return saved ? saved.text : Array(6).fill("—");
  });
  const [settledSlots, setSettledSlots] = useState(() => {
    const saved = loadSession();
    return saved ? saved.settled : Array(6).fill(false);
  });
  const [spinningSlots, setSpinningSlots] = useState(Array(6).fill(false));
  const [buttonPressed, setButtonPressed] = useState(false);
  const [clearPressed, setClearPressed] = useState(false);
  const [friendlyMode, setFriendlyMode] = useState(() => loadFM());
  const [menuOpen, setMenuOpen] = useState(false);
  const intervalsRef = useRef([]);
  const menuRef = useRef(null);

  // Persist to sessionStorage whenever a settled result changes
  useEffect(() => {
    if (settledSlots.some(Boolean)) {
      saveSession(displayedText, settledSlots);
    }
  }, [displayedText, settledSlots]);

  // Close menu when clicking outside
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const go = () => {
    if (spinningSlots.some(Boolean)) return;

    setButtonPressed(true);
    setTimeout(() => setButtonPressed(false), 150);

    // ── Friendly Friend Mode ──────────────────────────────────────
    // NAMES order: Pedro(0) Sarah(1) Davi(2) Kira(3) Gustavo(4) Nathally(5)
    let result;
    if (friendlyMode) {
      const convos = shuffle(["Conversação 1", "Conversação 2"]); // Davi & Gustavo
      const rest = shuffle(["Tradução", "Diagramação", "Gramática"]); // others
      result = [
        "Vocabulário", // Pedro  — always
        rest[0], // Sarah  — random from rest
        convos[0], // Davi   — one of the Conversações
        rest[1], // Kira   — random from rest
        convos[1], // Gustavo — other Conversação
        rest[2], // Nathally — random from rest
      ];
    } else {
      result = shuffle(ACTIVITIES);
    }
    // ─────────────────────────────────────────────────────────────

    setSpinningSlots(Array(6).fill(true));
    setSettledSlots(Array(6).fill(false));
    setDisplayedText(Array(6).fill("—"));

    intervalsRef.current.forEach(clearInterval);
    intervalsRef.current = [];

    result.forEach((finalActivity, i) => {
      let tick = 0;
      const interval = setInterval(() => {
        tick++;
        setDisplayedText((prev) => {
          const next = [...prev];
          next[i] = ACTIVITIES[tick % ACTIVITIES.length];
          return next;
        });
      }, 65);
      intervalsRef.current[i] = interval;

      const stopDelay = 1200 + i * 380;
      setTimeout(() => {
        clearInterval(interval);
        setDisplayedText((prev) => {
          const next = [...prev];
          next[i] = finalActivity;
          return next;
        });
        setSpinningSlots((prev) => {
          const next = [...prev];
          next[i] = false;
          return next;
        });
        setSettledSlots((prev) => {
          const next = [...prev];
          next[i] = true;
          return next;
        });
      }, stopDelay);
    });
  };

  const clearAll = () => {
    if (isAnySpinning) return;
    setClearPressed(true);
    setTimeout(() => setClearPressed(false), 150);
    clearSession();
    intervalsRef.current.forEach(clearInterval);
    setDisplayedText(Array(6).fill("—"));
    setSettledSlots(Array(6).fill(false));
    setSpinningSlots(Array(6).fill(false));
  };

  const toggleFriendlyMode = () => {
    const next = !friendlyMode;
    setFriendlyMode(next);
    saveFM(next);
  };

  const isAnySpinning = spinningSlots.some(Boolean);

  return (
    <>
      <Head>
        <title>Distribuidor de Atividades</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Exo+2:wght@300;400;600;700&display=swap"
          rel="stylesheet"
        />
      </Head>

      <div className="page">
        {/* ── Title ── */}
        <header className="header">
          <div className="title-rule" />
          <h1 className="title">Distribuidor de Atividades</h1>
          <div className="title-rule" />
        </header>

        {/* ── Main layout ── */}
        <main className="layout">
          {/* Left: Names */}
          <div className="names-col">
            {NAMES.map((name, i) => (
              <div
                key={name}
                className={[
                  "name-card",
                  spinningSlots[i] ? "name-spinning" : "",
                  settledSlots[i] ? "name-settled" : "",
                ].join(" ")}
              >
                <span className="name-dot" />
                <span className="name-text">{name}</span>
              </div>
            ))}
          </div>

          {/* Middle: Arrow connectors */}
          <div className="connectors">
            {NAMES.map((_, i) => (
              <div key={i} className="conn-row">
                <div
                  className={`conn-line ${settledSlots[i] ? "conn-lit" : ""}`}
                />
                <svg
                  width="9"
                  height="14"
                  viewBox="0 0 9 14"
                  fill="none"
                  className={`conn-arrow ${settledSlots[i] ? "conn-arrow-lit" : ""}`}
                >
                  <path d="M0 0L9 7L0 14" fill="currentColor" />
                </svg>
              </div>
            ))}
          </div>

          {/* Right: Slot-machine reel */}
          <div className="reel-wrapper">
            <div className="screw tl" />
            <div className="screw tr" />
            <div className="screw bl" />
            <div className="screw br" />

            <div className="reel-frame">
              {/* Atmosphere overlays */}
              <div className="shade shade-top" />
              <div className="shade shade-bot" />
              <div className="scanlines" />

              {NAMES.map((_, i) => (
                <div
                  key={i}
                  className={[
                    "reel-slot",
                    i > 0 ? "slot-sep" : "",
                    spinningSlots[i] ? "slot-spinning" : "",
                    settledSlots[i] ? "slot-settled" : "",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "slot-text",
                      spinningSlots[i] ? "text-spinning" : "",
                      settledSlots[i] ? "text-settled" : "",
                    ].join(" ")}
                  >
                    {displayedText[i]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </main>

        {/* ── Buttons ── */}
        <div className="btn-area">
          <div className="btn-row">
            <button
              className={[
                "go-btn",
                buttonPressed ? "btn-pressed" : "",
                isAnySpinning ? "btn-disabled" : "",
              ].join(" ")}
              onClick={go}
              disabled={isAnySpinning}
              onMouseDown={() => !isAnySpinning && setButtonPressed(true)}
              onMouseUp={() => setButtonPressed(false)}
              onMouseLeave={() => setButtonPressed(false)}
            >
              Go!
            </button>

            <button
              className={[
                "clear-btn",
                clearPressed ? "btn-pressed" : "",
                isAnySpinning ? "btn-disabled" : "",
              ].join(" ")}
              onClick={clearAll}
              disabled={isAnySpinning}
              onMouseDown={() => !isAnySpinning && setClearPressed(true)}
              onMouseUp={() => setClearPressed(false)}
              onMouseLeave={() => setClearPressed(false)}
            >
              Clear
            </button>
          </div>
          {isAnySpinning && <p className="hint">Sorteando…</p>}
        </div>

        {/* ── Three-dots settings menu ── */}
        <div className="menu-anchor" ref={menuRef}>
          <button
            className={`dots-btn ${menuOpen ? "dots-open" : ""} ${friendlyMode ? "dots-ffm" : ""}`}
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Configurações"
            title="Configurações"
          >
            <span className="dot" />
            <span className="dot" />
            <span className="dot" />
            {friendlyMode && <span className="ffm-badge" />}
          </button>

          {menuOpen && (
            <div className="menu-panel">
              <p className="menu-section-label">Configurações</p>

              <div className="menu-item" onClick={toggleFriendlyMode}>
                <div className="menu-item-info">
                  <span className="menu-item-title">Friendly Friend Mode</span>
                  <span className="menu-item-desc">
                    Look, if you had one shot or one opportunity To seize
                    everything you ever wanted in one moment Would you capture
                    it or just let it slip?
                  </span>
                </div>
                <div className={`toggle ${friendlyMode ? "toggle-on" : ""}`}>
                  <div className="toggle-knob" />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Global reset ── */}
      <style jsx global>{`
        *,
        *::before,
        *::after {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }
        html,
        body {
          background: #07090f;
          min-height: 100vh;
        }
      `}</style>

      {/* ── Component styles ── */}
      <style jsx>{`
        /* ─── Keyframes ─────────────────────────────── */
        @keyframes spinBlur {
          0% {
            transform: translateY(-5px);
            opacity: 0.35;
          }
          50% {
            transform: translateY(0);
            opacity: 1;
          }
          100% {
            transform: translateY(5px);
            opacity: 0.35;
          }
        }
        @keyframes namePulse {
          0%,
          100% {
            box-shadow: 0 0 10px rgba(79, 195, 247, 0.25);
          }
          50% {
            box-shadow: 0 0 22px rgba(79, 195, 247, 0.6);
          }
        }
        @keyframes settleFlash {
          0% {
            background: rgba(255, 215, 0, 0.22);
          }
          100% {
            background: rgba(255, 215, 0, 0.05);
          }
        }

        /* ─── Page shell ─────────────────────────────── */
        .page {
          min-height: 100vh;
          background: radial-gradient(
            ellipse 80% 60% at 50% 0%,
            #0d1530 0%,
            #07090f 70%
          );
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 48px 24px;
          font-family: "Exo 2", sans-serif;
          color: #d0e8ff;
          gap: 40px;
        }

        /* ─── Header ─────────────────────────────────── */
        .header {
          display: flex;
          align-items: center;
          gap: 18px;
          width: 100%;
          max-width: 820px;
        }
        .title-rule {
          flex: 1;
          height: 1px;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(79, 195, 247, 0.6),
            transparent
          );
        }
        .title {
          font-family: "Orbitron", sans-serif;
          font-size: clamp(0.9rem, 2.2vw, 1.35rem);
          font-weight: 700;
          color: #4fc3f7;
          text-transform: uppercase;
          letter-spacing: 0.14em;
          text-shadow: 0 0 22px rgba(79, 195, 247, 0.55);
          white-space: nowrap;
        }

        /* ─── Layout row ─────────────────────────────── */
        .layout {
          display: flex;
          align-items: stretch;
          width: 100%;
          max-width: 820px;
          height: ${REEL_HEIGHT}px;
        }

        /* ─── Names column ───────────────────────────── */
        .names-col {
          display: flex;
          flex-direction: column;
          width: 168px;
          flex-shrink: 0;
          gap: 0;
        }
        .name-card {
          flex: 1;
          display: flex;
          align-items: center;
          padding: 0 14px;
          gap: 10px;
          background: rgba(79, 195, 247, 0.04);
          border: 1px solid rgba(79, 195, 247, 0.12);
          border-radius: 8px;
          margin-bottom: 3px;
          transition:
            background 0.35s,
            border-color 0.35s,
            box-shadow 0.35s;
          position: relative;
          overflow: hidden;
        }
        .name-card:last-child {
          margin-bottom: 0;
        }
        .name-card::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(
            100deg,
            rgba(79, 195, 247, 0.05) 0%,
            transparent 70%
          );
          pointer-events: none;
        }
        .name-spinning {
          background: rgba(79, 195, 247, 0.09);
          border-color: rgba(79, 195, 247, 0.5);
          animation: namePulse 0.85s ease infinite;
        }
        .name-settled {
          background: rgba(255, 215, 0, 0.07);
          border-color: rgba(255, 215, 0, 0.5);
          box-shadow: 0 0 14px rgba(255, 215, 0, 0.18);
          animation: none;
        }
        .name-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: rgba(79, 195, 247, 0.3);
          flex-shrink: 0;
          transition:
            background 0.35s,
            box-shadow 0.35s;
        }
        .name-spinning .name-dot {
          background: #4fc3f7;
          box-shadow: 0 0 8px #4fc3f7;
        }
        .name-settled .name-dot {
          background: #ffd700;
          box-shadow: 0 0 8px #ffd700;
        }
        .name-text {
          font-size: 1.05rem;
          font-weight: 600;
          letter-spacing: 0.04em;
          color: #b0cde8;
          transition: color 0.35s;
        }
        .name-settled .name-text {
          color: #ffd700;
        }

        /* ─── Connectors ─────────────────────────────── */
        .connectors {
          display: flex;
          flex-direction: column;
          width: 48px;
          flex-shrink: 0;
          padding: 0 4px;
        }
        .conn-row {
          flex: 1;
          display: flex;
          align-items: center;
          margin-bottom: 3px;
        }
        .conn-row:last-child {
          margin-bottom: 0;
        }
        .conn-line {
          flex: 1;
          height: 1.5px;
          background: rgba(79, 195, 247, 0.18);
          transition:
            background 0.45s,
            box-shadow 0.45s;
        }
        .conn-lit {
          background: #ffd700;
          box-shadow: 0 0 6px rgba(255, 215, 0, 0.75);
        }
        .conn-arrow {
          color: rgba(79, 195, 247, 0.18);
          flex-shrink: 0;
          transition:
            color 0.45s,
            filter 0.45s;
        }
        .conn-arrow-lit {
          color: #ffd700;
          filter: drop-shadow(0 0 4px rgba(255, 215, 0, 0.9));
        }

        /* ─── Reel wrapper & frame ───────────────────── */
        .reel-wrapper {
          flex: 1;
          position: relative;
        }
        .screw {
          position: absolute;
          width: 11px;
          height: 11px;
          border-radius: 50%;
          background: radial-gradient(circle at 35% 35%, #3a5070, #18243c);
          border: 1px solid #2a3c58;
          box-shadow: inset 0 1px 2px rgba(255, 255, 255, 0.08);
          z-index: 20;
        }
        .screw::after {
          content: "";
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%) rotate(45deg);
          width: 6px;
          height: 1px;
          background: #1a2b40;
        }
        .tl {
          top: -5px;
          left: -5px;
        }
        .tr {
          top: -5px;
          right: -5px;
        }
        .bl {
          bottom: -5px;
          left: -5px;
        }
        .br {
          bottom: -5px;
          right: -5px;
        }

        .reel-frame {
          height: 100%;
          position: relative;
          background: linear-gradient(155deg, #0d1926 0%, #080f1a 100%);
          border: 2px solid #1c3652;
          border-radius: 10px;
          overflow: hidden;
          box-shadow:
            0 0 0 1px rgba(79, 195, 247, 0.08),
            0 0 32px rgba(79, 195, 247, 0.12),
            inset 0 0 60px rgba(0, 0, 0, 0.55);
          display: flex;
          flex-direction: column;
        }

        /* Gradient shades (casino lens effect) */
        .shade {
          position: absolute;
          left: 0;
          right: 0;
          height: 60px;
          z-index: 10;
          pointer-events: none;
        }
        .shade-top {
          top: 0;
          background: linear-gradient(
            to bottom,
            rgba(8, 15, 26, 0.92),
            transparent
          );
        }
        .shade-bot {
          bottom: 0;
          background: linear-gradient(
            to top,
            rgba(8, 15, 26, 0.92),
            transparent
          );
        }
        .scanlines {
          position: absolute;
          inset: 0;
          background: repeating-linear-gradient(
            0deg,
            transparent 0px,
            transparent 3px,
            rgba(0, 0, 0, 0.12) 3px,
            rgba(0, 0, 0, 0.12) 4px
          );
          z-index: 5;
          pointer-events: none;
        }

        /* ─── Reel slots ─────────────────────────────── */
        .reel-slot {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0 18px;
          position: relative;
          transition: background 0.35s;
          z-index: 2;
        }
        .slot-sep {
          border-top: 1px solid rgba(79, 195, 247, 0.09);
        }
        .slot-spinning {
          background: rgba(79, 195, 247, 0.04);
        }
        .slot-settled {
          animation: settleFlash 0.7s ease forwards;
        }

        .slot-text {
          font-family: "Orbitron", sans-serif;
          font-size: clamp(0.65rem, 1.3vw, 0.88rem);
          font-weight: 600;
          color: rgba(192, 216, 240, 0.22);
          letter-spacing: 0.06em;
          text-align: center;
          user-select: none;
          transition:
            color 0.3s,
            text-shadow 0.3s;
        }
        .text-spinning {
          color: #4fc3f7;
          text-shadow: 0 0 14px rgba(79, 195, 247, 0.9);
          animation: spinBlur 0.13s linear infinite;
        }
        .text-settled {
          color: #ffd700;
          text-shadow:
            0 0 18px rgba(255, 215, 0, 0.85),
            0 0 35px rgba(255, 215, 0, 0.4);
          animation: none;
        }

        /* ─── Buttons ───────────────────────────────── */
        .btn-area {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
        }
        .btn-row {
          display: flex;
          flex-direction: row;
          align-items: flex-end;
          gap: 16px;
        }
        .go-btn {
          font-family: "Orbitron", sans-serif;
          font-size: 1.65rem;
          font-weight: 900;
          color: #050709;
          letter-spacing: 0.06em;
          width: 155px;
          height: 62px;
          border: none;
          border-radius: 14px;
          cursor: pointer;
          background: linear-gradient(
            180deg,
            #ffe566 0%,
            #ffba00 45%,
            #d98700 100%
          );
          /* 3-D depth */
          box-shadow:
            0 8px 0 #7a4a00,
            0 12px 28px rgba(255, 180, 0, 0.35);
          transform: translateY(0);
          transition:
            transform 0.08s ease,
            box-shadow 0.08s ease,
            filter 0.2s;
          position: relative;
        }
        /* top gloss highlight */
        .go-btn::before {
          content: "";
          position: absolute;
          top: 4px;
          left: 14px;
          right: 14px;
          height: 14px;
          border-radius: 7px;
          background: rgba(255, 255, 255, 0.32);
          pointer-events: none;
        }
        .go-btn:not(.btn-disabled):hover {
          filter: brightness(1.08);
        }

        /* Clear button — same 3-D treatment, blue palette */
        .clear-btn {
          font-family: "Orbitron", sans-serif;
          font-size: 1.1rem;
          font-weight: 700;
          color: #e8f6ff;
          letter-spacing: 0.08em;
          width: 115px;
          height: 62px;
          border: none;
          border-radius: 14px;
          cursor: pointer;
          background: linear-gradient(
            180deg,
            #6dd5fa 0%,
            #2980b9 45%,
            #1a5c8a 100%
          );
          box-shadow:
            0 8px 0 #0d3352,
            0 12px 28px rgba(41, 128, 185, 0.35);
          transform: translateY(0);
          transition:
            transform 0.08s ease,
            box-shadow 0.08s ease,
            filter 0.2s;
          position: relative;
        }
        .clear-btn::before {
          content: "";
          position: absolute;
          top: 4px;
          left: 12px;
          right: 12px;
          height: 14px;
          border-radius: 7px;
          background: rgba(255, 255, 255, 0.28);
          pointer-events: none;
        }
        .clear-btn:not(.btn-disabled):hover {
          filter: brightness(1.1);
        }

        /* Shared pressed / disabled states */
        .btn-pressed {
          transform: translateY(7px) !important;
          box-shadow:
            0 1px 0 currentColor,
            0 3px 10px rgba(0, 0, 0, 0.2) !important;
        }
        .go-btn.btn-pressed {
          box-shadow:
            0 1px 0 #7a4a00,
            0 3px 10px rgba(255, 180, 0, 0.2) !important;
        }
        .clear-btn.btn-pressed {
          box-shadow:
            0 1px 0 #0d3352,
            0 3px 10px rgba(41, 128, 185, 0.2) !important;
        }
        .btn-disabled {
          opacity: 0.5;
          cursor: not-allowed;
          filter: saturate(0.35);
        }
        .hint {
          font-family: "Exo 2", sans-serif;
          font-size: 0.8rem;
          color: rgba(79, 195, 247, 0.55);
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }

        /* ─── Three-dots menu anchor ─────────────────── */
        .menu-anchor {
          position: fixed;
          top: 22px;
          right: 24px;
          z-index: 200;
        }

        /* Dots button */
        .dots-btn {
          width: 38px;
          height: 38px;
          border-radius: 50%;
          border: 1px solid rgba(79, 195, 247, 0.22);
          background: rgba(10, 16, 32, 0.82);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 3.5px;
          transition:
            border-color 0.2s,
            box-shadow 0.2s,
            background 0.2s;
          position: relative;
        }
        .dots-btn:hover {
          border-color: rgba(79, 195, 247, 0.55);
          box-shadow: 0 0 14px rgba(79, 195, 247, 0.25);
          background: rgba(14, 22, 44, 0.92);
        }
        .dots-open {
          border-color: #4fc3f7 !important;
          box-shadow: 0 0 18px rgba(79, 195, 247, 0.4) !important;
        }
        .dot {
          display: block;
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: #4fc3f7;
          opacity: 0.75;
          transition: opacity 0.2s;
        }
        .dots-btn:hover .dot,
        .dots-open .dot {
          opacity: 1;
        }

        /* Green badge when FFM is active */
        .ffm-badge {
          position: absolute;
          top: 4px;
          right: 4px;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #34d399;
          border: 1.5px solid rgba(10, 16, 32, 0.9);
          box-shadow: 0 0 6px rgba(52, 211, 153, 0.85);
        }

        /* ─── Dropdown panel ─────────────────────────── */
        .menu-panel {
          position: absolute;
          top: calc(100% + 10px);
          right: 0;
          width: 310px;
          background: rgba(9, 16, 32, 0.97);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          border: 1px solid rgba(79, 195, 247, 0.18);
          border-radius: 14px;
          padding: 6px;
          box-shadow:
            0 16px 48px rgba(0, 0, 0, 0.65),
            0 0 0 1px rgba(79, 195, 247, 0.05);
          animation: menuIn 0.18s cubic-bezier(0.34, 1.36, 0.64, 1) forwards;
          transform-origin: top right;
        }
        @keyframes menuIn {
          from {
            opacity: 0;
            transform: scale(0.92) translateY(-6px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }

        .menu-section-label {
          font-family: "Orbitron", sans-serif;
          font-size: 0.6rem;
          font-weight: 700;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: rgba(79, 195, 247, 0.4);
          padding: 8px 14px 4px;
        }

        .menu-item {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 12px 14px;
          border-radius: 10px;
          cursor: pointer;
          transition: background 0.18s;
        }
        .menu-item:hover {
          background: rgba(79, 195, 247, 0.07);
        }

        .menu-item-info {
          display: flex;
          flex-direction: column;
          gap: 5px;
          flex: 1;
          min-width: 0;
        }
        .menu-item-title {
          font-family: "Exo 2", sans-serif;
          font-weight: 700;
          font-size: 0.88rem;
          color: #d0e8ff;
          letter-spacing: 0.02em;
        }
        .menu-item-desc {
          font-family: "Exo 2", sans-serif;
          font-size: 0.7rem;
          color: rgba(130, 170, 200, 0.6);
          line-height: 1.45;
          white-space: normal;
        }

        /* ─── Toggle switch ──────────────────────────── */
        .toggle {
          width: 46px;
          height: 26px;
          border-radius: 13px;
          background: rgba(79, 195, 247, 0.1);
          border: 1px solid rgba(79, 195, 247, 0.18);
          position: relative;
          flex-shrink: 0;
          transition:
            background 0.3s,
            border-color 0.3s,
            box-shadow 0.3s;
        }
        .toggle-on {
          background: rgba(52, 211, 153, 0.2);
          border-color: #34d399;
          box-shadow:
            0 0 10px rgba(52, 211, 153, 0.45),
            0 0 22px rgba(52, 211, 153, 0.2),
            inset 0 0 8px rgba(52, 211, 153, 0.1);
        }
        .toggle-knob {
          position: absolute;
          top: 4px;
          left: 4px;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: rgba(79, 195, 247, 0.45);
          transition:
            transform 0.28s cubic-bezier(0.34, 1.4, 0.64, 1),
            background 0.28s,
            box-shadow 0.28s;
        }
        .toggle-on .toggle-knob {
          transform: translateX(20px);
          background: #34d399;
          box-shadow: 0 0 10px rgba(52, 211, 153, 0.8);
        }
      `}</style>
    </>
  );
}
