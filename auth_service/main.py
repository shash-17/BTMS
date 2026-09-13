"""
auth_service/main.py
FastAPI microservice — Authentication & User Management
SQLite backend via Python's built-in sqlite3

Endpoints:
  POST /auth/register  → create account, return JWT
  POST /auth/login     → verify credentials, return JWT
  GET  /auth/me        → return current user (requires Bearer token)
  POST /auth/logout    → client-side; endpoint for audit log
"""

from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional
import sqlite3
import bcrypt
import jwt
import datetime
import os
import re
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("auth_service")

# ── Config ────────────────────────────────────────────────────────────────────
JWT_SECRET  = os.getenv("JWT_SECRET", "btms-super-secret-key-change-in-prod-2026")
JWT_ALGO    = "HS256"
JWT_EXPIRY  = int(os.getenv("JWT_EXPIRY_HOURS", "24"))
DB_PATH     = os.getenv("DB_PATH", os.path.join(os.path.dirname(os.path.abspath(__file__)), "btms_users.db"))

app = FastAPI(title="BTMS Auth Service", version="1.0.0", docs_url="/auth/docs")
security = HTTPBearer(auto_error=False)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Database ──────────────────────────────────────────────────────────────────
def get_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Create tables on startup."""
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            username      TEXT    UNIQUE NOT NULL,
            email         TEXT    UNIQUE NOT NULL,
            password_hash TEXT    NOT NULL,
            role          TEXT    NOT NULL DEFAULT 'operator',
            created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
            last_login    TEXT
        );

        CREATE TABLE IF NOT EXISTS audit_log (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id    INTEGER,
            action     TEXT NOT NULL,
            ip_address TEXT,
            timestamp  TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id)
        );
    """)
    conn.commit()

    # Seed a default admin account if DB is empty
    existing = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
    if existing == 0:
        pw_hash = bcrypt.hashpw(b"admin123", bcrypt.gensalt()).decode()
        conn.execute(
            "INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)",
            ("admin", "admin@btms.local", pw_hash, "admin"),
        )
        conn.commit()
        logger.info("Seeded default admin account: admin / admin123")

    conn.close()

init_db()

# ── JWT helpers ───────────────────────────────────────────────────────────────
def create_token(user_id: int, username: str, role: str) -> str:
    payload = {
        "sub": str(user_id),
        "username": username,
        "role": role,
        "iat": datetime.datetime.utcnow(),
        "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=JWT_EXPIRY),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)

def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return decode_token(credentials.credentials)

# ── Pydantic models ───────────────────────────────────────────────────────────
class RegisterRequest(BaseModel):
    username: str
    email: str
    password: str

    @field_validator("username")
    @classmethod
    def username_valid(cls, v):
        if not re.match(r"^[a-zA-Z0-9_]{3,32}$", v):
            raise ValueError("Username must be 3-32 alphanumeric chars or underscores")
        return v.lower()

    @field_validator("password")
    @classmethod
    def password_valid(cls, v):
        if len(v) < 6:
            raise ValueError("Password must be at least 6 characters")
        return v

class LoginRequest(BaseModel):
    username: str   # accepts username or email
    password: str

class AuthResponse(BaseModel):
    token: str
    user: dict

# ── Routes ────────────────────────────────────────────────────────────────────
@app.get("/auth/health")
def health():
    return {"status": "ok", "service": "auth_service"}

@app.post("/auth/register", response_model=AuthResponse, status_code=201)
def register(body: RegisterRequest):
    pw_hash = bcrypt.hashpw(body.password.encode(), bcrypt.gensalt()).decode()
    conn = get_db()
    try:
        cur = conn.execute(
            "INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)",
            (body.username, body.email.lower(), pw_hash),
        )
        conn.commit()
        user_id = cur.lastrowid
    except sqlite3.IntegrityError as e:
        conn.close()
        detail = "Username already taken" if "username" in str(e) else "Email already registered"
        raise HTTPException(status_code=409, detail=detail)

    token = create_token(user_id, body.username, "operator")
    conn.execute(
        "INSERT INTO audit_log (user_id, action) VALUES (?, ?)",
        (user_id, "register"),
    )
    conn.commit()
    conn.close()

    logger.info(f"New user registered: {body.username}")
    return {
        "token": token,
        "user": {"id": user_id, "username": body.username, "email": body.email, "role": "operator"},
    }

@app.post("/auth/login", response_model=AuthResponse)
def login(body: LoginRequest):
    conn = get_db()
    row = conn.execute(
        "SELECT * FROM users WHERE username = ? OR email = ?",
        (body.username.lower(), body.username.lower()),
    ).fetchone()

    if not row or not bcrypt.checkpw(body.password.encode(), row["password_hash"].encode()):
        conn.close()
        raise HTTPException(status_code=401, detail="Invalid credentials")

    conn.execute(
        "UPDATE users SET last_login = datetime('now') WHERE id = ?", (row["id"],)
    )
    conn.execute(
        "INSERT INTO audit_log (user_id, action) VALUES (?, ?)",
        (row["id"], "login"),
    )
    conn.commit()
    conn.close()

    token = create_token(row["id"], row["username"], row["role"])
    logger.info(f"Login: {row['username']}")
    return {
        "token": token,
        "user": {
            "id": row["id"],
            "username": row["username"],
            "email": row["email"],
            "role": row["role"],
        },
    }

@app.get("/auth/me")
def me(current_user: dict = Depends(get_current_user)):
    conn = get_db()
    row = conn.execute(
        "SELECT id, username, email, role, created_at, last_login FROM users WHERE id = ?",
        (int(current_user["sub"]),),
    ).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    return dict(row)

@app.post("/auth/logout")
def logout(current_user: dict = Depends(get_current_user)):
    conn = get_db()
    conn.execute(
        "INSERT INTO audit_log (user_id, action) VALUES (?, ?)",
        (int(current_user["sub"]), "logout"),
    )
    conn.commit()
    conn.close()
    return {"status": "ok", "message": "Logged out"}
