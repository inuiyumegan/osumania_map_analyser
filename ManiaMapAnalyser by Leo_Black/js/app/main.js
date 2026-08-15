import { fetchBeatmapFile } from "./analysis.js";
import { startGraphAnimationLoop } from "./graph.js";
import {
    updateCardPlayVisibility,
    updateModeTagVisibility,
    updatePauseCountVisibility,
} from "./hud.js";
import { setRecomputeHandler, scheduleRecompute } from "./scheduler.js";
import { loadSettings } from "./settings.js";
import { setupSocketListener } from "./socketHandlers.js";
import { initTriangleField } from "./triangles.js";
import { loadJackDanTreeModel } from "../estimator/jackdanEstimator.js";
// Side-effect import: presets.js self-initializes (registers the preset
// settings-stream listener) on module load; it must be loaded exactly once.
import "./presets.js";

setRecomputeHandler(fetchBeatmapFile);

export async function initialize() {
    initTriangleField();
    await loadSettings();
    updateModeTagVisibility();
    updatePauseCountVisibility();
    updateCardPlayVisibility();
    startGraphAnimationLoop();
    setupSocketListener();
    // Preload JackDan GBDT tree model (non-blocking; linear fallback if it fails).
    loadJackDanTreeModel().catch((error) => {
        console.warn(`JackDan tree model unavailable, using linear model: ${error.message}`);
    });
    scheduleRecompute("initial load", false);
}


