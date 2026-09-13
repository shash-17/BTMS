import { useState, useRef, useEffect } from "react";
import { useToast } from "./ToastNotification";

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function formatTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

export default function ExportButton({ cells, history }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);
  const { addToast } = useToast();

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const exportCSV = () => {
    setOpen(false);
    try {
      // Pack history CSV
      const headers = ["tick", "avgTemp_C", "maxTemp_C", "minTemp_C"];
      const rows = (history || []).map((h) =>
        [h.tick, h.avgTemp?.toFixed(2), h.maxTemp?.toFixed(2), h.minTemp?.toFixed(2)].join(",")
      );
      const csv = [headers.join(","), ...rows].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      downloadBlob(blob, `btms_history_${formatTimestamp()}.csv`);
      addToast({ type: "success", title: "CSV Exported", message: `${rows.length} ticks of pack history` });
    } catch (e) {
      addToast({ type: "critical", title: "Export Failed", message: e.message });
    }
  };

  const exportCellsCSV = () => {
    setOpen(false);
    try {
      const headers = ["cell_id", "temperature_C", "voltage_V", "current_A", "soc_pct", "is_spike"];
      const rows = (cells || []).map((c) =>
        [c.cell_id, c.temperature?.toFixed(2), c.voltage?.toFixed(4), c.current?.toFixed(4), c.soc?.toFixed(1), c.is_spike ? "1" : "0"].join(",")
      );
      const csv = [headers.join(","), ...rows].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      downloadBlob(blob, `btms_cells_${formatTimestamp()}.csv`);
      addToast({ type: "success", title: "Cell CSV Exported", message: `10 cells at current tick` });
    } catch (e) {
      addToast({ type: "critical", title: "Export Failed", message: e.message });
    }
  };

  const exportJSON = () => {
    setOpen(false);
    try {
      const payload = {
        exportedAt: new Date().toISOString(),
        cells: cells || [],
        packHistory: history || [],
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      downloadBlob(blob, `btms_snapshot_${formatTimestamp()}.json`);
      addToast({ type: "success", title: "JSON Exported", message: "Full snapshot downloaded" });
    } catch (e) {
      addToast({ type: "critical", title: "Export Failed", message: e.message });
    }
  };

  return (
    <div className="export-btn-wrapper" ref={wrapperRef}>
      <button
        className="export-btn"
        onClick={() => setOpen((v) => !v)}
        id="export-btn"
        aria-haspopup="true"
        aria-expanded={open}
      >
        <span>↓</span>
        <span>Export</span>
      </button>

      {open && (
        <div className="export-dropdown" role="menu">
          <button className="export-dropdown-item" onClick={exportCSV} role="menuitem">
            <span className="export-item-icon">📊</span>
            <div>
              <div>Pack History CSV</div>
              <div className="export-item-sub">Last {history?.length ?? 0} ticks</div>
            </div>
          </button>
          <button className="export-dropdown-item" onClick={exportCellsCSV} role="menuitem">
            <span className="export-item-icon">🔋</span>
            <div>
              <div>Cell Snapshot CSV</div>
              <div className="export-item-sub">Current tick, 10 cells</div>
            </div>
          </button>
          <button className="export-dropdown-item" onClick={exportJSON} role="menuitem">
            <span className="export-item-icon">{ }</span>
            <div>
              <div>Full Snapshot JSON</div>
              <div className="export-item-sub">Cells + history</div>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
