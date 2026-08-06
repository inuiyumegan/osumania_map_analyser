/**
 * Preset system — fully self-contained module.
 *
 * Design goals (minimal footprint on the original plugin):
 *  - No changes to settings.js / appContext.js / config.js / main.js /
 *    index.html / styles. The ONLY repo change besides this file is the
 *    "preset" option added to settings.json.
 *  - Opens its own /websocket/commands connection (WebSocketManager supports
 *    multiple connections) to observe the tosu settings stream, detects
 *    preset-picker changes and manual settings changes by diffing snapshots,
 *    applies presets through the existing apply* functions and syncs results
 *    back to tosu via the settings API.
 *  - Creates its manager UI (and stylesheet link) dynamically; initializes
 *    itself on module load.
 */

import { APP_CONFIG, socket, state } from "./appContext.js";
import {
    applyAzusaSunnyReferenceHoSetting,
    applyCardBgBlurSetting,
    applyCardOpacitySetting,
    applyCardRadiusSetting,
    applyCardVisibilitySetting,
    applyCompanellaEtternaVersionSetting,
    applyContentBarSetting,
    applyCustomBackgroundColorSetting,
    applyDebugUseAmountSetting,
    applyDiffTextSetting,
    applyDisplay6kLevelSetting,
    applyEnableAlwaysShowLNDifficultySetting,
    applyEnableAnalyzeLNSetting,
    applyEnableCoverArtSetting,
    applyEnableEtternaRainbowBarsSetting,
    applyEnableFloatingTrianglesSetting,
    applyEnableLNDifficultySetting,
    applyEnableNumericDifficultySetting,
    applyEnableOsuThemeSetting,
    applyEnableResultCacheSetting,
    applyEnableStatusMarqueeSetting,
    applyEnableUpdateCheckSetting,
    applyEstimatorAlgorithmSetting,
    applyEtternaVersionSetting,
    applyExtendedEstimationRangeSetting,
    applyForceSunnyWindowSetting,
    applyPauseDetectionSetting,
    applyPauseDetectionThresholdSetting,
    applyReverseCardExtendDirectionSetting,
    applyShowModeTagCapsuleSetting,
    applySrTextSetting,
    applyUseOsuFontSetting,
    applyUseSvDetectionSetting,
    applyVibroDetectionSetting,
    applyWsEndpointSetting,
} from "./settings.js";
import { clearResultCache } from "./resultCache.js";
import { scheduleRecompute } from "./scheduler.js";

const CUSTOM_PRESETS_KEY = "mma.presets.custom.v1";
const ACTIVE_PRESET_KEY = "mma.presets.active.v1";
// System-managed container that follows manual settings changes when no custom
// preset is anchored. It is NOT an applicable snapshot — selecting "Auto" only
// marks "keep following my manual changes". Reserved name.
const AUTO_SAVE_PRESET_NAME = "Auto";
// Default anchor slots, created automatically on first load. They behave like
// any other custom preset (rename/delete allowed); re-creation is skipped once
// present. Picking them in the dashboard dropdown materializes them on demand.
const DEFAULT_SLOT_NAMES = ["Custom 1", "Custom 2", "Custom 3"];
// Defensive cap for distinct custom presets (the "Auto" container does not
// count towards it). Saving always overwrites an existing preset of the same
// name, so this is only reachable when creating many differently named presets.
const MAX_CUSTOM_PRESETS = 5;

// Built-in presets (moved here so config.js stays untouched): each is a full
// snapshot = APP_CONFIG.defaults + these overrides.
const PRESET_DEFS = [
    {
        id: "default",
        name: "Default",
        description: "Reset to the factory default configuration.",
        settings: {},
    },
    {
        id: "im-osu-main",
        name: "im osu main",
        description: "Difficulty graph in the card body, pattern in the top-left capsule, estimated difficulty at top-right.",
        settings: {
            contentBar: "Graph",
            srText: "Pattern",
            diffText: "Difficulty",
            debugUseAmount: false,
            estimatorAlgorithm: "Mixed",
            azusaSunnyReferenceHo: true,
            etternaVersion: "0.72.3",
            companellaEtternaVersion: "0.74.0",
            enablePauseDetection: true,
            pauseDetectionThreshold: "500",
            enableEtternaRainbowBars: false,
            enableStatusMarquee: true,
            VibroDetection: true,
            showModeTagCapsule: true,
            enableNumericDifficulty: true,
            cardVisibility: "Always",
            cardOpacity: "95%",
            cardRadius: "Medium",
            cardBgBlur: "4px",
            enableUpdateCheck: true,
            enableResultCache: true,
            reverseCardExtendDirection: false,
            useOsuFont: true,
            enableOsuTheme: true,
            enableFloatingTriangles: true,
            enableCoverArt: true,
            customBackgroundColor: "#000000",
            useSvDetection: true,
            forceSunnyWindow: true,
            enableLNDifficulty: true,
            enableAnalyzeLN: true,
            enableAlwaysShowLNDifficulty: true,
            display6kLevel: true,
            extendedEstimationRange: false,
        },
    },
    {
        id: "pattern-focus",
        name: "Pattern Focus",
        description: "Pattern analysis in the card body and the top-left capsule.",
        settings: { contentBar: "Pattern", srText: "Pattern", diffText: "Difficulty" },
    },
    {
        id: "etterna-focus",
        name: "Etterna Focus",
        description: "Etterna skillset bars in the card body with MSD on both capsules.",
        settings: { contentBar: "Etterna", srText: "MSD", diffText: "MSD" },
    },
    {
        id: "full-overview",
        name: "Full Overview",
        description: "Pattern, Etterna and graph together, ReworkSR on the left, graph at top-right.",
        settings: { contentBar: "Full", srText: "ReworkSR", diffText: "Graph" },
    },
    {
        id: "minimal",
        name: "Minimal",
        description: "Star rating only: no card body content, no top-right content, no map tag capsule.",
        settings: { contentBar: "None", srText: "ReworkSR", diffText: "None", showModeTagCapsule: false },
    },
];

// Every schema key a preset snapshot covers, mapped to its apply function.
// Keep in sync with applySettingsFrom() in settings.js.
const PRESET_APPLIERS = {
    contentBar: applyContentBarSetting,
    srText: applySrTextSetting,
    diffText: applyDiffTextSetting,
    debugUseAmount: applyDebugUseAmountSetting,
    estimatorAlgorithm: applyEstimatorAlgorithmSetting,
    azusaSunnyReferenceHo: applyAzusaSunnyReferenceHoSetting,
    etternaVersion: applyEtternaVersionSetting,
    companellaEtternaVersion: applyCompanellaEtternaVersionSetting,
    enablePauseDetection: applyPauseDetectionSetting,
    pauseDetectionThreshold: applyPauseDetectionThresholdSetting,
    enableEtternaRainbowBars: applyEnableEtternaRainbowBarsSetting,
    enableStatusMarquee: applyEnableStatusMarqueeSetting,
    VibroDetection: applyVibroDetectionSetting,
    showModeTagCapsule: applyShowModeTagCapsuleSetting,
    enableNumericDifficulty: applyEnableNumericDifficultySetting,
    cardVisibility: applyCardVisibilitySetting,
    cardOpacity: applyCardOpacitySetting,
    cardRadius: applyCardRadiusSetting,
    cardBgBlur: applyCardBgBlurSetting,
    enableUpdateCheck: applyEnableUpdateCheckSetting,
    enableResultCache: applyEnableResultCacheSetting,
    reverseCardExtendDirection: applyReverseCardExtendDirectionSetting,
    useOsuFont: applyUseOsuFontSetting,
    enableOsuTheme: applyEnableOsuThemeSetting,
    enableFloatingTriangles: applyEnableFloatingTrianglesSetting,
    enableCoverArt: applyEnableCoverArtSetting,
    customBackgroundColor: applyCustomBackgroundColorSetting,
    useSvDetection: applyUseSvDetectionSetting,
    forceSunnyWindow: applyForceSunnyWindowSetting,
    enableLNDifficulty: applyEnableLNDifficultySetting,
    enableAnalyzeLN: applyEnableAnalyzeLNSetting,
    enableAlwaysShowLNDifficulty: applyEnableAlwaysShowLNDifficultySetting,
    display6kLevel: applyDisplay6kLevelSetting,
    extendedEstimationRange: applyExtendedEstimationRangeSetting,
    wsEndpoint: applyWsEndpointSetting,
};

// The same keys mapped to a getter that reads the CURRENT user value from state.
const PRESET_STATE_GETTERS = {
    contentBar: () => state.userContentBar,
    srText: () => state.userSrText,
    diffText: () => state.userDiffText,
    debugUseAmount: () => state.debugUseAmount,
    estimatorAlgorithm: () => state.estimatorAlgorithm,
    azusaSunnyReferenceHo: () => state.azusaSunnyReferenceHo,
    etternaVersion: () => state.etternaVersion,
    companellaEtternaVersion: () => state.companellaEtternaVersion,
    enablePauseDetection: () => state.pauseDetectionEnabled,
    pauseDetectionThreshold: () => String(state.pauseDetectionThresholdMs),
    enableEtternaRainbowBars: () => state.enableEtternaRainbowBars,
    enableStatusMarquee: () => state.enableStatusMarquee,
    VibroDetection: () => state.vibroDetection,
    showModeTagCapsule: () => state.showModeTagCapsule,
    enableNumericDifficulty: () => state.enableNumericDifficulty,
    cardVisibility: () => state.cardVisibility,
    cardOpacity: () => state.cardOpacity,
    cardRadius: () => state.cardRadius,
    cardBgBlur: () => state.cardBgBlur,
    enableUpdateCheck: () => state.enableUpdateCheck,
    enableResultCache: () => state.enableResultCache,
    reverseCardExtendDirection: () => state.reverseCardExtendDirection,
    useOsuFont: () => state.useOsuFont,
    enableOsuTheme: () => state.enableOsuTheme,
    enableFloatingTriangles: () => state.enableFloatingTriangles,
    enableCoverArt: () => state.enableCoverArt,
    customBackgroundColor: () => state.customBackgroundColor,
    useSvDetection: () => state.useSvDetection,
    forceSunnyWindow: () => state.forceSunnyWindow,
    enableLNDifficulty: () => state.enableLNDifficulty,
    enableAnalyzeLN: () => state.enableAnalyzeLN,
    enableAlwaysShowLNDifficulty: () => state.enableAlwaysShowLNDifficulty,
    display6kLevel: () => state.display6kLevel,
    extendedEstimationRange: () => state.extendedEstimationRange,
    wsEndpoint: () => state.wsEndpoint,
};

// Keep in sync with the recomputeNeeded key set in settings.js.
const RECOMPUTE_KEYS = new Set([
    "contentBar", "srText", "debugUseAmount", "diffText",
    "estimatorAlgorithm", "azusaSunnyReferenceHo", "etternaVersion",
    "companellaEtternaVersion", "enablePauseDetection", "pauseDetectionThreshold",
    "enableEtternaRainbowBars", "vibroDetection", "showModeTagCapsule",
    "useSvDetection", "forceSunnyWindow", "enableLNDifficulty",
    "enableAnalyzeLN", "enableAlwaysShowLNDifficulty", "display6kLevel",
    "extendedEstimationRange",
]);

// Keep in sync with the result-cache invalidation key set in settings.js.
const CACHE_KEYS = new Set([
    "estimatorAlgorithm", "azusaSunnyReferenceHo", "etternaVersion",
    "companellaEtternaVersion", "debugUseAmount", "useSvDetection",
    "vibroDetection", "wsEndpoint", "forceSunnyWindow", "enableLNDifficulty",
    "enableAnalyzeLN", "enableAlwaysShowLNDifficulty", "display6kLevel",
    "extendedEstimationRange",
]);

let customPresets = [];
let currentPreset = "Default";
let lastValues = null;
let initialized = false;
let managerRootEl = null;
let managerBodyEl = null;
let managerSaveInputEl = null;
let managerHintEl = null;

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

function readStorageValue(key) {
    try {
        return window.localStorage.getItem(key);
    } catch {
        return null;
    }
}

function writeStorageValue(key, value) {
    try {
        window.localStorage.setItem(key, value);
    } catch {
        // Ignore storage failures and keep the runtime working.
    }
}

function loadCustomPresets() {
    try {
        const raw = readStorageValue(CUSTOM_PRESETS_KEY);
        if (!raw) {
            return [];
        }
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            return [];
        }
        return parsed.filter(
            (preset) => preset
                && typeof preset.id === "string"
                && typeof preset.name === "string"
                && preset.name.trim().length > 0
                && preset.settings && typeof preset.settings === "object",
        );
    } catch {
        return [];
    }
}

function persistCustomPresets() {
    writeStorageValue(CUSTOM_PRESETS_KEY, JSON.stringify(customPresets));
}

function persistActivePreset() {
    writeStorageValue(ACTIVE_PRESET_KEY, currentPreset);
}

function loadActivePreset() {
    try {
        const raw = readStorageValue(ACTIVE_PRESET_KEY);
        if (typeof raw === "string" && raw.trim()) {
            return raw.trim();
        }
    } catch {
        // ignore
    }
    return "Default";
}

// ---------------------------------------------------------------------------
// Snapshot helpers
// ---------------------------------------------------------------------------

function buildDefaultSnapshot() {
    const defaults = APP_CONFIG.defaults;
    return {
        contentBar: defaults.contentBar,
        srText: defaults.srText,
        diffText: defaults.diffText,
        debugUseAmount: defaults.debugUseAmount,
        estimatorAlgorithm: defaults.estimatorAlgorithm,
        azusaSunnyReferenceHo: defaults.azusaSunnyReferenceHo,
        etternaVersion: defaults.etternaVersion,
        companellaEtternaVersion: defaults.companellaEtternaVersion,
        enablePauseDetection: defaults.pauseDetectionEnabled,
        pauseDetectionThreshold: String(defaults.pauseDetectionThresholdMs),
        enableEtternaRainbowBars: defaults.enableEtternaRainbowBars,
        enableStatusMarquee: defaults.enableStatusMarquee,
        VibroDetection: defaults.vibroDetection,
        showModeTagCapsule: defaults.showModeTagCapsule,
        enableNumericDifficulty: defaults.enableNumericDifficulty,
        cardVisibility: defaults.cardVisibility,
        cardOpacity: defaults.cardOpacity,
        cardRadius: defaults.cardRadius,
        cardBgBlur: defaults.cardBgBlur,
        enableUpdateCheck: defaults.enableUpdateCheck,
        enableResultCache: defaults.enableResultCache,
        reverseCardExtendDirection: defaults.reverseCardExtendDirection,
        useOsuFont: defaults.useOsuFont,
        enableOsuTheme: defaults.enableOsuTheme,
        enableFloatingTriangles: defaults.enableFloatingTriangles,
        enableCoverArt: defaults.enableCoverArt,
        customBackgroundColor: defaults.customBackgroundColor,
        useSvDetection: defaults.useSvDetection,
        forceSunnyWindow: defaults.forceSunnyWindow,
        enableLNDifficulty: defaults.enableLNDifficulty,
        enableAnalyzeLN: defaults.enableAnalyzeLN,
        enableAlwaysShowLNDifficulty: defaults.enableAlwaysShowLNDifficulty,
        display6kLevel: defaults.display6kLevel,
        extendedEstimationRange: defaults.extendedEstimationRange,
        // wsEndpoint is intentionally NOT part of built-in preset snapshots:
        // it is a connection parameter (e.g. a LAN address for other devices),
        // so applying a preset must never drop or change the socket connection.
        // Custom presets still capture it via PRESET_STATE_GETTERS.
    };
}

function resolveSnapshot(preset) {
    // Built-in presets are "defaults + overrides"; custom presets already hold
    // a full snapshot. Merging over defaults covers both (and heals missing
    // keys from older custom presets).
    return { ...buildDefaultSnapshot(), ...preset.settings };
}

function applySnapshot(snapshot) {
    let anyChanged = false;
    let recomputeNeeded = false;
    let cacheNeeded = false;

    for (const [key, value] of Object.entries(snapshot)) {
        const applier = PRESET_APPLIERS[key];
        if (!applier) {
            continue;
        }
        const changed = applier(value);
        if (changed) {
            anyChanged = true;
            if (RECOMPUTE_KEYS.has(key)) {
                recomputeNeeded = true;
            }
            if (CACHE_KEYS.has(key)) {
                cacheNeeded = true;
            }
        }
    }

    if (cacheNeeded) {
        clearResultCache();
    }
    if (recomputeNeeded) {
        scheduleRecompute("preset applied", true);
    }

    return anyChanged;
}

function writeBackToTosu(presetName, snapshot) {
    const folderName = typeof window.COUNTER_PATH === "string"
        ? window.COUNTER_PATH.trim()
        : "";
    if (!folderName) {
        return;
    }

    // Same shape the dashboard POSTs: [{ uniqueID, value }, ...]. Only keys
    // present in the snapshot are sent (tosu merges, never replaces), so
    // built-in presets leave wsEndpoint untouched.
    const values = Object.keys(snapshot).map((key) => ({
        uniqueID: key,
        value: snapshot[key],
    }));
    values.push({ uniqueID: "preset", value: presetName });

    fetch(`/api/counters/settings/${encodeURIComponent(folderName)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
    }).catch(() => {
        // Write-back is a best-effort sync; preset application still worked.
    });
}

/** Captures the currently applied user settings as a full snapshot. */
export function captureCurrentSettings() {
    const snapshot = {};
    for (const key of Object.keys(PRESET_STATE_GETTERS)) {
        snapshot[key] = PRESET_STATE_GETTERS[key]();
    }
    return snapshot;
}

// ---------------------------------------------------------------------------
// Preset lookup / application
// ---------------------------------------------------------------------------

function findBuiltinPresetByName(name) {
    return PRESET_DEFS.find((preset) => preset.name === name) || null;
}

function findPresetByName(name) {
    return findBuiltinPresetByName(name)
        || customPresets.find((preset) => preset.name === name)
        || null;
}

/**
 * Applies a preset by name (built-in or user-defined) and syncs the resulting
 * configuration back to tosu. Unknown names are lazily materialized ONLY for
 * the default "Custom N" slots; any other unknown name is a no-op.
 *
 * @returns {boolean} true when a preset was applied.
 */
export function applyPresetByName(name) {
    let preset = findPresetByName(name);
    if (!preset && DEFAULT_SLOT_NAMES.includes(name)) {
        createCustomPreset(name, captureCurrentSettings());
        preset = findPresetByName(name);
    }
    if (!preset) {
        return false;
    }

    const snapshot = resolveSnapshot(preset);
    applySnapshot(snapshot);
    currentPreset = name;
    persistActivePreset();
    writeBackToTosu(name, snapshot);
    // Mirror the write-back into lastValues so the echo broadcast of the same
    // values is not mistaken for a manual settings change (no auto-save loop).
    // Spread the previous lastValues first so keys absent from built-in
    // snapshots (e.g. wsEndpoint) keep their last known value.
    lastValues = { ...lastValues, ...snapshot, preset: name };
    renderPresetManager();
    return true;
}

/** Returns the name of the currently active preset ("Default" when none). */
export function getActivePreset() {
    return currentPreset;
}

/**
 * Auto-save the current configuration after a dashboard settings change:
 *  - if a custom preset is anchored (currentPreset names one), update it and
 *    keep the anchor;
 *  - otherwise follow changes in the fixed "Auto" container and move the
 *    dashboard preset picker to "Auto".
 * Both paths sync the snapshot (plus the preset picker value) back to tosu.
 */
export function autoSaveCurrentPreset() {
    const snapshot = captureCurrentSettings();

    const anchored = customPresets.find((preset) => preset.name === currentPreset);
    if (anchored) {
        anchored.settings = snapshot;
        anchored.updatedAt = Date.now();
        persistCustomPresets();
        renderPresetManager();
        writeBackToTosu(anchored.name, snapshot);
        lastValues = { ...lastValues, ...snapshot, preset: anchored.name };
        return;
    }

    const auto = customPresets.find((preset) => preset.name === AUTO_SAVE_PRESET_NAME);
    if (auto) {
        auto.settings = snapshot;
        auto.updatedAt = Date.now();
    } else {
        customPresets.push({
            id: `auto-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
            name: AUTO_SAVE_PRESET_NAME,
            settings: snapshot,
            createdAt: Date.now(),
        });
    }
    persistCustomPresets();
    currentPreset = AUTO_SAVE_PRESET_NAME;
    persistActivePreset();
    renderPresetManager();
    writeBackToTosu(AUTO_SAVE_PRESET_NAME, snapshot);
    lastValues = { ...lastValues, ...snapshot, preset: AUTO_SAVE_PRESET_NAME };
}

// ---------------------------------------------------------------------------
// Custom preset CRUD
// ---------------------------------------------------------------------------

/** Creates or updates (same-name overwrite) a user preset from a snapshot. */
export function createCustomPreset(name, snapshot) {
    const cleanName = String(name || "").trim();
    if (!cleanName || cleanName === "Custom" || cleanName === AUTO_SAVE_PRESET_NAME) {
        return null;
    }
    if (findBuiltinPresetByName(cleanName)) {
        return null;
    }

    // Same name => overwrite the existing snapshot (saving is replacing).
    const existing = customPresets.find((preset) => preset.name === cleanName);
    if (existing) {
        existing.settings = snapshot || {};
        existing.updatedAt = Date.now();
        persistCustomPresets();
        renderPresetManager();
        return existing;
    }

    // The "Auto" container does not count towards the user preset cap.
    const userPresetCount = customPresets.filter((preset) => preset.name !== AUTO_SAVE_PRESET_NAME).length;
    if (userPresetCount >= MAX_CUSTOM_PRESETS) {
        return null;
    }

    const preset = {
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        name: cleanName,
        settings: snapshot || {},
        createdAt: Date.now(),
    };
    customPresets.push(preset);
    persistCustomPresets();
    renderPresetManager();
    return preset;
}

/** Renames a user preset by id. Returns true on success. */
export function renameCustomPreset(id, newName) {
    const cleanName = String(newName || "").trim();
    if (!cleanName || cleanName === "Custom" || cleanName === AUTO_SAVE_PRESET_NAME) {
        return false;
    }
    const preset = customPresets.find((item) => item.id === id);
    if (!preset) {
        return false;
    }
    if (findBuiltinPresetByName(cleanName)) {
        return false;
    }
    if (customPresets.some((item) => item.id !== id && item.name === cleanName)) {
        return false;
    }

    preset.name = cleanName;
    persistCustomPresets();
    renderPresetManager();
    return true;
}

/** Deletes a user preset by id. Returns true on success. */
export function deleteCustomPreset(id) {
    const index = customPresets.findIndex((item) => item.id === id);
    if (index === -1) {
        return false;
    }
    customPresets.splice(index, 1);
    persistCustomPresets();
    renderPresetManager();
    return true;
}

/** Ensures the default "Custom 1..N" anchor slots exist. */
function ensureDefaultCustomSlots() {
    const snapshot = captureCurrentSettings();
    for (const name of DEFAULT_SLOT_NAMES) {
        const existing = customPresets.some((preset) => preset.name === name);
        if (!existing && createCustomPreset(name, snapshot) === null) {
            break; // cap reached or name rejected — stop trying the rest
        }
    }
}

// ---------------------------------------------------------------------------
// tosu settings stream (own /websocket/commands connection)
// ---------------------------------------------------------------------------

function extractSettingsPayload(packet) {
    if (Array.isArray(packet)) {
        return packet;
    }
    if (packet && typeof packet === "object" && packet.command === "getSettings") {
        return packet.message;
    }
    return null;
}

function extractPresetValue(payload) {
    if (Array.isArray(payload)) {
        const item = payload.find((entry) => entry?.uniqueID === "preset");
        return typeof item?.value === "string" && item.value.trim() ? item.value.trim() : null;
    }
    if (payload && typeof payload === "object") {
        const value = payload.preset;
        return typeof value === "string" && value.trim() ? value.trim() : null;
    }
    return null;
}

function snapshotOf(payload) {
    if (Array.isArray(payload)) {
        const out = {};
        for (const entry of payload) {
            if (entry && typeof entry.uniqueID === "string") {
                out[entry.uniqueID] = entry.value;
            }
        }
        return out;
    }
    return { ...(payload || {}) };
}

function hasKeyChanged(prev, next, key) {
    return Object.prototype.hasOwnProperty.call(next, key)
        && next[key] !== prev[key];
}

/**
 * Settings stream handler:
 *  - first batch: record baseline, restore/apply the stored preset picker;
 *  - preset picker change: apply (or mark Auto);
 *  - any other settings change: auto-save into the anchored custom preset or
 *    the Auto container (write-back echoes the same values -> no loop).
 */
function handleSettingsPacket(packet) {
    const payload = extractSettingsPayload(packet);
    if (!payload) {
        return;
    }

    const presetValue = extractPresetValue(payload);

    if (lastValues === null) {
        lastValues = snapshotOf(payload);
        if (presetValue && presetValue !== currentPreset) {
            if (presetValue === "Default" || !applyPresetByName(presetValue)) {
                // "Custom" (or any unresolvable value) means "no preset": the
                // current manual configuration stays, anchored to nothing.
                currentPreset = "Default";
                persistActivePreset();
                renderPresetManager();
            }
        }
        return;
    }

    const prev = lastValues;
    lastValues = snapshotOf(payload);

    if (presetValue && presetValue !== currentPreset) {
        if (presetValue === AUTO_SAVE_PRESET_NAME) {
            currentPreset = AUTO_SAVE_PRESET_NAME;
            persistActivePreset();
            renderPresetManager();
            return;
        }
        if (!applyPresetByName(presetValue)) {
            currentPreset = "Default";
            persistActivePreset();
            renderPresetManager();
        }
        return;
    }

    let anyChange = false;
    for (const key of Object.keys(PRESET_APPLIERS)) {
        if (hasKeyChanged(prev, lastValues, key)) {
            anyChange = true;
            break;
        }
    }
    if (anyChange) {
        autoSaveCurrentPreset();
    }
}

// ---------------------------------------------------------------------------
// Manager UI (created dynamically; visible only with ?edit=1)
// ---------------------------------------------------------------------------

function isEditMode() {
    try {
        return new URLSearchParams(window.location.search).has("edit");
    } catch {
        return false;
    }
}

function injectStylesheet() {
    if (document.getElementById("preset-manager-style")) {
        return;
    }
    const link = document.createElement("link");
    link.id = "preset-manager-style";
    link.rel = "stylesheet";
    link.href = "./styles/presets.css";
    document.head.appendChild(link);
}

function ensureManagerDom() {
    if (managerRootEl) {
        return;
    }

    injectStylesheet();

    const root = document.createElement("aside");
    root.id = "preset-manager";
    root.className = "preset-manager";
    root.hidden = true;

    const header = document.createElement("div");
    header.className = "preset-manager-header";
    const title = document.createElement("span");
    title.className = "preset-manager-title";
    title.textContent = "Presets";
    const closeBtn = document.createElement("button");
    closeBtn.id = "preset-manager-close";
    closeBtn.className = "preset-manager-close";
    closeBtn.type = "button";
    closeBtn.title = "Hide preset manager";
    closeBtn.setAttribute("aria-label", "Hide preset manager");
    closeBtn.textContent = "\u00d7";
    header.appendChild(title);
    header.appendChild(closeBtn);

    const body = document.createElement("div");
    body.id = "preset-manager-body";
    body.className = "preset-manager-body";

    const hint = document.createElement("p");
    hint.id = "preset-manager-hint";
    hint.className = "preset-manager-hint";

    const saveRow = document.createElement("div");
    saveRow.className = "preset-manager-save";
    const saveInput = document.createElement("input");
    saveInput.id = "preset-save-name";
    saveInput.className = "preset-save-name";
    saveInput.type = "text";
    saveInput.placeholder = "New preset name...";
    saveInput.maxLength = 40;
    const saveBtn = document.createElement("button");
    saveBtn.id = "preset-save-btn";
    saveBtn.className = "preset-btn preset-save-btn";
    saveBtn.type = "button";
    saveBtn.textContent = "Save current";
    saveRow.appendChild(saveInput);
    saveRow.appendChild(saveBtn);

    root.appendChild(header);
    root.appendChild(body);
    root.appendChild(hint);
    root.appendChild(saveRow);
    document.body.appendChild(root);

    managerRootEl = root;
    managerBodyEl = body;
    managerSaveInputEl = saveInput;
    managerHintEl = hint;

    closeBtn.addEventListener("click", () => {
        root.hidden = true;
    });

    const saveCurrent = () => {
        const cleanName = String(managerSaveInputEl.value || "").trim();
        const existed = customPresets.some((preset) => preset.name === cleanName);
        const preset = createCustomPreset(cleanName, captureCurrentSettings());
        if (!preset) {
            if (cleanName && cleanName !== "Custom" && cleanName !== AUTO_SAVE_PRESET_NAME
                && !findBuiltinPresetByName(cleanName)
                && customPresets.filter((item) => item.name !== AUTO_SAVE_PRESET_NAME).length >= MAX_CUSTOM_PRESETS) {
                showManagerHint(`Preset limit reached (${MAX_CUSTOM_PRESETS}). Delete one first.`, true);
            } else {
                showManagerHint("Invalid preset name.", true);
            }
            return;
        }
        managerSaveInputEl.value = "";
        showManagerHint(
            existed ? `Preset "${preset.name}" updated.` : `Preset "${preset.name}" saved.`,
            false,
        );
    };
    saveBtn.addEventListener("click", saveCurrent);
    saveInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            saveCurrent();
        }
    });

    root.addEventListener("click", handleManagerClick);
}

function showManagerHint(message, isError) {
    if (!managerHintEl) {
        return;
    }
    managerHintEl.textContent = message;
    managerHintEl.classList.toggle("error", Boolean(isError));
}

function buildPresetRow(preset, { isSystem, active, actions = isSystem ? "apply" : "all" }) {
    const row = document.createElement("div");
    row.className = `preset-item${active ? " active" : ""}`;
    row.dataset.presetName = preset.name;

    const info = document.createElement("div");
    info.className = "preset-item-info";

    const nameEl = document.createElement("div");
    nameEl.className = "preset-item-name";
    nameEl.textContent = preset.name;
    if (isSystem) {
        const badge = document.createElement("span");
        badge.className = "preset-item-badge";
        badge.textContent = "System";
        nameEl.appendChild(badge);
    }

    const descEl = document.createElement("div");
    descEl.className = "preset-item-desc";
    descEl.textContent = preset.description || "";
    info.appendChild(nameEl);
    info.appendChild(descEl);

    if (actions !== "none") {
        const actionsEl = document.createElement("div");
        actionsEl.className = "preset-item-actions";

        const applyBtn = document.createElement("button");
        applyBtn.type = "button";
        applyBtn.className = "preset-btn preset-btn-apply";
        applyBtn.textContent = "Apply";
        applyBtn.dataset.action = "apply";
        actionsEl.appendChild(applyBtn);

        if (actions === "all") {
            const renameBtn = document.createElement("button");
            renameBtn.type = "button";
            renameBtn.className = "preset-btn";
            renameBtn.textContent = "Rename";
            renameBtn.dataset.action = "rename";
            actionsEl.appendChild(renameBtn);

            const deleteBtn = document.createElement("button");
            deleteBtn.type = "button";
            deleteBtn.className = "preset-btn preset-btn-danger";
            deleteBtn.textContent = "Delete";
            deleteBtn.dataset.action = "delete";
            actionsEl.appendChild(deleteBtn);
        }

        row.appendChild(actionsEl);
    }

    row.appendChild(info);
    return row;
}

function renderPresetManager() {
    if (!managerBodyEl) {
        return;
    }

    managerBodyEl.textContent = "";

    const activeName = currentPreset;

    // System presets.
    const systemSection = document.createElement("div");
    systemSection.className = "preset-section";
    systemSection.textContent = "System";
    managerBodyEl.appendChild(systemSection);

    for (const preset of PRESET_DEFS) {
        managerBodyEl.appendChild(buildPresetRow(preset, {
            isSystem: true,
            active: activeName === preset.name,
        }));
    }

    // User presets.
    const customSection = document.createElement("div");
    customSection.className = "preset-section";
    customSection.textContent = "My Presets";
    managerBodyEl.appendChild(customSection);

    if (customPresets.length === 0) {
        const empty = document.createElement("div");
        empty.className = "preset-empty";
        empty.textContent = "No custom presets yet. Save your current settings below.";
        managerBodyEl.appendChild(empty);
    } else {
        // The system-managed "Auto" container always sits at the bottom of
        // My Presets — user presets keep creation order.
        const userPresets = customPresets.filter((preset) => preset.name !== AUTO_SAVE_PRESET_NAME);
        const autoPreset = customPresets.find((preset) => preset.name === AUTO_SAVE_PRESET_NAME) || null;

        for (const preset of userPresets) {
            managerBodyEl.appendChild(buildPresetRow(preset, {
                isSystem: false,
                active: activeName === preset.name,
            }));
        }
        if (autoPreset) {
            managerBodyEl.appendChild(buildPresetRow(autoPreset, {
                isSystem: false,
                active: activeName === autoPreset.name,
            }));
        }
    }

    // The "Auto" container is shown in My Presets once it exists; until then
    // keep a read-only entry at the very bottom so the picker's Auto option
    // is still visible.
    const autoExists = customPresets.some((preset) => preset.name === AUTO_SAVE_PRESET_NAME);
    if (!autoExists) {
        managerBodyEl.appendChild(buildPresetRow(
            {
                name: AUTO_SAVE_PRESET_NAME,
                description: "Automatically keeps the latest manual configuration after you change settings.",
            },
            { isSystem: true, active: activeName === AUTO_SAVE_PRESET_NAME, actions: "none" },
        ));
    }
}

function startRename(row) {
    const nameEl = row.querySelector(".preset-item-name");
    if (!nameEl) {
        return;
    }
    const presetName = row.dataset.presetName;
    const preset = customPresets.find((item) => item.name === presetName);
    if (!preset) {
        return;
    }

    const input = document.createElement("input");
    input.type = "text";
    input.className = "preset-rename-input";
    input.value = preset.name;
    input.maxLength = 40;

    const info = row.querySelector(".preset-item-info");
    if (!info) {
        return;
    }
    info.replaceChildren(input);

    const actions = row.querySelector(".preset-item-actions");
    if (!actions) {
        return;
    }
    actions.textContent = "";

    const confirmBtn = document.createElement("button");
    confirmBtn.type = "button";
    confirmBtn.className = "preset-btn";
    confirmBtn.textContent = "Save";
    confirmBtn.dataset.action = "rename-confirm";

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "preset-btn";
    cancelBtn.textContent = "Cancel";
    cancelBtn.dataset.action = "rename-cancel";
    actions.appendChild(confirmBtn);
    actions.appendChild(cancelBtn);

    input.focus();
    input.select();
}

function finishRename(row) {
    const input = row.querySelector(".preset-rename-input");
    if (!input) {
        return;
    }
    const presetName = row.dataset.presetName;
    const preset = customPresets.find((item) => item.name === presetName);
    if (!preset) {
        return;
    }
    if (!renameCustomPreset(preset.id, input.value)) {
        showManagerHint("Invalid or duplicate name.", true);
        renderPresetManager();
        return;
    }
    showManagerHint("", false);
}

function handleManagerClick(event) {
    const actionBtn = event.target.closest("[data-action]");
    if (!actionBtn) {
        return;
    }
    const row = actionBtn.closest(".preset-item");
    if (!row) {
        return;
    }

    switch (actionBtn.dataset.action) {
        case "apply": {
            const name = row.dataset.presetName;
            if (name === AUTO_SAVE_PRESET_NAME) {
                // No-op: Auto is a follow-mode marker, not an applicable snapshot.
                showManagerHint("Auto keeps following your manual changes.", false);
                return;
            }
            if (applyPresetByName(name)) {
                showManagerHint(`Preset "${name}" applied and synced to tosu.`, false);
            } else {
                showManagerHint(`Preset "${name}" not found.`, true);
            }
            break;
        }
        case "rename":
            startRename(row);
            break;
        case "rename-confirm":
            finishRename(row);
            break;
        case "rename-cancel":
            renderPresetManager();
            break;
        case "delete": {
            const name = row.dataset.presetName;
            const preset = customPresets.find((item) => item.name === name);
            if (!preset) {
                return;
            }
            if (window.confirm(`Delete preset "${preset.name}"?`)) {
                deleteCustomPreset(preset.id);
                showManagerHint("Preset deleted.", false);
            }
            break;
        }
        default:
            break;
    }
}

// ---------------------------------------------------------------------------
// Init (self-contained — no main.js wiring needed)
// ---------------------------------------------------------------------------

function initPresets() {
    if (initialized) {
        return;
    }
    initialized = true;

    customPresets = loadCustomPresets();
    currentPreset = loadActivePreset();
    ensureDefaultCustomSlots();

    // Observe the tosu settings stream on our own commands connection.
    socket.commands(handleSettingsPacket);

    if (isEditMode()) {
        ensureManagerDom();
        if (managerRootEl) {
            managerRootEl.hidden = false;
            renderPresetManager();
        }
    }
}

initPresets();
