import { TOAST_MS, platformName, platformUrl } from './constants.js';

// Tagged template that escapes every interpolated value unless it came from html`` or raw().
const RAW = Symbol('raw');
export const raw = (value) => ({ [RAW]: String(value) });
export const toHtml = (fragment) => fragment[RAW];

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]);

const renderValue = (value) => {
  if (value == null || value === false) return '';
  if (Array.isArray(value)) return value.map(renderValue).join('');
  if (typeof value === 'object' && RAW in value) return value[RAW];
  return escapeHtml(value);
};

export const html = (strings, ...values) =>
  raw(strings.reduce((out, part, i) => out + part + (i < values.length ? renderValue(values[i]) : ''), ''));

// ---------- Small shared pieces ----------
export const dot = (platformId) => html`<i class="dot" data-p="${platformId}"></i>`;

// Opens the AI in a new tab. AIs added without a web address only get the copied text.
export const openPlatform = (platformId) => {
  const url = platformUrl(platformId);
  if (url) window.open(url, '_blank', 'noopener');
};

export const platformTag = (platformId) => html`<span class="ptag">${dot(platformId)}${platformName(platformId)}</span>`;

const DATE_FORMAT = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' });
export const formatDate = (iso) => DATE_FORMAT.format(new Date(iso));

export const linesOf = (text) => text.split('\n').map((l) => l.trim()).filter(Boolean);

// ---------- Feedback ----------
let toastTimer;
export function toast(message, { isError = false } = {}) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.toggle('is-error', isError);
  el.classList.add('is-shown');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-shown'), TOAST_MS);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard API is blocked on some origins; fall back to a hidden textarea.
    const area = Object.assign(document.createElement('textarea'), { value: text });
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;opacity:0';
    document.body.append(area);
    area.select();
    const isCopied = document.execCommand('copy');
    area.remove();
    return isCopied;
  }
}
