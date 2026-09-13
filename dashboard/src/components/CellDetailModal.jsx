import { useEffect, useRef } from "react";

const TEMP_OPTIMAL_HIGH = 45;
const TEMP_WARN_THRESHOLD = 35;

function getThermalStatus(temp) {
  if (temp > TEMP_OPTIMAL_HIGH) return "crit";
  if (temp > TEMP_WARN_THRESHOLD) return "warn";
  return "ok";
}

function FullSparkline({ data, status }) {
  const svgRef = useRef(null);
  if (!data || data.length < 2) {
    return (
      <div style={{ height: 100, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--bw-400)", fontSize: 12 }}>
        Accumulating history…
      </div>
    );
  }

  const W = 1000, H = 100;
  const min = 15, max = 60;
  const toY = (v) => H - ((v - min) / (max - min)) * H;
  const step = W / (data.length - 1);
  const pts = data.map((v, i) => `${(i * step).toFixed(1)},${toY(v).toFixed(1)}`).join(" ");
  const areaPath =
    `M 0,${toY(data[0]).toFixed(1)} ` +
    data.map((v, i) => `L ${(i * step).toFixed(1)},${toY(v).toFixed(1)}`).join(" ") +
    ` L ${W},${H} L 0,${H} Z`;

  const color =
    status === "crit" ? "var(--crit)" :
    status === "warn" ? "var(--warn)" :
    "rgba(255,255,255,0.6)";

  return (
    <svg
      ref={svgRef}
      width="100%" height={H}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={{ display: "block", overflow: "visible" }}
    >
      {/* 45°C danger line */}
      <line x1="0" y1={toY(45)} x2={W} y2={toY(45)}
        stroke="var(--crit)" strokeWidth="1" strokeDasharray="8 4" opacity="0.4" />
      <text x="4" y={toY(45) - 3} fill="var(--crit)" fontSize="9" opacity="0.6" fontFamily="monospace">45°C</text>
      {/* 35°C warn line */}
      <line x1="0" y1={toY(35)} x2={W} y2={toY(35)}
        stroke="var(--warn)" strokeWidth="1" strokeDasharray="8 4" opacity="0.3" />
      <text x="4" y={toY(35) - 3} fill="var(--warn)" fontSize="9" opacity="0.5" fontFamily="monospace">35°C</text>

      <path d={areaPath} fill={color} opacity="0.08" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2"
        strokeLinejoin="round" strokeLinecap="round" />
      {/* Latest dot */}
      <circle
        cx={((data.length - 1) * step).toFixed(1)}
        cy={toY(data[data.length - 1]).toFixed(1)}
        r="4" fill={color} stroke="rgba(0,0,0,0.8)" strokeWidth="1.5"
      />
    </svg>
  );
}

function MetricBlock({ label, value, unit, color }) {
  return (
    <div style={{
      background: "var(--glass-1)",
      border: "1px solid var(--glass-border)",
      borderRadius: "var(--r-md)",
      padding: "14px 16px",
    }}>
      <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--bw-400)", marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
        <span style={{ fontSize: 26, fontWeight: 700, fontFamily: "var(--font-mono)", color: color || "var(--bw-900)", lineHeight: 1 }}>
          {value}
        </span>
        {unit && <span style={{ fontSize: 11, color: "var(--bw-400)" }}>{unit}</span>}
      </div>
    </div>
  );
}

export default function CellDetailModal({ cell, sparkData, onClose }) {
  // Trap focus & close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  if (!cell) return null;

  const { cell_id, voltage, current, temperature, soc, is_spike, temperature_norm } = cell;
  const status = getThermalStatus(temperature);

  const statusColor =
    status === "crit" ? "var(--crit)" :
    status === "warn" ? "var(--warn)" :
    "var(--ok)";
  const statusLabel =
    status === "crit" ? "CRITICAL — SPIKE" :
    status === "warn" ? "WARNING" :
    "NOMINAL";

  const cellNum = String(cell_id + 1).padStart(2, "0");

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 600,
          background: "rgba(0,0,0,0.75)",
          backdropFilter: "blur(8px)",
          animation: "fade-in 0.15s ease",
        }}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Cell C${cellNum} detail`}
        style={{
          position: "fixed",
          top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 601,
          width: "min(700px, 95vw)",
          background: "#0a0a0a",
          border: `1.5px solid ${statusColor}40`,
          borderRadius: "var(--r-xl)",
          boxShadow: `var(--neo-shadow-xl), 0 0 60px ${statusColor}20`,
          overflow: "hidden",
          animation: "toast-in 0.2s cubic-bezier(0.34,1.56,0.64,1)",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "20px 24px",
          borderBottom: "1px solid var(--glass-border)",
          background: "var(--glass-2)",
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{
              fontFamily: "var(--font-mono)", fontSize: 28, fontWeight: 900,
              color: statusColor, letterSpacing: "-0.02em", lineHeight: 1,
            }}>
              C{cellNum}
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--bw-700)", letterSpacing: "0.04em" }}>
                21700 Li-ion Cell
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                <span style={{
                  width: 6, height: 6, borderRadius: "50%", background: statusColor,
                  display: "inline-block",
                  boxShadow: `0 0 6px ${statusColor}`,
                  animation: status !== "ok" ? "blink 1.1s ease infinite" : "none",
                }} />
                <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", color: statusColor, textTransform: "uppercase" }}>
                  {statusLabel}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close cell detail"
            style={{
              background: "var(--glass-2)", border: "1.5px solid var(--glass-border-bright)",
              borderRadius: "var(--r-sm)", color: "var(--bw-500)", cursor: "pointer",
              fontSize: 16, width: 32, height: 32, display: "flex", alignItems: "center",
              justifyContent: "center", boxShadow: "var(--neo-shadow-sm)",
              transition: "var(--t-fast)",
            }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ overflowY: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Metric grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
            <MetricBlock label="Temperature" value={temperature.toFixed(1)} unit="°C" color={statusColor} />
            <MetricBlock label="Voltage" value={voltage.toFixed(3)} unit="V" />
            <MetricBlock label="Current" value={current.toFixed(3)} unit="A" />
            <MetricBlock label="State of Charge" value={soc?.toFixed(1) ?? "—"} unit="%" />
          </div>

          {/* Secondary metrics */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10,
          }}>
            <MetricBlock label="Normalised Temp" value={temperature_norm?.toFixed(4) ?? "—"} />
            <MetricBlock label="Spike Flag" value={is_spike ? "ACTIVE" : "CLEAR"} color={is_spike ? "var(--crit)" : "var(--ok)"} />
            <MetricBlock label="Thermal Bar" value={`${((temperature / 60) * 100).toFixed(0)}%`} />
          </div>

          {/* Sparkline */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--bw-400)", marginBottom: 10 }}>
              Temperature History — Last {sparkData?.length ?? 0} samples
            </div>
            <div style={{
              background: "var(--glass-1)", border: "1px solid var(--glass-border)",
              borderRadius: "var(--r-md)", padding: 14, overflow: "visible",
            }}>
              <FullSparkline data={sparkData} status={status} />
            </div>
          </div>

          {/* Thermal bar visual */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 10, color: "var(--bw-400)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em" }}>
                Thermal Load
              </span>
              <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: statusColor }}>
                {temperature.toFixed(1)}°C / 60°C max display
              </span>
            </div>
            <div style={{ height: 8, background: "rgba(255,255,255,0.06)", borderRadius: 4, overflow: "hidden", border: "1px solid var(--glass-border)" }}>
              <div style={{
                width: `${Math.min(100, (temperature / 60) * 100)}%`,
                height: "100%",
                borderRadius: 4,
                background: status === "crit"
                  ? "linear-gradient(90deg, rgba(239,68,68,0.4), var(--crit))"
                  : status === "warn"
                  ? "linear-gradient(90deg, rgba(245,158,11,0.4), var(--warn))"
                  : "linear-gradient(90deg, rgba(255,255,255,0.15), rgba(255,255,255,0.65))",
                transition: "width 0.4s ease",
                boxShadow: status !== "ok" ? `0 0 8px ${statusColor}` : "none",
              }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 9, color: "var(--bw-300)", fontFamily: "var(--font-mono)" }}>
              <span>15°C min</span>
              <span style={{ color: "var(--warn)" }}>35°C warn</span>
              <span style={{ color: "var(--crit)" }}>45°C crit</span>
              <span>60°C max</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: "12px 24px", borderTop: "1px solid var(--glass-border)",
          background: "var(--glass-1)", flexShrink: 0,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span style={{ fontSize: 9, color: "var(--bw-400)", fontFamily: "var(--font-mono)", letterSpacing: "0.10em" }}>
            BTMS-PACK-001 · Cell {cell_id} of 9 · Press ESC to close
          </span>
          <span style={{ fontSize: 9, color: "var(--bw-300)", fontFamily: "var(--font-mono)" }}>
            21700 cylindrical · NMC chemistry
          </span>
        </div>
      </div>
    </>
  );
}
