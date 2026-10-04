// Section markup for the brand board. Every colour comes from tokens.json (via CSS variables or resolved hex for fixed panels).
import { icon } from './icons.mjs';
import { medallion } from './tiers.mjs';
import { phone } from './phone.mjs';
import { stackedBars, lineChart, heatmap, diverging, seriesNames } from './charts.mjs';

const sec = (id, idx, over, title, lede, inner) => `
<section class="sec wrap" id="${id}">
  <header class="sec-head"><div class="idx">${idx}</div><div><div class="fd-overline over">${over}</div><h2>${title}</h2><p>${lede}</p></div></header>
  ${inner}
</section>`;
const sub = (h, note = '') => `<div class="sub-h"><h3>${h}</h3>${note ? `<span>${note}</span>` : ''}</div>`;
const card = (inner, cls = '') => `<div class="fd-glass card ${cls}">${inner}</div>`;

export function sections(ctx) {
  const { T, svg, contrastReport: CR, chartReport } = ctx;
  const { contrast, parseColor } = ctx.color;
  const P = T.color.primitive;
  const S = T.color.semantic;
  const minText = (theme, token) => Math.min(...CR.rows.filter((r) => r.theme === theme && r.group === 'text' && r.name === token).map((r) => r.ratio));
  const ratioVs = (fg, bg) => contrast({ ...parseColor(fg), a: 1 }, { ...parseColor(bg), a: 1 });

  /* ---------------- top bar ---------------- */
  const topbar = `
<div class="wrap topbar">
  <div class="fd-glass fd-glass-l2 topbar-in" data-interactive>
    <a class="logo" href="#top" aria-label="flowd brand board">${svg('flowd-lockup-on-dark.svg').replace('<svg ', '<svg class="lk-dark" ')}${svg('flowd-lockup-on-light.svg').replace('<svg ', '<svg class="lk-light" ')}</a>
    <nav aria-label="Sections"><a href="#logo">Logo</a><a href="#color">Colour</a><a href="#type">Type</a><a href="#glass">Glass</a><a href="#tiers">Tiers</a><a href="#data">Charts</a><a href="#app">App</a><a href="#motion">Motion</a><a href="#voice">Voice</a></nav>
    <div class="tog-row"><span>Reduce transparency</span><button class="tog" id="rt-toggle" role="switch" aria-checked="false" aria-label="Reduce transparency"></button></div>
    <div class="seg" role="group" aria-label="Theme"><button data-theme-btn="dark" aria-pressed="true">Dark</button><button data-theme-btn="light" aria-pressed="false">Light</button></div>
  </div>
</div>`;

  /* ---------------- hero ---------------- */
  const hero = `
<header class="wrap hero" id="top">
  <div>
    <div class="fd-overline over"><span class="tag">Brand board</span><span>Lagoon Glass · v${T.$meta.version} · ${T.$meta.updated}</span></div>
    <h1>Money follows <em>what works.</em></h1>
    <p class="lede">flowd is the open market for app creators. Brands fund bounties, creators compete, and a model prices, scores and checks every video, so the money flows to whatever actually drives views, installs and trials.</p>
    <div class="cta"><a class="btn btn-primary btn-lg" href="#glass">${icon('bounty')}Start a bounty</a><a class="btn btn-glass fd-glass fd-glass-l2 btn-lg" data-interactive href="#app">${icon('arrow')}See the app</a></div>
    <div class="meta"><div><b>8</b>colour ramps</div><div><b>3</b>glass layers</div><div><b>5</b>tiers</div><div><b>AA</b>on every glass surface</div></div>
  </div>
  <div class="hero-art" aria-hidden="true">
    <div class="disc"></div>
    <div class="big-mark">${svg('flowd-mark.svg')}</div>
    <div class="fd-glass wallet" data-interactive>
      <div class="fd-overline subtle" style="margin-bottom:10px">Cleared this week</div>
      <div class="fd-figure t-figure-xl" style="color:var(--fd-mint)">$240.00</div>
      <div class="muted" style="font:500 13px/1.45 var(--fd-font-text);margin-top:10px">+ $62.40 pending<br>Typical (median) creator: $212</div>
    </div>
    <div class="fd-glass fd-glass-l2 float-pill" data-interactive><span class="dot-ok">${icon('check')}</span><span style="font:650 15px/1.25 var(--fd-font-text)">Payout flowd<br><span class="muted" style="font-weight:500;font-size:13px">$62.40 cleared</span></span></div>
    <div class="fd-glass fd-glass-l2 float-drop"><span class="pill ember">${icon('bolt')}Daily Drop</span><span class="num" style="font:700 15px/1 var(--fd-font-display)">02:14:09</span></div>
  </div>
</header>`;

  /* ---------------- 01 logo ---------------- */
  const iconTile = (name, size, label) => `<figure><div class="icon-tile" style="width:${size}px;height:${size}px"><img src="${'data:image/svg+xml;base64,' + Buffer.from(ctx.svgInner(name)).toString('base64')}" width="${size}" height="${size}" alt="flowd app icon, ${label}"></div><figcaption>${label}</figcaption></figure>`;
  const dataUri = (name) => `data:image/svg+xml;base64,${Buffer.from(ctx.svgInner(name)).toString('base64')}`;
  const stage = (cls, name, cap, extra = '') => `<div class="stage ${cls}"${extra}><img src="${dataUri(name)}" alt="${cap}"><span class="cap">${cap}</span></div>`;
  const constr = `
<svg viewBox="0 0 660 330" role="img" aria-label="Mark construction: one ribbon of constant width">
  <defs><linearGradient id="cg" gradientUnits="userSpaceOnUse" x1="40" y1="300" x2="300" y2="30"><stop offset="0" stop-color="${P.ultraviolet['500']}"/><stop offset=".52" stop-color="${P.azure['500']}"/><stop offset="1" stop-color="${P.lagoon['500']}"/></linearGradient></defs>
  <g stroke="var(--fd-rim)" stroke-width="1" stroke-dasharray="3 5"><path d="M20 150H640M20 54H640M20 240H640M120 14V316M242 14V316"/></g>
  <g transform="translate(40 10) scale(1.1)" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M34 214C66 214 84 196 90 170 98 134 100 112 112 88 124 64 144 52 172 52H196" stroke="url(#cg)" stroke-width="38"/>
    <path d="M62 138H168" stroke="url(#cg)" stroke-width="32"/>
    <path d="M34 214C66 214 84 196 90 170 98 134 100 112 112 88 124 64 144 52 172 52H196" stroke="#fff" stroke-opacity=".75" stroke-width="1.2" stroke-dasharray="2 4"/>
  </g>
  <g font-size="12" font-weight="600" fill="var(--fd-fg-muted)">
    <g><line x1="330" y1="76" x2="296" y2="76" stroke="var(--fd-fg-subtle)"/><circle cx="296" cy="76" r="3" fill="var(--fd-fg)"/><text x="338" y="80">Hook: ribbon rolls over to horizontal</text></g>
    <g><line x1="330" y1="160" x2="262" y2="160" stroke="var(--fd-fg-subtle)"/><circle cx="262" cy="160" r="3" fill="var(--fd-fg)"/><text x="338" y="164">Crossbar: 32 on a 256 grid, straight</text></g>
    <g><line x1="330" y1="232" x2="150" y2="232" stroke="var(--fd-fg-subtle)"/><circle cx="150" cy="232" r="3" fill="var(--fd-fg)"/><text x="338" y="236">Stem: one S sweep, stroke 38</text></g>
    <g><line x1="330" y1="278" x2="80" y2="278" stroke="var(--fd-fg-subtle)"/><circle cx="80" cy="278" r="3" fill="var(--fd-fg)"/><text x="338" y="282">Foot: liquid tail enters from the left</text></g>
  </g>
</svg>`;
  const lockAspect = Number(ctx.svgInner('flowd-lockup-on-dark.svg').match(/width="([\d.]+)" height="([\d.]+)"/).slice(1).reduce((a, b) => a / b));
  const clear = `
<svg viewBox="0 0 520 250" role="img" aria-label="Clear space equals the height of the o in the wordmark">
  ${(() => { const H = 78, W = Math.round(H * lockAspect), X = Math.round(H * 70 / 124), cx = 260, cy = 118; const x0 = cx - W / 2, y0 = cy - H / 2;
    return `<rect x="${x0 - X}" y="${y0 - X}" width="${W + 2 * X}" height="${H + 2 * X}" rx="10" fill="var(--fd-accent-soft)" stroke="var(--fd-accent)" stroke-dasharray="5 5"/>
  <rect x="${x0}" y="${y0}" width="${W}" height="${H}" rx="4" fill="#030921"/>
  <image href="${dataUri('flowd-lockup-on-dark.svg')}" x="${x0}" y="${y0}" width="${W}" height="${H}" preserveAspectRatio="xMidYMid meet"/>
  <g stroke="var(--fd-accent)" stroke-width="1.5"><path d="M${x0 - X} ${cy}H${x0}M${x0 + W} ${cy}H${x0 + W + X}M${cx} ${y0 - X}V${y0}M${cx} ${y0 + H}V${y0 + H + X}"/></g>
  <g font-size="14" font-weight="700" fill="var(--fd-accent)" text-anchor="middle"><text x="${x0 - X / 2}" y="${cy - 8}">x</text><text x="${x0 + W + X / 2}" y="${cy - 8}">x</text><text x="${cx + 12}" y="${y0 - X / 2 + 5}">x</text><text x="${cx + 12}" y="${y0 + H + X / 2 + 5}">x</text></g>`; })()}
  <text x="260" y="232" text-anchor="middle" font-size="12.5" fill="var(--fd-fg-muted)">x = height of the "o" (the x-height of the wordmark)</text>
</svg>`;
  const misuse = [
    ['Don’t recolour the gradient', 'filter:hue-rotate(150deg) saturate(1.4)'],
    ['Don’t stretch or squash', 'transform:scaleX(1.35)'],
    ['Don’t add shadows or glows', 'filter:drop-shadow(0 10px 0 #FF4D6D)'],
    ['Don’t rotate or tilt', 'transform:rotate(-14deg)'],
    ['Don’t outline the wordmark', 'filter:contrast(1.0) drop-shadow(0 0 1px #fff) drop-shadow(0 0 1px #fff) drop-shadow(0 0 1px #fff);opacity:.9;mix-blend-mode:screen'],
    ['Don’t put it on low contrast', 'opacity:.55'],
  ];
  const logo = sec('logo', '01', 'Identity', 'A ribbon that becomes an f.',
    'One continuous ribbon enters from the lower left like water, sweeps up into the stem and rolls over into the hook. The wordmark is custom monoline lowercase, drawn as paths so no font is ever needed. Both are built from one stroke weight.',
    `
  <div class="grid g2">
    <div class="stage dark" style="min-height:420px"><img src="${dataUri('flowd-mark.svg')}" alt="flowd mark" style="width:260px;max-height:none"><span class="cap">flowd-mark.svg</span></div>
    <div class="stage light" style="min-height:420px"><img src="${dataUri('flowd-lockup-on-light.svg')}" alt="flowd horizontal lockup on light" style="width:78%"><span class="cap">flowd-lockup-on-light.svg</span></div>
  </div>
  <div class="grid g3" style="margin-top:20px">
    ${stage('dark', 'flowd-lockup-on-dark.svg', 'lockup · on dark')}
    ${stage('flow', 'flowd-lockup-mono-light.svg', 'lockup · mono light on Flow')}
    ${stage('white', 'flowd-lockup-mono-dark.svg', 'lockup · mono dark')}
  </div>
  <div class="grid g4" style="margin-top:20px">
    <div class="stage dark" style="min-height:300px"><img src="${dataUri('flowd-lockup-stacked-on-dark.svg')}" alt="stacked lockup" style="max-height:70%"><span class="cap">stacked · on dark</span></div>
    <div class="stage light" style="min-height:300px"><img src="${dataUri('flowd-wordmark-mono-dark.svg')}" alt="wordmark" style="max-width:70%"><span class="cap">wordmark · mono dark</span></div>
    <div class="stage ink" style="min-height:300px"><img src="${dataUri('flowd-mark-mono-light.svg')}" alt="mark in white" style="width:150px"><span class="cap">mark · mono light</span></div>
    <div class="stage flow" style="min-height:300px"><img src="${dataUri('flowd-mark-mono-light.svg')}" alt="mark in white on gradient" style="width:150px"><span class="cap">mark · on Flow gradient</span></div>
  </div>
  ${sub('App icon', 'Full-bleed, opaque, no pre-rounded corners. iOS applies its own mask (shown here at 22.4%).')}
  <div class="fd-glass card" style="padding:44px 28px">
    <div class="icon-row">
      ${iconTile('app-icon.svg', 168, 'light · default')}
      ${iconTile('app-icon-dark.svg', 168, 'dark')}
      ${iconTile('app-icon-tinted.svg', 168, 'tinted (mono)')}
      <figure><div class="icon-row" style="gap:16px;align-items:flex-end">${[88, 60, 40, 29].map((s) => `<div class="icon-tile" style="width:${s}px;height:${s}px"><img src="${dataUri('app-icon.svg')}" width="${s}" height="${s}" alt=""></div>`).join('')}</div><figcaption>180 · 120 · 80 · 58 pt</figcaption></figure>
      <figure><div class="icon-row" style="gap:14px;align-items:flex-end">${[64, 32, 16].map((s) => `<img src="${dataUri('favicon.svg')}" width="${s}" height="${s}" alt="">`).join('')}</div><figcaption>favicon 64 · 32 · 16</figcaption></figure>
    </div>
  </div>
  ${sub('Construction, clear space, minimum size')}
  <div class="grid g2">
    ${card(`<h4>Construction</h4>${constr}<p class="cap">256 grid. Ribbon stroke 38, crossbar 32, round caps and joins. The wordmark f is the same ribbon, condensed.</p>`)}
    ${card(`<h4>Clear space</h4>${clear}<p class="cap">Keep x clear on all four sides. Minimum sizes: lockup 96 px wide, wordmark 64 px wide, mark 16 px (favicon uses the tile with a heavier stroke).</p>`)}
  </div>
  ${sub('Misuse', 'Never alter the logo. Use the shipped files.')}
  <div class="grid g3">${misuse.map(([t, st]) => `<div class="misuse"><img src="${dataUri('flowd-lockup-on-dark.svg')}" alt="" style="${st}"><p>${t}</p></div>`).join('')}</div>`);

  /* ---------------- 02 colour ---------------- */
  const swatch = (theme, key, label) => {
    const bg = S[theme][key];
    const solid = parseColor(bg).a >= 0.99;
    const fg = S[theme].fg;
    return `<div class="sw" style="background:${bg};color:${fg}"><b>${label ?? key}</b><span>${solid ? bg : bg.replace(/\s+/g, '')}</span></div>`;
  };
  const palette = (theme) => {
    const s = S[theme];
    const bgc = s.bg;
    const L1 = CR.backdrops[theme].L1;
    const aurora = ctx.auroraBg?.[theme] ?? '';
    const textRow = ['fg', 'fg-muted', 'fg-subtle'].map((k) => `<div class="sw" style="background:${s.surface};color:${s[k]}"><b style="font-size:26px;font-family:var(--fd-font-display);letter-spacing:-.02em">Aa</b><span style="color:${s.fg}">${k}<br>${s[k]}<br>${ratioVs(s[k], bgc).toFixed(1)}:1 · min ${minText(theme, k).toFixed(1)}:1 on glass</span></div>`).join('');
    const sig = ['accent', 'mint', 'ember', 'sun', 'rose', 'info', 'violet'].map((h) => {
      const solidKey = `${h}-solid`;
      const hasSolid = h === 'accent' || true;
      return `<div class="sig" style="background:${s.surface};color:${s.fg}">
        <div class="name">${h === 'info' ? 'info / pending' : h === 'mint' ? 'mint · money up' : h === 'ember' ? 'ember · urgent' : h === 'sun' ? 'sun · elite' : h === 'rose' ? 'rose · danger' : h === 'violet' ? 'violet · Flo' : 'accent · flow'}</div>
        <div class="chips"><div class="solid" style="background:${s[solidKey]};color:${s[`on-${h}`]}">${s[solidKey]}</div></div>
        <div class="txt" style="color:${s[h]}">${h === 'mint' ? '+$62.40' : h === 'rose' ? '−$12.00' : h === 'ember' ? '02:14:09' : h === 'sun' ? 'Elite' : h === 'info' ? '$186.20' : h === 'violet' ? 'Flo' : 'Open'}</div>
        <div class="num" style="font:600 11px/1.5 var(--fd-font-mono);opacity:.85">text ${s[h]}<br>AA ${minText(theme, h).toFixed(1)}:1 min</div>
        <div class="pill" style="background:${s[`${h}-soft`]};color:${s[h]};justify-self:start">${h}-soft</div></div>`;
    }).join('');
    return `<div class="pal" style="background:${bgc};color:${s.fg};box-shadow:inset 0 0 0 1px ${s.rim}">
      <h4>${theme === 'dark' ? 'Dark (default)' : 'Light'}<span class="tag" style="background:${s['surface-field']};color:${s['fg-muted']}">glass worst case ${L1}</span></h4>
      <div class="lbl">Backgrounds and surfaces</div>
      <div class="row">${['bg', 'bg-elevated', 'surface', 'surface-raised'].map((k) => `<div class="sw" style="background:${s[k]};color:${s.fg}"><b>${k}</b><span>${s[k]}</span></div>`).join('')}</div>
      <div class="lbl">Text (AA verified on bg, surface and every glass layer)</div>
      <div class="row" style="grid-template-columns:repeat(3,1fr)">${textRow}</div>
      <div class="lbl">Signals: solid fill + readable text + soft pill</div>
      <div class="sigrow" style="grid-template-columns:repeat(4,1fr)">${sig}</div>
    </div>`;
  };
  const rampOrder = ['abyss', 'ultraviolet', 'azure', 'lagoon', 'mint', 'ember', 'sun', 'rose'];
  const rampMeta = { abyss: 'ink-navy neutrals', ultraviolet: 'Flo, gradient start', azure: 'interactive', lagoon: 'pending, info, gradient end', mint: 'money', ember: 'urgency', sun: 'Elite, featured', rose: 'danger' };
  const ramps = rampOrder.map((h) => `<div class="ramp"><b>${h}<i>${rampMeta[h]}</i></b><div class="steps">${Object.entries(P[h]).map(([k, hex]) => {
    const dark = contrast({ ...parseColor(hex), a: 1 }, { r: 255, g: 255, b: 255, a: 1 }) > contrast({ ...parseColor(hex), a: 1 }, { r: 3, g: 9, b: 33, a: 1 });
    return `<div style="background:${hex};color:${dark ? '#fff' : '#030921'}">${k}</div>`;
  }).join('')}</div></div>`).join('');
  const grads = [
    ['flow', 'Flow · signature', T.gradient.flow.note, '#030921'],
    ['flowButton', 'Flow button', 'White text clears AA at both ends', '#fff'],
    ['money', 'Money', 'Earnings glow, payout moments', '#030921'],
    ['ember', 'Ember', 'Daily Drop, urgent CTAs', '#030921'],
    ['sun', 'Sun', 'Featured, Elite accents', '#030921'],
    ['flo', 'Flo', 'The AI copilot, always violet', '#fff'],
  ].map(([k, t, n, c]) => `<div class="grad" style="background:var(--fd-gradient-${k});color:${c}"><b>${t}</b><span>${n}</span></div>`).join('');
  const orbPos = (o) => `${o.x < 50 ? `left:${Math.max(o.x + 2, 3)}%` : `right:${Math.max(100 - o.x + 2, 3)}%`};${o.y < 50 ? `top:${Math.max(o.y + 8, 8)}%` : `bottom:${Math.max(100 - o.y + 8, 8)}%`}`;
  const orbs = (theme) => T.aurora[theme].orbs.map((o) => `<div class="lab" style="${orbPos(o)}">${o.id} ${Math.round(o.stops[0][1] * 100)}%</div>`).join('');
  const color = sec('color', '02', 'Colour', 'Luminous darks, living light.',
    'Abyss ink-navy backgrounds, a signature Flow gradient from ultraviolet through azure to lagoon, and four reserved signals: mint for money, ember for urgency, sun for Elite, rose for danger. Every text colour is measured on the actual glass over the brightest (or darkest) pixel of the aurora.',
    `<div class="grid g2">${palette('dark')}${palette('light')}</div>
  ${sub('Primitive ramps', 'OKLCH-derived, constant hue, chroma scaled to each hue’s own gamut. 500 is the signature. Components use semantic tokens, never primitives.')}
  <div class="fd-glass card ramps" style="padding:28px">${ramps}</div>
  ${sub('Gradients and aurora')}
  <div class="grads">${grads}</div>
  <div class="grid g2" style="margin-top:20px">
    <div><div class="orbdemo" style="background-color:${S.dark.bg}"><div class="bgl" style="background:${ctx.auroraDark}"></div>${orbs('dark')}</div><p class="cap" style="font:400 13px/1.5 var(--fd-font-text);color:var(--fd-fg-subtle);margin-top:10px">Dark aurora: violet top-left, azure top-right, lagoon bottom-right, a rose ghost bottom-left. Orb radius is a fraction of the longer screen side.</p></div>
    <div><div class="orbdemo" style="background-color:${S.light.bg}"><div class="bgl" style="background:${ctx.auroraLight}"></div>${orbs('light')}</div><p class="cap" style="font:400 13px/1.5 var(--fd-font-text);color:var(--fd-fg-subtle);margin-top:10px">Light aurora: the same four orbs as pastels over pearl. Light-mode text is measured on the darkest pixel of this field.</p></div>
  </div>`);

  /* ---------------- 03 type ---------------- */
  const scaleRows = Object.entries(T.typography.scale).map(([n, s]) => {
    const sample = s.family === 'mono' ? 'bnty_8f2c · app.flowd.link/nap-nest'
      : n.startsWith('figure') ? '$1,284.50'
      : n === 'overline' ? 'Pending to cleared'
      : n.startsWith('display') ? 'Money follows what works.'
      : n.startsWith('title') ? 'Wind-down routine hook'
      : n === 'button' ? 'Start a bounty'
      : n === 'micro' ? 'Checklist score. Gets smarter as bounties settle.'
      : n === 'caption' ? 'Paid out Fridays. Instant cash-out for a small fee.'
      : 'Brands fund bounties. Creators compete. Results get paid, in plain English.';
    return `<div class="r"><div class="meta"><b>${n}</b>${s.size}px / ${s.lineHeight} · ${s.tracking >= 0 ? '+' : ''}${s.tracking}em · ${s.weight}${s.tabular ? ' · tnum' : ''}</div><div class="s t-${n}" style="${n.startsWith('display') && s.size > 60 ? 'font-size:' + Math.min(s.size, 64) + 'px' : ''}">${sample}</div></div>`;
  }).join('');
  const type = sec('type', '03', 'Typography', 'Big, confident, tabular.',
    'Bricolage Grotesque gives headlines a friendly, slightly quirky voice that survives at 96 px. Geist is the quiet workhorse for everything you read. Numbers are heroes: every figure is tabular so counts and money can animate without jitter.',
    `<div class="grid g2" style="grid-template-columns:1.4fr 1fr">
    <div class="fd-glass spec-hero"><div class="fd-overline subtle" style="margin-bottom:22px">Display · Bricolage Grotesque Variable · 800 · opsz auto</div><div class="big">Money follows <em>what works.</em></div></div>
    <div class="fd-glass card"><div class="fd-overline subtle" style="margin-bottom:12px">Weights in use</div><div class="glyphs"><div class="aa">Aa</div><div class="muted" style="font:500 13px/1.5 var(--fd-font-mono)">opsz 12–96<br>wght 200–800<br>tnum · pnum · frac</div></div>
      <div class="weights"><div style="font-weight:800">Heavy 800<span>hero, figures</span></div><div style="font-weight:700">Bold 700<span>H2, card titles</span></div><div style="font-weight:600">Semibold 600<span>small titles</span></div></div></div>
  </div>
  <div class="grid g3" style="margin-top:20px">
    <div class="fd-glass card"><div class="fd-overline subtle" style="margin-bottom:12px">Text · Geist Variable</div><p style="font:400 18px/1.55 var(--fd-font-text);text-wrap:pretty">Paid in minutes, not months. Every bounty is escrowed before it goes live, so creators know the money is real.</p><p class="cap" style="font:500 12px/1.5 var(--fd-font-mono);color:var(--fd-fg-subtle);margin-top:14px">wght 100–900 · tnum · case · ss01–ss11</p></div>
    <div class="fd-glass card"><div class="fd-overline subtle" style="margin-bottom:12px">Figures · tabular numerals</div><table class="ledger"><tbody><tr><td>Cleared</td><td class="t-figure-sm" style="color:var(--fd-mint)">$1,098.30</td></tr><tr><td>Pending</td><td class="t-figure-sm" style="color:var(--fd-info)">$186.20</td></tr><tr><td>Next payout</td><td class="t-figure-sm">$1,111.11</td></tr></tbody></table></div>
    <div class="fd-glass card"><div class="fd-overline subtle" style="margin-bottom:12px">Mono · Geist Mono Variable</div><div class="mono" style="font-size:13px;line-height:1.7;color:var(--fd-fg-muted)">bnty_8f2c1a<br>sub_00419 · cleared<br>flowd.link/nap-nest?c=maya<br><span style="color:var(--fd-fg)">cpm_cents: 240</span></div></div>
  </div>
  ${sub('Scale', 'Web sizes (px / unitless line-height / tracking / weight). Display sizes are fluid. Tracking tightens as size grows. 16 px minimum on mobile inputs.')}
  <div class="fd-glass card"><div class="scale">${scaleRows}</div></div>
  ${sub('iOS', 'SF Pro Rounded for display and every number, SF Pro for text, SF Mono for code. Dynamic Type via ScaledMetric.')}
  <div class="grid g3">${Object.entries(T.typography.ios.scale).filter(([n]) => ['hero', 'largeTitle', 'title1', 'headline', 'body', 'figureHero'].includes(n)).map(([n, s]) => `<div class="fd-glass card"><div class="fd-overline subtle">${n}</div><div style="font-family:ui-rounded,'SF Pro Rounded',var(--fd-font-display);font-size:${Math.min(s.size, 44)}px;font-weight:${s.weight === 'heavy' ? 800 : s.weight === 'bold' ? 700 : s.weight === 'semibold' ? 600 : 400};letter-spacing:${(s.trackingPt / s.size).toFixed(3)}em;margin-top:10px" class="num">${n.startsWith('figure') ? '$1,284' : n === 'body' || n === 'headline' || n === 'caption1' ? 'Hook Score 82' : 'Wallet'}</div><div class="cap">${s.size}pt · ${s.weight} · ${s.design} · ${s.textStyle}</div></div>`).join('')}</div>`);

  /* ---------------- 04 glass ---------------- */
  const g = T.glass;
  const glassSec = sec('glass', '04', 'Liquid Glass', 'Glass is a material, not decoration.',
    'Three layers over a living aurora. L1 holds content, L2 floats controls, L3 is for sheets. Never more than two stacked. Every layer has blur, a legibility tint, a specular rim, a highlight and a soft coloured shadow. Flip the theme or reduce transparency in the top bar to see the fallbacks.',
    `<div class="glass-stage">
    <div class="layers">
      <div style="position:relative;padding-bottom:30px">
        <div class="fd-glass l1demo" data-interactive>
          <div class="fd-overline subtle">L1 · content surface</div>
          <h4>Wind-down routine hook</h4>
          <p class="muted" style="font:400 15px/1.5 var(--fd-font-text);margin-top:10px;max-width:40ch">Rate $2.40 per 1,000 views plus $1.50 per trial started. 68% of the pool is left and 6 days remain.</p>
          <div style="display:flex;align-items:center;gap:18px;margin-top:26px"><div class="ring" style="--p:68"><b class="num">68%</b></div><div><div class="fd-figure t-figure-lg" style="color:var(--fd-mint)">$2.40</div><div class="subtle" style="font:500 13px/1.4 var(--fd-font-text)">per 1,000 views</div></div></div>
          <div class="fd-glass fd-glass-l2 l2demo" data-interactive><span class="dot-ok">${icon('check')}</span><div style="flex:1"><div style="font:650 14px/1.2 var(--fd-font-text)">L2 · floating control</div><div class="muted" style="font:400 12.5px/1.3 var(--fd-font-text)">Checklist score: A. Gets smarter as bounties settle.</div></div><a class="btn btn-primary btn-sm" href="#glass">Apply</a></div>
        </div>
      </div>
      <div class="fd-glass fd-glass-l3 l3demo" data-interactive>
        <div class="fd-overline subtle">L3 · sheet (thick)</div>
        <h4 style="font:700 24px/1.15 var(--fd-font-display);letter-spacing:-.015em;margin-top:8px">Fund this bounty</h4>
        <div class="field" style="margin-top:20px"><label for="amt">Pool budget</label><div class="in"><span class="pre">$</span><input id="amt" value="5,000" inputmode="decimal"></div><div class="hint">Escrowed before the bounty goes live.</div></div>
        <div style="display:flex;gap:10px;margin-top:20px"><button class="btn btn-ghost" style="flex:1">Cancel</button><button class="btn btn-primary" style="flex:1">Fund $5,000</button></div>
      </div>
    </div>
  </div>
  <div class="grid g2" style="margin-top:20px;grid-template-columns:1.1fr 0.9fr">
    ${card(`<h4>Anatomy of a glass surface</h4><ol class="anat" style="margin:18px 0 0;padding:0">
      <li><i>1</i><div><b>Backdrop</b>blur ${g.dark.L1.blur}px (L1) · ${g.dark.L2.blur}px (L2) · ${g.dark.L3.blur}px (L3) with saturate ${Math.round(g.dark.L1.saturate * 100)}% / ${Math.round(g.dark.L2.saturate * 100)}% / ${Math.round(g.dark.L3.saturate * 100)}%.</div></li>
      <li><i>2</i><div><b>Tint = the legibility scrim</b>Fill alpha does the contrast work, never less blur. Over media, switch to the heavier fill-over-media value.</div></li>
      <li><i>3</i><div><b>Sheen</b>135° white gradient, brightest top-left, so every surface catches the same light.</div></li>
      <li><i>4</i><div><b>Specular rim</b>1px masked gradient border: bright top-left, dim bottom-right. Pointer sheen follows the cursor (240px).</div></li>
      <li><i>5</i><div><b>Highlight + lowlight + edge</b>Inset 1px top highlight, inset bottom shade, 1px outer edge. Then a soft, slightly coloured elevation shadow.</div></li></ol>`)}
    ${card(`<h4>Fallbacks are part of the material</h4><div class="grid" style="gap:12px;margin-top:16px">
      <div class="fd-glass fd-glass-l2" style="padding:14px 18px;--fd-glass-radius:18px"><b style="font:650 14px/1.2 var(--fd-font-text)">Reduced transparency</b><div class="muted" style="font:400 13px/1.4 var(--fd-font-text);margin-top:4px">Opaque tinted solids, no blur, no sheen.</div></div>
      <div class="fd-glass fd-glass-l2" style="padding:14px 18px;--fd-glass-radius:18px"><b style="font:650 14px/1.2 var(--fd-font-text)">Reduced motion</b><div class="muted" style="font:400 13px/1.4 var(--fd-font-text);margin-top:4px">Aurora stops drifting, sheen and springs go static.</div></div>
      <div class="fd-glass fd-glass-l2" style="padding:14px 18px;--fd-glass-radius:18px"><b style="font:650 14px/1.2 var(--fd-font-text)">Increased contrast</b><div class="muted" style="font:400 13px/1.4 var(--fd-font-text);margin-top:4px">Rims become solid strong lines.</div></div></div>`)}
  </div>
  ${sub('Components', 'Every control is 44 px or taller, scales to 0.96 on press and shows a focus ring.')}
  <div class="pgrid">
    ${card(`<h4>Buttons</h4><div class="btnrow"><button class="btn btn-primary">${icon('bounty')}Start a bounty</button><button class="btn btn-ember">${icon('bolt')}Claim drop</button><button class="btn btn-mint">Cash out</button></div><div class="btnrow"><button class="btn btn-glass fd-glass fd-glass-l2" data-interactive>Save for later</button><button class="btn btn-ghost">Maybe later</button><button class="btn btn-danger">Remove post</button></div><div class="btnrow"><button class="btn btn-primary btn-sm">Small</button><button class="btn btn-ghost btn-sm">Small</button><button class="btn" disabled>Disabled</button></div>`)}
    ${card(`<h4>Pills and status</h4><div class="tchips" style="display:flex;flex-wrap:wrap;gap:8px"><span class="pill mint">${icon('check')}Cleared</span><span class="pill info">${icon('clock')}Pending</span><span class="pill ember">${icon('bolt')}Daily Drop</span><span class="pill sun">${icon('spark')}Featured</span><span class="pill rose">Rejected</span><span class="pill violet">${icon('spark')}Flo</span><span class="pill accent">Open</span></div><div class="fd-glass fd-glass-l2" style="padding:12px 16px;display:flex;align-items:center;gap:12px;--fd-glass-radius:18px"><span class="pill mint">+$62.40</span><span class="muted" style="font:400 13px/1.3 var(--fd-font-text)">cleared 3 min ago</span></div><div class="muted" style="font:400 13px/1.5 var(--fd-font-text)">Pending money is lagoon with a clock. Cleared money is mint with a check. Colour is never the only cue.</div>`)}
    ${card(`<h4>Inputs</h4><div class="field"><label for="f1">Hook line</label><div class="in">${icon('spark')}<input id="f1" placeholder="Stop scrolling if you sleep badly"></div></div><div class="field"><label for="f2">Search bounties</label><div class="in">${icon('search')}<input id="f2" placeholder="Search apps, hooks, rates"><kbd>⌘K</kbd></div></div><div class="field"><label for="f3">Rate card (per video)</label><div class="in"><span class="pre">$</span><input id="f3" value="180"></div><div class="hint">Minimum CPM $1.20</div></div>`)}
    ${card(`<h4>Tab bar (L2)</h4><nav class="fd-glass fd-glass-l2 tabbar" data-interactive aria-label="Demo tab bar"><button aria-current="page">${icon('home')}Home</button><button>${icon('bounty')}Bounties</button><button>${icon('studio')}Studio</button><button>${icon('wallet')}Wallet</button><button>${icon('user')}You</button></nav><p class="cap">The active tab is a flat tint, not a third glass layer.</p>`)}
    ${card(`<h4>Toast</h4><div class="fd-glass fd-glass-l2 toast" data-interactive><span class="dot-ok">${icon('check')}</span><div><b>Payout flowd</b><span>$62.40 cleared to your Wallet.</span></div></div><div class="fd-glass fd-glass-l2 toast" data-interactive><span class="dot-bad">!</span><div><b>Hook too slow</b><span>Your first 3 seconds scored C. Try a sharper open.</span></div></div>`)}
    ${card(`<h4>Loading</h4><div class="sk"><div class="fd-skeleton"></div><div class="fd-skeleton"></div><div class="fd-skeleton"></div></div><p class="cap">Skeletons shimmer like glass catching light, and stop under reduced motion.</p>`)}
  </div>`);

  /* ---------------- 05 tiers ---------------- */
  const tierNames = ['bronze', 'silver', 'gold', 'platinum', 'elite'];
  const perks = {
    bronze: 'Open bounties and weekly payouts. Everyone starts here.',
    silver: 'Rate card unlocked. Faster review.',
    gold: 'Higher-paying bounties are shown to you first.',
    platinum: 'Auction slots and faster payouts.',
    elite: 'Priority everything, a public badge for your bio.',
  };
  const tiers = sec('tiers', '05', 'Status', 'Earned on results, worn with pride.',
    'Tiers run Bronze to Elite. Each badge is a medallion with one to four chevrons, so rank reads without colour. Elite is the only dark medallion, with a prismatic ring, so it never gets mistaken for Gold.',
    `<div class="tiers">${tierNames.map((id) => `<div class="fd-glass tier" data-interactive>${medallion(id, T.tier[id])}<h4>${T.tier[id].label}</h4><p>${perks[id]}</p></div>`).join('')}</div>
  ${sub('In context', 'Tier chips for profiles, leaderboards and bios.')}
  <div class="fd-glass card"><div class="tchips">${tierNames.map((id) => `<span class="tchip" style="background:var(--fd-tier-${id});color:var(--fd-tier-${id}-ink);--g:var(--fd-tier-${id}-glow)"><i>${icon('arrow').replace('M7 17 17 7M8.5 7H17v8.5', 'M6 15l6-6 6 6')}</i>${T.tier[id].label}</span>`).join('')}</div></div>`);

  /* ---------------- 06 data ---------------- */
  const chk = (r) => r.checks.find((c) => c.name === 'CVD separation').detail.match(/dE ([\d.]+)/)?.[1];
  const nor = (r) => r.checks.find((c) => c.name === 'Normal-vision floor').detail.match(/dE ([\d.]+)/)?.[1];
  const lightRep = chartReport.find((r) => r.set.startsWith('categorical (light, adjacent'));
  const darkRep = chartReport.find((r) => r.set.startsWith('categorical (dark, adjacent'));
  const legend = seriesNames.map((n, i) => `<span><i style="background:var(--fd-chart-${i + 1})"></i>${n}</span>`).join('');
  const data = sec('data', '06', 'Data', 'Charts that read at a glance.',
    'Eight categorical hues in a fixed, colour-blind-safe order, one-hue ramps for magnitude, azure-to-ember for polarity. Marks are thin, gaps are 2 px, grids recede, and the last point is labelled directly. Palettes are checked by the dataviz validator inside the token build.',
    `<div class="grid g2">
    ${card(`<h4>Payout by hook type</h4><div class="cap" style="margin:4px 0 10px">Stacked columns · 8 categorical slots, never cycled</div>${stackedBars()}<div class="legend">${legend}</div>`, 'chartcard')}
    ${card(`<h4>Reach, installs and trials</h4><div class="cap" style="margin:4px 0 10px">Indexed to week 1 = 100, one shared axis (no dual axes)</div>${lineChart()}`, 'chartcard')}
    ${card(`<h4>When views land</h4><div class="cap" style="margin:4px 0 10px">One-hue sequential ramp, lightest = fewest</div>${heatmap()}<div class="legend" style="align-items:center"><span>Fewer</span>${[1, 2, 3, 4, 5, 6, 7].map((i) => `<i style="background:var(--fd-chart-seq-${i});width:26px;height:10px;border-radius:3px"></i>`).join('')}<span>More</span></div>`, 'chartcard')}
    ${card(`<h4>Trial rate vs category median</h4><div class="cap" style="margin:4px 0 10px">Diverging: azure below, ember above, neutral midpoint</div>${diverging()}`, 'chartcard')}
  </div>
  <div class="grid g2" style="margin-top:20px">
    ${card(`<h4>Validation</h4><div class="vcheck">
      <div><span>Light · 8 slots, adjacent pairs</span><b>CVD ΔE ${chk(lightRep)} · normal ${nor(lightRep)}</b></div>
      <div><span>Dark · 8 slots, adjacent pairs</span><b>CVD ΔE ${chk(darkRep)} · normal ${nor(darkRep)}</b></div>
      <div><span>Scatter, bubble, map, small multiples</span><b>first 3 slots (all-pairs pass)</b></div>
      <div><span>Targets</span><b>CVD ≥ 8 · normal ≥ 15</b></div></div>`)}
    ${card(`<h4>Status is reserved</h4><div class="tchips" style="display:flex;flex-wrap:wrap;gap:10px;margin-top:14px"><span class="pill" style="background:var(--fd-mint-soft);color:var(--fd-mint)">${icon('check')}Good</span><span class="pill" style="background:var(--fd-sun-soft);color:var(--fd-sun)">${icon('clock')}Warning</span><span class="pill" style="background:var(--fd-ember-soft);color:var(--fd-ember)">${icon('bolt')}Serious</span><span class="pill" style="background:var(--fd-rose-soft);color:var(--fd-rose)">Critical</span></div><p class="cap" style="margin-top:14px">Status colours always carry an icon and a label, and are never reused as a series colour.</p>`)}
  </div>`);

  /* ---------------- 07 app ---------------- */
  const app = sec('app', '07', 'Creator app', 'The north star, in your pocket.',
    'The native iOS app is the same material on every screen: aurora behind, content on L1, floating controls on L2, wallet numbers as heroes. Pending and cleared are always distinct, and a typical (median) payout always sits next to the headline number.',
    `<div class="phones"><div class="phone-wrap">${phone(T, 'dark')}<span>iPhone · dark</span></div><div class="phone-wrap">${phone(T, 'light')}<span>iPhone · light</span></div></div>`);

  /* ---------------- 08 motion ---------------- */
  const springDefs = Object.entries(T.motion.spring);
  const curve = (spec) => {
    const k = spec.stiffness, c = spec.damping, m = spec.mass;
    const w0 = Math.sqrt(k / m), z = c / (2 * Math.sqrt(k * m)), wd = z < 1 ? w0 * Math.sqrt(1 - z * z) : 0;
    const x = (t) => (z < 1 ? 1 - Math.exp(-z * w0 * t) * (Math.cos(wd * t) + ((z * w0) / wd) * Math.sin(wd * t)) : 1 - Math.exp(-w0 * t) * (1 + w0 * t));
    const T0 = 0.9, pts = [];
    for (let i = 0; i <= 60; i++) { const t = (i / 60) * T0; pts.push(`${(i / 60) * 300} ${50 - x(t) * 36}`); }
    return `<svg viewBox="0 0 300 60" preserveAspectRatio="none" aria-hidden="true"><line x1="0" x2="300" y1="14" y2="14" stroke="var(--fd-chart-grid)" stroke-dasharray="3 4"/><polyline points="${pts.join(' ')}" fill="none" stroke="var(--fd-accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  };
  const motion = sec('motion', '08', 'Motion', 'Springs that start from where you are.',
    'State changes use springs; micro-interactions use 150–250 ms ease-out. Everything is interruptible, lists stagger at most 40 ms per item, and reduced motion swaps movement for fades. Click a card to run its spring.',
    `<div class="springs">${springDefs.map(([k, s]) => `<button class="fd-glass spring" data-spring="${k}" data-interactive><h4>${k}<span>k ${s.stiffness} · c ${s.damping}</span></h4><div class="track"><div class="ball"></div></div>${curve(s)}<p>${s.use}</p></button>`).join('')}</div>
  ${sub('Easing and durations')}
  <div class="grid g2">
    ${card(`<h4>Durations</h4><table class="ledger"><tbody>${Object.entries(T.motion.duration).map(([k, v]) => `<tr><td>${k}</td><td class="mono">${v} ms</td></tr>`).join('')}<tr><td>stagger</td><td class="mono">≤ ${T.motion.stagger} ms / item</td></tr></tbody></table>`)}
    ${card(`<h4>Curves</h4><table class="ledger"><tbody>${Object.entries(T.motion.easing).map(([k, v]) => `<tr><td>${k}</td><td class="mono">cubic-bezier(${v.join(', ')})</td></tr>`).join('')}</tbody></table>`)}
  </div>`);

  /* ---------------- 09 voice ---------------- */
  const voice = sec('voice', '09', 'Voice', 'Plain English. Numbers over adjectives.',
    'Confident, clear, a little playful. Short sentences. Show the number, not the hype. Earnings are always shown with the typical (median) beside any top example, and the first-pass scores say they are checklist scores.',
    `<div class="voice">
    ${card(`<h4>Push notifications</h4><div class="fd-glass fd-glass-l2 push"><div class="app">${svg('app-icon-rounded.svg').replace('width="1024" height="1024"', 'width="38" height="38"')}</div><div><b>Payout flowd</b><span>$62.40 cleared to your Wallet. Nice hook on Nap Nest.</span></div></div><div class="fd-glass fd-glass-l2 push"><div class="app">${svg('app-icon-rounded.svg').replace('width="1024" height="1024"', 'width="38" height="38"')}</div><div><b>Daily Drop is live</b><span>6 new bounties. First come, first filled. Closes in 2h.</span></div></div>`)}
    ${card(`<h4>Empty state</h4><div class="empty"><div class="art">${icon('film')}</div><h4>No posts yet</h4><p>Record your first video in Studio. Hook Score checks the first 3 seconds before you post.</p><a class="btn btn-primary btn-sm" href="#voice">Open Studio</a></div>`)}
    ${card(`<h4>Do and don’t</h4><div class="dd"><div class="do"><b>Do</b>$2.40 per 1,000 views, plus $1.50 per trial.</div><div class="dont"><b>Don’t</b>Earn insane money with this one trick!</div><div class="do"><b>Do</b>Checklist score: B. Gets smarter as bounties settle.</div><div class="dont"><b>Don’t</b>AI predicts your video will go viral.</div></div>`)}
  </div>`);

  const foot = `
<footer class="wrap foot">
  <div><h5>flowd</h5>Lagoon Glass design system. Pronounced "flowed". Always lowercase. Fictional apps and creators only; no real logos, people or photos.</div>
  <div><h5>Source of truth</h5><code>packages/tokens/tokens.json</code><br><code>npm run build</code> in packages/tokens verifies contrast, then writes CSS, Tailwind v4, SwiftUI and TypeScript.</div>
  <div><h5>Files</h5><code>brand/BRAND.md</code><br><code>brand/logo/*.svg + PNG</code><br><code>packages/tokens/dist/*</code></div>
</footer>`;

  return `${topbar}\n<main>${hero}${logo}${color}${type}${glassSec}${tiers}${data}${app}${motion}${voice}</main>${foot}`;
}
