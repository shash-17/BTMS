import React from "react";

const CHART_H = 72;
const TEMP_MIN_DISPLAY = 15;
const TEMP_MAX_DISPLAY = 60;

function tempToY(temp) {
  const pct = (temp - TEMP_MIN_DISPLAY) / (TEMP_MAX_DISPLAY - TEMP_MIN_DISPLAY);
  return CHART_H - Math.max(0, Math.min(CHART_H, pct * CHART_H));
}

function buildPath(points, width) {
  if (points.length < 2) return "";
  const step = width / (points.length - 1);
  return points
    .map((y, i) => `${i === 0 ? "M" : "L"} ${(i * step).toFixed(1)} ${y.toFixed(1)}`)
    .join(" ");
}

function buildAreaPath(points, width) {
  if (points.length < 2) return "";
  const step = width / (points.length - 1);
  const line = points
    .map((y, i) => `${i === 0 ? "M" : "L"} ${(i * step).toFixed(1)} ${y.toFixed(1)}`)
    .join(" ");
  return `${line} L ${((points.length - 1) * step).toFixed(1)} ${CHART_H} L 0 ${CHART_H} Z`;
}

export default function PackTrendChart({ history }) {
  if (!history || history.length < 2) {
    return (
      <div className="trend-chart-container">
        <div className="trend-chart-header">
          <span className="section-title">Pack Temperature Trend</span>
          <span style={{ fontSize: "10px", color: "var(--bw-400)" }}>Waiting for data…</span>
        </div>
        <div style={{ height: CHART_H, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: "11px", color: "var(--bw-400)" }}>Accumulating history…</span>
        </div>
      </div>
    );
  }

  const avgPoints = history.map((h) => tempToY(h.avgTemp));
  const maxPoints = history.map((h) => tempToY(h.maxTemp));
  const minPoints = history.map((h) => tempToY(h.minTemp));

  const latest = history[history.length - 1];

  return (
    <div className="trend-chart-container">
      <div className="trend-chart-header">
        <span className="section-title">Pack Temperature Trend</span>
        <div className="trend-legend">
          <span className="trend-legend-item">
            <span style={{ width: 20, height: 1.5, background: "rgba(255,255,255,0.80)", display: "inline-block", verticalAlign: "middle", marginRight: 4 }} />
            Max {latest.maxTemp.toFixed(1)}°C
          </span>
          <span className="trend-legend-item">
            <span style={{ width: 20, height: 1.5, background: "rgba(255,255,255,0.45)", display: "inline-block", verticalAlign: "middle", marginRight: 4 }} />
            Avg {latest.avgTemp.toFixed(1)}°C
          </span>
          <span className="trend-legend-item">
            <span style={{ width: 20, height: 1.5, background: "rgba(255,255,255,0.22)", display: "inline-block", verticalAlign: "middle", marginRight: 4 }} />
            Min {latest.minTemp.toFixed(1)}°C
          </span>
          <span style={{ fontSize: "10px", color: "var(--bw-400)", marginLeft: 8 }}>
            Last {history.length}s
          </span>
        </div>
      </div>

      <svg
        width="100%"
        height={CHART_H}
        viewBox={`0 0 1000 ${CHART_H}`}
        preserveAspectRatio="none"
        style={{ display: "block", overflow: "visible" }}
        aria-label="Pack temperature trend chart"
      >
        <defs>
          <linearGradient id="area-grad-max" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.12)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.00)" />
          </linearGradient>
          <linearGradient id="area-grad-avg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.06)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.00)" />
          </linearGradient>
          {/* 45°C danger line Y position */}
        </defs>

        {/* 45°C threshold line */}
        <line
          x1="0" y1={tempToY(45)} x2="1000" y2={tempToY(45)}
          stroke="var(--crit)" strokeWidth="1" strokeDasharray="6 4" opacity="0.55"
        />
        <text x="4" y={tempToY(45) - 3} fill="var(--crit)" fontSize="9" opacity="0.75" fontFamily="'Space Mono', monospace">45°C</text>

        {/* 35°C warn line */}
        <line
          x1="0" y1={tempToY(35)} x2="1000" y2={tempToY(35)}
          stroke="var(--warn)" strokeWidth="1" strokeDasharray="6 4" opacity="0.40"
        />
        <text x="4" y={tempToY(35) - 3} fill="var(--warn)" fontSize="9" opacity="0.60" fontFamily="'Space Mono', monospace">35°C</text>

        {/* Min area fill */}
        <path
          d={buildAreaPath(minPoints, 1000)}
          fill="rgba(255,255,255,0.03)"
        />

        {/* Max area fill */}
        <path
          d={buildAreaPath(maxPoints, 1000)}
          fill="url(#area-grad-max)"
        />

        {/* Avg area fill */}
        <path
          d={buildAreaPath(avgPoints, 1000)}
          fill="url(#area-grad-avg)"
        />

        {/* Min line */}
        <path
          d={buildPath(minPoints, 1000)}
          fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="1.2"
          strokeLinejoin="round" strokeLinecap="round"
        />

        {/* Avg line */}
        <path
          d={buildPath(avgPoints, 1000)}
          fill="none" stroke="rgba(255,255,255,0.50)" strokeWidth="1.5"
          strokeLinejoin="round" strokeLinecap="round"
        />

        {/* Max line */}
        <path
          d={buildPath(maxPoints, 1000)}
          fill="none" stroke="rgba(255,255,255,0.82)" strokeWidth="2"
          strokeLinejoin="round" strokeLinecap="round"
        />

        {/* Latest value dots */}
        {[
          { points: maxPoints, stroke: "rgba(255,255,255,0.90)", r: 3 },
          { points: avgPoints, stroke: "rgba(255,255,255,0.55)", r: 2.5 },
          { points: minPoints, stroke: "rgba(255,255,255,0.30)", r: 2 },
        ].map(({ points, stroke, r }, idx) => {
          const x = 1000;
          const y = points[points.length - 1];
          return (
            <circle key={idx} cx={x} cy={y} r={r}
              fill="none" stroke={stroke} strokeWidth="1.5"
            />
          );
        })}
      </svg>
    </div>
  );
}
