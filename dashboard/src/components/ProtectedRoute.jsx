import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

function LoadingScreen() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#000",
        gap: 20,
      }}
    >
      <div className="spinner" style={{ width: 36, height: 36 }} />
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "var(--bw-400)",
          fontFamily: "var(--font-mono)",
        }}
      >
        Validating Session…
      </div>
    </div>
  );
}

export default function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  // Show spinner while token is being validated on boot
  if (loading) return <LoadingScreen />;

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}
