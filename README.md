# Source vs Render SEO

Chrome extension for checking how JavaScript rendering changes SEO-relevant signals.

**Source vs Render SEO** compares the raw HTML source of a page with the rendered DOM and shows whether JavaScript changed important SEO fields such as canonical, meta robots, title, meta description, H1s, or hreflangs.

![Source vs Render SEO popup](screenshot/screenshot.png)

## What It Does

Many SEO issues only become visible after JavaScript has run. This extension checks both versions of a page:

- **Source HTML**: the raw HTML returned by the server before JavaScript execution
- **Rendered DOM**: the final document after JavaScript has modified the page

The extension then highlights differences directly in the popup and updates the toolbar icon to show the current indexability and rendering state.

## Key Features

- Compare raw HTML vs rendered DOM
- Detect JavaScript changes to SEO-critical fields
- Check indexability via `meta robots` and canonical
- Show a state-aware toolbar icon for each page
- Switch between Compare, HTML-only, and Rendered-only modes
- Display inline source-vs-rendered differences next to each field
- Keep visible URLs clickable without visual clutter
- Works on regular websites and local test files when file URL access is enabled
- Plain JavaScript, no build step, no bundler

## Checked Fields

Source vs Render SEO currently checks:

- Title
- Meta description
- Meta robots
- Canonical
- H1 values
- Hreflang links
- HTTP status

## Toolbar Icon States

The toolbar icon summarizes indexability and JavaScript changes at a glance.

| State | Meaning |
|---|---|
| Green | Indexable, no JavaScript difference |
| Red | Not indexable, no JavaScript difference |
| Green + yellow | Indexable, content changed by JavaScript |
| Red + yellow | Not indexable, content changed by JavaScript |
| Green -> red | Source was indexable, rendered page became not indexable |
| Red -> green | Source was not indexable, rendered page became indexable |
| Yellow border | Content and indexability changed |

For indexability changes, the icon direction is always:

```text
Source -> Rendered
```

Example: if the source canonical points to another URL but JavaScript changes it to a self-referencing canonical, the page changes from not indexable to indexable. The icon therefore shows red -> green.

## Popup Modes

The popup has three modes:

- **Compare**: raw HTML source vs rendered DOM
- **HTML**: raw HTML source only
- **Rendered**: rendered DOM only

The selected mode is remembered locally.

## Installation For Development

There is no build step.

1. Clone or download this repository.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the project folder.
6. Reload the extension after changing files.

For local `file://` pages, enable **Allow access to file URLs** on the extension card.

## Test Pages

The `test-pages/` directory contains minimal HTML files for all toolbar icon states.

## Project Structure

```text
manifest.json
icons/
  status/   toolbar state icons
  store/    extension and store icons
src/
  background/service-worker.js
  content/content-script.js
  offscreen/offscreen.html
  offscreen/offscreen.js
  popup/popup.html
  popup/popup.css
  popup/popup.js
  shared/seo-fields.js
test-pages/
  manual test pages
```

## How It Works

The service worker fetches the current URL to get the raw HTML source. Because service workers do not have `DOMParser`, the raw HTML is sent to an offscreen document for parsing.

The rendered DOM is read by the content script. The service worker compares both result sets and stores the current tab result in `chrome.storage.session`.

The popup reads the stored result and renders:

- indexability status
- render-change status
- HTTP status
- URL, meta robots, and canonical
- additional checks for title, meta description, H1, and hreflangs

## Permissions

The extension uses:

- `activeTab`: access the active tab context
- `tabs`: read active tab metadata and restore per-tab state
- `webNavigation`: detect page loads and SPA navigation
- `storage`: store per-tab results and selected mode
- `scripting`: inject the content script as a fallback
- `offscreen`: parse raw HTML with `DOMParser`
- `<all_urls>`: fetch the raw HTML source of the current page

## Privacy

Source vs Render SEO does not collect, transmit, sell, or share user data.

The extension only analyzes the page you are currently visiting. Results are stored locally in Chrome session storage and are cleared with the browser session or tab lifecycle.

There are no analytics, no tracking scripts, no remote logging, and no third-party services.

## License

MIT
