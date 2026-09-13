import { Component } from "react";
import { Link } from "react-router-dom";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    console.error("[BTMS ErrorBoundary]", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      const msg = this.state.error?.message || "Unknown rendering error";
      return (
        <div className="error-boundary-page" role="alert">
          <div className="error-boundary-icon">⚠</div>
          <h1 className="error-boundary-title">Render Failure</h1>
          <p className="error-boundary-desc">
            A component crashed unexpectedly. This is usually caused by a WebGL
            context failure, a malformed API response, or a missing dependency.
          </p>
          {msg && (
            <pre className="error-boundary-details">{msg}</pre>
          )}
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center" }}>
            <button
              onClick={this.handleReset}
              style={{
                background: "#fff",
                color: "#000",
                padding: "10px 22px",
                border: "none",
                borderRadius: "4px",
                fontWeight: "800",
                fontSize: "13px",
                cursor: "pointer",
                letterSpacing: "0.04em",
              }}
            >
              ↺ Retry Component
            </button>
            <Link
              to="/"
              style={{
                background: "transparent",
                color: "#aaa",
                padding: "10px 22px",
                border: "1px solid #333",
                borderRadius: "4px",
                fontWeight: "700",
                fontSize: "13px",
                textDecoration: "none",
                letterSpacing: "0.04em",
              }}
            >
              ← Back to Landing
            </Link>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
