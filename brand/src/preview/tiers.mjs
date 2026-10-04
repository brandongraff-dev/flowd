// Tier medallions: gradient disc + engraved ring + N stacked chevrons. Elite adds a spinning prismatic ring and sparks.
export function medallion(id, tier, { size = 112 } = {}) {
  const gid = `tg-${id}-${size}`;
  const n = tier.chevrons;
  const stops = tier.stops.map(([c, at]) => `<stop offset="${at / 100}" stop-color="${c}"/>`).join('');
  const gap = 10.5;
  const total = (n - 1) * gap;
  const chev = Array.from({ length: n }, (_, i) => {
    const y = 56 - total / 2 + i * gap + 4;
    return `<path d="M42 ${y + 5}L56 ${y - 5}L70 ${y + 5}" fill="none" stroke="${tier.ink}" stroke-width="5.4" stroke-linecap="round" stroke-linejoin="round"/>`;
  }).join('');
  const elite = id === 'elite';
  const sparks = elite
    ? [[56, 3, 0], [109, 56, 90], [56, 109, 180], [3, 56, 270]].map(([x, y, r]) => `<path d="M0 -7 L1.6 -1.6 L7 0 L1.6 1.6 L0 7 L-1.6 1.6 L-7 0 L-1.6 -1.6Z" transform="translate(${x} ${y}) rotate(${r})" fill="#FFF4D6"/>`).join('')
    : '';
  const dark = elite ? '#1A0A33' : null;
  return `<div class="med" style="width:${size}px;height:${size}px">
${elite ? '<div class="elite-ring"></div>' : ''}
<svg viewBox="0 0 112 112" width="${size}" height="${size}" role="img" aria-label="${tier.label} tier badge">
<defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1">${stops}</linearGradient>
<linearGradient id="${gid}-rim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${tier.rim}" stop-opacity=".95"/><stop offset=".5" stop-color="${tier.rim}" stop-opacity=".1"/><stop offset="1" stop-color="${tier.rim}" stop-opacity=".4"/></linearGradient>
<radialGradient id="${gid}-hl" cx=".3" cy=".18" r=".7"><stop offset="0" stop-color="#fff" stop-opacity=".6"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
<filter id="${gid}-glow" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="10" stdDeviation="9" flood-color="${tier.glow.replace(/rgba?\(([^)]+)\)/, (m, v) => `rgb(${v.split(',').slice(0, 3).join(',')})`)}" flood-opacity=".75"/></filter></defs>
<g filter="url(#${gid}-glow)"><circle cx="56" cy="56" r="${elite ? 42 : 46}" fill="${elite ? dark : `url(#${gid})`}"/></g>
${elite ? `<circle cx="56" cy="56" r="40" fill="url(#${gid})" opacity=".28"/>` : ''}
<circle cx="56" cy="56" r="${elite ? 42 : 46}" fill="url(#${gid}-hl)"/>
<circle cx="56" cy="56" r="${elite ? 41.2 : 45.2}" fill="none" stroke="url(#${gid}-rim)" stroke-width="1.6"/>
<circle cx="56" cy="56" r="${elite ? 33 : 36}" fill="none" stroke="${elite ? '#fff' : tier.ink}" stroke-opacity="${elite ? '.16' : '.2'}" stroke-width="1.4" stroke-dasharray="${elite ? '2 5' : '0'}"/>
${elite ? chev.replace(new RegExp(tier.ink.replace('#', '#'), 'g'), `url(#${gid})`) : chev}
${sparks}
</svg></div>`;
}
