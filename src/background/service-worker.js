/**
 * service-worker.js
 * Central orchestrator. Listens for page-load and SPA-navigation events,
 * fetches raw HTML, requests rendered DOM from the content script,
 * compares both, stores the result, and updates the tab icon.
 */

import { compareSeoFields } from '../shared/seo-fields.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ICON_PATHS = {
  'indexable-no-js-diff': iconPaths('indexable-no-js-diff'),
  'indexable-content-diff': iconPaths('indexable-content-diff'),
  'indexable-index-diff': iconPaths('indexable-index-diff'),
  'indexable-content-index-diff': iconPaths('indexable-content-index-diff'),
  'not-indexable-no-js-diff': iconPaths('not-indexable-no-js-diff'),
  'not-indexable-content-diff': iconPaths('not-indexable-content-diff'),
  'not-indexable-index-diff': iconPaths('not-indexable-index-diff'),
  'not-indexable-content-index-diff': iconPaths('not-indexable-content-index-diff'),
};

const CONTENT_DIFF_FIELDS = ['title', 'metaDescription', 'h1s', 'hreflangs'];
const LOADING_ICON_PATH = ICON_PATHS['indexable-no-js-diff'];
const ANALYSIS_VERSION = 'analysis-mode-v10';
const ANALYSIS_MODE_KEY = 'seoInspectorAnalysisMode';
const ANALYSIS_MODES = {
  COMPARE: 'compare',
  HTML: 'html',
  RENDERED: 'rendered',
};

const ICON_STATE_LABELS = {
  'indexable-no-js-diff': 'Indexable, no JS change',
  'indexable-content-diff': 'Indexable, content change',
  'indexable-index-diff': 'Indexable, indexability change',
  'indexable-content-index-diff': 'Indexable, content and indexability change',
  'not-indexable-no-js-diff': 'Not indexable, no JS change',
  'not-indexable-content-diff': 'Not indexable, content change',
  'not-indexable-index-diff': 'Not indexable, indexability change',
  'not-indexable-content-index-diff': 'Not indexable, content and indexability change',
};

const ANALYSIS_MODE_LABELS = {
  [ANALYSIS_MODES.COMPARE]: 'Compare',
  [ANALYSIS_MODES.HTML]: 'HTML only',
  [ANALYSIS_MODES.RENDERED]: 'Rendered only',
};

const iconImageDataCache = new Map();
const activeAnalysisTokens = new Map();
let nextAnalysisToken = 0;
let offscreenDocumentPromise = null;

// ---------------------------------------------------------------------------
// Event listeners
// ---------------------------------------------------------------------------

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status === 'complete' && tab.url && isAnalyzableUrl(tab.url)) {
    analyzeTab(tabId, tab.url);
  }
});

chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
  if (details.frameId !== 0) return;
  chrome.tabs.get(details.tabId, (tab) => {
    if (chrome.runtime.lastError) return;
    if (tab && tab.url && isAnalyzableUrl(tab.url)) {
      analyzeTab(details.tabId, tab.url);
    }
  });
});

// Restore icon when user switches tabs
chrome.tabs.onActivated.addListener(({ tabId }) => {
  restoreIconForActivatedTab(tabId);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  activeAnalysisTokens.delete(tabId);
  chrome.storage.session.remove(String(tabId)).catch(() => {
    // ignore cleanup failures
  });
});

// Popup requests stored data
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!isTrustedExtensionSender(sender)) return false;

  if (msg.type === 'GET_SEO_DATA') {
    handleSeoDataRequest()
      .then(sendResponse)
      .catch((err) => {
        console.warn('[Source vs Render SEO] popup analysis failed:', err.message);
        sendResponse(null);
      });
    return true; // async
  }

  if (msg.type === 'SET_ANALYSIS_MODE') {
    handleAnalysisModeChange(msg.mode)
      .then(sendResponse)
      .catch((err) => {
        console.warn('[Source vs Render SEO] mode change failed:', err.message);
        sendResponse({ ok: false, error: err.message });
      });
    return true; // async
  }

  return false;
});

// ---------------------------------------------------------------------------
// Core analysis
// ---------------------------------------------------------------------------

async function analyzeTab(tabId, url, requestedMode) {
  const analysisToken = beginAnalysis(tabId);
  const analysisMode = normalizeAnalysisMode(requestedMode ?? await getAnalysisMode());
  const needsSource = analysisMode !== ANALYSIS_MODES.RENDERED;
  const needsRendered = analysisMode !== ANALYSIS_MODES.HTML;

  let httpStatus = null;
  let sourceFields = null;
  let renderedFields = null;
  let analysisState = 'ok'; // ok | source_unavailable | rendered_unavailable | partial | both_unavailable

  // 1. Fetch raw HTML + HTTP status
  if (needsSource) {
    try {
      const resp = await fetch(url, { cache: 'no-cache', credentials: 'include' });
      httpStatus = resp.status;
      const html = await resp.text();
      sourceFields = await parseRawHtml(html);
    } catch (err) {
      console.warn('[Source vs Render SEO] fetch failed:', err.message);
      analysisState = 'source_unavailable';
    }
  }

  // 2. Get rendered DOM from content script
  if (needsRendered) {
    try {
      renderedFields = await getRenderedFields(tabId);
    } catch (err) {
      console.warn('[Source vs Render SEO] content script failed:', err.message);
      if (analysisState === 'source_unavailable') {
        analysisState = 'both_unavailable';
      } else {
        analysisState = 'rendered_unavailable';
      }
    }
  }

  // 3. Compare (only if both available)
  let comparison = null;
  if (analysisMode === ANALYSIS_MODES.COMPARE && sourceFields && renderedFields) {
    comparison = compareSeoFields(sourceFields, renderedFields, url);
  } else if (analysisMode === ANALYSIS_MODES.COMPARE && (sourceFields || renderedFields)) {
    analysisState = analysisState === 'ok' ? 'partial' : analysisState;
  }

  const iconState = getIconStateForAnalysis({
    analysisMode,
    analysisState,
    httpStatus,
    url,
    sourceFields,
    renderedFields,
    comparison,
  });

  const result = {
    tabId,
    url,
    analysisVersion: ANALYSIS_VERSION,
    analysisMode,
    analysisModeLabel: ANALYSIS_MODE_LABELS[analysisMode],
    httpStatus,
    analysisState,
    iconState,
    iconStateLabel: iconState ? ICON_STATE_LABELS[iconState] : null,
    sourceFields,
    renderedFields,
    comparison,
    analyzedAt: Date.now(),
  };

  // 4. Persist + update icon
  if (!isCurrentAnalysis(tabId, analysisToken)) {
    return result;
  }

  await chrome.storage.session.set({ [String(tabId)]: result });
  if (isCurrentAnalysis(tabId, analysisToken)) {
    await applyIcon(tabId, result);
  }
  return result;
}

async function handleSeoDataRequest() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url || !isAnalyzableUrl(tab.url)) return null;

  const analysisMode = await getAnalysisMode();
  const items = await chrome.storage.session.get(String(tab.id));
  const storedResult = items[String(tab.id)];
  if (
    storedResult?.url === tab.url
    && storedResult.analysisVersion === ANALYSIS_VERSION
    && storedResult.analysisMode === analysisMode
  ) {
    await applyIcon(tab.id, storedResult);
    return storedResult;
  }

  return analyzeTab(tab.id, tab.url, analysisMode);
}

async function handleAnalysisModeChange(mode) {
  const analysisMode = normalizeAnalysisMode(mode);
  await chrome.storage.local.set({ [ANALYSIS_MODE_KEY]: analysisMode });

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url || !isAnalyzableUrl(tab.url)) {
    return { ok: true, data: null };
  }

  const data = await analyzeTab(tab.id, tab.url, analysisMode);
  return { ok: true, data };
}

async function restoreIconForActivatedTab(tabId) {
  const analysisMode = await getAnalysisMode();
  const items = await chrome.storage.session.get(String(tabId));
  const result = items[String(tabId)];

  if (!result) return;

  if (result.analysisVersion === ANALYSIS_VERSION && result.analysisMode === analysisMode) {
    await applyIcon(tabId, result);
    return;
  }

  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError) return;
    if (tab?.url && isAnalyzableUrl(tab.url)) {
      analyzeTab(tabId, tab.url, analysisMode);
    }
  });
}

// ---------------------------------------------------------------------------
// Offscreen: parse raw HTML
// ---------------------------------------------------------------------------

async function parseRawHtml(html) {
  await ensureOffscreenDocument();
  return new Promise((resolve, reject) => {
    const port = chrome.runtime.connect({ name: 'PARSE_RAW_HTML' });
    let settled = false;

    port.onMessage.addListener((resp) => {
      if (settled) return;
      settled = true;
      port.disconnect();
      if (resp?.ok) {
        resolve(resp.fields);
      } else {
        reject(new Error(resp?.error ?? 'parse failed'));
      }
    });

    port.onDisconnect.addListener(() => {
      if (settled) return;
      settled = true;
      const err = chrome.runtime.lastError;
      reject(new Error(err?.message ?? 'offscreen parser disconnected'));
    });

    port.postMessage({ html });
  });
}

async function ensureOffscreenDocument() {
  if (offscreenDocumentPromise) {
    await offscreenDocumentPromise;
  }

  if (await chrome.offscreen.hasDocument()) return;

  offscreenDocumentPromise = (async () => {
    if (await chrome.offscreen.hasDocument()) return;
    await chrome.offscreen.createDocument({
      url: chrome.runtime.getURL('src/offscreen/offscreen.html'),
      reasons: ['DOM_PARSER'],
      justification: 'Parse raw HTML to extract SEO fields',
    });
  })();

  try {
    await offscreenDocumentPromise;
  } catch (err) {
    offscreenDocumentPromise = null;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Content script: get rendered fields
// ---------------------------------------------------------------------------

async function getRenderedFields(tabId) {
  try {
    return await sendMessageToTab(tabId);
  } catch {
    // Fallback: inject content script (tab was open before install)
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['src/content/content-script.js'],
    });
    return await sendMessageToTab(tabId);
  }
}

function sendMessageToTab(tabId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, { type: 'GET_RENDERED_SEO' }, (resp) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (resp && resp.ok) {
        resolve(resp.fields);
      } else {
        reject(new Error('no response'));
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Icon
// ---------------------------------------------------------------------------

function beginAnalysis(tabId) {
  const token = ++nextAnalysisToken;
  activeAnalysisTokens.set(tabId, token);
  return token;
}

function isCurrentAnalysis(tabId, token) {
  return activeAnalysisTokens.get(tabId) === token;
}

function applyIcon(tabId, result) {
  if (result.analysisState === 'ok' && result.iconState) {
    const iconKey = result.iconState;
    return setIcon(tabId, ICON_PATHS[iconKey]);
  }

  return setIcon(tabId, null);
}

async function setIcon(tabId, iconPath) {
  const paths = iconPath ?? LOADING_ICON_PATH;

  try {
    const imageData = await getIconImageDataSet(paths);
    await setActionIcon(tabId, imageData);
  } catch (err) {
    console.warn('[Source vs Render SEO] setIcon failed:', err.message, paths);
  }

  try {
    await setActionBadgeText(tabId, '');
  } catch {
    // ignore
  }
}

function setActionIcon(tabId, imageData) {
  return new Promise((resolve, reject) => {
    chrome.action.setIcon({ tabId, imageData }, () => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message));
      } else {
        resolve();
      }
    });
  });
}

function setActionBadgeText(tabId, text) {
  return new Promise((resolve, reject) => {
    chrome.action.setBadgeText({ tabId, text }, () => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message));
      } else {
        resolve();
      }
    });
  });
}

async function getIconImageData(path) {
  if (!iconImageDataCache.has(path)) {
    iconImageDataCache.set(path, loadIconImageData(path));
  }
  return iconImageDataCache.get(path);
}

async function getIconImageDataSet(paths) {
  const entries = await Promise.all(
    Object.entries(paths).map(async ([size, path]) => [size, await getIconImageData(path)]),
  );
  return Object.fromEntries(entries);
}

async function loadIconImageData(path) {
  const resp = await fetch(chrome.runtime.getURL(path));
  if (!resp.ok) {
    throw new Error(`Failed to load icon asset ${path}`);
  }

  const bitmap = await createImageBitmap(await resp.blob());
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, bitmap.width, bitmap.height);
  ctx.drawImage(bitmap, 0, 0);
  const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  bitmap.close();
  return imageData;
}

function getStatusIconKey(result) {
  const contentDiff = hasAnyFieldDiff(result.comparison, CONTENT_DIFF_FIELDS);
  const sourceIndexable = isResultIndexable(result.sourceFields, result.url, result.httpStatus);
  const renderedIndexable = isResultIndexable(result.renderedFields, result.url, result.httpStatus);
  const indexabilityDiff = sourceIndexable !== renderedIndexable;
  const indexabilityPrefix = sourceIndexable ? 'indexable' : 'not-indexable';

  if (contentDiff && indexabilityDiff) return `${indexabilityPrefix}-content-index-diff`;
  if (contentDiff) return `${indexabilityPrefix}-content-diff`;
  if (indexabilityDiff) return `${indexabilityPrefix}-index-diff`;
  return `${indexabilityPrefix}-no-js-diff`;
}

function getIconStateForAnalysis(result) {
  if (result.analysisState !== 'ok') return null;

  if (result.analysisMode === ANALYSIS_MODES.COMPARE && result.comparison && result.renderedFields) {
    return getStatusIconKey(result);
  }

  if (result.analysisMode === ANALYSIS_MODES.HTML && result.sourceFields) {
    return getIndexabilityOnlyIconKey(result.sourceFields, result.url, result.httpStatus);
  }

  if (result.analysisMode === ANALYSIS_MODES.RENDERED && result.renderedFields) {
    return getIndexabilityOnlyIconKey(result.renderedFields, result.url, result.httpStatus);
  }

  return null;
}

function getIndexabilityOnlyIconKey(fields, url, httpStatus) {
  const indexable = isResultIndexable(fields, url, httpStatus);
  return `${indexable ? 'indexable' : 'not-indexable'}-no-js-diff`;
}

function isResultIndexable(fields, pageUrl, httpStatus) {
  return isIndexableHttpStatus(httpStatus) && isPageIndexable(fields, pageUrl);
}

function isIndexableHttpStatus(status) {
  return status == null || (status >= 200 && status < 400);
}

function hasAnyFieldDiff(comparison, fields) {
  return fields.some((field) => comparison?.fields?.[field]?.diff);
}

function isPageIndexable(fields, pageUrl) {
  if (!fields) return false;
  return !hasNoindexDirective(fields.metaRobots) && hasSelfReferencingCanonical(fields.canonical, pageUrl);
}

function hasNoindexDirective(metaRobots) {
  if (!metaRobots) return false;
  const directives = metaRobots
    .toLowerCase()
    .split(',')
    .map((part) => part.trim());
  return directives.includes('noindex') || directives.includes('none');
}

function hasSelfReferencingCanonical(canonical, pageUrl) {
  if (!canonical) return true;
  return normalizeComparableUrl(canonical, pageUrl) === normalizeComparableUrl(pageUrl, pageUrl);
}

function normalizeComparableUrl(value, baseUrl) {
  try {
    const url = new URL(value, baseUrl);
    const pathname = url.pathname.replace(/\/$/, '') || '/';
    return `${url.protocol.toLowerCase()}//${url.host.toLowerCase()}${pathname}${url.search}`;
  } catch {
    return String(value).trim();
  }
}

function iconPaths(name) {
  return {
    16: `icons/status/${name}-16.png`,
    48: `icons/status/${name}-48.png`,
    96: `icons/status/${name}-96.png`,
    128: `icons/status/${name}-128.png`,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getAnalysisMode() {
  const items = await chrome.storage.local.get(ANALYSIS_MODE_KEY);
  return normalizeAnalysisMode(items[ANALYSIS_MODE_KEY]);
}

function normalizeAnalysisMode(mode) {
  return Object.values(ANALYSIS_MODES).includes(mode) ? mode : ANALYSIS_MODES.COMPARE;
}

function isAnalyzableUrl(url) {
  return url.startsWith('http://') || url.startsWith('https://') || url.startsWith('file://');
}

function isTrustedExtensionSender(sender) {
  return sender.id === chrome.runtime.id && !sender.tab;
}

