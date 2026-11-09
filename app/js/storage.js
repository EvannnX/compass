import { STORAGE_KEY } from './constants.js';
import { emptyState, parseImportedState } from './model.js';

// Copies unreadable data to its own key so the next save cannot overwrite it. Returns that key, or null.
function keepUnreadable(saved) {
  const key = `${STORAGE_KEY}.unreadable-${new Date().toISOString()}`;
  try {
    localStorage.setItem(key, saved);
    return key;
  } catch (error) {
    console.error('Compass: could not keep a copy of the unreadable data.', error);
    return null;
  }
}

// Returns the saved state, or a fresh one. backupKey is set when saved data could not be read and was kept aside.
export function loadState() {
  let saved = null;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
    return { state: saved ? parseImportedState(JSON.parse(saved)) : emptyState(), backupKey: null };
  } catch (error) {
    console.error('Compass: could not read saved data, starting fresh.', error);
    return { state: emptyState(), backupKey: saved ? keepUnreadable(saved) : null };
  }
}

// Returns false when the browser refuses to store (private mode, full quota).
export function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (error) {
    console.error('Compass: could not save data.', error);
    return false;
  }
}

export function clearState() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Compass: could not clear saved data.', error);
  }
}

export function downloadJson(state, at = new Date()) {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), {
    href: url,
    download: `compass-export-${at.toISOString().slice(0, 10)}.json`,
  });
  link.click();
  URL.revokeObjectURL(url);
}

export async function readImportFile(file) {
  const text = await file.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('This file is not valid JSON.');
  }
  return parseImportedState(parsed);
}
