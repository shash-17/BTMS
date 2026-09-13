"""
BTMS AI Optimisation Engine
─────────────────────────────────────────────────────────────────────
FastAPI service that:
  1. Continuously consumes telemetry from the Redis 'battery_stream' queue
     (via a background worker thread).
  2. Applies CFD-based heuristics to compute the optimal coolant flow rate
     (targeting Re 400–700) and Al₂O₃/water nanofluid concentration.
  3. Exposes REST endpoints so the React dashboard can poll recommendations.

CFD Heuristic Model (simplified)
─────────────────────────────────────────────────────────────────────
The microchannel hydraulic diameter: Dh = 1 mm
Fluid: Al₂O₃/water nanofluid

Reynolds number:   Re = (ρ · v · Dh) / μ
  where v = flow velocity [m/s], ρ = density [kg/m³], μ = viscosity [Pa·s]

Nanofluid properties (linear mixing rule, simplified):
  ρ_nf  = φ·ρ_p  + (1-φ)·ρ_f      [kg/m³]
  μ_nf  ≈ μ_f · exp(2.5·φ)          [Pa·s]  (Einstein model)
  k_nf  ≈ k_f · (1 + 3·φ)           [W/m·K] (Maxwell model, dilute)

The engine maps temperature excess → target Re → required flow velocity
→ concentration choice that maximises Nu (Nusselt number) while keeping
Re in the laminar-cooling sweet spot (400–700).
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

# ─── Shared state (updated by background worker, read by API) ─────────────────
state_lock = threading.Lock()
latest_telemetry: Optional[dict] = None
latest_recommendation: Optional[dict] = None

# ─── Physical constants ───────────────────────────────────────────────────────
DH = 0.001          # hydraulic diameter [m] — 1 mm microchannels
RHO_WATER = 997.0   # water density [kg/m³]  @ 25 °C
MU_WATER = 8.9e-4   # water dynamic viscosity [Pa·s] @ 25 °C
K_WATER = 0.607     # water thermal conductivity [W/m·K]
RHO_AL2O3 = 3960.0  # Al₂O₃ particle density [kg/m³]

TEMP_OPTIMAL_LOW = 15.0   # °C
TEMP_OPTIMAL_HIGH = 45.0  # °C
TEMP_CRITICAL = 45.0      # °C — threshold for aggressive cooling
RE_MIN = 400.0
RE_MAX = 700.0
RE_TARGET_NORMAL = 450.0   # Re for nominal operation
RE_TARGET_SPIKE = 680.0    # Re for thermal spike mitigation

# Concentration lookup table: [low, medium, high] vol% → φ
CONC_TABLE = {
    "low":    0.005,   # 0.5 vol%
    "medium": 0.015,   # 1.5 vol%
    "high":   0.030,   # 3.0 vol%
}


# ─── CFD Heuristic Functions ──────────────────────────────────────────────────

def nanofluid_properties(phi: float) -> dict:
    """Compute effective nanofluid thermophysical properties for a given volume fraction φ."""
    rho_nf = phi * RHO_AL2O3 + (1 - phi) * RHO_WATER
    mu_nf = MU_WATER * math.exp(2.5 * phi)          # Einstein model
    k_nf = K_WATER * (1 + 3 * phi)                   # Maxwell (dilute, simplified)
    return {"rho": rho_nf, "mu": mu_nf, "k": k_nf}


def compute_flow_velocity(re_target: float, props: dict) -> float:
    """Invert Re = ρ·v·Dh/μ to get required flow velocity [m/s]."""
    return (re_target * props["mu"]) / (props["rho"] * DH)


def compute_nusselt(re: float, pr: float) -> float:
    """
    Dittus-Boelter correlation for developing laminar flow:
    Nu = 3.66 + (0.065 · Re · Pr · Dh/L) / (1 + 0.04 · (Re·Pr·Dh/L)^(2/3))
    Simplified here with L = 0.1 m channel length.
    """
    L = 0.1  # channel length [m]
    gz = re * pr * DH / L   # Graetz number term
    nu = 3.66 + (0.065 * gz) / (1 + 0.04 * gz ** (2 / 3))
    return round(nu, 3)


def cfd_optimise(cells: list[dict]) -> dict:
    """
    Core CFD-based optimisation logic.
    Returns a recommendation dict with flow rate, Re, concentration, etc.
    """
    temps = [c["temperature"] for c in cells]
    max_temp = max(temps)
    avg_temp = sum(temps) / len(temps)
    delta_t = max(temps) - min(temps)
    spike_cells = [c["cell_id"] for c in cells if c["temperature"] > TEMP_CRITICAL]

    # 1. Choose target Reynolds number based on thermal state
    if spike_cells:
        re_target = RE_TARGET_SPIKE
        severity = "critical"
        conc_key = "high"
    elif max_temp > 40.0 or delta_t > 4.0:
        re_target = RE_TARGET_NORMAL + 100.0
        severity = "warning"
        conc_key = "medium"
    else:
        re_target = RE_TARGET_NORMAL
        severity = "normal"
        conc_key = "low"

    # Clamp Re to allowed range
    re_target = max(RE_MIN, min(RE_MAX, re_target))

    # 2. Compute nanofluid properties for chosen concentration
    phi = CONC_TABLE[conc_key]
    props = nanofluid_properties(phi)

    # 3. Flow velocity and volumetric flow rate
    velocity = compute_flow_velocity(re_target, props)
    channel_area = math.pi * (DH / 2) ** 2   # circular microchannel cross-section
    flow_rate_m3s = velocity * channel_area
    flow_rate_ml_min = flow_rate_m3s * 1e6 * 60   # convert to mL/min (practical unit)

    # 4. Nusselt number for heat transfer effectiveness estimate
    # Prandtl number: Pr = μ·Cp/k — use approximate Cp for water
    CP_WATER = 4182.0  # J/kg·K
    pr = (props["mu"] * CP_WATER) / props["k"]
    nu = compute_nusselt(re_target, pr)

    # 5. Heat transfer coefficient
    htc = nu * props["k"] / DH   # W/m²·K

    return {
        "severity": severity,
        "spike_cells": spike_cells,
        "max_temp": round(max_temp, 2),
        "avg_temp": round(avg_temp, 2),
        "delta_t": round(delta_t, 2),
        "target_re": round(re_target, 1),
        "concentration_key": conc_key,
        "al2o3_vol_percent": round(phi * 100, 1),
        "flow_velocity_m_s": round(velocity, 6),
        "flow_rate_ml_min": round(flow_rate_ml_min, 4),
        "nusselt_number": nu,
        "heat_transfer_coeff_W_m2K": round(htc, 2),
        "nanofluid_density_kg_m3": round(props["rho"], 2),
        "nanofluid_viscosity_mPas": round(props["mu"] * 1000, 4),
        "nanofluid_conductivity_W_mK": round(props["k"], 4),
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }


# ─── Background worker ────────────────────────────────────────────────────────

def queue_worker():
    """
    Continuously reads telemetry from the Redis queue and updates
    the latest recommendation in shared state.
    """
    logger.info("Queue worker started — polling 'battery_stream'")
    while True:
        try:
            # Blocking pop with 2 s timeout (returns None on timeout)
            item = redis_client.brpop(QUEUE_NAME, timeout=2)
            if item is None:
                continue

            _, raw = item
            payload = json.loads(raw)
            cells = payload.get("cells", [])
            if not cells:
                continue

            recommendation = cfd_optimise(cells)

            with state_lock:
                global latest_telemetry, latest_recommendation
                latest_telemetry = payload
                latest_recommendation = recommendation

            if recommendation["spike_cells"]:
                logger.warning(
                    "Tick %s | SPIKE cells %s | Re=%.0f | Al₂O₃=%.1f%% | HTC=%.0f W/m²K",
                    payload.get("tick"),
                    recommendation["spike_cells"],
                    recommendation["target_re"],
                    recommendation["al2o3_vol_percent"],
                    recommendation["heat_transfer_coeff_W_m2K"],
                )
            else:
                logger.info(
                    "Tick %s | Tmax=%.1f°C | ΔT=%.1f°C | Re=%.0f | %s",
                    payload.get("tick"),
                    recommendation["max_temp"],
                    recommendation["delta_t"],
                    recommendation["target_re"],
                    recommendation["severity"],
                )

        except redis.RedisError as e:
            logger.error("Redis error: %s — retrying in 3 s", e)
            time.sleep(3)
        except Exception as e:
            logger.exception("Worker error: %s", e)
            time.sleep(1)


# ─── FastAPI app ──────────────────────────────────────────────────────────────

app = FastAPI(
    title="BTMS AI Optimisation Engine",
    description="CFD-based coolant flow optimiser for 21700 Li-ion battery packs",
    version="1.0.0",
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
    logger.info("AI Engine started — worker thread live")


@app.get("/health")
def health():
    """Service health check."""
    try:
        redis_client.ping()
        redis_ok = True
    except Exception:
        redis_ok = False
    return {"service": "ai-engine", "status": "ok", "redis": redis_ok}


@app.get("/recommendations")
def get_recommendations():
    """Return the latest AI cooling recommendation."""
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
