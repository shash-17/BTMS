import React from "react";

const TEMP_OPTIMAL_HIGH = 45;
const TEMP_WARN_THRESHOLD = 35;
const TEMP_MAX_DISPLAY = 60;

function getThermalStatus(temp) {
  if (temp > TEMP_OPTIMAL_HIGH) return "crit";
  if (temp > TEMP_WARN_THRESHOLD) return "warn";
  return "ok";
}

function getThermalBarWidth(temp) {
  const pct = (temp / TEMP_MAX_DISPLAY) * 100;
  return Math.min(100, Math.max(0, pct));
}

/** Pure SVG sparkline — no deps */
function Sparkline({ data, status }) {
  if (!data || data.length < 2) return null;
  const W = 100, H = 20;
  const min = 15, max = 60;
  const toY = (v) => H - ((v - min) / (max - min)) * H;
  const step = W / (data.length - 1);
  const pts = data.map((v, i) => `${(i * step).toFixed(1)},${toY(v).toFixed(1)}`).join(" ");
  const color =
    status === "crit" ? "var(--crit)" :
    status === "warn" ? "var(--warn)" :
    "rgba(255,255,255,0.45)";

  // Area path
  const area =
    `M 0,${toY(data[0]).toFixed(1)} ` +
    data.map((v, i) => `L ${(i * step).toFixed(1)},${toY(v).toFixed(1)}`).join(" ") +
    ` L ${W},${H} L 0,${H} Z`;

  return (
    <svg
      width="100%" height={H} viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={{ display: "block", marginTop: 4, overflow: "visible" }}
      aria-hidden="true"
    >
      <path d={area} fill={color} opacity="0.10" />
      <polyline
        points={pts} fill="none"
        stroke={color} strokeWidth="1.2"
        strokeLinejoin="round" strokeLinecap="round"
      />
      {/* Latest dot */}
      <circle
        cx={(( data.length - 1) * step).toFixed(1)}
        cy={toY(data[data.length - 1]).toFixed(1)}
        r="1.8" fill={color}
      />
    </svg>
  );
}

export default function BatteryCell({ cell, sparkData, onSelect }) {
  const { cell_id, voltage, current, temperature, soc, is_spike } = cell;
  const status = getThermalStatus(temperature);
  const barWidth = getThermalBarWidth(temperature);

  return (
    <article
      className={`cell-card ${status}`}
      id={`cell-${cell_id}`}
      aria-label={`Cell ${cell_id + 1}: ${temperature.toFixed(1)}°C — ${status}. Click for details.`}
      role="button"
      tabIndex={0}
      style={{ cursor: "pointer" }}
      onClick={() => onSelect?.(cell)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelect?.(cell); }}
    >
      {is_spike && <span className="spike-badge">Spike</span>}

      <div className="cell-header">
        <span className="cell-id font-mono">C{String(cell_id + 1).padStart(2, "0")}</span>
        <span
          aria-hidden="true"
          style={{
            width: 6, height: 6, borderRadius: "50%", display: "inline-block",
            background:
              status === "crit" ? "var(--crit)" :
              status === "warn" ? "var(--warn)" :
              "rgba(255,255,255,0.25)",
            boxShadow:
              status === "crit" ? "0 0 5px var(--crit)" :
              status === "warn" ? "0 0 5px var(--warn)" :
              "none",
            transition: "background 250ms ease, box-shadow 250ms ease",
          }}
        />
      </div>

      {/* Main temperature reading */}
      <div className="cell-temp-display">
        <span className={`cell-temp-value ${status}`}>
          {temperature.toFixed(1)}
        </span>
        <span className="cell-temp-unit">°C</span>
      </div>

      {/* Thermal fill bar */}
      <div className="cell-thermal-bar-track" role="progressbar"
        aria-valuenow={temperature} aria-valuemin={0} aria-valuemax={TEMP_MAX_DISPLAY}>
        <div
          className={`cell-thermal-bar-fill ${status}`}
          style={{ width: `${barWidth}%` }}
        />
      </div>

      {/* Sparkline */}
      <Sparkline data={sparkData} status={status} />

      {/* Secondary metrics */}
      <div className="cell-metrics">
        <div className="cell-metric">
          <span className="cell-metric-label">Voltage</span>
          <span className="cell-metric-value">{voltage.toFixed(2)}V</span>
        </div>
        <div className="cell-metric">
          <span className="cell-metric-label">Current</span>
          <span className="cell-metric-value">{current.toFixed(2)}A</span>
        </div>
        <div className="cell-metric">
          <span className="cell-metric-label">SoC</span>
          <span className="cell-metric-value">{soc?.toFixed(1) ?? "–"}%</span>
        </div>
        <div className="cell-metric">
          <span className="cell-metric-label">Norm T</span>
          <span className="cell-metric-value">
            {cell.temperature_norm !== undefined
              ? cell.temperature_norm.toFixed(3)
              : "–"}
          </span>
        </div>
      </div>
    </article>
  );
}
