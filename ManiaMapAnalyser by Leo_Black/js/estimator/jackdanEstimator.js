import { runSunnyEstimatorFromText } from "./sunnyEstimator.js";
import { calculateInterludeStar } from "../interlude/index.js";
import { analyzeEtternaFromText } from "../ett/index.js";
import { classifyCompanellaDifficulty } from "./companellaEstimator.js";

/**
 * Jack Dan estimator — retrained on 94 jack/chordjack single maps
 * (Joker Practice Packs 1/2, Impossible Jack 1-5, Kether Dan, Stellar Dan 2).
 *
 * Model (forward feature selection + strict leave-one-out on 94 maps):
 *   ideal = intercept
 *         + 0.1828 * sunny.star
 *         + 0.4385 * companella.numeric
 *         + 0.1746 * msd.Technical(0.72.3)
 *         + 0.1601 * msd.Overall(0.72.3)
 *         + 0.3642 * interlude.sr
 *   LOO-RMSE 0.602 / LOO-MAE 0.466 (vs 0.737 for the previous 2-feature fit).
 *
 * Overfit guards: strict LOO for feature selection (cap 5 features), ridge /
 * quadratic / split-bucket / key-type-correction variants all measured worse,
 * weights verified stable between the 49-map and 94-map fits (except sunny,
 * whose coefficient is small and collinear with interlude — prediction stays
 * stable under LOO).
 *
 * MSD features are pinned to 0.72.3 (weights calibrated on that version);
 * Companella input uses its own MSD version (0.74.0 default).
 */

export const JACKDAN_MSD_VERSION = "0.72.3";
export const JACKDAN_COMPANELLA_MSD_VERSION = "0.74.0";

export const JACKDAN_WEIGHTS = Object.freeze({
    intercept: -12.5055,
    sunny: 0.1828,
    companella: 0.4385,
    msdTechnical: 0.1746,
    msdOverall: 0.1601,
    interlude: 0.3642,
});

const JACKDAN_DAN_NAMES = Object.freeze([
    "I", "II", "III", "IV", "V", "VI", "VII",
    "Phi", "Chi", "Psi", "Omega", "Gemini", "Kether", "Ender Horus",
]);

/**
 * Pure scoring function shared by the plugin pipeline and standalone scripts.
 * All six inputs must be finite numbers.
 * @returns {{ numeric: number, label: string }}
 * @throws if any input is not a finite number.
 */
export function computeJackDanDifficulty({
    sunnyStar,
    companellaNumeric,
    msdTechnical,
    msdOverall,
    interludeStar,
}) {
    const vals = [sunnyStar, companellaNumeric, msdTechnical, msdOverall, interludeStar].map(Number);
    if (vals.some((v) => !Number.isFinite(v))) {
        throw new Error("JackDan requires valid Sunny, Companella, MSD(0.72.3 Overall/Technical) and Interlude SR");
    }

    const raw = JACKDAN_WEIGHTS.intercept
        + JACKDAN_WEIGHTS.sunny * vals[0]
        + JACKDAN_WEIGHTS.companella * vals[1]
        + JACKDAN_WEIGHTS.msdTechnical * vals[2]
        + JACKDAN_WEIGHTS.msdOverall * vals[3]
        + JACKDAN_WEIGHTS.interlude * vals[4];
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
 * The plugin pipeline reuses already-computed Etterna + Interlude results and
 * only calls computeJackDanDifficulty.
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
        msdTechnical: ett723?.values?.Technical,
        msdOverall: ett723?.values?.Overall,
        interludeStar,
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
        jackDanInterludeStar: Number.isFinite(interludeStar) ? interludeStar : null,
    };
}
