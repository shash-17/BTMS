"""
anomaly_detector.py  — BTMS ML Anomaly Detection Module
─────────────────────────────────────────────────────────────────────────────
Implements real Unsupervised Machine Learning anomaly detection using
scikit-learn's IsolationForest algorithm.

Architecture
────────────
IsolationForest works by randomly partitioning the feature space with
isolation trees.  Anomalies are isolated in fewer splits → shorter path
length → high anomaly score.  It requires NO labelled data.

Feature vector (8 dimensions per cell sample)
──────────────────────────────────────────────
  [0] temperature         — primary thermal signal
  [1] voltage             — sag indicates high heat generation (I²R losses)
  [2] current             — directly drives resistive heating
  [3] soc                 — low SoC → electrolyte resistance rises
  [4] temperature_norm    — scaled version (provides gradient signal)
  [5] pack_avg_temp       — contextual pack mean (cell vs pack deviation)
  [6] pack_delta_t        — temperature spread across the pack
  [7] cell_vs_pack_delta  — how far this cell deviates from pack mean

Lifecycle
─────────
1. BOOTSTRAP: at startup, 600 synthetic "normal" samples are generated
   from the known safe operating envelopes. The model is fit immediately
   so it can score from tick 0.
2. LIVE ACCUMULATION: every real telemetry tick's cells are added to a
   rolling buffer (max 1000 samples).
3. RETRAIN: every RETRAIN_INTERVAL ticks, the model is refitted on the
   full buffer (bootstrap + live normal data), improving specificity over
   time as it learns this pack's true normal distribution.
"""

import logging
import math
import random
import threading
from collections import deque
from typing import Optional

import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler

logger = logging.getLogger("anomaly_detector")

# ── Hyper-parameters ───────────────────────────────────────────────────────────
N_ESTIMATORS       = 200          # more trees = more stable scores
CONTAMINATION      = 0.15         # expected anomaly fraction (matches 15% spike prob)
RANDOM_STATE       = 42
BOOTSTRAP_SAMPLES  = 800          # synthetic normal samples for cold-start
BUFFER_CAPACITY    = 1000         # rolling live sample buffer
RETRAIN_INTERVAL   = 50          # retrain every N ticks of live data
MIN_SAMPLES_TRAIN  = 200          # minimum samples before retraining

# ── Safe operating envelope (for bootstrap generation) ─────────────────────────
SAFE_TEMP_MIN,  SAFE_TEMP_MAX  = 20.0,  42.0   # °C
SAFE_VOLT_MIN,  SAFE_VOLT_MAX  = 3.2,   4.1    # V
SAFE_CURR_MIN,  SAFE_CURR_MAX  = 1.8,   3.2    # A
SAFE_SOC_MIN,   SAFE_SOC_MAX   = 30.0,  100.0  # %

# Also generate some anomalous examples so the model sees contrast
ANOM_TEMP_MIN,  ANOM_TEMP_MAX  = 46.0,  58.0   # °C spikes
ANOM_FRAC                      = 0.15          # 15% of bootstrap = anomalous


def _build_feature_vector(
    cell: dict,
    pack_avg_temp: float,
    pack_delta_t: float,
) -> list[float]:
    """
    Convert a single cell dict + pack-level statistics into the 8-dim
    feature vector expected by the IsolationForest.
    """
    temp     = cell["temperature"]
    voltage  = cell["voltage"]
    current  = cell["current"]
    soc      = cell.get("soc", 80.0)
    temp_norm = cell.get("temperature_norm",
                          (temp - 0.0) / (60.0 - 0.0))

    cell_vs_pack = temp - pack_avg_temp

    return [
        temp,
        voltage,
        current,
        soc,
        temp_norm,
        pack_avg_temp,
        pack_delta_t,
        cell_vs_pack,
    ]


def _pack_stats(cells: list[dict]) -> tuple[float, float]:
    """Return (avg_temp, delta_t) for a list of cell dicts."""
    temps = [c["temperature"] for c in cells]
    return sum(temps) / len(temps), max(temps) - min(temps)


def _generate_bootstrap_samples(n: int = BOOTSTRAP_SAMPLES) -> np.ndarray:
    """
    Generate synthetic samples from the known operating distribution.
    Includes both normal AND anomalous samples so the IsolationForest
    has clear contrast and doesn't over-flag normal packs.
    """
    rng = random.Random(RANDOM_STATE)
    samples = []

    n_normal = int(n * (1 - ANOM_FRAC))
    n_anom   = n - n_normal

    # ── Normal samples ──────────────────────────────────────────────────────
    for _ in range(n_normal):
        pack_temps = [rng.uniform(SAFE_TEMP_MIN, SAFE_TEMP_MAX) for _ in range(10)]
        avg_t   = sum(pack_temps) / len(pack_temps)
        delta_t = max(pack_temps) - min(pack_temps)
        temp    = rng.choice(pack_temps)
        volt    = rng.uniform(SAFE_VOLT_MIN, SAFE_VOLT_MAX)
        current = rng.uniform(SAFE_CURR_MIN, SAFE_CURR_MAX)
        soc     = rng.uniform(SAFE_SOC_MIN, SAFE_SOC_MAX)
        t_norm  = temp / 60.0
        vs_pack = temp - avg_t
        samples.append([temp, volt, current, soc, t_norm, avg_t, delta_t, vs_pack])

    # ── Anomalous samples (spike cells) ─────────────────────────────────────
    for _ in range(n_anom):
        # Normal background pack
        pack_temps = [rng.uniform(SAFE_TEMP_MIN, SAFE_TEMP_MAX) for _ in range(10)]
        spike_temp = rng.uniform(ANOM_TEMP_MIN, ANOM_TEMP_MAX)
        pack_temps[rng.randint(0, 9)] = spike_temp   # inject one spike
        avg_t   = sum(pack_temps) / len(pack_temps)
        delta_t = max(pack_temps) - min(pack_temps)
        # The anomalous cell
        volt    = rng.uniform(3.0, 3.4)    # sagging voltage under thermal stress
        current = rng.uniform(3.5, 5.5)   # elevated current
        soc     = rng.uniform(30.0, 75.0)
        t_norm  = spike_temp / 60.0
        vs_pack = spike_temp - avg_t
        samples.append([spike_temp, volt, current, soc, t_norm, avg_t, delta_t, vs_pack])

    rng.shuffle(samples)
    return np.array(samples, dtype=np.float32)


# ══════════════════════════════════════════════════════════════════════════════
# Main detector class
# ══════════════════════════════════════════════════════════════════════════════

class BTMSAnomalyDetector:
    """
    Thread-safe IsolationForest anomaly detector for BTMS telemetry.

    Public API
    ──────────
    detect(cells)       → dict with per-cell scores and pack-level verdict
    ingest(cells)       → add live samples to rolling buffer (call each tick)
    status()            → dict summary of model state
    """

    def __init__(self):
        self._lock         = threading.Lock()
        self._buffer       = deque(maxlen=BUFFER_CAPACITY)   # rolling sample store
        self._tick_count   = 0                                # live ticks seen
        self._train_count  = 0                                # number of retrains
        self._model: Optional[IsolationForest] = None
        self._scaler: Optional[StandardScaler] = None
        self._is_ready     = False
        self._bootstrap_n  = 0

        # Bootstrap immediately on construction (synchronous, ~10 ms)
        self._bootstrap()
        logger.info(
            "AnomalyDetector ready — IsolationForest fitted on %d bootstrap samples",
            self._bootstrap_n,
        )

    # ── Private: training ──────────────────────────────────────────────────────

    def _bootstrap(self):
        """Cold-start: fit on synthetic normal data."""
        X_boot = _generate_bootstrap_samples(BOOTSTRAP_SAMPLES)
        self._bootstrap_n = len(X_boot)
        self._fit(X_boot)

    def _fit(self, X: np.ndarray):
        """Fit scaler + IsolationForest on X. Called under the lock."""
        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)

        model = IsolationForest(
            n_estimators=N_ESTIMATORS,
            contamination=CONTAMINATION,
            random_state=RANDOM_STATE,
            n_jobs=-1,          # use all CPU cores
            bootstrap=True,
        )
        model.fit(X_scaled)

        self._scaler = scaler
        self._model  = model
        self._is_ready = True
        self._train_count += 1

    def _maybe_retrain(self):
        """
        Retrain if enough live data has accumulated since the last retrain.
        Non-blocking: runs in a daemon thread to avoid stalling the worker.
        """
        if (self._tick_count % RETRAIN_INTERVAL == 0 and
                len(self._buffer) >= MIN_SAMPLES_TRAIN):

            snapshot = np.array(list(self._buffer), dtype=np.float32)

            def _train_thread():
                with self._lock:
                    self._fit(snapshot)
                logger.info(
                    "AnomalyDetector retrained on %d samples (retrain #%d)",
                    len(snapshot), self._train_count,
                )

            threading.Thread(target=_train_thread, daemon=True).start()

    # ── Public API ─────────────────────────────────────────────────────────────

    def ingest(self, cells: list[dict]) -> None:
        """
        Add live telemetry cells to the rolling buffer and potentially
        trigger a background retrain.  Call once per telemetry tick.
        """
        avg_t, delta_t = _pack_stats(cells)
        features = [_build_feature_vector(c, avg_t, delta_t) for c in cells]

        with self._lock:
            self._buffer.extend(features)
            self._tick_count += 1

        self._maybe_retrain()

    def detect(self, cells: list[dict]) -> dict:
        """
        Score every cell in the current tick for anomaly.

        Returns
        ───────
        {
          "model_ready":   bool,
          "train_count":   int,          # how many times model has been retrained
          "samples_seen":  int,          # live samples in buffer
          "pack_anomaly":  bool,         # True if ANY cell is anomalous
          "pack_severity": str,          # "normal" | "warning" | "critical"
          "pack_confidence": float,      # 0.0–1.0 confidence in anomaly verdict
          "anomalous_cells": [int, ...], # cell_ids flagged as anomalous
          "cells": [
              {
                "cell_id":       int,
                "anomaly_score": float,   # 0.0–1.0 (higher = more anomalous)
                "is_anomaly":    bool,
                "confidence":    float,   # certainty of the anomaly verdict
                "label":         str,     # "NORMAL" | "ANOMALY"
              },
              ...
          ]
        }
        """
        if not self._is_ready or self._model is None:
            return self._fallback_result(cells)

        avg_t, delta_t = _pack_stats(cells)
        features = np.array(
            [_build_feature_vector(c, avg_t, delta_t) for c in cells],
            dtype=np.float32,
        )

        with self._lock:
            scaler = self._scaler
            model  = self._model
            tc     = self._train_count
            buf_sz = len(self._buffer)

        # Scale and score
        X_scaled = scaler.transform(features)

        # raw_scores: negative values; more negative = more anomalous
        raw_scores = model.score_samples(X_scaled)     # shape: (n_cells,)
        predictions = model.predict(X_scaled)          # +1 = normal, -1 = anomaly

        # Normalise scores to [0, 1]: 1.0 = definitely anomalous
        # We probe the bootstrap scores to set adaptive bounds
        raw_min = float(np.percentile(raw_scores, 5))    # 5th pct = very anomalous
        raw_max = float(np.percentile(raw_scores, 95))   # 95th pct = very normal
        raw_range = max(raw_max - raw_min, 1e-6)
        norm_scores = np.clip(
            1.0 - (raw_scores - raw_min) / raw_range,
            0.0, 1.0,
        )

        cell_results = []
        anomalous_ids = []

        for i, cell in enumerate(cells):
            is_anomaly  = bool(predictions[i] == -1)
            score       = float(norm_scores[i])
            confidence  = float(abs(score - 0.5) * 2.0)   # 0 at decision boundary, 1 at extremes
            label       = "ANOMALY" if is_anomaly else "NORMAL"

            if is_anomaly:
                anomalous_ids.append(cell["cell_id"])

            cell_results.append({
                "cell_id":       cell["cell_id"],
                "anomaly_score": round(score, 4),
                "is_anomaly":    is_anomaly,
                "confidence":    round(confidence, 4),
                "label":         label,
            })

        # Pack-level verdict
        n_anomalous = len(anomalous_ids)
        frac = n_anomalous / len(cells)

        if frac == 0:
            pack_severity  = "normal"
            pack_anomaly   = False
            pack_confidence = float(np.mean(1.0 - norm_scores))
        elif frac <= 0.2:
            pack_severity  = "warning"
            pack_anomaly   = True
            pack_confidence = float(np.mean(norm_scores[predictions == -1]))
        else:
            pack_severity  = "critical"
            pack_anomaly   = True
            pack_confidence = float(np.mean(norm_scores[predictions == -1]))

        return {
            "model_ready":     True,
            "train_count":     tc,
            "samples_seen":    buf_sz,
            "pack_anomaly":    pack_anomaly,
            "pack_severity":   pack_severity,
            "pack_confidence": round(pack_confidence, 4),
            "anomalous_cells": sorted(anomalous_ids),
            "cells":           cell_results,
        }

    def status(self) -> dict:
        """Return a summary of the detector's current state."""
        with self._lock:
            return {
                "model_ready":    self._is_ready,
                "train_count":    self._train_count,
                "bootstrap_n":    self._bootstrap_n,
                "live_samples":   len(self._buffer),
                "ticks_seen":     self._tick_count,
                "buffer_capacity": BUFFER_CAPACITY,
                "n_estimators":   N_ESTIMATORS,
                "contamination":  CONTAMINATION,
                "features": [
                    "temperature", "voltage", "current", "soc",
                    "temperature_norm", "pack_avg_temp",
                    "pack_delta_t", "cell_vs_pack_delta",
                ],
            }

    # ── Fallback (model not ready) ─────────────────────────────────────────────

    def _fallback_result(self, cells: list[dict]) -> dict:
        """Return a safe default result when the model isn't ready yet."""
        return {
            "model_ready":     False,
            "train_count":     0,
            "samples_seen":    0,
            "pack_anomaly":    False,
            "pack_severity":   "unknown",
            "pack_confidence": 0.0,
            "anomalous_cells": [],
            "cells": [
                {
                    "cell_id":       c["cell_id"],
                    "anomaly_score": 0.0,
                    "is_anomaly":    False,
                    "confidence":    0.0,
                    "label":         "PENDING",
                }
                for c in cells
            ],
        }
