"""
BTMS AI Optimisation Engine  (v2 — with ML Anomaly Detection)
─────────────────────────────────────────────────────────────────────
FastAPI service that:
  1. Continuously consumes telemetry from the Redis 'battery_stream' queue
     (via a background worker thread).
  2. Runs an IsolationForest anomaly detector on every telemetry tick.
     The detector bootstraps on synthetic normal data at startup, then
     continuously retrains on live data as it accumulates.
  3. Applies CFD-based heuristics — now informed by the ML severity
     verdict — to compute the optimal coolant flow rate and Al₂O₃
     nanofluid concentration.
  4. Exposes REST endpoints so the React dashboard can poll both
     recommendations and raw anomaly scores.

ML Model: IsolationForest (scikit-learn)
─────────────────────────────────────────────────────────────────────
  • Unsupervised — no labels required.
  • Feature vector (8 dims): temperature, voltage, current, soc,
    temperature_norm, pack_avg_temp, pack_delta_t, cell_vs_pack_delta.
  • Contamination: 12 % (matches ~15 % spike probability in simulator).
  • Auto-retrains on a 1000-sample rolling buffer every 50 ticks.

CFD Heuristic Model (unchanged physics)
─────────────────────────────────────────────────────────────────────
Re = (ρ · v · Dh) / μ  |  Nusselt: Dittus-Boelter  |  Dh = 1 mm
Nanofluid: Al₂O₃/H₂O  |  Einstein viscosity  |  Maxwell conductivity
"""

import os
import json
import math
import logging
import threading
import time
from datetime import datetime
from typing import Optional

import redis
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from anomaly_detector import BTMSAnomalyDetector

# ─── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [ai-engine] %(levelname)s  %(message)s",
)
logger = logging.getLogger(__name__)

# ─── Redis ────────────────────────────────────────────────────────────────────
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
QUEUE_NAME = "battery_stream"

redis_client = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)

# ─── ML Anomaly Detector (initialised once at import time) ────────────────────
detector = BTMSAnomalyDetector()

# ─── Shared state (updated by background worker, read by API) ─────────────────
state_lock = threading.Lock()
latest_telemetry: Optional[dict]        = None
latest_recommendation: Optional[dict]  = None
latest_anomaly: Optional[dict]          = None   # ← new: ML anomaly result

# ─── Physical constants ───────────────────────────────────────────────────────
DH        = 0.001       # hydraulic diameter [m] — 1 mm microchannels
RHO_WATER = 997.0       # water density     [kg/m³]  @ 25 °C
MU_WATER  = 8.9e-4      # dynamic viscosity  [Pa·s]  @ 25 °C
K_WATER   = 0.607       # thermal conductivity [W/m·K]
RHO_AL2O3 = 3960.0      # Al₂O₃ particle density [kg/m³]

TEMP_OPTIMAL_LOW  = 15.0
TEMP_OPTIMAL_HIGH = 45.0
TEMP_CRITICAL     = 45.0
RE_MIN            = 400.0
RE_MAX            = 700.0
RE_TARGET_NORMAL  = 450.0
RE_TARGET_SPIKE   = 680.0

CONC_TABLE = {
    "low":    0.005,   # 0.5 vol%
    "medium": 0.015,   # 1.5 vol%
    "high":   0.030,   # 3.0 vol%
}


# ─── CFD Physics Functions ────────────────────────────────────────────────────

def nanofluid_properties(phi: float) -> dict:
    """Compute effective nanofluid thermophysical properties for volume fraction φ."""
    rho_nf = phi * RHO_AL2O3 + (1 - phi) * RHO_WATER
    mu_nf  = MU_WATER * math.exp(2.5 * phi)    # Einstein model
    k_nf   = K_WATER  * (1 + 3 * phi)           # Maxwell (dilute)
    return {"rho": rho_nf, "mu": mu_nf, "k": k_nf}


def compute_flow_velocity(re_target: float, props: dict) -> float:
    """Invert Re = ρ·v·Dh/μ to get required flow velocity [m/s]."""
    return (re_target * props["mu"]) / (props["rho"] * DH)


def compute_nusselt(re: float, pr: float) -> float:
    """
    Dittus-Boelter / Graetz correlation for developing laminar flow.
    L = 0.1 m channel length.
    """
    L  = 0.1
    gz = re * pr * DH / L
    nu = 3.66 + (0.065 * gz) / (1 + 0.04 * gz ** (2 / 3))
    return round(nu, 3)


def cfd_optimise(cells: list[dict], ml_severity: str) -> dict:
    """
    CFD-based coolant optimisation.

    The severity tier is now DRIVEN BY the ML anomaly detector instead of
    hardcoded temperature thresholds.  This means the CFD parameters adapt
    to learned pack behaviour rather than fixed rules.

    ml_severity: "normal" | "warning" | "critical" | "unknown"
    """
    temps    = [c["temperature"] for c in cells]
    max_temp = max(temps)
    avg_temp = sum(temps) / len(temps)
    delta_t  = max(temps) - min(temps)

    # Cells physically above the critical threshold (hardware safety floor)
    hw_spike_cells = [c["cell_id"] for c in cells if c["temperature"] > TEMP_CRITICAL]

    # ── Map ML severity → CFD parameters ──────────────────────────────────────
    # Hardware critical always overrides (safety first)
    if hw_spike_cells:
        severity = "critical"
        re_target = RE_TARGET_SPIKE
        conc_key  = "high"
    elif ml_severity == "critical":
        severity = "critical"
        re_target = RE_TARGET_SPIKE
        conc_key  = "high"
    elif ml_severity == "warning":
        severity = "warning"
        re_target = RE_TARGET_NORMAL + 100.0
        conc_key  = "medium"
    else:
        severity = "normal"
        re_target = RE_TARGET_NORMAL
        conc_key  = "low"

    re_target = max(RE_MIN, min(RE_MAX, re_target))

    phi   = CONC_TABLE[conc_key]
    props = nanofluid_properties(phi)

    velocity        = compute_flow_velocity(re_target, props)
    channel_area    = math.pi * (DH / 2) ** 2
    flow_rate_m3s   = velocity * channel_area
    flow_rate_ml_min = flow_rate_m3s * 1e6 * 60

    CP_WATER = 4182.0
    pr = (props["mu"] * CP_WATER) / props["k"]
    nu = compute_nusselt(re_target, pr)
    htc = nu * props["k"] / DH

    return {
        "severity":                    severity,
        "ml_driven":                   True,          # ← flag: decision is ML-driven
        "spike_cells":                 hw_spike_cells,
        "max_temp":                    round(max_temp, 2),
        "avg_temp":                    round(avg_temp, 2),
        "delta_t":                     round(delta_t, 2),
        "target_re":                   round(re_target, 1),
        "concentration_key":           conc_key,
        "al2o3_vol_percent":           round(phi * 100, 1),
        "flow_velocity_m_s":           round(velocity, 6),
        "flow_rate_ml_min":            round(flow_rate_ml_min, 4),
        "nusselt_number":              nu,
        "heat_transfer_coeff_W_m2K":   round(htc, 2),
        "nanofluid_density_kg_m3":     round(props["rho"], 2),
        "nanofluid_viscosity_mPas":    round(props["mu"] * 1000, 4),
        "nanofluid_conductivity_W_mK": round(props["k"], 4),
        "timestamp":                   datetime.utcnow().isoformat() + "Z",
    }


# ─── Background Worker ────────────────────────────────────────────────────────

def queue_worker():
    """
    Continuously reads telemetry from Redis.
    On each tick:
      1. Feeds cells to the ML anomaly detector (ingest + detect).
      2. Passes ML severity to cfd_optimise for coolant recommendations.
      3. Stores results in shared state for the API endpoints.
    """
    logger.info("Queue worker started — polling 'battery_stream'")
    while True:
        try:
            item = redis_client.brpop(QUEUE_NAME, timeout=2)
            if item is None:
                continue

            _, raw    = item
            payload   = json.loads(raw)
            cells     = payload.get("cells", [])
            if not cells:
                continue

            # ── Step 1: ML anomaly detection ───────────────────────────────
            detector.ingest(cells)               # add to rolling buffer
            anomaly_result = detector.detect(cells)   # score this tick

            ml_severity = anomaly_result.get("pack_severity", "normal")
            n_anomalous = len(anomaly_result.get("anomalous_cells", []))

            # ── Step 2: CFD optimisation (severity driven by ML) ───────────
            recommendation = cfd_optimise(cells, ml_severity)

            # ── Step 3: Update shared state ────────────────────────────────
            with state_lock:
                global latest_telemetry, latest_recommendation, latest_anomaly
                latest_telemetry       = payload
                latest_recommendation  = recommendation
                latest_anomaly         = anomaly_result

            # ── Logging ────────────────────────────────────────────────────
            if anomaly_result.get("pack_anomaly"):
                logger.warning(
                    "Tick %s | ML-ANOMALY detected — %d cell(s) [%s] | "
                    "confidence=%.2f | Re=%.0f | Al₂O₃=%.1f%%",
                    payload.get("tick"),
                    n_anomalous,
                    anomaly_result.get("anomalous_cells"),
                    anomaly_result.get("pack_confidence", 0),
                    recommendation["target_re"],
                    recommendation["al2o3_vol_percent"],
                )
            else:
                logger.info(
                    "Tick %s | ML-NORMAL | confidence=%.2f | "
                    "Tmax=%.1f°C | ΔT=%.1f°C | Re=%.0f",
                    payload.get("tick"),
                    anomaly_result.get("pack_confidence", 0),
                    recommendation["max_temp"],
                    recommendation["delta_t"],
                    recommendation["target_re"],
                )

        except redis.RedisError as e:
            logger.error("Redis error: %s — retrying in 3 s", e)
            time.sleep(3)
        except Exception as e:
            logger.exception("Worker error: %s", e)
            time.sleep(1)


# ─── FastAPI App ──────────────────────────────────────────────────────────────

app = FastAPI(
    title="BTMS AI Optimisation Engine",
    description=(
        "IsolationForest ML anomaly detection + CFD coolant optimisation "
        "for 21700 Li-ion battery packs"
    ),
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup_event():
    """Launch the background queue worker on startup."""
    worker = threading.Thread(target=queue_worker, daemon=True)
    worker.start()
    logger.info(
        "AI Engine v2 started — ML detector ready (trained on %d bootstrap samples)",
        detector._bootstrap_n,
    )


# ─── Endpoints ────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    """Service health check including ML model status."""
    try:
        redis_client.ping()
        redis_ok = True
    except Exception:
        redis_ok = False

    model_status = detector.status()
    return {
        "service":     "ai-engine",
        "version":     "2.0.0",
        "status":      "ok",
        "redis":       redis_ok,
        "ml_model":    {
            "ready":        model_status["model_ready"],
            "train_count":  model_status["train_count"],
            "live_samples": model_status["live_samples"],
            "ticks_seen":   model_status["ticks_seen"],
        },
    }


@app.get("/recommendations")
def get_recommendations():
    """Return the latest CFD cooling recommendation (severity now ML-driven)."""
    with state_lock:
        if latest_recommendation is None:
            return {"status": "waiting", "message": "No telemetry received yet"}
        return {"status": "ok", "recommendation": latest_recommendation}


@app.get("/telemetry/latest")
def get_latest_telemetry():
    """Return the latest raw telemetry snapshot from the simulator."""
    with state_lock:
        if latest_telemetry is None:
            return {"status": "waiting", "message": "No telemetry received yet"}
        return {"status": "ok", "telemetry": latest_telemetry}


@app.get("/anomaly")
def get_anomaly():
    """
    Return the latest ML anomaly detection result.

    Per-cell anomaly scores (0–1), pack-level verdict, confidence, and
    the current model training state.
    """
    with state_lock:
        if latest_anomaly is None:
            return {
                "status": "waiting",
                "message": "No telemetry received yet",
                "model": detector.status(),
            }
        return {
            "status":  "ok",
            "anomaly": latest_anomaly,
            "model":   detector.status(),
        }


@app.get("/anomaly/model")
def get_model_status():
    """Return detailed IsolationForest model metadata."""
    return {"status": "ok", "model": detector.status()}
