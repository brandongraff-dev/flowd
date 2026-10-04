// A phone mock of the creator app Home screen, built from tokens (explicit per-theme variables so both phones can show at once).
import { auroraCss } from '../../../packages/tokens/lib/emit-css.mjs';
import { icon } from './icons.mjs';

const THUMBS = [
  { bg: 'linear-gradient(150deg,#7A4DFF,#2F7BFF 55%,#19D3E6)', t: 'POV:<br>3am' },
  { bg: 'linear-gradient(150deg,#FF8A3D,#FF4D8D 60%,#8B5CFF)', t: 'learn<br>fast' },
  { bg: 'linear-gradient(150deg,#18DF9B,#17D2E7 60%,#307DFD)', t: 'bake<br>club' },
];

export function phone(T, theme) {
  const s = T.color.semantic[theme];
  const g = T.glass[theme];
  const vars = {
    '--s-bg': s.bg, '--s-fg': s.fg, '--s-muted': s['fg-muted'],
    '--s-glass': g.L1.fill, '--s-glass2': g.L2.fill, '--s-hi': g.L1.highlight, '--s-rim': theme === 'dark' ? 'rgba(255,255,255,.16)' : 'rgba(255,255,255,.9)',
    '--s-rim2': theme === 'dark' ? 'rgba(255,255,255,.26)' : 'rgba(255,255,255,1)', '--s-field': s['surface-field'], '--s-active': s['surface-active'],
    '--s-mint': s.mint, '--s-info': s.info, '--s-ember': s.ember, '--s-ember-soft': s['ember-soft'],
    '--s-shadow': theme === 'dark' ? 'rgba(1,4,20,.75)' : 'rgba(22,38,96,.32)',
    '--s-aurora': `${auroraCss(T.aurora[theme], 720)}`,
  };
  const style = Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(';');
  const rows = [
    ['Nap Nest', 'Sleep sounds · iOS', '$2.40', '+ $1.50 trial'],
    ['Fernlingo', 'Language · iOS', '$3.10', 'Hook challenge'],
  ];
  const sb = `<div class="sb"><span>9:41</span><i><svg viewBox="0 0 18 11" fill="currentColor"><rect x="0" y="7" width="3" height="4" rx="1"/><rect x="5" y="4.5" width="3" height="6.5" rx="1"/><rect x="10" y="2" width="3" height="9" rx="1"/><rect x="15" y="0" width="3" height="11" rx="1"/></svg><svg viewBox="0 0 26 12" fill="none" stroke="currentColor"><rect x=".5" y=".5" width="22" height="11" rx="3.5" opacity=".5"/><rect x="2" y="2" width="16" height="8" rx="2" fill="currentColor" stroke="none"/><rect x="24" y="4" width="1.6" height="4" rx=".8" fill="currentColor" stroke="none" opacity=".5"/></svg></i></div>`;
  return `<div class="phone"><div class="screen" style="${style}"><div class="island"></div>${sb}
<div class="body">
  <div class="hello"><div><small>Good morning</small><h5>Maya</h5></div><div class="av" aria-hidden="true">M</div></div>
  <div class="sg wal">
    <div class="lbl"><span>Wallet</span><span>Demo data</span></div>
    <div class="amt">$1,098<small>.30</small></div>
    <div class="split"><div>Cleared<b>$1,098.30</b></div><div class="pend">Pending<b>$186.20</b></div></div>
    <div class="med">Typical creator, last 30 days: $212 (median)</div>
  </div>
  <div class="sg drop"><div class="ic">${icon('bolt')}</div><div><b>Daily Drop</b><span>6 new bounties land at 2 PM</span></div><div class="cd">02:14:09</div></div>
  <div class="rows">
    ${rows.map(([n, sub, rate, tag], i) => `<div class="sg brow"><div class="thumb" style="background:${THUMBS[i].bg}"><b>${THUMBS[i].t}</b></div><div class="tt"><b>${n}</b><span>${sub}</span><span>${tag}</span></div><div class="rt">${rate}<small>per 1K views</small></div></div>`).join('')}
  </div>
</div>
<div class="stabbar"><div aria-current="page">${icon('home')}Home</div><div>${icon('bounty')}Bounties</div><div>${icon('studio')}Studio</div><div>${icon('wallet')}Wallet</div><div>${icon('user')}You</div></div>
<div class="homebar"></div>
</div></div>`;
}
