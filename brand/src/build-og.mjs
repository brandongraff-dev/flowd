// Builds brand/logo/og-image.svg (1200 x 630). All type is outlined (see og-text.json, produced from Bricolage Grotesque + Geist
// with OpenType shaping), so the SVG needs no fonts. Plain Node, zero dependencies.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { HERE, C, file, wrap, lockupH, KINDS } from './logo-lib.mjs';
import { fmt } from './geometry.mjs';

const TXT = JSON.parse(readFileSync(path.join(HERE, 'og-text.json'), 'utf8'));
const W = 1200, H = 630;
const FG = '#F3F7FF', MUTED = '#C0CAE0', SUBTLE = '#A3AFCB', MINT = '#18DF9B';

const text = (key, x, y, fill, extra = '') => `<path d="${TXT[key].d}" transform="translate(${fmt(x)} ${fmt(y)})" fill="${fill}"${extra}/>`;

const lock = lockupH(KINDS['-on-dark']);
const lockScale = 56 / lock.H;

const defs = `
<radialGradient id="a1" gradientUnits="userSpaceOnUse" cx="60" cy="-10" r="700"><stop offset="0" stop-color="#6B3FF5" stop-opacity=".62"/><stop offset=".45" stop-color="#6B3FF5" stop-opacity=".24"/><stop offset="1" stop-color="#6B3FF5" stop-opacity="0"/></radialGradient>
<radialGradient id="a2" gradientUnits="userSpaceOnUse" cx="1190" cy="40" r="560"><stop offset="0" stop-color="#2F7BFF" stop-opacity=".55"/><stop offset=".45" stop-color="#2F7BFF" stop-opacity=".2"/><stop offset="1" stop-color="#2F7BFF" stop-opacity="0"/></radialGradient>
<radialGradient id="a3" gradientUnits="userSpaceOnUse" cx="980" cy="700" r="620"><stop offset="0" stop-color="#19D3E6" stop-opacity=".42"/><stop offset=".45" stop-color="#19D3E6" stop-opacity=".16"/><stop offset="1" stop-color="#19D3E6" stop-opacity="0"/></radialGradient>
<radialGradient id="a4" gradientUnits="userSpaceOnUse" cx="-40" cy="660" r="420"><stop offset="0" stop-color="#FF4D8D" stop-opacity=".22"/><stop offset="1" stop-color="#FF4D8D" stop-opacity="0"/></radialGradient>
<linearGradient id="flowText" gradientUnits="userSpaceOnUse" x1="72" y1="0" x2="580" y2="0"><stop offset="0" stop-color="#8E6BFF"/><stop offset=".5" stop-color="#4C8DFF"/><stop offset="1" stop-color="#3BE3F4"/></linearGradient>
<linearGradient id="money" gradientUnits="userSpaceOnUse" x1="736" y1="0" x2="990" y2="0"><stop offset="0" stop-color="#39F1AB"/><stop offset="1" stop-color="#37E4FA"/></linearGradient>
<linearGradient id="bar" gradientUnits="userSpaceOnUse" x1="736" y1="0" x2="1092" y2="0"><stop offset="0" stop-color="#784FFC"/><stop offset=".55" stop-color="#307DFD"/><stop offset="1" stop-color="#17D2E7"/></linearGradient>
<linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".14"/><stop offset="1" stop-color="#fff" stop-opacity=".02"/></linearGradient>
<linearGradient id="rim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".62"/><stop offset=".45" stop-color="#fff" stop-opacity=".14"/><stop offset="1" stop-color="#fff" stop-opacity=".10"/></linearGradient>
<filter id="shadow" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="34" stdDeviation="30" flood-color="#010414" flood-opacity=".6"/></filter>
<filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .5 0"/></filter>`;

const card = { x: 716, y: 84, w: 412, h: 434, r: 36 };
const px = card.x + 36;

const body = `
<rect width="${W}" height="${H}" fill="${C.abyss}"/>
<rect width="${W}" height="${H}" fill="url(#a3)"/><rect width="${W}" height="${H}" fill="url(#a2)"/><rect width="${W}" height="${H}" fill="url(#a4)"/><rect width="${W}" height="${H}" fill="url(#a1)"/>
<rect width="${W}" height="${H}" filter="url(#grain)" opacity=".05"/>

<!-- decorative glass orbs -->
<circle cx="1128" cy="96" r="104" fill="#fff" fill-opacity=".05"/><circle cx="1128" cy="96" r="104" fill="none" stroke="url(#rim)" stroke-width="1.5"/>
<circle cx="624" cy="590" r="64" fill="#fff" fill-opacity=".04"/><circle cx="624" cy="590" r="64" fill="none" stroke="url(#rim)" stroke-width="1.5"/>

<!-- lockup -->
<g transform="translate(72 56) scale(${(lockScale).toFixed(4)})"><defs>${lock.defs}</defs>${lock.body}</g>

<!-- headline -->
${text('h1a', 72, 258, FG)}
${text('h1b', 72, 354, 'url(#flowText)')}
${text('sub', 72, 428, MUTED)}
${text('tag', 72, 472, SUBTLE)}

<!-- bounty card (glass L1) -->
<g filter="url(#shadow)"><rect x="${card.x}" y="${card.y}" width="${card.w}" height="${card.h}" rx="${card.r}" fill="#090F28" fill-opacity=".70"/></g>
<rect x="${card.x}" y="${card.y}" width="${card.w}" height="${card.h}" rx="${card.r}" fill="url(#sheen)"/>
<rect x="${card.x + .75}" y="${card.y + .75}" width="${card.w - 1.5}" height="${card.h - 1.5}" rx="${card.r - .75}" fill="none" stroke="url(#rim)" stroke-width="1.5"/>
<path d="M${card.x + 40} ${card.y + 1}H${card.x + card.w - 40}" stroke="#fff" stroke-opacity=".30" stroke-width="1" stroke-linecap="round"/>

${text('eyebrow', px, card.y + 58, SUBTLE)}
<rect x="${card.x + card.w - 36 - 98}" y="${card.y + 34}" width="98" height="34" rx="17" fill="${MINT}" fill-opacity=".16"/>
<circle cx="${card.x + card.w - 36 - 98 + 22}" cy="${card.y + 51}" r="4.5" fill="${MINT}"/>
${text('open', card.x + card.w - 36 - 98 + 38, card.y + 57, MINT)}

${text('cardTitle', px, card.y + 112, FG)}
${text('rate', px, card.y + 232, 'url(#money)')}
${text('per', px + 2, card.y + 270, MUTED)}
<path d="M${px} ${card.y + 298}H${card.x + card.w - 36}" stroke="#fff" stroke-opacity=".12"/>
<circle cx="${px + 6}" cy="${card.y + 331}" r="6" fill="#307DFD"/>
${text('plus', px + 24, card.y + 338, FG)}
<rect x="${px}" y="${card.y + 366}" width="${card.w - 72}" height="10" rx="5" fill="#fff" fill-opacity=".12"/>
<rect x="${px}" y="${card.y + 366}" width="${Math.round((card.w - 72) * 0.68)}" height="10" rx="5" fill="url(#bar)"/>
${text('pool', px, card.y + 408, SUBTLE)}
${text('days', card.x + card.w - 36 - TXT.days.width, card.y + 408, MUTED)}

<!-- floating glass pill (L2 on L1) -->
<g filter="url(#shadow)"><rect x="652" y="512" width="268" height="64" rx="32" fill="#0E1634" fill-opacity=".74"/></g>
<rect x="652" y="512" width="268" height="64" rx="32" fill="url(#sheen)"/>
<rect x="652.75" y="512.75" width="266.5" height="62.5" rx="31.25" fill="none" stroke="url(#rim)" stroke-width="1.5"/>
<circle cx="688" cy="544" r="17" fill="${MINT}"/>
<path d="M680.5 544.5l5.2 5.2 9-10.2" fill="none" stroke="#030921" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
${text('flow', 716, 551, FG)}
`;

file('og-image.svg', wrap({ w: W, h: H, title: 'flowd: Money follows what works.', desc: 'flowd social card: headline Money follows what works over a lagoon aurora, with a glass bounty card showing $2.40 per 1,000 views plus $1.50 per trial started.', defs, body }));
console.log('og-image.svg written');
