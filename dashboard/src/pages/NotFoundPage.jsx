import { Link, useLocation } from "react-router-dom";

export default function NotFoundPage() {
  const location = useLocation();

  return (
    <div className="not-found-page" id="not-found-page">
      {/* Ambient grid overlay */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      <div style={{ position: "relative", zIndex: 1 }}>
        <div className="not-found-code" aria-hidden="true">404</div>

        <div className="not-found-label">SECTOR NOT FOUND</div>

        <h1 className="not-found-title">Navigation Error</h1>

        <p className="not-found-desc">
          The requested route{" "}
          <code
            style={{
              fontFamily: "var(--font-mono)",
              background: "rgba(255,255,255,0.06)",
              padding: "1px 6px",
              borderRadius: "3px",
              fontSize: "12px",
            }}
          >
            {location.pathname}
          </code>{" "}
          does not exist in this system. You may have followed a broken link or
          manually navigated to an unregistered endpoint.
        </p>

        <div className="not-found-actions">
          <Link
            to="/"
            style={{
              background: "#fff",
              color: "#000",
              padding: "12px 24px",
              fontWeight: "800",
              fontSize: "13px",
              textDecoration: "none",
              borderRadius: "4px",
              letterSpacing: "0.04em",
            }}
          >
            ← Return to Landing
          </Link>

          <Link
            to="/dashboard"
            style={{
              background: "transparent",
              color: "#aaa",
              padding: "12px 22px",
              fontWeight: "700",
              fontSize: "13px",
              textDecoration: "none",
              border: "1px solid #333",
              borderRadius: "4px",
              letterSpacing: "0.04em",
            }}
          >
            Open Dashboard →
          </Link>
        </div>

        {/* System info footer */}
        <div
          style={{
            marginTop: 52,
            display: "flex",
            gap: 16,
            justifyContent: "center",
            flexWrap: "wrap",
            fontSize: "11px",
            color: "var(--bw-300)",
            fontFamily: "var(--font-mono)",
            letterSpacing: "0.06em",
          }}
        >
          <span>BTMS DIGITAL TWIN // 2026</span>
          <span style={{ color: "var(--bw-200)" }}>|</span>
          <span>HTTP 404</span>
          <span style={{ color: "var(--bw-200)" }}>|</span>
          <span>ROUTE UNRESOLVED</span>
        </div>
      </div>
    </div>
  );
}
