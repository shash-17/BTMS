import time
import random
import json
import os
import requests
from datetime import datetime

# ─── Configuration ────────────────────────────────────────────────────────────
INGESTION_URL = os.getenv("INGESTION_URL", "http://ingestion-service:5000/telemetry")
SEND_INTERVAL = 1.0          # seconds between payloads
NUM_CELLS = 10               # 10 × 21700 Li-ion cells
SPIKE_PROBABILITY = 0.15     # 15 % chance of thermal spike per tick

# ─── Physical constants for 21700 cells ───────────────────────────────────────
NOMINAL_VOLTAGE = 3.6        # V
NOMINAL_CURRENT = 2.5        # A  (≈ 0.5C discharge)
BASE_TEMP_MIN = 22.0         # °C  ambient baseline low
BASE_TEMP_MAX = 38.0         # °C  ambient baseline high
SPIKE_TEMP_MIN = 46.0        # °C  spike range low
SPIKE_TEMP_MAX = 58.0        # °C  spike range high

# State of Charge degrades slowly across time to simulate discharge
soc = [100.0] * NUM_CELLS    # Start at 100 % for all cells


def simulate_cell(cell_id: int, tick: int) -> dict:
    """Generate realistic telemetry for a single Li-ion cell."""
    global soc

    # SoC degrades ~0.01 % per tick (very slow for demo purposes)
    soc[cell_id] = max(0.0, soc[cell_id] - random.uniform(0.005, 0.02))

    # Voltage sags slightly with discharge
    voltage = NOMINAL_VOLTAGE - (1 - soc[cell_id] / 100) * 0.5 + random.uniform(-0.05, 0.05)

    # Current varies slightly around nominal
    current = NOMINAL_CURRENT + random.uniform(-0.3, 0.3)

    # Base temperature varies per cell (non-uniform by design)
    base_temp = BASE_TEMP_MIN + (cell_id * 1.5) % (BASE_TEMP_MAX - BASE_TEMP_MIN)
    temperature = base_temp + random.uniform(-1.0, 1.5)

    # Inject thermal spike
    is_spike = False
    if random.random() < SPIKE_PROBABILITY:
        temperature = random.uniform(SPIKE_TEMP_MIN, SPIKE_TEMP_MAX)
        is_spike = True

    return {
        "cell_id": cell_id,
        "voltage": round(voltage, 4),
        "current": round(current, 4),
        "temperature": round(temperature, 4),
        "soc": round(soc[cell_id], 2),
        "is_spike": is_spike,
    }


def build_payload(tick: int) -> dict:
    """Assemble a full 10-cell telemetry payload."""
    cells = [simulate_cell(i, tick) for i in range(NUM_CELLS)]
    return {
        "tick": tick,
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "pack_id": "BTMS-PACK-001",
        "cells": cells,
    }


def send_payload(payload: dict) -> None:
    """POST the telemetry payload to the ingestion service."""
    try:
        response = requests.post(
            INGESTION_URL,
            json=payload,
            timeout=3,
            headers={"Content-Type": "application/json"},
        )
        spike_cells = [c["cell_id"] for c in payload["cells"] if c["is_spike"]]
        status = f"  ⚠️  SPIKE in cells {spike_cells}" if spike_cells else ""
        print(
            f"[Tick {payload['tick']:04d}] Sent → HTTP {response.status_code}{status}",
            flush=True,
        )
    except requests.exceptions.ConnectionError:
        print(f"[Tick {payload['tick']:04d}] ⚠ Ingestion service unavailable, retrying…", flush=True)
    except Exception as e:
        print(f"[Tick {payload['tick']:04d}] Error: {e}", flush=True)


def main():
    print("=" * 60)
    print("  BTMS Sensor Simulator — 10 × 21700 Li-ion Cells")
    print(f"  Target: {INGESTION_URL}")
    print("=" * 60)

    tick = 0
    while True:
        payload = build_payload(tick)
        send_payload(payload)
        tick += 1
        time.sleep(SEND_INTERVAL)


if __name__ == "__main__":
    main()
