// Hand-drawn art for manage-ai: Byte (our robot buddy) + one icon per kind of stuff.
// Icons are duotone: `currentColor` for the shape, white for details.

import { html } from '/vendor/preact.js';

/** Byte — mood: "hi" | "happy" | "think" */
export function Byte({ size = 56, mood = 'hi' }) {
  const eyes = mood === 'happy'
    ? html`<path d="M22.5 29.5q3.5-4 7 0M34.5 29.5q3.5-4 7 0" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round"/>`
    : mood === 'think'
      ? html`<circle cx="26" cy="28" r="3.2" fill="#fff"/><circle cx="38" cy="26.5" r="3.2" fill="#fff"/>`
      : html`<circle cx="26" cy="28" r="3.4" fill="#fff"/><circle cx="38" cy="28" r="3.4" fill="#fff"/>`;
  const mouth = mood === 'think'
    ? html`<path d="M29 35h6" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>`
    : html`<path d="M27 33.5q5 4.5 10 0" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
  return html`
    <svg class="byte" width=${size} height=${size} viewBox="0 0 64 64" aria-hidden="true">
      <line x1="32" y1="5" x2="32" y2="13" stroke="#7c70f2" stroke-width="2.6" stroke-linecap="round"/>
      <circle cx="32" cy="5" r="3.6" fill="#ff8fb1"/>
      <rect x="5" y="23" width="8" height="15" rx="4" fill="#6a5de6"/>
      <rect x="51" y="23" width="8" height="15" rx="4" fill="#6a5de6"/>
      <path d="M19 50q0-5 5-5h16q5 0 5 5v9q0 3-3 3H22q-3 0-3-3z" fill="#7c70f2"/>
      <circle cx="32" cy="54" r="2.4" fill="#c9c3ff"/>
      <rect x="10" y="11" width="44" height="36" rx="15" fill="#aba3ff"/>
      <rect x="15.5" y="18" width="33" height="22" rx="11" fill="#2a2460"/>
      ${eyes}${mouth}
      <circle cx="18" cy="42" r="2" fill="#ff8fb1" opacity=".55"/>
      <circle cx="46" cy="42" r="2" fill="#ff8fb1" opacity=".55"/>
    </svg>`;
}

const svg = (size, body) => html`<svg width=${size} height=${size} viewBox="0 0 48 48" fill="none" aria-hidden="true">${body}</svg>`;

export const ART = {
  chats: (s = 34) => svg(s, html`
    <path d="M6 12a6 6 0 0 1 6-6h16a6 6 0 0 1 6 6v9a6 6 0 0 1-6 6H16l-6 5v-5.5A6 6 0 0 1 6 21z" fill="currentColor"/>
    <path d="M18 24a5 5 0 0 1 5-5h14a5 5 0 0 1 5 5v8a5 5 0 0 1-5 5v4.5L32 37h-9a5 5 0 0 1-5-5z" fill="#fff" stroke="currentColor" stroke-width="2.4"/>
    <circle cx="25" cy="28" r="1.8" fill="currentColor"/><circle cx="30" cy="28" r="1.8" fill="currentColor"/><circle cx="35" cy="28" r="1.8" fill="currentColor"/>`),

  memory: (s = 34) => svg(s, html`
    <rect x="10" y="6" width="28" height="36" rx="5" fill="currentColor"/>
    <rect x="16" y="6" width="22" height="36" rx="4" fill="#fff" stroke="currentColor" stroke-width="2.4"/>
    <path d="M21 15h11M21 21h11M21 27h7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M31 6v11l3-2.5 3 2.5V6" fill="currentColor"/>
    <circle cx="10" cy="14" r="2" fill="#fff" stroke="currentColor" stroke-width="2"/><circle cx="10" cy="24" r="2" fill="#fff" stroke="currentColor" stroke-width="2"/><circle cx="10" cy="34" r="2" fill="#fff" stroke="currentColor" stroke-width="2"/>`),

  rules: (s = 34) => svg(s, html`
    <rect x="9" y="8" width="30" height="35" rx="5" fill="currentColor"/>
    <rect x="13" y="12" width="22" height="27" rx="3" fill="#fff"/>
    <rect x="17" y="4" width="14" height="8" rx="3" fill="#fff" stroke="currentColor" stroke-width="2.4"/>
    <path d="m17 20 2 2 4-4M17 29l2 2 4-4" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M26 21h5M26 30h5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>`),

  plug: (s = 34) => svg(s, html`
    <path d="M17 5v9M31 5v9" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/>
    <path d="M11 14h26v6a13 13 0 0 1-26 0z" fill="currentColor"/>
    <rect x="18" y="18" width="12" height="4" rx="2" fill="#fff" opacity=".7"/>
    <path d="M24 33v4q0 6 7 6h6" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/>`),

  addons: (s = 34) => svg(s, html`
    <path d="M8 14a4 4 0 0 1 4-4h7a5 5 0 1 1 10 0h7a4 4 0 0 1 4 4v7a5 5 0 1 1 0 10v7a4 4 0 0 1-4 4h-7a5 5 0 1 0-10 0h-7a4 4 0 0 1-4-4z" fill="currentColor"/>
    <path d="m22 21 2-4 2 4 4 .6-3 2.8.8 4.2-3.8-2-3.8 2 .8-4.2-3-2.8z" fill="#fff"/>`),

  junk: (s = 34) => svg(s, html`
    <path d="M30 4 21 24" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/>
    <path d="M14 23h15l5 3-2 16a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2.4l3-15z" fill="currentColor"/>
    <path d="M13 32v9M19 32v9M25 32v9" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".85"/>
    <path d="M40 8v6M37 11h6M41 26v4M39 28h4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>`),

  settings: (s = 34) => svg(s, html`
    <rect x="6" y="8" width="36" height="32" rx="8" fill="currentColor"/>
    <path d="M14 17h20M14 24h20M14 31h20" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".55"/>
    <circle cx="20" cy="17" r="3.6" fill="#fff"/><circle cx="30" cy="24" r="3.6" fill="#fff"/><circle cx="17" cy="31" r="3.6" fill="#fff"/>`),

  other: (s = 34) => svg(s, html`
    <path d="M6 16 24 7l18 9v18l-18 9-18-9z" fill="currentColor"/>
    <path d="M6 16l18 9 18-9M24 25v18" stroke="#fff" stroke-width="2.4" stroke-linejoin="round" opacity=".8"/>`),

  trash: (s = 34) => svg(s, html`
    <path d="M10 13h28l-2.4 26a4 4 0 0 1-4 3.6H16.4a4 4 0 0 1-4-3.6z" fill="currentColor"/>
    <rect x="7" y="9" width="34" height="6" rx="3" fill="currentColor"/>
    <path d="M19 9V7a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2" stroke="currentColor" stroke-width="2.4"/>
    <path d="M24 21v13m-5-6 5 6 5-6" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" transform="rotate(180 24 27.5)"/>`),
};

/** Small UI glyphs */
export const G = {
  back: html`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m15 5-7 7 7 7"/></svg>`,
  go: html`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`,
  search: html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>`,
  close: html`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>`,
  check: html`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-10"/></svg>`,
  copy: html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="9" y="9" width="11" height="11" rx="3"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/></svg>`,
  refresh: html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>`,
  lock: html`<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="10" rx="3"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>`,
  folder: html`<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" opacity=".8"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>`,
  file: html`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/></svg>`,
};
