import { createContext, useContext, useState, useEffect } from "react";

const AuthContext = createContext(null);

// Dev bypass: set VITE_DEV_AUTH_BYPASS=true in .env.local to skip auth service
const DEV_BYPASS = import.meta.env.VITE_DEV_AUTH_BYPASS === "true";

const SYNTHETIC_USER = {
  id: 0,
  username: "admin",
  email: "admin@btms.local",
  role: "admin",
};

const AUTH_URL =
  import.meta.env.VITE_AUTH_URL !== undefined && import.meta.env.VITE_AUTH_URL !== ""
    ? import.meta.env.VITE_AUTH_URL
    : typeof window !== "undefined" && window.location.hostname !== "localhost"
    ? "/auth"
    : "http://localhost:9000/auth";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem("btms_token"));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Validate existing token on boot — or inject synthetic user in dev bypass mode
  useEffect(() => {
    async function verifyToken() {
      // Dev bypass: instantly authenticate without hitting the auth service
      if (DEV_BYPASS) {
        setUser(SYNTHETIC_USER);
        setToken("dev-bypass-token");
        setLoading(false);
        return;
      }

      const storedToken = localStorage.getItem("btms_token");
      if (!storedToken) {
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(`${AUTH_URL}/me`, {
          headers: {
            Authorization: `Bearer ${storedToken}`,
          },
        });
        if (res.ok) {
          const userData = await res.json();
          setUser(userData);
          setToken(storedToken);
        } else {
          // Token invalid or expired
          localStorage.removeItem("btms_token");
          setUser(null);
          setToken(null);
        }
      } catch (err) {
        console.warn("Auth check failed, using cached session if available", err);
        // If server is temporarily unreachable, keep stored user info if present
        const cachedUser = localStorage.getItem("btms_user");
        if (cachedUser) {
          try {
            setUser(JSON.parse(cachedUser));
          } catch {
            localStorage.removeItem("btms_token");
          }
        }
      } finally {
        setLoading(false);
      }
    }
    verifyToken();
  }, []);

  const login = async (username, password) => {
    setError(null);
    try {
      const res = await fetch(`${AUTH_URL}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Authentication failed");
      }
      setToken(data.token);
      setUser(data.user);
      localStorage.setItem("btms_token", data.token);
      localStorage.setItem("btms_user", JSON.stringify(data.user));
      return { success: true, user: data.user };
    } catch (err) {
      setError(err.message);
      return { success: false, error: err.message };
    }
  };

  const register = async (username, email, password) => {
    setError(null);
    try {
      const res = await fetch(`${AUTH_URL}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Registration failed");
      }
      setToken(data.token);
      setUser(data.user);
      localStorage.setItem("btms_token", data.token);
      localStorage.setItem("btms_user", JSON.stringify(data.user));
      return { success: true, user: data.user };
    } catch (err) {
      setError(err.message);
      return { success: false, error: err.message };
    }
  };

  const logout = async () => {
    try {
      if (token) {
        await fetch(`${AUTH_URL}/logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => {});
      }
    } finally {
      localStorage.removeItem("btms_token");
      localStorage.removeItem("btms_user");
      setUser(null);
      setToken(null);
      setError(null);
    }
  };

  const demoLogin = async () => {
    // In dev bypass mode, skip the network call entirely
    if (DEV_BYPASS) {
      setUser(SYNTHETIC_USER);
      setToken("dev-bypass-token");
      return { success: true, user: SYNTHETIC_USER };
    }
    return login("admin", "admin123");
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        error,
        login,
        register,
        logout,
        demoLogin,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
