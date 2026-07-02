import React from "react";

// Fixed decorative capsule balls floating inside the glass globe.
const BALLS = [
  { l: 18, t: 20, c: "#ff2d95" }, { l: 46, t: 14, c: "#22d3ee" },
  { l: 70, t: 24, c: "#ffe066" }, { l: 30, t: 40, c: "#4caf50" },
  { l: 58, t: 42, c: "#a855f7" }, { l: 12, t: 52, c: "#ff7b00" },
  { l: 40, t: 58, c: "#4dabf7" }, { l: 66, t: 56, c: "#ff2d95" },
  { l: 24, t: 70, c: "#ffd54f" }, { l: 52, t: 72, c: "#22d3ee" },
  { l: 78, t: 66, c: "#c4b0ff" }, { l: 34, t: 26, c: "#ffffff" },
];

export const GashaponMachine = ({
  leverActive = false,
  leverTurned = false,
  shaking = false,
  capsuleVisible = false,
  capsuleOpened = false,
  onLever,
  onCapsule,
}) => {
  const leverProps = leverActive
    ? {
        onMouseDown: onLever,
        onTouchStart: (e) => { e.preventDefault(); onLever?.(e); },
        role: "button",
        tabIndex: 0,
        onKeyDown: (e) => { if (e.key === "Enter" || e.key === " ") onLever?.(e); },
      }
    : {};

  return (
    <div className="gash-stage" data-testid="gashapon-stage">
      <div className={`gash-cabinet ${shaking ? "gash-shake" : ""}`} data-testid="gashapon-cabinet">
        <div className="gash-topper" data-testid="machine-topper">
          <span>GASHABITS</span>
        </div>

        <div className="gash-globe" data-testid="machine-globe">
          <div className="gash-balls">
            {BALLS.map((b, i) => (
              <span
                key={i}
                className="gash-ball"
                style={{ left: `${b.l}%`, top: `${b.t}%`, background: b.c }}
              />
            ))}
          </div>
          <div className="gash-glass-shine" />
        </div>

        <div className="gash-body">
          <div className="gash-coin-slot" data-testid="machine-coin-slot">
            <span className="gash-coin-line" />
            <span className="gash-slot-label">INSERT COIN</span>
          </div>

          <div
            className={`gash-lever ${leverActive ? "is-active" : ""} ${leverTurned ? "is-turned" : ""}`}
            data-testid="machine-lever"
            aria-label="Turn the crank lever"
            {...leverProps}
          >
            <span className="gash-lever-handle" />
            <span className="gash-lever-dot" />
          </div>
          {leverActive && !leverTurned && (
            <div className="gash-lever-hint" data-testid="lever-hint">TURN ME!</div>
          )}
        </div>

        <div className="gash-tray" data-testid="machine-prize-slot">
          <div className="gash-tray-mouth" />
          {capsuleVisible && (
            <button
              type="button"
              className={`gash-capsule ${capsuleOpened ? "is-open" : "is-drop"}`}
              data-testid="prize-capsule"
              onClick={onCapsule}
              aria-label="Open the dropped capsule"
            >
              <span className="gash-capsule-top" />
              <span className="gash-capsule-bottom" />
            </button>
          )}
        </div>
      </div>
      <div className="gash-feet" />
    </div>
  );
};

export default GashaponMachine;
