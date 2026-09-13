import React from "react";
import BatteryCell from "./BatteryCell";

export default function CellGrid({ cells, tick, cellHistory, onSelectCell }) {
  const spikeCount = cells.filter((c) => c.is_spike).length;

  return (
    <section className="cell-grid-container" aria-label="Battery cell grid">
      <div className="section-header">
        <h2 className="section-title">Battery Pack — 10 × 21700 Li-ion Cells</h2>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {spikeCount > 0 && (
            <span className="status-pill critical" id="spike-alert">
              <span className="status-dot live" />
              {spikeCount} Spike{spikeCount > 1 ? "s" : ""} Detected
            </span>
          )}
          <span className="section-badge font-mono" id="tick-badge">Tick #{tick ?? "–"}</span>
          <span style={{ fontSize: 9, color: "var(--bw-300)", fontFamily: "var(--font-mono)", letterSpacing: "0.06em" }}>
            click cell ↗
          </span>
        </div>
      </div>

      <div className="cell-grid" role="list">
        {cells.map((cell) => (
          <BatteryCell
            key={cell.cell_id}
            cell={cell}
            sparkData={cellHistory?.get(cell.cell_id) || []}
            onSelect={onSelectCell}
          />
        ))}
      </div>
    </section>
  );
}
