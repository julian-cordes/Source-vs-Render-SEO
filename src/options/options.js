const UI_SETTINGS_KEY = 'seoInspectorUiSettings';
const DEFAULT_UI_SETTINGS = {
  theme: 'system',
  popupWidth: 'standard',
};
const VALID_THEMES = ['system', 'light', 'dark'];
const VALID_POPUP_WIDTHS = ['standard', 'wide', 'maximum'];

document.addEventListener('DOMContentLoaded', async () => {
  const settings = await getStoredUiSettings();
  applyUiSettings(settings);
  updateControls(settings);

  document.querySelectorAll('input[name="theme"]').forEach((input) => {
    input.addEventListener('change', () => saveUiSettings({ theme: input.value }));
  });

  document.querySelectorAll('input[name="popupWidth"]').forEach((input) => {
    input.addEventListener('change', () => saveUiSettings({ popupWidth: input.value }));
  });

  document.getElementById('close-settings')?.addEventListener('click', closeSettings);
});

function getStoredUiSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(UI_SETTINGS_KEY, (items) => {
      if (chrome.runtime.lastError) {
        resolve({ ...DEFAULT_UI_SETTINGS });
        return;
      }
      resolve(normalizeUiSettings(items?.[UI_SETTINGS_KEY]));
    });
  });
}

function saveUiSettings(partial) {
  getStoredUiSettings().then((current) => {
    const next = normalizeUiSettings({ ...current, ...partial });
    chrome.storage.local.set({ [UI_SETTINGS_KEY]: next }, () => {
      if (chrome.runtime.lastError) {
        setSaveState('Could not save settings.');
        return;
      }
      applyUiSettings(next);
      updateControls(next);
      setSaveState('Settings saved.');
    });
  });
}

function normalizeUiSettings(settings) {
  const normalized = { ...DEFAULT_UI_SETTINGS, ...(settings ?? {}) };
  if (!VALID_THEMES.includes(normalized.theme)) normalized.theme = DEFAULT_UI_SETTINGS.theme;
  if (!VALID_POPUP_WIDTHS.includes(normalized.popupWidth)) {
    normalized.popupWidth = DEFAULT_UI_SETTINGS.popupWidth;
  }
  return normalized;
}

function applyUiSettings(settings) {
  document.documentElement.dataset.theme = settings.theme;
}

function updateControls(settings) {
  const theme = document.querySelector(`input[name="theme"][value="${settings.theme}"]`);
  const popupWidth = document.querySelector(`input[name="popupWidth"][value="${settings.popupWidth}"]`);
  if (theme) theme.checked = true;
  if (popupWidth) popupWidth.checked = true;
}

function setSaveState(text) {
  const el = document.getElementById('save-state');
  if (!el) return;
  el.textContent = text;
  window.clearTimeout(setSaveState.timeoutId);
  setSaveState.timeoutId = window.setTimeout(() => {
    el.textContent = '';
  }, 1800);
}

function closeSettings() {
  window.close();
  window.setTimeout(() => {
    chrome.tabs.getCurrent((tab) => {
      if (chrome.runtime.lastError || !tab?.id) return;
      chrome.tabs.remove(tab.id);
    });
  }, 80);
}
