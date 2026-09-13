import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export default function AuthPage({ defaultMode = "login" }) {
  const [mode, setMode] = useState(defaultMode); // "login" | "signup"
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { login, register, demoLogin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from?.pathname || "/dashboard";

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");

    if (mode === "login") {
      if (!username || !password) {
        setFormError("Please provide both username/email and password");
        return;
      }
      setSubmitting(true);
      const res = await login(username, password);
      setSubmitting(false);
      if (res.success) {
        navigate(from, { replace: true });
      } else {
        setFormError(res.error || "Login failed");
      }
    } else {
      // Signup
      if (!username || !email || !password) {
        setFormError("All fields are required");
        return;
      }
      if (password !== confirmPassword) {
        setFormError("Passwords do not match");
        return;
      }
      if (password.length < 6) {
        setFormError("Password must be at least 6 characters");
        return;
      }
      setSubmitting(true);
      const res = await register(username, email, password);
      setSubmitting(false);
      if (res.success) {
        navigate(from, { replace: true });
      } else {
        setFormError(res.error || "Registration failed");
      }
    }
  };

  const handleDemoSignIn = async () => {
    setSubmitting(true);
    setFormError("");
    const res = await demoLogin();
    setSubmitting(false);
    if (res.success) {
      navigate(from, { replace: true });
    } else {
      setFormError(res.error || "Demo sign-in failed");
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#080808",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        padding: "24px",
        color: "#f0f0f0",
      }}
    >
      {/* Background ambient grid */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundImage:
            "linear-gradient(#151515 1px, transparent 1px), linear-gradient(90deg, #151515 1px, transparent 1px)",
          backgroundSize: "40px 40px",
          opacity: 0.4,
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      <div style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: "440px" }}>
        {/* Brand Link */}
        <div style={{ textAlign: "center", marginBottom: "28px" }}>
          <Link
            to="/"
            style={{
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: "10px",
              color: "#fff",
            }}
          >
            <div
              style={{
                width: "32px",
                height: "32px",
                border: "2px solid #fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: "900",
                fontSize: "13px",
                background: "#000",
              }}
            >
              BT
            </div>
            <span style={{ fontWeight: "800", fontSize: "16px", letterSpacing: "0.08em" }}>
              BTMS DIGITAL TWIN
            </span>
          </Link>
          <div style={{ fontSize: "12px", color: "#666", marginTop: "6px" }}>
            Operator Authentication & Access Control
          </div>
        </div>

        {location.state?.from && (
          <div
            style={{
              background: "#18140a",
              border: "1px solid #d97706",
              color: "#fbbf24",
              padding: "10px 14px",
              borderRadius: "6px",
              fontSize: "12px",
              marginBottom: "16px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <span>🔒</span>
            <span>Operator authentication required to enter the Live Digital Twin Dashboard.</span>
          </div>
        )}

        {/* Card Box */}
        <div
          style={{
            background: "#101010",
            border: "1px solid #282828",
            borderRadius: "10px",
            boxShadow: "0 24px 60px rgba(0,0,0,0.8)",
            overflow: "hidden",
          }}
        >
          {/* Mode Switcher Tabs */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              borderBottom: "1px solid #242424",
              background: "#0c0c0c",
            }}
          >
            <button
              onClick={() => {
                setMode("login");
                setFormError("");
              }}
              style={{
                padding: "14px",
                background: mode === "login" ? "#101010" : "transparent",
                color: mode === "login" ? "#fff" : "#666",
                border: "none",
                fontWeight: "700",
                fontSize: "13px",
                cursor: "pointer",
                borderBottom: mode === "login" ? "2px solid #fff" : "2px solid transparent",
                letterSpacing: "0.04em",
              }}
            >
              Sign In
            </button>
            <button
              onClick={() => {
                setMode("signup");
                setFormError("");
              }}
              style={{
                padding: "14px",
                background: mode === "signup" ? "#101010" : "transparent",
                color: mode === "signup" ? "#fff" : "#666",
                border: "none",
                fontWeight: "700",
                fontSize: "13px",
                cursor: "pointer",
                borderBottom: mode === "signup" ? "2px solid #fff" : "2px solid transparent",
                letterSpacing: "0.04em",
              }}
            >
              Create Account
            </button>
          </div>

          <div style={{ padding: "28px" }}>
            {/* Quick Demo Login Pill */}
            <div
              style={{
                background: "#161616",
                border: "1px dashed #3a3a3a",
                borderRadius: "6px",
                padding: "12px 14px",
                marginBottom: "20px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div>
                <div style={{ fontSize: "11px", fontWeight: "700", color: "#ddd" }}>
                  Quick Operator Access
                </div>
                <div style={{ fontSize: "11px", color: "#777" }}>
                  Pre-seeded: <code>admin</code> / <code>admin123</code>
                </div>
              </div>
              <button
                type="button"
                onClick={handleDemoSignIn}
                disabled={submitting}
                style={{
                  background: "#fff",
                  color: "#000",
                  border: "none",
                  padding: "6px 12px",
                  fontSize: "11px",
                  fontWeight: "700",
                  borderRadius: "4px",
                  cursor: "pointer",
                }}
              >
                1-Click Demo →
              </button>
            </div>

            {/* Error message */}
            {formError && (
              <div
                style={{
                  background: "rgba(239, 68, 68, 0.12)",
                  border: "1px solid #ef4444",
                  color: "#fca5a5",
                  padding: "10px 14px",
                  borderRadius: "6px",
                  fontSize: "12px",
                  marginBottom: "16px",
                }}
              >
                {formError}
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <label style={{ display: "block", fontSize: "11px", fontWeight: "700", color: "#888", marginBottom: "6px", textTransform: "uppercase" }}>
                  {mode === "login" ? "Username or Email" : "Username"}
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={mode === "login" ? "e.g. admin or operator@ev.tech" : "e.g. thermal_eng"}
                  required
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    background: "#080808",
                    border: "1px solid #2e2e2e",
                    borderRadius: "4px",
                    color: "#fff",
                    fontSize: "13px",
                    boxSizing: "border-box",
                    outline: "none",
                  }}
                />
              </div>

              {mode === "signup" && (
                <div>
                  <label style={{ display: "block", fontSize: "11px", fontWeight: "700", color: "#888", marginBottom: "6px", textTransform: "uppercase" }}>
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="operator@ev.tech"
                    required
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      background: "#080808",
                      border: "1px solid #2e2e2e",
                      borderRadius: "4px",
                      color: "#fff",
                      fontSize: "13px",
                      boxSizing: "border-box",
                      outline: "none",
                    }}
                  />
                </div>
              )}

              <div>
                <label style={{ display: "block", fontSize: "11px", fontWeight: "700", color: "#888", marginBottom: "6px", textTransform: "uppercase" }}>
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    background: "#080808",
                    border: "1px solid #2e2e2e",
                    borderRadius: "4px",
                    color: "#fff",
                    fontSize: "13px",
                    boxSizing: "border-box",
                    outline: "none",
                  }}
                />
              </div>

              {mode === "signup" && (
                <div>
                  <label style={{ display: "block", fontSize: "11px", fontWeight: "700", color: "#888", marginBottom: "6px", textTransform: "uppercase" }}>
                    Confirm Password
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      background: "#080808",
                      border: "1px solid #2e2e2e",
                      borderRadius: "4px",
                      color: "#fff",
                      fontSize: "13px",
                      boxSizing: "border-box",
                      outline: "none",
                    }}
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                style={{
                  background: "#fff",
                  color: "#000",
                  padding: "12px",
                  border: "none",
                  borderRadius: "4px",
                  fontWeight: "800",
                  fontSize: "13px",
                  letterSpacing: "0.04em",
                  cursor: submitting ? "not-allowed" : "pointer",
                  marginTop: "8px",
                  opacity: submitting ? 0.7 : 1,
                }}
              >
                {submitting
                  ? "Authenticating..."
                  : mode === "login"
                  ? "Sign In to Dashboard"
                  : "Create Operator Account"}
              </button>
            </form>
          </div>

          {/* SQLite DB Status Footer */}
          <div
            style={{
              padding: "12px 24px",
              background: "#080808",
              borderTop: "1px solid #202020",
              fontSize: "11px",
              color: "#666",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#4ade80" }} />
              <span>SQLite Microservice :9000</span>
            </div>
            <span>Table: <code>users</code> + <code>audit_log</code></span>
          </div>
        </div>

        {/* Back link */}
        <div style={{ textAlign: "center", marginTop: "20px" }}>
          <Link to="/" style={{ color: "#777", fontSize: "12px", textDecoration: "none" }}>
            ← Back to Landing Page
          </Link>
        </div>
      </div>
    </div>
  );
}
