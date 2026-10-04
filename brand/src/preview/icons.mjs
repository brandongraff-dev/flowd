// Tiny inline icon set for the board (24px grid, 1.75 stroke, currentColor). Stroke matches regular/semibold text.
const P = {
  home: '<path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z"/>',
  bounty: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".9" fill="currentColor"/>',
  studio: '<rect x="3" y="6.5" width="12.5" height="11" rx="3"/><path d="m15.5 10.5 5-2.8v8.6l-5-2.8z"/>',
  wallet: '<rect x="3" y="6" width="18" height="13" rx="3.2"/><path d="M3 10.2h18"/><circle cx="16.6" cy="14.6" r="1.1" fill="currentColor"/>',
  user: '<circle cx="12" cy="8.5" r="3.6"/><path d="M4.5 20c.9-3.6 3.8-5.5 7.5-5.5s6.6 1.9 7.5 5.5"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
  bolt: '<path d="M13 3 5 13.5h6L10 21l8-10.5h-6z"/>',
  arrow: '<path d="M7 17 17 7M8.5 7H17v8.5"/>',
  spark: '<path d="M12 3.5l1.9 5.3 5.3 1.9-5.3 1.9L12 18l-1.9-5.4-5.3-1.9 5.3-1.9z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  bell: '<path d="M6 9a6 6 0 1 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9z"/><path d="M10 19a2 2 0 0 0 4 0"/>',
  inbox: '<path d="M4 13.5 6.5 5h11L20 13.5V18a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M4 13.5h4.5l1 2.5h5l1-2.5H20"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  film: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M4 9h16M4 15h16M9 4v16M15 4v16"/>',
};
export const icon = (name, { cls = '', w } = {}) =>
  `<svg${cls ? ` class="${cls}"` : ''}${w ? ` width="${w}" height="${w}"` : ''} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name]}</svg>`;
