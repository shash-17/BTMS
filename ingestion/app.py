"""
BTMS Data Ingestion Service
─────────────────────────────────────────────────────────────────────
Flask microservice that receives telemetry from the simulator,
normalises temperature values, and pushes the payload onto a Redis
queue for the AI Optimisation Engine to consume.
"""

import os
import json
import logging
from flask import Flask, request, jsonify
try:
    from flask_cors import CORS
    HAS_CORS = True
except ImportError:
    HAS_CORS = False
import redis

# ─── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [ingestion] %(levelname)s  %(message)s",
)
logger = logging.getLogger(__name__)

# ─── App & Redis ──────────────────────────────────────────────────────────────
app = Flask(__name__)
if HAS_CORS:
    CORS(app)

REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
QUEUE_NAME = "battery_stream"

# Temperature normalisation bounds (°C)
TEMP_MIN = 0.0
TEMP_MAX = 60.0

redis_client = redis.Redis(
    host=REDIS_HOST,
    port=REDIS_PORT,
    decode_responses=True,
    socket_connect_timeout=0.5,
    socket_timeout=0.5
)


# ─── Helpers ──────────────────────────────────────────────────────────────────

def normalise_temperature(temp: float) -> float:
    """Min-max normalise temperature to [0.0, 1.0]."""
    return round((temp - TEMP_MIN) / (TEMP_MAX - TEMP_MIN), 6)


def enrich_payload(payload: dict) -> dict:
    """Add normalised temperatures to each cell record."""
    for cell in payload.get("cells", []):
        cell["temperature_norm"] = normalise_temperature(cell["temperature"])
    return payload


# ─── Routes ───────────────────────────────────────────────────────────────────

@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    return response

@app.route("/health", methods=["GET"])
def health():
    """Health-check endpoint used by Docker and load balancers."""
    try:
        redis_client.ping()
        redis_status = "ok"
    except Exception:
        redis_status = "unavailable"
    return jsonify({"service": "ingestion", "status": "ok", "redis": redis_status})


@app.route("/telemetry", methods=["POST"])
def ingest_telemetry():
    """
    Receive raw telemetry JSON from the simulator.
    Normalise temperatures and push onto the Redis queue.
    """
    if not request.is_json:
        return jsonify({"error": "Content-Type must be application/json"}), 415

    payload = request.get_json()

    # Validate required fields
    if "cells" not in payload or "tick" not in payload:
        return jsonify({"error": "Payload must contain 'cells' and 'tick' fields"}), 400

    # Enrich with normalised values
    enriched = enrich_payload(payload)

    # Push to Redis queue (newest at head; AI engine pops from tail)
    try:
        redis_client.lpush(QUEUE_NAME, json.dumps(enriched))
        # Keep queue bounded to last 200 payloads
        redis_client.ltrim(QUEUE_NAME, 0, 199)
    except redis.RedisError as e:
        logger.error("Redis error: %s", e)
        return jsonify({"error": "Failed to enqueue telemetry"}), 503

    spike_cells = [c["cell_id"] for c in enriched["cells"] if c.get("is_spike")]
    if spike_cells:
        logger.warning("Tick %04d — THERMAL SPIKE detected in cells: %s", payload["tick"], spike_cells)
    else:
        logger.info("Tick %04d — enqueued OK (%d cells)", payload["tick"], len(enriched["cells"]))

    return jsonify({"status": "queued", "tick": payload["tick"]}), 202


# ─── Entry point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
