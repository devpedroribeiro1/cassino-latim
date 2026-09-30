import { useState, useRef, useEffect } from "react";
import Head from "next/head";

const PARTICIPANTS = [
  { id: "pedro", name: "Pedro" },
  { id: "sarah", name: "Sarah" },
  { id: "davi", name: "Davi" },
  { id: "kira", name: "Kira" },
  { id: "gustavo", name: "Gustavo" },
  { id: "nathally", name: "Nathally" },
];
const MODALITIES = [
  {
    id: "conversacao",
    name: "Conversação",
    activities: ["Conversação 1", "Conversação 2"],
  },
  { id: "traducao", name: "Tradução", activities: ["Tradução"] },
  { id: "diagramacao", name: "Diagramação", activities: ["Diagramação"] },
  { id: "vocabulario", name: "Vocabulário", activities: ["Vocabulário"] },
  { id: "gramatica", name: "Gramática", activities: ["Gramática"] },
];
const SLOT_HEIGHT = 80;
const SESSION_KEY = "activity-assignments";
const SETTINGS_KEY = "activity-customization";

function emptySlots(count) {
  return Array(count).fill("—");
}

function activeOptions(options, selectedIds) {
  return options.filter((option) => selectedIds.includes(option.id));
}

function activityNames(modalities) {
  return modalities.flatMap(({ activities }) => activities);
}

function selectionRespectsModalityGroups(selectedActivities, modalities) {
  return modalities.every(({ activities }) => {
    const selectedCount = activities.filter((activity) =>
      selectedActivities.includes(activity)
    ).length;
    return selectedCount === 0 || selectedCount === activities.length;
  });
}

function hasValidActivitySelection(modalities, participantCount) {
  let possibleCounts = new Set([0]);

  modalities.forEach(({ activities }) => {
    const countsWithThisModality = [...possibleCounts].map(
      (count) => count + activities.length
    );
    possibleCounts = new Set([...possibleCounts, ...countsWithThisModality]);
  });

  return possibleCounts.has(participantCount);
}

function defaultSettings() {
  return {
    participantIds: PARTICIPANTS.map(({ id }) => id),
    modalityIds: MODALITIES.map(({ id }) => id),
  };
}

function hasValidIds(ids, options) {
  return (
    Array.isArray(ids) &&
    new Set(ids).size === ids.length &&
    ids.every((id) => options.some((option) => option.id === id))
  );
}

function sameIds(first, second) {
  return (
    Array.isArray(first) &&
    Array.isArray(second) &&
    first.length === second.length && first.every((id, index) => id === second[index])
  );
}

// Use rejection sampling so every index has exactly the same probability.
// This keeps every possible one-to-one assignment equally likely.
function getRandomIndex(max) {
  if (!Number.isInteger(max) || max <= 0 || max > 0x100000000) {
    throw new RangeError("max must be an integer between 1 and 2^32");
  }

  const limit = 0x100000000 - (0x100000000 % max);
  const value = new Uint32Array(1);

  do {
    crypto.getRandomValues(value);
  } while (value[0] >= limit);

  return value[0] % max;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = getRandomIndex(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Helpers for sessionStorage (no libraries) ──────────────────
function isCompleteAssignment(text, settled, participants, modalities) {
  const activities = activityNames(modalities);
  return (
    Array.isArray(text) &&
    text.length === participants.length &&
    Array.isArray(settled) &&
    settled.length === participants.length &&
    settled.every(Boolean) &&
    text.every((activity) => activities.includes(activity)) &&
    new Set(text).size === text.length &&
    selectionRespectsModalityGroups(text, modalities)
  );
}

function loadSettings() {
  try {
    const raw = sessionStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaultSettings();
    const saved = JSON.parse(raw);
    if (
      saved &&
      hasValidIds(saved.participantIds, PARTICIPANTS) &&
      hasValidIds(saved.modalityIds, MODALITIES)
    ) {
      return saved;
    }
    sessionStorage.removeItem(SETTINGS_KEY);
  } catch {
    /* storage unavailable or malformed */
  }
  return defaultSettings();
}

function saveSettings(settings) {
  try {
    sessionStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* quota exceeded or private mode — silently ignore */
  }
}

function loadSession(settings) {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    const participants = activeOptions(PARTICIPANTS, settings.participantIds);
    const modalities = activeOptions(MODALITIES, settings.modalityIds);
    if (
      saved &&
      sameIds(saved.participantIds, settings.participantIds) &&
      sameIds(saved.modalityIds, settings.modalityIds) &&
      isCompleteAssignment(saved.text, saved.settled, participants, modalities)
    ) {
      return saved;
    }
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* storage unavailable or malformed */
  }
  return null;
}

function saveSession(text, settled, settings) {
  try {
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ ...settings, text, settled })
    );
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

export default function Home() {
  // Keep the server and first browser render identical. Saved settings are
  // applied after mount so sessionStorage cannot cause a hydration mismatch.
  const [settings, setSettings] = useState(defaultSettings);
  const [displayedText, setDisplayedText] = useState(() =>
    emptySlots(PARTICIPANTS.length)
  );
  const [settledSlots, setSettledSlots] = useState(() =>
    Array(PARTICIPANTS.length).fill(false)
  );
  const [spinningSlots, setSpinningSlots] = useState(
    Array(PARTICIPANTS.length).fill(false)
  );
  const [buttonPressed, setButtonPressed] = useState(false);
  const [clearPressed, setClearPressed] = useState(false);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const intervalsRef = useRef([]);
  const timeoutsRef = useRef([]);
  const spinningSlotsRef = useRef(Array(PARTICIPANTS.length).fill(false));
  const isSpinningRef = useRef(false);
  const customizeRef = useRef(null);
  const activeParticipants = activeOptions(PARTICIPANTS, settings.participantIds);
  const activeModalities = activeOptions(MODALITIES, settings.modalityIds);
  const activeActivities = activityNames(activeModalities);
  const canDraw =
    activeParticipants.length > 0 &&
    activeParticipants.length <= activeActivities.length &&
    hasValidActivitySelection(activeModalities, activeParticipants.length);

  useEffect(() => {
    const savedSettings = loadSettings();
    const savedSession = loadSession(savedSettings);
    const participantCount = savedSettings.participantIds.length;

    setSettings(savedSettings);
    setDisplayedText(
      savedSession ? savedSession.text : emptySlots(participantCount)
    );
    setSettledSlots(
      savedSession
        ? savedSession.settled
        : Array(participantCount).fill(false)
    );
    setSpinningSlots(Array(participantCount).fill(false));
    spinningSlotsRef.current = Array(participantCount).fill(false);
  }, []);

  // Store only completed draws. Saving an animation frame could restore
  // temporary, repeated labels as though they were a finished result.
  useEffect(() => {
    if (
      isCompleteAssignment(
        displayedText,
        settledSlots,
        activeParticipants,
        activeModalities
      )
    ) {
      saveSession(displayedText, settledSlots, settings);
    }
  }, [displayedText, settledSlots, settings]);

  // Do not leave animation work running if this page is unmounted.
  useEffect(() => {
    return () => {
      intervalsRef.current.forEach(clearInterval);
      timeoutsRef.current.forEach(clearTimeout);
      isSpinningRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!customizeOpen) return undefined;
    const closeOnOutsideClick = (event) => {
      if (customizeRef.current && !customizeRef.current.contains(event.target)) {
        setCustomizeOpen(false);
      }
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [customizeOpen]);

  const resetDraw = (participantCount) => {
    clearSession();
    intervalsRef.current.forEach(clearInterval);
    timeoutsRef.current.forEach(clearTimeout);
    intervalsRef.current = [];
    timeoutsRef.current = [];
    isSpinningRef.current = false;
    spinningSlotsRef.current = Array(participantCount).fill(false);
    setDisplayedText(emptySlots(participantCount));
    setSettledSlots(Array(participantCount).fill(false));
    setSpinningSlots(Array(participantCount).fill(false));
  };

  const toggleSetting = (settingKey, id) => {
    if (isSpinningRef.current) return;

    const selectedIds = settings[settingKey];
    const nextSettings = {
      ...settings,
      [settingKey]: selectedIds.includes(id)
        ? selectedIds.filter((selectedId) => selectedId !== id)
        : [...selectedIds, id],
    };
    setSettings(nextSettings);
    saveSettings(nextSettings);
    resetDraw(nextSettings.participantIds.length);
  };

  const go = () => {
    // A ref closes the small window before React has painted the disabled UI.
    if (isSpinningRef.current || !canDraw) return;
    isSpinningRef.current = true;

    setButtonPressed(true);
    setTimeout(() => setButtonPressed(false), 150);

    let result;
    do {
      result = shuffle(activeActivities).slice(0, activeParticipants.length);
    } while (!selectionRespectsModalityGroups(result, activeModalities));
    const allSpinning = Array(activeParticipants.length).fill(true);

    // An unfinished draw must never be restored after a refresh.
    clearSession();

    spinningSlotsRef.current = allSpinning;
    setSpinningSlots(allSpinning);
    setSettledSlots(Array(activeParticipants.length).fill(false));
    setDisplayedText(shuffle(result));

    intervalsRef.current.forEach(clearInterval);
    intervalsRef.current = [];
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];

    const interval = setInterval(() => {
      const spinningIndexes = spinningSlotsRef.current
        .map((isSpinning, index) => (isSpinning ? index : null))
        .filter((index) => index !== null);

      if (spinningIndexes.length === 0) return;

      // The active rows display a shuffled set of only their remaining
      // activities, so the screen is always a one-to-one assignment.
      const remainingActivities = shuffle(
        spinningIndexes.map((index) => result[index])
      );
      setDisplayedText((prev) => {
        const next = [...prev];
        spinningIndexes.forEach((index, position) => {
          next[index] = remainingActivities[position];
        });
        return next;
      });
    }, 65);
    intervalsRef.current = [interval];

    result.forEach((finalActivity, i) => {
      const stopDelay = 1200 + i * 380;
      const timeout = setTimeout(() => {
        spinningSlotsRef.current = spinningSlotsRef.current.map(
          (isSpinning, index) => (index === i ? false : isSpinning)
        );
        setDisplayedText((prev) => {
          const next = [...prev];
          next[i] = finalActivity;
          return next;
        });
        setSpinningSlots([...spinningSlotsRef.current]);
        setSettledSlots((prev) => {
          const next = [...prev];
          next[i] = true;
          return next;
        });

        if (!spinningSlotsRef.current.some(Boolean)) {
          clearInterval(interval);
          intervalsRef.current = [];
          isSpinningRef.current = false;
        }
      }, stopDelay);
      timeoutsRef.current[i] = timeout;
    });
  };

  const clearAll = () => {
    if (isSpinningRef.current) return;
    setClearPressed(true);
    setTimeout(() => setClearPressed(false), 150);
    resetDraw(activeParticipants.length);
  };

  const isAnySpinning = spinningSlots.some(Boolean);
  const hasCompletedDraw =
    settledSlots.length > 0 && settledSlots.every(Boolean);
  const configurationMessage =
    activeParticipants.length === 0
      ? "Ative pelo menos um participante para sortear."
      : activeModalities.length === 0
        ? "Ative pelo menos uma modalidade para sortear."
        : activeParticipants.length > activeActivities.length
          ? "Ative mais modalidades ou menos participantes para poder realizar o sorteio."
          : !hasValidActivitySelection(
                activeModalities,
                activeParticipants.length
              )
            ? "Conversação ocupa duas vagas: ajuste os participantes ou as modalidades."
          : null;

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
        <main
          className="layout"
          aria-busy={isAnySpinning}
          style={{
            height: `${Math.max(activeParticipants.length, 1) * SLOT_HEIGHT}px`,
          }}
        >
          {/* Left: Names */}
          <div className="names-col">
            {activeParticipants.map(({ id, name }, i) => (
              <div
                key={id}
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
            {activeParticipants.map(({ id }, i) => (
              <div key={id} className="conn-row">
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

              {activeParticipants.map(({ id }, i) => (
                <div
                  key={id}
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
              type="button"
              className={[
                "go-btn",
                buttonPressed ? "btn-pressed" : "",
                isAnySpinning || !canDraw ? "btn-disabled" : "",
              ].join(" ")}
              onClick={go}
              disabled={isAnySpinning || !canDraw}
              onMouseDown={() =>
                !isAnySpinning && canDraw && setButtonPressed(true)
              }
              onMouseUp={() => setButtonPressed(false)}
              onMouseLeave={() => setButtonPressed(false)}
            >
              Sortear
            </button>

            <button
              type="button"
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
              Limpar
            </button>
          </div>
          <p className="hint" role="status">
            {configurationMessage
              ? configurationMessage
              : isAnySpinning
              ? "Sorteando…"
              : hasCompletedDraw
                ? "Sorteio concluído."
                : "Clique em Sortear para começar."}
          </p>
        </div>

        <div className="customize-anchor" ref={customizeRef}>
          <button
            type="button"
            className={`customize-btn ${customizeOpen ? "customize-btn-open" : ""}`}
            onClick={() => setCustomizeOpen((isOpen) => !isOpen)}
            aria-expanded={customizeOpen}
            aria-controls="customize-panel"
          >
            Personalizar
          </button>

          {customizeOpen && (
            <section
              id="customize-panel"
              className="customize-panel"
              aria-label="Personalizar sorteio"
            >
              <div className="customize-heading">
                <p>Personalizar sorteio</p>
                <span>
                  {activeParticipants.length} participante
                  {activeParticipants.length === 1 ? "" : "s"} · {" "}
                  {activeModalities.length} modalidade
                  {activeModalities.length === 1 ? "" : "s"} · {" "}
                  {activeActivities.length} atividade
                  {activeActivities.length === 1 ? "" : "s"}
                  <span className="activity-info">
                    <span className="info-icon" aria-hidden="true">
                      i
                    </span>
                    <span
                      id="activity-info-tooltip"
                      role="tooltip"
                      className="activity-tooltip"
                    >
                      Conversação é uma modalidade que conta como duas atividades, pois é feita em dupla.
                    </span>
                  </span>
                </span>
              </div>

              <fieldset className="option-group" disabled={isAnySpinning}>
                <legend>Participantes</legend>
                {PARTICIPANTS.map(({ id, name }) => (
                  <label className="option-item" key={id}>
                    <input
                      type="checkbox"
                      checked={settings.participantIds.includes(id)}
                      onChange={() => toggleSetting("participantIds", id)}
                    />
                    <span>{name}</span>
                  </label>
                ))}
              </fieldset>

              <fieldset className="option-group" disabled={isAnySpinning}>
                <legend>Modalidades</legend>
                {MODALITIES.map(({ id, name }) => (
                  <label className="option-item" key={id}>
                    <input
                      type="checkbox"
                      checked={settings.modalityIds.includes(id)}
                      onChange={() => toggleSetting("modalityIds", id)}
                    />
                    <span>{name}</span>
                  </label>
                ))}
              </fieldset>

              {configurationMessage && (
                <p className="customize-warning">{configurationMessage}</p>
              )}
            </section>
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
          max-width: min(620px, calc(100vw - 48px));
          text-align: center;
          line-height: 1.45;
        }

        /* ─── Customization menu ────────────────────── */
        .customize-anchor {
          position: fixed;
          top: 22px;
          right: 24px;
          z-index: 200;
        }
        .customize-btn {
          min-height: 38px;
          padding: 0 15px;
          border: 1px solid rgba(79, 195, 247, 0.3);
          border-radius: 9px;
          background: rgba(10, 16, 32, 0.88);
          color: #bfe9ff;
          font-family: "Orbitron", sans-serif;
          font-size: 0.62rem;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          cursor: pointer;
          transition:
            border-color 0.2s,
            box-shadow 0.2s,
            background 0.2s;
        }
        .customize-btn:hover,
        .customize-btn-open {
          border-color: #4fc3f7;
          background: rgba(14, 28, 52, 0.96);
          box-shadow: 0 0 16px rgba(79, 195, 247, 0.3);
        }
        .customize-panel {
          position: absolute;
          top: calc(100% + 10px);
          right: 0;
          width: min(330px, calc(100vw - 32px));
          max-height: calc(100vh - 82px);
          overflow-y: auto;
          padding: 16px;
          border: 1px solid rgba(79, 195, 247, 0.2);
          border-radius: 14px;
          background: rgba(9, 16, 32, 0.98);
          box-shadow:
            0 16px 48px rgba(0, 0, 0, 0.65),
            0 0 0 1px rgba(79, 195, 247, 0.05);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
        }
        .customize-heading {
          display: flex;
          flex-direction: column;
          gap: 4px;
          margin-bottom: 15px;
        }
        .customize-heading p,
        .option-group legend {
          color: #d0e8ff;
          font-family: "Orbitron", sans-serif;
          font-size: 0.68rem;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }
        .customize-heading span {
          color: rgba(130, 170, 200, 0.75);
          font-size: 0.75rem;
        }
        .activity-info {
          position: relative;
          display: inline-flex;
          margin-left: 6px;
          vertical-align: middle;
        }
        .info-icon {
          display: inline-grid;
          width: 16px;
          height: 16px;
          place-items: center;
          padding: 0;
          border: 1px solid rgba(79, 195, 247, 0.55);
          border-radius: 50%;
          background: rgba(79, 195, 247, 0.08);
          color: #8bdcff;
          cursor: help;
          font-family: Georgia, serif;
          font-size: 0.72rem;
          font-style: italic;
          font-weight: 700;
          line-height: 1;
        }
        .activity-info:hover .info-icon {
          border-color: #4fc3f7;
          background: rgba(79, 195, 247, 0.2);
          box-shadow: 0 0 8px rgba(79, 195, 247, 0.35);
        }
        .activity-tooltip {
          position: absolute;
          top: calc(100% + 8px);
          right: 0;
          z-index: 10;
          width: 250px;
          padding: 9px 10px;
          border: 1px solid rgba(79, 195, 247, 0.25);
          border-radius: 8px;
          background: #101d33;
          box-shadow: 0 8px 22px rgba(0, 0, 0, 0.45);
          color: #d5edfb;
          font-size: 0.74rem;
          line-height: 1.4;
          opacity: 0;
          pointer-events: none;
          transform: translateY(-3px);
          transition:
            opacity 0.16s ease,
            transform 0.16s ease;
        }
        .activity-info:hover .activity-tooltip {
          opacity: 1;
          pointer-events: auto;
          transform: translateY(0);
        }
        .option-group {
          display: grid;
          gap: 3px;
          min-width: 0;
          margin: 0;
          padding: 0;
          border: 0;
        }
        .option-group + .option-group {
          margin-top: 15px;
        }
        .option-group legend {
          margin-bottom: 6px;
          color: rgba(79, 195, 247, 0.7);
          font-size: 0.58rem;
        }
        .option-item {
          display: flex;
          align-items: center;
          gap: 10px;
          min-height: 31px;
          padding: 5px 8px;
          border-radius: 7px;
          color: #c8e3f8;
          cursor: pointer;
          font-size: 0.9rem;
          transition: background 0.18s;
        }
        .option-item:hover {
          background: rgba(79, 195, 247, 0.08);
        }
        .option-item input {
          width: 16px;
          height: 16px;
          accent-color: #4fc3f7;
          cursor: pointer;
        }
        .option-group:disabled .option-item,
        .option-group:disabled .option-item input {
          cursor: not-allowed;
          opacity: 0.55;
        }
        .customize-warning {
          margin-top: 15px;
          padding: 9px 10px;
          border-radius: 8px;
          font-size: 0.75rem;
          line-height: 1.4;
        }
        .customize-warning {
          background: rgba(255, 186, 0, 0.09);
          color: #ffd56a;
        }

      `}</style>
    </>
  );
}
