import { APP_CONFIG, state } from "./appContext.js";
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
// Auto-saved preset name: a system-managed container that follows manual
// settings changes when no custom preset is anchored. It is NOT an applicable
// snapshot — selecting "Auto" in the preset picker only marks "keep following
// my manual changes". Reserved name: users cannot create presets named "Auto".
export const AUTO_SAVE_PRESET_NAME = "Auto";
// Default anchor slots, created automatically on first load so users can pick
// them in the dashboard dropdown right away. They behave like any other
// custom preset (rename/delete allowed); re-creation is skipped once present.
const DEFAULT_SLOT_NAMES = ["Custom 1", "Custom 2", "Custom 3"];
// Defensive cap for distinct custom presets (the "Auto" container does not
// count towards it). Saving always overwrites an existing preset of the same
// name, so this is only reachable when creating many differently named presets.
const MAX_CUSTOM_PRESETS = 5;

// Every schema key that a preset snapshot covers, mapped to its apply function.
// Keep this list in sync with applySettingsFrom() in settings.js.
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
// Values are captured in the exact format tosu stores (string options stay
// strings; pauseDetectionThreshold is a number in state but a string in tosu).
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
let managerRootEl = null;
let managerBodyEl = null;
let managerSaveInputEl = null;
let managerHintEl = null;

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

function findBuiltinPresetByName(name) {
    return (APP_CONFIG.presets || []).find((preset) => preset.name === name) || null;
}

function findPresetByName(name) {
    return findBuiltinPresetByName(name)
        || customPresets.find((preset) => preset.name === name)
        || null;
}

function resolveSnapshot(preset) {
    // Built-in presets are "defaults + overrides"; custom presets already hold
    // a full snapshot. Merging over defaults covers both (and heals missing keys
    // from older custom presets).
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
    // built-in presets leave wsEndpoint untouched. Headers and buttons are
    // intentionally omitted.
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

/**
 * Applies a preset by name (built-in or user-defined) and syncs the resulting
 * configuration back to tosu. "Custom" or an unknown name is a no-op that
 * simply marks the current manual configuration as active.
 *
 * @returns {boolean} true when a known preset was applied.
 */
export function applyPresetByName(name) {
    const preset = findPresetByName(name);
    if (!preset) {
        return false;
    }

    const snapshot = resolveSnapshot(preset);
    applySnapshot(snapshot);
    writeBackToTosu(name, snapshot);
    renderPresetManager();
    return true;
}

/** Captures the currently applied user settings as a full snapshot. */
export function captureCurrentSettings() {
    const snapshot = {};
    for (const key of Object.keys(PRESET_STATE_GETTERS)) {
        snapshot[key] = PRESET_STATE_GETTERS[key]();
    }
    return snapshot;
}

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

/**
 * Auto-save the current configuration after a dashboard settings change:
 *  - if a custom preset is anchored (state.preset names one), update it and
 *    keep the anchor;
 *  - otherwise follow changes in the fixed "Auto" container and move the
 *    dashboard preset picker to "Auto".
 * Both paths sync the snapshot (plus the preset picker value) back to tosu.
 */
export function autoSaveCurrentPreset() {
    const snapshot = captureCurrentSettings();

    const anchored = customPresets.find((preset) => preset.name === state.preset);
    if (anchored) {
        anchored.settings = snapshot;
        anchored.updatedAt = Date.now();
        persistCustomPresets();
        renderPresetManager();
        writeBackToTosu(anchored.name, snapshot);
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
    renderPresetManager();
    writeBackToTosu(AUTO_SAVE_PRESET_NAME, snapshot);
}

/** Renames a user preset by id. Returns true on success. */
export function renameCustomPreset(id, newName) {
    const cleanName = String(newName || "").trim();
    if (!cleanName || cleanName === "Custom") {
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

// ---------------------------------------------------------------------------
// Preset manager UI (visible only when the page is opened with ?edit=1)
// ---------------------------------------------------------------------------

function isEditMode() {
    try {
        return new URLSearchParams(window.location.search).has("edit");
    } catch {
        return false;
    }
}

function ensureManagerDom() {
    if (managerRootEl) {
        return;
    }
    managerRootEl = document.getElementById("preset-manager");
    if (!managerRootEl) {
        return;
    }
    managerBodyEl = document.getElementById("preset-manager-body");
    managerSaveInputEl = document.getElementById("preset-save-name");
    managerHintEl = document.getElementById("preset-manager-hint");

    const closeBtn = document.getElementById("preset-manager-close");
    if (closeBtn) {
        closeBtn.addEventListener("click", () => {
            managerRootEl.hidden = true;
        });
    }

    const saveBtn = document.getElementById("preset-save-btn");
    if (saveBtn && managerSaveInputEl) {
        const saveCurrent = () => {
            const cleanName = String(managerSaveInputEl.value || "").trim();
            const existed = customPresets.some((preset) => preset.name === cleanName);
            const preset = createCustomPreset(cleanName, captureCurrentSettings());
            if (!preset) {
                if (cleanName && cleanName !== "Custom" && !findBuiltinPresetByName(cleanName)
                    && customPresets.length >= MAX_CUSTOM_PRESETS) {
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
        managerSaveInputEl.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                saveCurrent();
            }
        });
    }
}

function showManagerHint(message, isError) {
    if (!managerHintEl) {
        return;
    }
    managerHintEl.textContent = message;
    managerHintEl.classList.toggle("error", Boolean(isError));
}

function clearManagerHint() {
    if (managerHintEl) {
        managerHintEl.textContent = "";
    }
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

    const activeName = state.preset;

    // System presets.
    const systemSection = document.createElement("div");
    systemSection.className = "preset-section";
    systemSection.textContent = "System";
    managerBodyEl.appendChild(systemSection);

    for (const preset of APP_CONFIG.presets || []) {
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
        // My Presets, above nothing — user presets keep creation order.
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
    clearManagerHint();
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
            if (name === "Custom") {
                // Persist the current manual configuration and clear the preset
                // selection in tosu so the dashboard dropdown shows Custom.
                writeBackToTosu("Custom", captureCurrentSettings());
                showManagerHint("Custom configuration kept.", false);
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

/**
 * Ensures the default "Custom 1..N" anchor slots exist (snapshot = current
 * configuration). Skipped for names already present; silently respects the
 * user preset cap so existing manual presets are never disturbed.
 */
function ensureDefaultCustomSlots() {
    const snapshot = captureCurrentSettings();
    for (const name of DEFAULT_SLOT_NAMES) {
        const existing = customPresets.some((preset) => preset.name === name);
        if (!existing && createCustomPreset(name, snapshot) === null) {
            break; // cap reached or name rejected — stop trying the rest
        }
    }
}

/**
 * Applies a preset by name, lazily materializing ONLY the default "Custom N"
 * slots picked in the dashboard dropdown. Any other unknown name (e.g. a
 * stale broadcast referencing a deleted preset) is NOT re-created — it falls
 * through to applyPresetByName, which reports false for unknown names.
 *
 * @returns {boolean} true when a preset was applied.
 */
export function ensureAndApplyPresetByName(name) {
    if (!findPresetByName(name) && DEFAULT_SLOT_NAMES.includes(name)) {
        createCustomPreset(name, captureCurrentSettings());
    }
    return applyPresetByName(name);
}

/**
 * Initializes the preset module. Always loads custom presets and ensures the
 * default slots; the manager UI is rendered only when the page is opened with
 * ?edit=1.
 */
export function initPresets() {
    customPresets = loadCustomPresets();
    ensureDefaultCustomSlots();
    if (!isEditMode()) {
        return;
    }
    ensureManagerDom();
    if (!managerRootEl) {
        return;
    }
    managerRootEl.hidden = false;
    managerRootEl.addEventListener("click", handleManagerClick);
    renderPresetManager();
}
