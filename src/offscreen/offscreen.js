/**
 * offscreen.js
 * Runs in the hidden offscreen document.
 * Receives raw HTML text, parses it with DOMParser, extracts SEO fields,
 * and returns them to the service worker over a dedicated runtime port.
 */

import { extractSeoFields } from '../shared/seo-fields.js';

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'PARSE_RAW_HTML') return;

  port.onMessage.addListener((msg) => {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(msg.html, 'text/html');
      const fields = extractSeoFields(doc);
      port.postMessage({ ok: true, fields });
    } catch (err) {
      port.postMessage({ ok: false, error: err.message });
    }
  });
});
