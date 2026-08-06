import WebSocketManager from "./socket.js";
import { DISPLAY_SKILLSET_ORDER } from "../ett/index.js";
import { APP_CONFIG } from "../../config.js";
import { createSettingsParsers } from "../parser/settingsParser.js";

export { APP_CONFIG };

export const ENDPOINT = APP_CONFIG.endpoint;
export const SOCKET_HOST = APP_CONFIG.socketHost;

export function getSocketHost() {
    const host = typeof state.wsEndpoint === "string" ? state.wsEndpoint.trim() : "";
    return host || SOCKET_HOST;
}

export function getEndpoint() {
    return `http://${getSocketHost()}/files/beatmap/file`;
}

export const STAR_BG_STOPS = APP_CONFIG.starStops.background;
export const STAR_TEXT_STOPS = APP_CONFIG.starStops.text;

// appContext is imported by estimator/rework modules that also run inside the
// compute Worker, where `document` does not exist. Guard every top-level DOM
// lookup so importing this module can never crash a worker.
const hasDocument = typeof document !== "undefined";
const queryId = (id) => (hasDocument ? document.getElementById(id) : null);
const querySel = (selector) => (hasDocument ? document.querySelector(selector) : null);

export const statusEl = queryId("status");
export const reworkStarEl = queryId("rework-star");
export const reworkDiffEl = queryId("rework-diff");
export const reworkRightCapsuleEl = queryId("rework-right-capsule");
export const reworkMetaEl = queryId("rework-meta");
export const reworkBlockEl = queryId("rework");
export const diffGraphWrapEl = queryId("rework-diff-graph-wrap");
export const diffGraphSvgEl = queryId("rework-diff-graph");
export const diffGraphFillEl = queryId("rework-diff-graph-fill");
export const diffGraphFillPlayEl = queryId("rework-diff-graph-fill-play");
export const diffGraphPlayClipRectEl = queryId("rework-diff-graph-play-clip-rect");
export const diffGraphLineEl = queryId("rework-diff-graph-line");
export const diffGraphCursorEl = queryId("rework-diff-graph-cursor");
export const diffGraphCursorDotEl = queryId("rework-diff-graph-cursor-dot");
export const diffGraphPauseMarkersEl = queryId("rework-diff-graph-pause-markers");
export const diffGraphErrorEl = queryId("rework-diff-graph-error");
export const bodyGraphWrapEl = queryId("body-graph-wrap");
export const bodyGraphSvgEl = queryId("body-graph");
export const bodyGraphFillEl = queryId("body-graph-fill");
export const bodyGraphFillPlayEl = queryId("body-graph-fill-play");
export const bodyGraphPlayClipRectEl = queryId("body-graph-play-clip-rect");
export const bodyGraphLineEl = queryId("body-graph-line");
export const bodyGraphCursorEl = queryId("body-graph-cursor");
export const bodyGraphCursorDotEl = queryId("body-graph-cursor-dot");
export const bodyGraphPauseMarkersEl = queryId("body-graph-pause-markers");
export const bodyGraphErrorEl = queryId("body-graph-error");
export const estDiffCaptionEl = queryId("est-diff-caption");
export const patternClustersEl = queryId("pattern-clusters");
export const ettSkillBarsEl = queryId("ett-skill-bars");
export const pauseCountEl = queryId("pause-count");
export const overlayEl = queryId("card-overlay");
export const overlaySpinnerEl = queryId("overlay-spinner");
export const overlayTitleEl = queryId("overlay-title");
export const overlayMessageEl = queryId("overlay-message");
export const mainCardEl = querySel(".main-card");
export const dashboardEl = querySel(".dashboard");
export const titleIconEl = querySel(".title-icon");
export const modeTagSubGroupEl = queryId("mode-tag-subgroup");
export const svTagEl = queryId("sv-tag");
export const starTipEl = queryId("star-tip");

export const state = {
    lastBeatmapKey: "",
    lastBeatmapIdentity: "",
    lastBeatmapIdentitySource: "",
    lastSongKey: "",
    pendingChangeKind: "",
    activeChangeKind: "",
    client: "",
    speedRate: 1.0,
    odFlag: null,
    cvtFlag: null,
    modSignature: "",
    contentBar: APP_CONFIG.defaults.contentBar,
    effectiveContentBar: null,
    preset: APP_CONFIG.defaults.preset,
    srText: APP_CONFIG.defaults.srText,
    userContentBar: APP_CONFIG.defaults.contentBar,
    userSrText: APP_CONFIG.defaults.srText,
    userDiffText: APP_CONFIG.defaults.diffText,
    debugUseAmount: APP_CONFIG.defaults.debugUseAmount,
    useSvDetection: APP_CONFIG.defaults.useSvDetection,
    display6kLevel: APP_CONFIG.defaults.display6kLevel,
    sunnySR: null,
    extendedEstimationRange: APP_CONFIG.defaults.extendedEstimationRange,
    diffText: APP_CONFIG.defaults.diffText,
    estimatorAlgorithm: APP_CONFIG.defaults.estimatorAlgorithm,
    actualEstimatorAlgorithm: APP_CONFIG.defaults.estimatorAlgorithm,
    azusaSunnyReferenceHo: APP_CONFIG.defaults.azusaSunnyReferenceHo,
    etternaVersion: APP_CONFIG.defaults.etternaVersion,
    companellaEtternaVersion: APP_CONFIG.defaults.companellaEtternaVersion,
    pauseDetectionEnabled: APP_CONFIG.defaults.pauseDetectionEnabled,
    pauseDetectionThresholdMs: APP_CONFIG.defaults.pauseDetectionThresholdMs,
    enableEtternaRainbowBars: APP_CONFIG.defaults.enableEtternaRainbowBars,
    enableStatusMarquee: APP_CONFIG.defaults.enableStatusMarquee,
    enableNumericDifficulty: APP_CONFIG.defaults.enableNumericDifficulty,
    cardVisibility: APP_CONFIG.defaults.cardVisibility,
    cardOpacity: APP_CONFIG.defaults.cardOpacity,
    cardRadius: APP_CONFIG.defaults.cardRadius,
    cardBgBlur: APP_CONFIG.defaults.cardBgBlur,
    enableUpdateCheck: APP_CONFIG.defaults.enableUpdateCheck,
    enableResultCache: APP_CONFIG.defaults.enableResultCache,
    hasAvailableUpdate: false,
    reverseCardExtendDirection: APP_CONFIG.defaults.reverseCardExtendDirection,
    useOsuFont: APP_CONFIG.defaults.useOsuFont,
    enableOsuTheme: APP_CONFIG.defaults.enableOsuTheme,
    enableFloatingTriangles: APP_CONFIG.defaults.enableFloatingTriangles,
    enableCoverArt: APP_CONFIG.defaults.enableCoverArt,
    customBackgroundColor: APP_CONFIG.defaults.customBackgroundColor,
    vibroDetection: APP_CONFIG.defaults.vibroDetection,
    forceSunnyWindow: APP_CONFIG.defaults.forceSunnyWindow,
    enableLNDifficulty: APP_CONFIG.defaults.enableLNDifficulty,
    enableAnalyzeLN: APP_CONFIG.defaults.enableAnalyzeLN,
    enableAlwaysShowLNDifficulty: APP_CONFIG.defaults.enableAlwaysShowLNDifficulty,
    numericDifficulty: null,
    numericDifficultyHint: null,
    lnStar: 0,
    forceHideNumericDifficulty: false,
    showModeTagCapsule: APP_CONFIG.defaults.showModeTagCapsule,
    showSvTag: false,
    statusText: "",
    statusKind: "loading",
    currentModeTag: "Mix",
    etternaTechnicalHidden: false,
    graphSeries: null,
    pauseMarkerTimes: [],
    pauseCount: 0,
    isPaused: false,
    pauseTimeMs: 0,
    frozenInterpMs: 0,
    pauseFreezeStartRealMs: 0,
    pauseFreezeSongTimeMs: 0,
    hasSongTimeSample: false,
    clientStateName: "",
    isInPlayState: false,
    songTimeMs: 0,
    prevSongTimeMs: 0,
    songTimeReceiveTs: 0,
    prevSongTimeReceiveTs: 0,
    songStartMs: null,
    songEndMs: null,
    graphAnimationStarted: false,
    recalcTimerId: null,
    settingsCommandSubscribed: false,
    settingsRequested: false,
    settingsReceivedFromCommand: false,
    initialSettingsResolver: null,
    analysisRequestSeq: 0,
    wsEndpoint: APP_CONFIG.defaults.wsEndpoint || SOCKET_HOST,
};

export const MODE_TAG_OPTIONS = APP_CONFIG.options.modeTag;
export const ETT_SKILLSET_ORDER = DISPLAY_SKILLSET_ORDER.filter((name) => name !== "Overall");
export const ETT_SKILLSET_ORDER_NO_TECHNICAL = ETT_SKILLSET_ORDER.filter((name) => name !== "Technical");
export const ETT_MAX_SKILL_VALUE = APP_CONFIG.etterna.maxSkillValue;
export const VIBRO_JACKSPEED_RATIO_THRESHOLD = APP_CONFIG.etterna.vibroJackspeedRatioThreshold;

export const GRAPH_VIEWBOX_WIDTH = APP_CONFIG.graph.viewboxWidth;
export const GRAPH_VIEWBOX_HEIGHT = APP_CONFIG.graph.viewboxHeight;
export const GRAPH_PADDING_X = APP_CONFIG.graph.paddingX;
export const GRAPH_PADDING_TOP = APP_CONFIG.graph.paddingTop;
export const GRAPH_PADDING_BOTTOM = APP_CONFIG.graph.paddingBottom;
export const GRAPH_RESAMPLE_INTERVAL_MS = APP_CONFIG.graph.resampleIntervalMs;
export const PAUSE_LINE_COLOR = APP_CONFIG.graph.pauseLineColor;
export const PAUSE_LINE_WIDTH = APP_CONFIG.graph.pauseLineWidth;

export const GRAPH_LOADING_BASELINE_Y = GRAPH_VIEWBOX_HEIGHT - GRAPH_PADDING_BOTTOM;

export const SONG_TIME_JUMP_THRESHOLD_MS = APP_CONFIG.timing.songTimeJumpThresholdMs;
export const NOTE_END_MARGIN_MS = APP_CONFIG.timing.noteEndMarginMs;
export const PAUSE_DETECT_EPSILON_MS = APP_CONFIG.timing.pauseDetectEpsilonMs;
export const PAUSE_DETECTION_THRESHOLD_MS = APP_CONFIG.timing.pauseDetectionThresholdMs;

export const SOCKET_RECALC_LAZY_DELAY_MS = APP_CONFIG.timing.socketRecalcLazyDelayMs;
export const SETTINGS_COMMAND_TIMEOUT_MS = APP_CONFIG.timing.settingsCommandTimeoutMs;

export const socket = new WebSocketManager(getSocketHost());

export const GRAPH_SUPPORTED_KEY_SET = new Set([4, 6, 7]);

const KNOWN_MOD_CODES = APP_CONFIG.mods.knownCodes;
const MOD_BIT_FLAGS = APP_CONFIG.mods.bitFlags;
export const SORTED_KNOWN_MOD_CODES = [...KNOWN_MOD_CODES].sort((a, b) => b.length - a.length);
export const MOD_BIT_FLAG_ENTRIES = Object.entries(MOD_BIT_FLAGS);

export const {
    parseContentBarValue,
    parseSrTextValue,
    parseDebugUseAmountValue,
    parseDiffTextValue,
    parseAutoModeValue,
    parseUseDanielAlgorithmValue,
    parseEstimatorAlgorithmValue,
    parseAzusaSunnyReferenceHoValue,
    parseEtternaVersionValue,
    parseCompanellaEtternaVersionValue,
    parseEnablePauseDetectionValue,
    parseEnableResultCacheValue,
    parsePauseDetectionThresholdValue,
    parseDisableVibroDetectionValue,
    parseVibroDetectionValue,
    parseEnableEtternaRainbowBarsValue,
    parseEnableStatusMarqueeValue,
    parseShowModeTagCapsuleValue,
    parseEnableNumericDifficultyValue,
    parseCardVisibilityValue,
    parseCardOpacityValue,
    parseCardRadiusValue,
    parseCardBgBlurValue,
    parseEnableUpdateCheckValue,
    parseReverseCardExtendDirectionValue,
    parseUseOsuFontValue,
    parseEnableOsuThemeValue,
    parseEnableFloatingTrianglesValue,
    parseEnableCoverArtValue,
    parseCustomBackgroundColorValue,
    parseSvDetectionValue,
    parseDisplay6kLevelValue,
    parseExtendedEstimationRangeValue,
    parseWsEndpointValue,
    parseForceSunnyWindowValue,
    parseEnableLNDifficultyValue,
    parseEnableAnalyzeLNValue,
    parseEnableAlwaysShowLNDifficultyValue,
    parsePresetValue,
} = createSettingsParsers(APP_CONFIG);

export function getActiveContentBar() {
    return state.effectiveContentBar || state.contentBar;
}

export function contentBarShows(section) {
    const active = getActiveContentBar();
    return active === section || active === "Full";
}

export const GRAPH_VIEW_DEFS = [
    {
        key: "header",
        wrapEl: diffGraphWrapEl,
        svgEl: diffGraphSvgEl,
        fillEl: diffGraphFillEl,
        fillPlayEl: diffGraphFillPlayEl,
        playClipRectEl: diffGraphPlayClipRectEl,
        lineEl: diffGraphLineEl,
        cursorEl: diffGraphCursorEl,
        cursorDotEl: diffGraphCursorDotEl,
        pauseMarkersEl: diffGraphPauseMarkersEl,
        errorEl: diffGraphErrorEl,
        isEnabled: () => state.diffText === "Graph",
    },
    {
        key: "body",
        wrapEl: bodyGraphWrapEl,
        svgEl: bodyGraphSvgEl,
        fillEl: bodyGraphFillEl,
        fillPlayEl: bodyGraphFillPlayEl,
        playClipRectEl: bodyGraphPlayClipRectEl,
        lineEl: bodyGraphLineEl,
        cursorEl: bodyGraphCursorEl,
        cursorDotEl: bodyGraphCursorDotEl,
        pauseMarkersEl: bodyGraphPauseMarkersEl,
        errorEl: bodyGraphErrorEl,
        isEnabled: () => contentBarShows("Graph"),
    },
];

export function hasAnyGraphModeEnabled() {
    return state.diffText === "Graph" || contentBarShows("Graph");
}

export function forEachGraphView(callback) {
    for (const view of GRAPH_VIEW_DEFS) {
        callback(view);
    }
}

export function forEachEnabledGraphView(callback) {
    for (const view of GRAPH_VIEW_DEFS) {
        if (view.isEnabled()) {
            callback(view);
        }
    }
}

export function isAutoSrTextEnabled() {
    return state.userSrText === "Auto";
}

export function isAutoContentBarEnabled() {
    return state.userContentBar === "Auto";
}
