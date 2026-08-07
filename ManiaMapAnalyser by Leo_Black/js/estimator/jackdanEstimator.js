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
    intercept: -12.1173,
    sunny: 0.1112,
    companella: 0.5764,
    msdJumpstream: 0.1324,
    msdJackSpeed: 0.2048,
    msdStream: 0.1564,
    msdStamina: 0.0379,
});

const JACKDAN_DAN_NAMES = Object.freeze([
    "I", "II", "III", "IV", "V", "VI", "VII",
    "Phi", "Chi", "Psi", "Omega", "Gemini", "Kether", "Ender Horus",
]);

/**
 * Pure scoring function shared by the plugin pipeline and standalone scripts.
 * All inputs must be finite numbers.
 * @returns {{ numeric: number, label: string }}
 * @throws if any input is not a finite number.
 */
export function computeJackDanDifficulty({
    sunnyStar,
    companellaNumeric,
    msdJumpstream,
    msdJackSpeed,
    msdStream,
    msdStamina,
}) {
    const vals = [sunnyStar, companellaNumeric, msdJumpstream, msdJackSpeed, msdStream, msdStamina].map(Number);
    if (vals.some((v) => !Number.isFinite(v))) {
        throw new Error("JackDan requires valid Sunny, Companella, MSD(0.72.3 Jumpstream/JackSpeed/Stream/Stamina)");
    }

    const raw = JACKDAN_WEIGHTS.intercept
        + JACKDAN_WEIGHTS.sunny * vals[0]
        + JACKDAN_WEIGHTS.companella * vals[1]
        + JACKDAN_WEIGHTS.msdJumpstream * vals[2]
        + JACKDAN_WEIGHTS.msdJackSpeed * vals[3]
        + JACKDAN_WEIGHTS.msdStream * vals[4]
        + JACKDAN_WEIGHTS.msdStamina * vals[5];
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

    const [ett723, ettCompanella, interludeStar] = await Promise.all([
        analyzeEtternaFromText(osuText, {
            musicRate: speedRate,
            etternaVersion: options.jackDanMsdVersion || JACKDAN_MSD_VERSION,
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

    const dan = computeJackDanDifficulty({
        sunnyStar: sunny.star,
        companellaNumeric,
        msdJumpstream: ett723?.values?.Jumpstream,
        msdJackSpeed: ett723?.values?.JackSpeed,
        msdStream: ett723?.values?.Stream,
        msdStamina: ett723?.values?.Stamina,
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
