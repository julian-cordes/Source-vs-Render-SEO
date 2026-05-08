/**
 * offscreen.js
 * Runs in the hidden offscreen document.
 * Receives raw HTML text, parses it with DOMParser, extracts SEO fields,
 * and returns them to the service worker via chrome.runtime.sendMessage.
 */

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'PARSE_RAW_HTML') return false;

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(msg.html, 'text/html');
    const fields = extractSeoFields(doc);
    sendResponse({ ok: true, fields });
  } catch (err) {
    sendResponse({ ok: false, error: err.message });
  }
  return true; // keep channel open for async sendResponse
});

// ---------------------------------------------------------------------------
// Inline extraction (mirrors seo-fields.js — offscreen cannot use ES imports)
// ---------------------------------------------------------------------------

function extractSeoFields(doc) {
  return {
    title: doc.title ?? null,
    metaDescription: getMeta(doc, 'description'),
    metaRobots: getMeta(doc, 'robots'),
    canonical: getCanonical(doc),
    h1s: getH1s(doc),
    hreflangs: getHreflangs(doc),
  };
}

function getMeta(doc, name) {
  const el = doc.querySelector(`meta[name="${name}"]`);
  return el ? el.getAttribute('content') : null;
}

function getCanonical(doc) {
  const el = doc.querySelector('link[rel="canonical"]');
  return el ? el.getAttribute('href') : null;
}

function getH1s(doc) {
  const els = doc.querySelectorAll('h1');
  if (!els.length) return null;
  return Array.from(els).map(el => el.textContent.trim()).filter(Boolean);
}

function getHreflangs(doc) {
  const els = doc.querySelectorAll('link[rel="alternate"][hreflang]');
  if (!els.length) return null;
  return Array.from(els).map(el => ({
    lang: el.getAttribute('hreflang'),
    href: el.getAttribute('href'),
  }));
}
