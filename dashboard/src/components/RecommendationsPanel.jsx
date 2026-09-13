import React from "react";

const RE_MIN = 400;
const RE_MAX = 700;

function getReGaugePct(re) {
  return Math.min(100, Math.max(0, ((re - RE_MIN) / (RE_MAX - RE_MIN)) * 100));
}

function SeverityBadge({ severity }) {
  return (
    <span className={`status-pill ${severity}`} id="severity-badge">
      <span className={`status-dot ${severity !== "normal" ? "live" : ""}`} />
      {severity.charAt(0).toUpperCase() + severity.slice(1)}
    </span>
  );
}

function MetricRow({ icon, label, value, valueClass = "" }) {
  return (
    <div className="rec-metric-row">
      <span className="rec-metric-label">
        <span className="rec-metric-label-icon" aria-hidden="true">{icon}</span>
        {label}
      </span>
      <span className={`rec-metric-value ${valueClass}`}>{value}</span>
    </div>
  );
}

export default function RecommendationsPanel({ recommendation }) {
  if (!recommendation) {
    return (
      <aside className="recommendations-panel" aria-label="AI recommendations">
        <div className="rec-card">
          <div className="waiting-state">
            <div className="spinner" />
            <p className="waiting-text">Waiting for telemetry…</p>
          </div>
        </div>
      </aside>
    );
  }

  const {
    severity,
    spike_cells,
    max_temp,
    avg_temp,
    delta_t,
    target_re,
    concentration_key,
    al2o3_vol_percent,
    flow_rate_ml_min,
    flow_velocity_m_s,
    nusselt_number,
    heat_transfer_coeff_W_m2K,
    nanofluid_conductivity_W_mK,
    timestamp,
  } = recommendation;

  const reGaugePct = getReGaugePct(target_re);
  const tsFormatted = timestamp
    ? new Date(timestamp).toLocaleTimeString()
    : "–";

  return (
    <aside className="recommendations-panel" aria-label="AI recommendations panel" id="recommendations-panel">

      {/* ── Card 1: AI System Status ── */}
      <div className={`rec-card ${severity}`}>
        <div className="rec-title">
          <div className="rec-title-icon ai-icon">🤖</div>
          AI Optimisation Engine
          <SeverityBadge severity={severity} />
        </div>

        <MetricRow icon="🌡️" label="Max Temperature"
          value={`${max_temp} °C`}
          valueClass={severity === "critical" ? "crit" : severity === "warning" ? "warn" : "ok"} />
        <MetricRow icon="📊" label="Avg Temperature"
          value={`${avg_temp} °C`} />
        <MetricRow icon="↕️" label="ΔT (Pack)"
          value={`${delta_t} °C`}
          valueClass={delta_t > 5 ? "warn" : "ok"} />
        {spike_cells.length > 0 && (
          <MetricRow icon="⚠️" label="Spike Cells"
            value={spike_cells.map((id) => `C${String(id + 1).padStart(2, "0")}`).join(", ")}
            valueClass="crit" />
        )}
        <MetricRow icon="🕐" label="Last Update" value={tsFormatted} />
      </div>

      {/* ── Card 2: CFD Cooling Recommendation ── */}
      <div className="rec-card">
        <div className="rec-title">
          <div className="rec-title-icon cfd-icon">🧪</div>
          CFD Cooling Recommendation
        </div>

        {/* Reynolds number gauge */}
        <div style={{ marginBottom: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
            <span style={{ fontSize: "10px", color: "var(--bw-400)", fontWeight: 600, letterSpacing: "0.10em", textTransform: "uppercase" }}>
              Target Reynolds Number
            </span>
            <span className="rec-metric-value" id="re-number">Re {target_re}</span>
          </div>
          <div className="re-gauge">
            <div className="re-gauge-track">
              <div className="re-gauge-fill" style={{ width: `${reGaugePct}%` }} />
            </div>
            <div className="re-gauge-labels">
              <span>400 (min)</span>
              <span>Laminar-cooling zone</span>
              <span>700 (max)</span>
            </div>
          </div>
        </div>

        {/* Nanofluid concentration selector */}
        <div style={{ marginBottom: "16px" }}>
          <span style={{ fontSize: "10px", color: "var(--bw-400)", fontWeight: 600, letterSpacing: "0.10em", textTransform: "uppercase" }}>
            Al₂O₃/Water Concentration — {al2o3_vol_percent} vol%
          </span>
          <div className="conc-pills" id="conc-pills">
            {["low", "medium", "high"].map((key) => (
              <div
                key={key}
                className={`conc-pill ${key} ${concentration_key === key ? "active" : ""}`}
                id={`conc-pill-${key}`}
              >
                {key === "low" ? "0.5%" : key === "medium" ? "1.5%" : "3.0%"}
                <br />
                <span style={{ fontSize: "9px", opacity: 0.8 }}>{key}</span>
              </div>
            ))}
          </div>
        </div>

        <MetricRow icon="💧" label="Flow Rate"
          value={`${flow_rate_ml_min.toFixed(3)} mL/min`} />
        <MetricRow icon="⚡" label="Flow Velocity"
          value={`${(flow_velocity_m_s * 1000).toFixed(3)} mm/s`} />
        <MetricRow icon="🔥" label="Nusselt Number"
          value={nusselt_number} />
        <MetricRow icon="📡" label="HTC"
          value={`${heat_transfer_coeff_W_m2K.toLocaleString()} W/m²K`} />
        <MetricRow icon="🌊" label="Conductivity (k_nf)"
          value={`${nanofluid_conductivity_W_mK} W/m·K`} />
      </div>

      {/* ── Card 3: System Info ── */}
      <div className="rec-card" style={{ padding: "12px 16px" }}>
        <div style={{ fontSize: "11px", color: "var(--bw-400)", lineHeight: "1.9", fontWeight: 600, letterSpacing: "0.05em" }}>
          <div>📐 Microchannel Dh: <span style={{ color: "var(--bw-700)", fontFamily: "var(--font-mono)" }}>1 mm</span></div>
          <div>🧲 Fluid: <span style={{ color: "var(--bw-700)", fontFamily: "var(--font-mono)" }}>Al₂O₃/H₂O nanofluid</span></div>
          <div>🎯 Target ΔT: <span style={{ color: "var(--bw-700)", fontFamily: "var(--font-mono)" }}>&lt; 5 °C</span></div>
          <div>🌡️ Safe range: <span style={{ color: "var(--bw-700)", fontFamily: "var(--font-mono)" }}>15 – 45 °C</span></div>
        </div>
      </div>
    </aside>
  );
}
