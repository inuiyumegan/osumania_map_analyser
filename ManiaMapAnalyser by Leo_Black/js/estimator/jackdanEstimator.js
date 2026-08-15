import { runSunnyEstimatorFromText } from "./sunnyEstimator.js";
import { calculateInterludeStar } from "../interlude/index.js";
import { analyzeEtternaFromText } from "../ett/index.js";
import { classifyCompanellaDifficulty } from "./companellaEstimator.js";

/**
 * Jack Dan estimator — retrained on 424 maps:
 *   - 117 exact (CSV1 49 / CSV2 33 / Stellar 12 / 高难 23, fuzzy 14.5)
 *   - 274 fuzzy ±0.5 (Road to Joker non-boss maps: Chi 50 / Psi 117 / Omega 107, weight 1.0)
 *   - 33 fuzzy ±1 (Road to Joker boss maps: Psi 12 / Omega 12 / Gemini 9, weight 0.15)
 *
 * Model (weighted forward feature selection + strict leave-one-out, all plugin
 * algorithms as candidates; Interlude/pattern features were out-selected):
 *   ideal = intercept
 *         + 0.1112 * sunny.star
 *         + 0.5764 * companella.numeric
 *         + 0.1324 * msd.Jumpstream(0.72.3)
 *         + 0.2048 * msd.JackSpeed(0.72.3)
 *         + 0.1564 * msd.Stream(0.72.3)
 *         + 0.0379 * msd.Stamina(0.72.3)
 *   LOO-RMSE 0.530 (weighted), grouped ±1: exact 90%, fuzzy05 Chi 90% / Psi 97% / Omega 99%.
 *
 * MSD features pinned to 0.72.3 (weights calibrated on that version);
 * Companella input uses its own MSD version (0.74.0 default).
 */

export const JACKDAN_MSD_VERSION = "0.72.3";
export const JACKDAN_COMPANELLA_MSD_VERSION = "0.74.0";

export const JACKDAN_WEIGHTS = Object.freeze({
    intercept: -6.0032,
    sunny: -0.0450,
    companella: 0.4945,
    msdStream: 0.0153,
    msdJumpstream: -0.0142,
    msdHandstream: 0.0621,
    msdStamina: -0.0012,
    msdJackSpeed: 0.0358,
    msdChordjack: -0.0730,
    msdTechnical: -0.0338,
    msd0_68JackSpeed: 0.0966,
    msd0_74Chordjack: 0.1461,
    interlude: 0.3129,
    minijack: -0.6260,
    minitrill: -1.0400,
    trill: -1.4576,
    longjack: -0.7483,
    chordjack: -1.6039,
    quadstream: -1.1848,
    glut: -1.4313,
    roll: -0.6246,
    clusterCount: -1.3428,
});

const JACKDAN_DAN_NAMES = Object.freeze([
    "I", "II", "III", "IV", "V", "VI", "VII",
    "Phi", "Chi", "Psi", "Omega", "Gemini", "Kether", "Ender Horus",
]);

// ---------------------------------------------------------------------------
// GBDT tree model (21 plugin-native features, CV RMSE 0.472).
// Trained on 2054-map train-set (csv1 12 / csv2 9 / reform 6 / dani 6 / ... weights).
// Model JSON: 400 trees, depth<=4, lr=0.02, leaf values + per-feature medians
// (training filled NaN with medians; inference mirrors that).
// ---------------------------------------------------------------------------
export const JACKDAN_TREE_MODEL_URL = new URL("./gbdt-model.json", import.meta.url);

let treeModelPromise = null;
let treeModel = null;

/**
 * Load the GBDT model JSON (cached; safe to call concurrently).
 * Browser: fetch(URL). Node: fs.readFileSync fallback (file:// fetch not implemented).
 * @returns {Promise<object>} model { init, lr, feats, medians, trees }
 */
export function loadJackDanTreeModel() {
    if (!treeModelPromise) {
        treeModelPromise = (async () => {
            let m;
            if (typeof process !== "undefined" && process.versions?.node) {
                const { readFileSync } = await import("node:fs");
                m = JSON.parse(readFileSync(JACKDAN_TREE_MODEL_URL, "utf8"));
            } else {
                const r = await fetch(JACKDAN_TREE_MODEL_URL);
                if (!r.ok) throw new Error(`jackdan tree model fetch failed: ${r.status}`);
                m = await r.json();
            }
            treeModel = m;
            return m;
        })().catch((e) => { treeModelPromise = null; throw e; });
    }
    return treeModelPromise;
}

export function isJackDanTreeModelLoaded() {
    return treeModel != null;
}

/**
 * Pure GBDT scoring. Inputs are the 21 features in the SAME ORDER as
 * computeJackDanDifficulty's vals array. Missing (NaN/undefined) values are
 * filled with training medians. Synchronous; model must be loaded first.
 * @param {number[]} vals length-21 feature vector
 * @returns {number} raw score
 */
export function predictJackDanTree(vals) {
    if (!treeModel) {
        throw new Error("jackdan tree model not loaded");
    }
    const { init, lr, feats, medians, trees } = treeModel;
    // fill NaN with training medians (order matches feats)
    const x = feats.map((f, i) => {
        const v = Number(vals[i]);
        return Number.isFinite(v) ? v : medians[f];
    });
    let score = init;
    for (const t of trees) {
        let node = 0;
        const left = t.l, right = t.r, featIdx = t.f, thr = t.t;
        const leafFlag = t.leaf; // HistGBDT exports explicit is_leaf array; GBDT format omits it
        // HistGBDT leaf values already include learning_rate (lr=1.0 in export);
        // old GBDT format uses left[node]===-1 as leaf marker and lr multiply.
        while (leafFlag ? leafFlag[node] === 0 : left[node] !== -1) {
            node = x[featIdx[node]] <= thr[node] ? left[node] : right[node];
        }
        score += lr * t.v[node];
    }
    return score;
}

/**
 * Tree-model variant of computeJackDanDifficulty (same signature, same label logic).
 * @throws if model not loaded or inputs invalid.
 */
export function computeJackDanTreeDifficulty({
    sunnyStar,
    companellaNumeric,
    msdStream,
    msdJumpstream,
    msdHandstream,
    msdStamina,
    msdJackSpeed,
    msdChordjack,
    msdTechnical,
    msd0_68JackSpeed,
    msd0_74Chordjack,
    interludeStar,
    minijack = 0,
    minitrill = 0,
    trill = 0,
    longjack = 0,
    chordjack = 0,
    quadstream = 0,
    glut = 0,
    roll = 0,
    clusterCount = 0,
}) {
    const vals = [sunnyStar, companellaNumeric, msdStream, msdJumpstream, msdHandstream, msdStamina, msdJackSpeed, msdChordjack, msdTechnical, msd0_68JackSpeed, msd0_74Chordjack, interludeStar, minijack, minitrill, trill, longjack, chordjack, quadstream, glut, roll, clusterCount].map(Number);
    if (vals.slice(0, 12).some((v) => !Number.isFinite(v))) {
        throw new Error("JackDan tree requires valid Sunny, Companella, MSD and Interlude SR inputs");
    }
    const raw = predictJackDanTree(vals);
    const numeric = Number(raw.toFixed(2));

    if (numeric > 14.4) {
        return { numeric, label: "> Ender Horus High" };
    }
    if (numeric < 0.4) {
        return { numeric, label: "< I low" };
    }

    const danLevel = Math.max(1, Math.round(numeric));
    const offset = numeric - danLevel;
    let variant;
    if (offset <= -0.3) {
        variant = "low";
    } else if (offset <= -0.1) {
        variant = "mid/low";
    } else if (offset < 0.1) {
        variant = "mid";
    } else if (offset < 0.3) {
        variant = "mid/high";
    } else {
        variant = "high";
    }

    const idx = danLevel - 1;
    const name = idx < JACKDAN_DAN_NAMES.length ? JACKDAN_DAN_NAMES[idx] : String(danLevel);

    return { numeric, label: `${name} ${variant}` };
}

const JACK_PATTERN_RE = /jack|glut|quad/i;

/**
 * 双筛选判定谱面是否为叠键（jack/chordjack）谱：
 *  1) MSD（排除 Stamina 后）最高键型是 Chordjack 或 JackSpeed；
 *  2) pattern 分析的 Category 是 jack 类键型（chordjack/longjack/jacks/minijacks/
 *     glut/quadstream 或任何含 jack 的键型）。
 * 任一信号为真即视为叠键；两者都否定才判非叠键（保守，避免误伤）。
 * @param {object|null} msdValues MSD 8 键型值（0.72.3）
 * @param {string|null} patternCategory pattern 分析的 Category
 * @returns {boolean}
 */
export function isJackMap(msdValues, patternCategory = null) {
    if (msdValues && typeof msdValues === "object") {
        const keys = ["Stream", "Jumpstream", "Handstream", "JackSpeed", "Chordjack", "Technical"];
        const vals = keys.map((k) => Number(msdValues[k]));
        if (vals.every((v) => Number.isFinite(v))) {
            const max = Math.max(...vals);
            const top = keys.filter((_, i) => vals[i] === max);
            if (top.includes("Chordjack") || top.includes("JackSpeed")) {
                return true;
            }
        }
    }
    if (typeof patternCategory === "string" && JACK_PATTERN_RE.test(patternCategory)) {
        return true;
    }
    return false;
}

/**
 * Extract small-jack pattern features from pattern clusters (same aggregation as training).
 * @param {Array} clusters topFiveClusters (each has Amount + SpecificTypes [[type, ratio]])
 * @returns {object} minijack/minitrill/trill/longjack/chordjack/quadstream/glut/roll/clusterCount
 */
export function extractJackDanPatternFeatures(clusters = []) {
    const out = { minijack: 0, minitrill: 0, trill: 0, longjack: 0, chordjack: 0, quadstream: 0, glut: 0, roll: 0, clusterCount: clusters.length };
    for (const c of clusters.slice(0, 3)) {
        const amt = Number(c?.Amount) || 0;
        for (const [type, ratio] of c?.SpecificTypes || []) {
            const t = String(type).toLowerCase();
            const contribution = amt * (Number(ratio) || 0);
            if (t.includes("minijack")) out.minijack += contribution;
            if (t.includes("minitrill")) out.minitrill += contribution;
            if (t.includes("trill")) out.trill += contribution;
            if (t.includes("longjack")) out.longjack += contribution;
            if (t.includes("chordjack")) out.chordjack += contribution;
            if (t.includes("quadstream")) out.quadstream += contribution;
            if (t.includes("glut")) out.glut += contribution;
            if (t.includes("roll")) out.roll += contribution;
        }
    }
    const tot = out.minijack + out.minitrill + out.trill + out.longjack + out.chordjack + out.quadstream + out.glut + out.roll;
    if (tot > 0) {
        // IMPORTANT: matches training normalization — ALL keys (incl. clusterCount) divided by tot.
        for (const k of Object.keys(out)) {
            out[k] = Number((out[k] / tot).toFixed(4));
        }
    }
    return out;
}

/**
 * Pure scoring function shared by the plugin pipeline and standalone scripts.
 * All inputs must be finite numbers.
 * @returns {{ numeric: number, label: string }}
 * @throws if any input is not a finite number.
 */
export function computeJackDanDifficulty({
    sunnyStar,
    companellaNumeric,
    msdStream,
    msdJumpstream,
    msdHandstream,
    msdStamina,
    msdJackSpeed,
    msdChordjack,
    msdTechnical,
    msd0_68JackSpeed,
    msd0_74Chordjack,
    interludeStar,
    minijack = 0,
    minitrill = 0,
    trill = 0,
    longjack = 0,
    chordjack = 0,
    quadstream = 0,
    glut = 0,
    roll = 0,
    clusterCount = 0,
}) {
    const vals = [sunnyStar, companellaNumeric, msdStream, msdJumpstream, msdHandstream, msdStamina, msdJackSpeed, msdChordjack, msdTechnical, msd0_68JackSpeed, msd0_74Chordjack, interludeStar, minijack, minitrill, trill, longjack, chordjack, quadstream, glut, roll, clusterCount].map(Number);
    if (vals.some((v) => !Number.isFinite(v))) {
        throw new Error("JackDan requires valid Sunny, Companella, MSD(0.72.3 Stream/Jumpstream/Handstream/Stamina/JackSpeed/Chordjack/Technical, 0.68 JackSpeed, 0.74 Chordjack), Interlude SR and pattern features");
    }

    const raw = JACKDAN_WEIGHTS.intercept
        + JACKDAN_WEIGHTS.sunny * vals[0]
        + JACKDAN_WEIGHTS.companella * vals[1]
        + JACKDAN_WEIGHTS.msdStream * vals[2]
        + JACKDAN_WEIGHTS.msdJumpstream * vals[3]
        + JACKDAN_WEIGHTS.msdHandstream * vals[4]
        + JACKDAN_WEIGHTS.msdStamina * vals[5]
        + JACKDAN_WEIGHTS.msdJackSpeed * vals[6]
        + JACKDAN_WEIGHTS.msdChordjack * vals[7]
        + JACKDAN_WEIGHTS.msdTechnical * vals[8]
        + JACKDAN_WEIGHTS.msd0_68JackSpeed * vals[9]
        + JACKDAN_WEIGHTS.msd0_74Chordjack * vals[10]
        + JACKDAN_WEIGHTS.interlude * vals[11]
        + JACKDAN_WEIGHTS.minijack * vals[12]
        + JACKDAN_WEIGHTS.minitrill * vals[13]
        + JACKDAN_WEIGHTS.trill * vals[14]
        + JACKDAN_WEIGHTS.longjack * vals[15]
        + JACKDAN_WEIGHTS.chordjack * vals[16]
        + JACKDAN_WEIGHTS.quadstream * vals[17]
        + JACKDAN_WEIGHTS.glut * vals[18]
        + JACKDAN_WEIGHTS.roll * vals[19]
        + JACKDAN_WEIGHTS.clusterCount * vals[20];
    const numeric = Number(raw.toFixed(2));

    // 超出标尺范围：> Ender Horus High（14.4）显示上限标签，< I low（0.4）显示下限标签。
    if (numeric > 14.4) {
        return { numeric, label: "> Ender Horus High" };
    }
    if (numeric < 0.4) {
        return { numeric, label: "< I low" };
    }

    // 段位等级按最近整数（四舍五入），变体按偏移分五档（与 Companella 一致）：
    //   offset <= -0.3        -> low
    //   -0.3 <  offset <= -0.1 -> mid/low
    //   -0.1 <  offset < 0.1   -> mid
    //   0.1 <=  offset < 0.3   -> mid/high
    //   offset >= 0.3          -> high
    const danLevel = Math.max(1, Math.round(numeric));
    const offset = numeric - danLevel;
    let variant;
    if (offset <= -0.3) {
        variant = "low";
    } else if (offset <= -0.1) {
        variant = "mid/low";
    } else if (offset < 0.1) {
        variant = "mid";
    } else if (offset < 0.3) {
        variant = "mid/high";
    } else {
        variant = "high";
    }

    const idx = danLevel - 1;
    const name = idx < JACKDAN_DAN_NAMES.length ? JACKDAN_DAN_NAMES[idx] : String(danLevel);

    return { numeric, label: `${name} ${variant}` };
}

/**
 * Standalone async entry point (Node training scripts / debug panel).
 * The plugin pipeline reuses already-computed Etterna results and only calls
 * computeJackDanDifficulty.
 */
export async function runJackDanEstimatorFromText(osuText, options = {}) {
    const speedRate = Number.isFinite(options.speedRate) && options.speedRate > 0 ? options.speedRate : 1.0;
    const sunny = runSunnyEstimatorFromText(osuText, options);

    const [ett723, ett068, ettCompanella, interludeStar] = await Promise.all([
        analyzeEtternaFromText(osuText, {
            musicRate: speedRate,
            etternaVersion: options.jackDanMsdVersion || JACKDAN_MSD_VERSION,
        }),
        analyzeEtternaFromText(osuText, {
            musicRate: speedRate,
            etternaVersion: "0.68.0-Unofficial",
        }),
        analyzeEtternaFromText(osuText, {
            musicRate: speedRate,
            etternaVersion: options.jackDanCompanellaMsdVersion || JACKDAN_COMPANELLA_MSD_VERSION,
        }),
        calculateInterludeStar(osuText, speedRate, options.cvtFlag ?? null),
    ]);

    let companellaNumeric = null;
    try {
        const cp = await classifyCompanellaDifficulty({
            msdValues: ettCompanella?.values,
            interludeStar,
            sunnyStar: sunny.star,
        });
        companellaNumeric = cp.numericDifficulty;
    } catch (error) {
        // Companella failure -> caller falls back to Sunny display.
    }

    let patternFeatures = null;
    try {
        const { analyzePatternFromText } = await import("../patterns/service.js");
        const p = analyzePatternFromText(osuText);
        patternFeatures = extractJackDanPatternFeatures(p.topFiveClusters || p.report?.Clusters || []);
    } catch (error) {
        // pattern features optional in standalone
    }

    const dan = computeJackDanDifficulty({
        sunnyStar: sunny.star,
        companellaNumeric,
        msdStream: ett723?.values?.Stream,
        msdJumpstream: ett723?.values?.Jumpstream,
        msdHandstream: ett723?.values?.Handstream,
        msdStamina: ett723?.values?.Stamina,
        msdJackSpeed: ett723?.values?.JackSpeed,
        msdChordjack: ett723?.values?.Chordjack,
        msdTechnical: ett723?.values?.Technical,
        msd0_68JackSpeed: ett068?.values?.JackSpeed,
        msd0_74Chordjack: ettCompanella?.values?.Chordjack,
        interludeStar,
        ...(patternFeatures || {}),
    });

    return {
        star: sunny.star,
        lnRatio: sunny.lnRatio,
        columnCount: sunny.columnCount,
        estDiff: dan.label,
        numericDifficulty: dan.numeric,
        numericDifficultyHint: null,
        graph: sunny.graph ?? null,
        jackDanMsdValues: ett723?.values ?? null,
    };
}
