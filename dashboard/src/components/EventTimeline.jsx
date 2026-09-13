import { forwardRef } from "react";

const TYPE_CONFIG = {
  spike:       { icon: "⚠",  color: "var(--crit)", bg: "var(--crit-bg)",  border: "var(--crit-border)", label: "SPIKE" },
  delta_warn:  { icon: "↕",  color: "var(--warn)", bg: "var(--warn-bg)",  border: "var(--warn-border)", label: "ΔT HIGH" },
  delta_ok:    { icon: "✓",  color: "var(--ok)",   bg: "var(--ok-bg)",    border: "var(--ok-border)",   label: "ΔT OK" },
  offline:     { icon: "⊗",  color: "var(--warn)", bg: "var(--warn-bg)",  border: "var(--warn-border)", label: "OFFLINE" },
  online:      { icon: "⊕",  color: "var(--ok)",   bg: "var(--ok-bg)",    border: "var(--ok-border)",   label: "ONLINE" },
  info:        { icon: "·",  color: "var(--bw-400)", bg: "var(--glass-1)", border: "var(--glass-border)", label: "INFO" },
};

function EventRow({ event, isFirst }) {
  const cfg = TYPE_CONFIG[event.type] || TYPE_CONFIG.info;
  const timeStr = new Date(event.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "32px 64px 1fr",
        gap: 10,
        padding: "8px 16px",
        alignItems: "flex-start",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
        background: isFirst ? "rgba(255,255,255,0.02)" : "transparent",
        transition: "background 0.15s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = isFirst ? "rgba(255,255,255,0.02)" : "transparent"; }}
    >
      {/* Type badge */}
      <div style={{ paddingTop: 2 }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 20,
            height: 20,
            borderRadius: 3,
            background: cfg.bg,
            border: `1px solid ${cfg.border}`,
            color: cfg.color,
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          {cfg.icon}
        </span>
      </div>

      {/* Timestamp + badge */}
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontSize: 9, color: "var(--bw-400)", fontFamily: "var(--font-mono)" }}>{timeStr}</span>
        <span
          style={{
            fontSize: 8,
            fontWeight: 800,
            letterSpacing: "0.10em",
            fontFamily: "var(--font-mono)",
            color: cfg.color,
            textTransform: "uppercase",
          }}
        >
          {cfg.label}
        </span>
      </div>

      {/* Message */}
      <div style={{ paddingTop: 2 }}>
        <div style={{ fontSize: 11, color: "var(--bw-700)", lineHeight: 1.4, fontWeight: 500 }}>
          {event.message}
        </div>
        {event.meta && (
          <div style={{ fontSize: 10, color: "var(--bw-400)", fontFamily: "var(--font-mono)", marginTop: 2 }}>
            {event.meta}
          </div>
        )}
      </div>
    </div>
  );
}

const EventTimeline = forwardRef(function EventTimeline({ events, onClear }, ref) {
  return (
    <div
      style={{
        background: "var(--glass-1)",
        border: "1.5px solid var(--glass-border-bright)",
        borderRadius: "var(--r-xl)",
        overflow: "hidden",
        boxShadow: "var(--neo-shadow-lg)",
        display: "flex",
        flexDirection: "column",
        maxHeight: 340,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          borderBottom: "1px solid var(--glass-border)",
          background: "var(--glass-2)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--bw-500)" }}>
            Event Log
          </span>
          {events.length > 0 && (
            <span
              style={{
                padding: "1px 6px",
                borderRadius: 3,
                fontSize: 9,
                fontWeight: 700,
                fontFamily: "var(--font-mono)",
                background: "var(--glass-2)",
                border: "1px solid var(--glass-border-bright)",
                color: "var(--bw-400)",
              }}
            >
              {events.length}
            </span>
          )}
        </div>
        {events.length > 0 && (
          <button
            onClick={onClear}
            style={{
              background: "transparent",
              border: "1px solid var(--glass-border)",
              borderRadius: "var(--r-sm)",
              color: "var(--bw-400)",
              fontSize: 9,
              fontWeight: 700,
              padding: "2px 8px",
              cursor: "pointer",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            Clear
          </button>
        )}
      </div>

      {/* Event list */}
      <div ref={ref} style={{ overflowY: "auto", flex: 1 }}>
        {events.length === 0 ? (
          <div
            style={{
              padding: "32px 16px",
              textAlign: "center",
              fontSize: 11,
              color: "var(--bw-400)",
              fontFamily: "var(--font-mono)",
            }}
          >
            No events yet — monitoring active
          </div>
        ) : (
          events.map((e, i) => (
            <EventRow key={e.id} event={e} isFirst={i === 0} />
          ))
        )}
      </div>
    </div>
  );
});

export default EventTimeline;

// Hook to manage event log state — use this in DashboardPage
let _evtId = 0;
export function createEvent(type, message, meta = null) {
  return { id: ++_evtId, type, message, meta, ts: Date.now() };
}
