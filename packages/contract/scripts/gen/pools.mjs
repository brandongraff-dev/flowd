// Believable FICTIONAL pools for the fixture generators. No real people, brands or apps are intended: names are recombined,
// handles are invented, apps are made up (any resemblance to a real product is coincidence; `isBlockedName` guards the obvious cases).
// This module has no imports; lib.mjs and the generators pull from it. Text pools live in pools-text.mjs and pools-content.mjs
// and are re-exported at the bottom.

// ── people ──────────────────────────────────────────────────────────────────────────────────────
export const FIRST_NAMES = [
  // English / Irish
  'Ava', 'Liam', 'Noah', 'Emma', 'Olivia', 'Ethan', 'Mason', 'Chloe', 'Grace', 'Owen', 'Caleb', 'Hannah', 'Nora', 'Finn', 'Aiden', 'Cora', 'Declan', 'Maeve', 'Rory', 'Siobhan',
  'Tessa', 'Wyatt', 'Ruby', 'Piper', 'Jude', 'Harper', 'Elliot', 'Millie', 'Hugo', 'Imogen', 'Callum', 'Freddie', 'Bridget', 'Colm', 'Niamh', 'Cillian', 'Aoife', 'Tadhg', 'Orla', 'Brendan',
  // Hispanic
  'Mateo', 'Sofia', 'Valentina', 'Diego', 'Camila', 'Santiago', 'Lucia', 'Mariana', 'Joaquin', 'Elena', 'Rafael', 'Ximena', 'Andres', 'Paloma', 'Emilio', 'Renata', 'Tomas', 'Ines', 'Gael', 'Alma',
  'Marcela', 'Esteban', 'Daniela', 'Nicolas', 'Fernanda', 'Javier', 'Catalina', 'Ruben', 'Itzel', 'Cristian',
  // Portuguese / Brazilian
  'Thiago', 'Beatriz', 'Gustavo', 'Luana', 'Caio', 'Larissa', 'Rodrigo', 'Bianca', 'Matheus', 'Isadora', 'Leandro', 'Yasmin', 'Vinicius', 'Helena', 'Rafaela',
  // South Asian
  'Aarav', 'Priya', 'Rohan', 'Ananya', 'Vikram', 'Meera', 'Kabir', 'Isha', 'Arjun', 'Diya', 'Neel', 'Tara', 'Sanjay', 'Riya', 'Dev', 'Anika', 'Kiran', 'Naveen', 'Pooja', 'Imran', 'Sana', 'Farhan', 'Zoya', 'Harini', 'Rahul',
  // East Asian
  'Haruto', 'Yuki', 'Mei', 'Jin', 'Hana', 'Kenji', 'Sora', 'Wei', 'Lin', 'Ming', 'Xiu', 'Jun', 'Min-jun', 'Seo-yeon', 'Ji-woo', 'Hyun', 'Sakura', 'Ren', 'Aiko', 'Takumi', 'Nari', 'Yuna', 'Daichi', 'Mina', 'Tae',
  // Southeast Asian
  'Linh', 'Minh', 'Thao', 'Mika', 'Jericho', 'Althea', 'Paolo', 'Bea', 'Migo', 'Trisha', 'Anh', 'Dara', 'Sokha', 'Putri', 'Arif',
  // Middle Eastern / North African
  'Omar', 'Layla', 'Yusuf', 'Amira', 'Karim', 'Noor', 'Tariq', 'Samira', 'Zayd', 'Rania', 'Idris', 'Leila', 'Hamza', 'Dalia', 'Sami', 'Nadia', 'Rami', 'Salma',
  // Sub-Saharan African
  'Amara', 'Kwame', 'Zuri', 'Chidi', 'Imani', 'Tunde', 'Nia', 'Kofi', 'Folake', 'Sade', 'Jabari', 'Adaeze', 'Emeka', 'Ayo', 'Thandi', 'Sipho', 'Wanjiru', 'Kamau', 'Efua', 'Femi',
  // European
  'Lukas', 'Emil', 'Freya', 'Matteo', 'Chiara', 'Jonas', 'Elin', 'Sven', 'Klara', 'Nikola', 'Anja', 'Pavel', 'Marta', 'Luca', 'Greta', 'Henrik', 'Ilse', 'Dario', 'Liesel', 'Anton', 'Petra', 'Stefan', 'Ingrid', 'Bram', 'Sanne',
  // Gender-neutral / modern
  'Zara', 'Mila', 'Ezra', 'Leo', 'Ivy', 'Theo', 'Juno', 'Wren', 'Sasha', 'Quinn', 'Rowan', 'Sage', 'River', 'Indigo', 'Marlowe', 'Avery', 'Casey', 'Dakota', 'Emerson', 'Remy', 'Kai', 'Lior', 'Noa', 'Eden', 'Ari',
];

export const LAST_NAMES = [
  'Alvarez', 'Bergstrom', 'Castellanos', 'Dlamini', 'Eriksen', 'Fontaine', 'Guerrero', 'Haddad', 'Iyer', 'Jankowski', 'Kowalczyk', 'Lindqvist', 'Mbeki', 'Nakamura', 'Oyelaran', 'Petrov', 'Quintero', 'Rahimi', 'Sorensen', 'Takahashi',
  'Underhill', 'Vasquez', 'Whitlock', 'Xiong', 'Yilmaz', 'Zielinski', 'Abara', 'Brennan', 'Calloway', 'Dubois', 'Esposito', 'Fitzgerald', 'Gallagher', 'Hartwell', 'Ibarra', 'Jovanovic', 'Kapoor', 'Lacroix', 'Moreau', 'Nwosu',
  'Okonkwo', 'Pereira', 'Quigley', 'Rosales', 'Salazar', 'Tanaka', 'Uchenna', 'Vega', 'Wojcik', 'Yamamoto', 'Zhang', 'Almeida', 'Banerjee', 'Cardoso', 'Delgado', 'Eze', 'Ferreira', 'Gutierrez', 'Hossain', 'Inoue',
  'Joshi', 'Kim', 'Lopez', 'Mahmoud', 'Nair', 'Ortega', 'Park', 'Qureshi', 'Reyes', 'Santos', 'Torres', 'Usman', 'Varga', 'Walsh', 'Xavier', 'Yadav', 'Zamora', 'Achebe', 'Baptiste', 'Costa',
  'Dang', 'Elmasry', 'Fernandes', 'Gomez', 'Hashemi', 'Ito', 'Jimenez', 'Khan', 'Lim', 'Mendoza', 'Nguyen', 'Osei', 'Patel', 'Quach', 'Rivera', 'Singh', 'Tran', 'Ugwu', 'Valdez', 'Weber',
  'Abdi', 'Bianchi', 'Chen', 'Duarte', 'Engstrom', 'Farouk', 'Garcia', 'Holm', 'Ivanov', 'Jensen', 'Kaur', 'Laurent', 'Murphy', 'Novak', 'Olsen', 'Pham', 'Rao', 'Silva', 'Teixeira', 'Ueda',
  'Voss', 'Wang', 'Yoon', 'Zimmer', 'Adeyemi', 'Bose', 'Carvalho', 'Diaz', 'Ekwueme', 'Fischer', 'Gunawardena', 'Hakimi', 'Ishikawa', 'Jaramillo', 'Kone', 'Lund', 'Marchetti', 'Nunez', 'Ochoa', 'Prakash',
  'Quinn', 'Romero', 'Saito', 'Thapa', 'Umeh', 'Vidal', 'Wright', 'Yusuf', 'Zapata', 'Ashworth', 'Bellamy', 'Castro', 'Donnelly', 'Eastwood', 'Faulkner', 'Greene', 'Hale', 'Irving', 'Jessop', 'Kerrigan',
  'Langford', 'Maddox', 'Norwood', 'Oakley', 'Pemberton', 'Radcliffe', 'Sinclair', 'Thornton', 'Upton', 'Vaughn', 'Winters', 'Yates', 'Ziegler', 'Aguilar', 'Barros', 'Cisneros', 'Dominguez', 'Escobar', 'Fuentes', 'Herrera',
  'Ibrahim', 'Jha', 'Karimi', 'Lozano', 'Menon', 'Naidoo', 'Orozco', 'Pillai', 'Rojas', 'Soto', 'Trevino', 'Urrutia', 'Villanueva', 'Wanjiku', 'Ahmadi', 'Bhatt', 'Campos', 'Demir', 'Evans', 'Flores',
  'Ghosh', 'Haas', 'Ismail', 'Johansson', 'Karlsson', 'Lehtonen', 'Mazur', 'Nilsson', 'Ogunbanjo', 'Popescu', 'Rasmussen', 'Soares', 'Toure', 'Udoka', 'Vogel', 'Westbrook', 'Yoshida', 'Zubair', 'Alder', 'Birch',
];

/** Full names that must never be produced (real public figures and obvious collisions). Extend as needed. */
export const BLOCKED_FULL_NAMES = new Set([
  'Taylor Swift', 'Selena Gomez', 'Emma Watson', 'Ryan Reynolds', 'Chris Evans', 'Zoe Saldana', 'Jordan Peterson', 'Elon Musk', 'Kim Kardashian', 'Noah Centineo', 'Olivia Rodrigo', 'Ariana Grande',
  'Harper Lee', 'Emma Stone', 'Chloe Kim', 'Liam Neeson', 'Ethan Hawke', 'Hannah Montana', 'Ava Gardner', 'Mason Mount', 'Owen Wilson', 'Grace Kelly', 'Priya Kumar', 'Sofia Vergara', 'Diego Maradona',
  'Maya Angelou', 'Jordan Belfort', 'Quinn Fabray', 'Kai Havertz', 'Leo Messi', 'Zara Larsson', 'Marta Vieira', 'Layla Hathaway', 'Noor Jahan', 'Rowan Atkinson', 'Wren Kitz',
]);
/** Reserved for the personas; the generators must not hand these out to other people. */
export const RESERVED_FULL_NAMES = new Set(['Maya Reyes', 'Jordan Ellis', 'Sam Okafor', 'Maren Cole', 'Tobias Lang', 'Aiko Tanaka']);
export const isBlockedName = (full) => BLOCKED_FULL_NAMES.has(full) || RESERVED_FULL_NAMES.has(full);
/** A unique, non-blocked full name. `used` is a Set<string> the caller keeps. */
export function uniqueName(rng, used) {
  for (let i = 0; i < 200; i++) {
    const n = `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`;
    if (!isBlockedName(n) && !used.has(n)) {
      used.add(n);
      return n;
    }
  }
  throw new Error('uniqueName: pool exhausted');
}
/** Emails are always fictional: <first>.<last>@example.com */
export const emailFor = (full) => `${full.toLowerCase().normalize('NFKD').replace(/[^a-z\s-]/g, '').trim().replace(/\s+/g, '.')}@example.com`;

/** 170 invented creator handles (lowercase [a-z0-9._], 30 characters at most). "maya.makes" is reserved for the persona. */
export const HANDLES = [
  'kai.frames', 'juno.does.stuff', 'theo.tests.apps', 'lenabuilds', 'nomad.nia', 'pixel.priya', 'sleepy.sasha', 'dailywithdev', 'the.real.rowan', 'ivy.in.motion',
  'cole.cuts', 'mira.mornings', 'tobi.tinkers', 'zoe.zooms.in', 'finn.finds.apps', 'sana.scrolls', 'leo.layouts', 'hazel.hacks', 'ravi.reviews', 'nina.noted',
  'jules.journals', 'omar.on.screen', 'tessa.tries', 'diego.demos', 'amara.edits', 'wes.walkthroughs', 'lila.loops', 'beck.builds', 'ines.in.frame', 'arlo.apps',
  'noor.notes', 'dev.does.daily', 'cleo.clips', 'rhea.reels', 'milo.makes.mornings', 'tara.tests', 'ezra.explains', 'faye.finds', 'gus.gadgets', 'hana.habits',
  'iris.edits.things', 'jax.jots', 'kira.kitchen', 'luca.lifts', 'mina.mindful', 'nico.nights', 'opal.organizes', 'pax.plans', 'quinn.quick.takes', 'remy.reviews',
  'sage.studies', 'tomas.trips', 'uma.unboxes', 'vik.vlogs', 'willa.wellness', 'xander.zen', 'yara.yields', 'zane.zoomed', 'abe.adds.apps', 'bea.budgets',
  'cam.cooks', 'dani.drafts', 'eli.edits', 'flo.fitness.diary', 'gigi.glow', 'hugo.hooks', 'isla.inks', 'joel.jogs', 'kat.keeps.up', 'lou.learns',
  'maxine.moves', 'nate.notes.apps', 'ollie.opens', 'paige.pins', 'rae.runs', 'seth.scripts', 'tia.tracks', 'uri.uses.it', 'val.visuals', 'wren.writes',
  'yuki.yeah', 'zed.zones', 'ada.adapts', 'bo.bakes', 'cass.captions', 'dre.demos.daily', 'emi.explores', 'fox.focus', 'gwen.goes', 'hal.hacks',
  'ida.ideas', 'jo.just.tries', 'kobe.kicks', 'lena.listens', 'moss.makes', 'neo.nudges', 'orla.orbits', 'pia.pivots', 'rio.reels.up', 'sky.studio',
  'tate.tests', 'ula.unwinds', 'vera.views', 'wade.watches', 'xia.xtra', 'yves.yields.more', 'zora.zips', 'aria.apps', 'bryn.briefs', 'cruz.crafts',
  'dara.days', 'elle.edits', 'fern.focus', 'glen.gets.it', 'holly.hustles', 'ivo.inspects', 'june.jumps', 'kit.kits', 'lark.lives', 'mace.measures',
  'nell.nests', 'otis.optimizes', 'pru.preps', 'ria.rewinds', 'stan.stacks', 'trix.tips', 'una.undoes', 'vee.vibes', 'wynn.wins', 'zeke.zaps',
  'alba.angles', 'blair.beats', 'coda.cuts', 'drew.dials.in', 'esme.eyes', 'flynn.flows', 'greta.grows', 'heath.hones', 'indy.in.the.app', 'jett.jams',
  'kiki.keeps.it.real', 'lux.looks', 'mabel.maps', 'nolan.nails.it', 'odie.on.it', 'perla.plays', 'rhys.rates', 'sunny.sync', 'tevin.taps', 'unity.unfolds',
  'viv.vaults', 'wilder.wanders', 'xena.explains', 'yael.yes', 'zion.zooms', 'amos.audits', 'bree.breaks.down', 'cyrus.cleans.up', 'dex.digs', 'eden.edits.it',
];

// ── geography ───────────────────────────────────────────────────────────────────────────────────
export const COUNTRIES = [
  { code: 'US', name: 'United States', share: 0.58, locale: 'en-US', language: 'en', timezones: ['America/Chicago', 'America/New_York', 'America/Los_Angeles', 'America/Denver', 'America/Phoenix'], region: 'North America' },
  { code: 'GB', name: 'United Kingdom', share: 0.09, locale: 'en-GB', language: 'en', timezones: ['Europe/London'], region: 'Europe' },
  { code: 'CA', name: 'Canada', share: 0.07, locale: 'en-CA', language: 'en', timezones: ['America/Toronto', 'America/Vancouver'], region: 'North America' },
  { code: 'AU', name: 'Australia', share: 0.04, locale: 'en-AU', language: 'en', timezones: ['Australia/Sydney', 'Australia/Melbourne'], region: 'Oceania' },
  { code: 'DE', name: 'Germany', share: 0.04, locale: 'de-DE', language: 'de', timezones: ['Europe/Berlin'], region: 'Europe' },
  { code: 'BR', name: 'Brazil', share: 0.04, locale: 'pt-BR', language: 'pt', timezones: ['America/Sao_Paulo'], region: 'South America' },
  { code: 'FR', name: 'France', share: 0.03, locale: 'fr-FR', language: 'fr', timezones: ['Europe/Paris'], region: 'Europe' },
  { code: 'ES', name: 'Spain', share: 0.03, locale: 'es-ES', language: 'es', timezones: ['Europe/Madrid'], region: 'Europe' },
  { code: 'MX', name: 'Mexico', share: 0.03, locale: 'es-MX', language: 'es', timezones: ['America/Mexico_City'], region: 'North America' },
  { code: 'NL', name: 'Netherlands', share: 0.02, locale: 'nl-NL', language: 'nl', timezones: ['Europe/Amsterdam'], region: 'Europe' },
  { code: 'PH', name: 'Philippines', share: 0.02, locale: 'en-PH', language: 'en', timezones: ['Asia/Manila'], region: 'Asia' },
  { code: 'IE', name: 'Ireland', share: 0.01, locale: 'en-IE', language: 'en', timezones: ['Europe/Dublin'], region: 'Europe' },
];

// ── categories and niches ───────────────────────────────────────────────────────────────────────
/**
 * Market behaviour per app category. base_cpm_cents is the day-90 clearing CPM; median_views is the median verified views of a
 * post; install_to_trial and trial_to_paid centre the funnel; median_fill_hours is the median time to fill at the clearing price.
 * The words (noun, activity, pain, outcome) feed hook templates, briefs and captions.
 */
export const CATEGORIES = [
  { key: 'ai_photo', label: 'AI photo & video', base_cpm_cents: 240, drift: 0.08, median_views: 15800, install_to_trial: 0.066, trial_to_paid: 0.36, median_fill_hours: 31, noun: 'photo editor', activity: 'editing my photos', pain: 'spending an hour retouching one picture', outcome: 'a photo I actually want to post', niches: ['ai_tools', 'tech', 'beauty', 'lifestyle'] },
  { key: 'ai_assistant', label: 'AI assistants', base_cpm_cents: 260, drift: 0.06, median_views: 13900, install_to_trial: 0.058, trial_to_paid: 0.33, median_fill_hours: 36, noun: 'AI assistant', activity: 'writing and research', pain: 'staring at a blank page', outcome: 'a finished draft in minutes', niches: ['ai_tools', 'tech', 'productivity', 'study'] },
  { key: 'fitness', label: 'Fitness', base_cpm_cents: 210, drift: 0.04, median_views: 17200, install_to_trial: 0.071, trial_to_paid: 0.34, median_fill_hours: 28, noun: 'workout app', activity: 'working out', pain: 'skipping the gym because I had no plan', outcome: 'a routine I actually keep', niches: ['fitness', 'wellness', 'lifestyle'] },
  { key: 'language', label: 'Language & learning', base_cpm_cents: 190, drift: 0.05, median_views: 14400, install_to_trial: 0.064, trial_to_paid: 0.37, median_fill_hours: 40, noun: 'language app', activity: 'learning a language', pain: 'knowing words but freezing in conversation', outcome: 'a real conversation on day one', niches: ['study', 'travel', 'lifestyle'] },
  { key: 'productivity', label: 'Productivity', base_cpm_cents: 200, drift: 0.03, median_views: 12600, install_to_trial: 0.055, trial_to_paid: 0.35, median_fill_hours: 38, noun: 'productivity app', activity: 'planning my day', pain: 'ending the day with nothing done', outcome: 'a day that is already planned', niches: ['productivity', 'study', 'tech', 'lifestyle'] },
  { key: 'finance', label: 'Money & budgeting', base_cpm_cents: 280, drift: 0.07, median_views: 15100, install_to_trial: 0.052, trial_to_paid: 0.32, median_fill_hours: 44, noun: 'budgeting app', activity: 'tracking my money', pain: 'not knowing where my paycheck went', outcome: 'a budget I can read in ten seconds', niches: ['money', 'productivity', 'lifestyle'] },
  { key: 'sleep_mind', label: 'Sleep & mind', base_cpm_cents: 185, drift: 0.04, median_views: 14800, install_to_trial: 0.069, trial_to_paid: 0.38, median_fill_hours: 33, noun: 'sleep app', activity: 'winding down', pain: 'lying awake replaying my day', outcome: 'falling asleep before the story ends', niches: ['wellness', 'lifestyle', 'parenting'] },
  { key: 'music_audio', label: 'Music & audio', base_cpm_cents: 170, drift: 0.03, median_views: 13300, install_to_trial: 0.06, trial_to_paid: 0.31, median_fill_hours: 46, noun: 'music app', activity: 'making music', pain: 'ideas that die in my voice memos', outcome: 'a beat I can actually share', niches: ['tech', 'lifestyle', 'study'] },
  { key: 'lifestyle', label: 'Lifestyle & travel', base_cpm_cents: 175, drift: 0.03, median_views: 12900, install_to_trial: 0.061, trial_to_paid: 0.3, median_fill_hours: 42, noun: 'planning app', activity: 'planning my week', pain: 'twelve tabs open and no plan', outcome: 'a plan everyone agrees on', niches: ['lifestyle', 'travel', 'food', 'parenting'] },
];

/** Creator niches: weight in the creator population, hashtags, bio fragments and the categories they fit best. */
export const NICHES = [
  { key: 'ai_tools', label: 'AI tools', weight: 0.14, tags: ['#aitools', '#aiapps', '#techtok'], bio: ['AI tools I actually use', 'testing every AI app so you do not have to'], categories: ['ai_photo', 'ai_assistant', 'productivity'] },
  { key: 'tech', label: 'Tech', weight: 0.10, tags: ['#techtok', '#appreview', '#gadgets'], bio: ['apps, gadgets and desk setups', 'honest app reviews'], categories: ['ai_assistant', 'productivity', 'music_audio'] },
  { key: 'fitness', label: 'Fitness', weight: 0.11, tags: ['#fitnesstok', '#workoutroutine', '#gymtok'], bio: ['training logs and honest reviews', 'strength, running and recovery'], categories: ['fitness', 'sleep_mind'] },
  { key: 'wellness', label: 'Wellness', weight: 0.08, tags: ['#wellness', '#selfcare', '#mentalhealthtok'], bio: ['slow mornings and better sleep', 'gentle habits that stick'], categories: ['sleep_mind', 'fitness'] },
  { key: 'productivity', label: 'Productivity', weight: 0.10, tags: ['#productivity', '#studytok', '#notion'], bio: ['systems for messy brains', 'planners, notes and focus'], categories: ['productivity', 'ai_assistant'] },
  { key: 'study', label: 'Study & learning', weight: 0.08, tags: ['#studytok', '#languagelearning', '#examprep'], bio: ['student life and study systems', 'learning languages in public'], categories: ['language', 'productivity', 'ai_assistant'] },
  { key: 'money', label: 'Money', weight: 0.07, tags: ['#moneytok', '#budgeting', '#savingmoney'], bio: ['budgeting in plain English', 'side income and saving habits'], categories: ['finance'] },
  { key: 'lifestyle', label: 'Lifestyle', weight: 0.12, tags: ['#dayinmylife', '#routines', '#lifestyle'], bio: ['days in my life', 'routines, rituals and small upgrades'], categories: ['lifestyle', 'sleep_mind', 'fitness', 'productivity'] },
  { key: 'beauty', label: 'Beauty', weight: 0.05, tags: ['#glowup', '#selfietips', '#beautytok'], bio: ['glow-ups and selfie tricks', 'looks, lighting and filters that are not lies'], categories: ['ai_photo', 'lifestyle'] },
  { key: 'travel', label: 'Travel', weight: 0.05, tags: ['#traveltok', '#tripplanning', '#wanderlust'], bio: ['trips planned on a budget', 'travel hacks and itineraries'], categories: ['lifestyle', 'language'] },
  { key: 'food', label: 'Food', weight: 0.05, tags: ['#foodtok', '#mealprep', '#whatieatinaday'], bio: ['meal prep without the stress', 'dinners that take 20 minutes'], categories: ['lifestyle'] },
  { key: 'parenting', label: 'Parenting', weight: 0.05, tags: ['#parenttok', '#momlife', '#dadlife'], bio: ['real life with small kids', 'family routines that survive Tuesdays'], categories: ['sleep_mind', 'lifestyle', 'productivity'] },
];

// ── apps (24 fictional customers + flowd) ───────────────────────────────────────────────────────
/**
 * 24 fictional apps in 9 categories. `avg_first_payment_cents` is the typical revenue of a paid conversion's first period
 * (mix of monthly and annual). `competitors` are other FICTIONAL apps in the same category (used for the competitor_shown rule).
 */
export const APPS = [
  { slug: 'lumi', name: 'Lumi', company: 'Lumi Labs', category: 'ai_photo', tagline: 'Pro-grade photo edits in one tap', domain: 'lumi.example', features: ['One-tap relight', 'Background swap', 'Skin retouch that still looks like you', 'Batch edit 50 photos'], colors: { primary: '#7C5CFF', secondary: '#35B8FF', accent: '#FFC15E' }, pricing: { monthly_cents: 999, annual_cents: 5999, trial_days: 7 }, avg_first_payment_cents: 3499, rating: 4.8, rating_count: 28400, hashtags: ['#lumiapp', '#photoediting', '#aiphotos'] },
  { slug: 'glowkit', name: 'Glowkit', company: 'Glowkit Studio', category: 'ai_photo', tagline: 'Profile photos that look like you on a good day', domain: 'glowkit.example', features: ['AI headshots from 6 selfies', 'Dating and work presets', 'Outfit and backdrop swaps', 'Unlimited retakes'], colors: { primary: '#FF6FA5', secondary: '#FFB36B', accent: '#7A5CFF' }, pricing: { monthly_cents: 1299, annual_cents: 7999, trial_days: 3 }, avg_first_payment_cents: 4499, rating: 4.6, rating_count: 12100, hashtags: ['#glowkit', '#aiheadshots', '#profilepic'] },
  { slug: 'reelcraft', name: 'Reelcraft', company: 'Reelcraft Inc.', category: 'ai_photo', tagline: 'Turn raw clips into edited reels', domain: 'reelcraft.example', features: ['Auto-cut to the beat', 'Captions in 20 languages', 'AI b-roll', 'Template library'], colors: { primary: '#FF5B3D', secondary: '#FFAA3B', accent: '#3DE0FF' }, pricing: { monthly_cents: 1499, annual_cents: 8999, trial_days: 7 }, avg_first_payment_cents: 5299, rating: 4.7, rating_count: 19800, hashtags: ['#reelcraft', '#videoediting', '#contentcreator'] },
  { slug: 'quillby', name: 'Quillby', company: 'Quillby AI', category: 'ai_assistant', tagline: 'Write it once, send it everywhere', domain: 'quillby.example', features: ['Tone matcher', 'Inbox replies in your voice', 'Meeting summaries', 'Rewrite in 12 languages'], colors: { primary: '#3E7BFF', secondary: '#7FD6FF', accent: '#FFD36B' }, pricing: { monthly_cents: 1099, annual_cents: 7499, trial_days: 7 }, avg_first_payment_cents: 3999, rating: 4.7, rating_count: 15600, hashtags: ['#quillby', '#aiwriting', '#productivityhacks'] },
  { slug: 'scoutly', name: 'Scoutly', company: 'Scoutly Research', category: 'ai_assistant', tagline: 'The research assistant that shows its sources', domain: 'scoutly.example', features: ['Cited answers', 'PDF Q&A', 'Reading lists', 'Weekly digests'], colors: { primary: '#16B8A6', secondary: '#2E6BFF', accent: '#FFC857' }, pricing: { monthly_cents: 1299, annual_cents: 8999, trial_days: 14 }, avg_first_payment_cents: 4799, rating: 4.5, rating_count: 7300, hashtags: ['#scoutly', '#studytok', '#aitools'] },
  { slug: 'stridely', name: 'Stridely', company: 'Stridely Run Co.', category: 'fitness', tagline: 'A run coach in your pocket', domain: 'stridely.example', features: ['Adaptive 5K to marathon plans', 'Live audio coaching', 'Route maps', 'Recovery scores'], colors: { primary: '#FF7A3D', secondary: '#FF3D6E', accent: '#FFE066' }, pricing: { monthly_cents: 899, annual_cents: 5499, trial_days: 7 }, avg_first_payment_cents: 3199, rating: 4.7, rating_count: 21700, hashtags: ['#stridely', '#runningtok', '#couchto5k'] },
  { slug: 'ironleaf', name: 'Ironleaf', company: 'Ironleaf Strength', category: 'fitness', tagline: 'Strength training that logs itself', domain: 'ironleaf.example', features: ['Auto rep counting', 'Progressive overload plans', 'Gym timer', 'Form check clips'], colors: { primary: '#2FD08A', secondary: '#1B8F7A', accent: '#E9FF70' }, pricing: { monthly_cents: 1099, annual_cents: 6999, trial_days: 7 }, avg_first_payment_cents: 3699, rating: 4.8, rating_count: 16200, hashtags: ['#ironleaf', '#gymtok', '#strengthtraining'] },
  { slug: 'pulsepath', name: 'Pulsepath', company: 'Pulsepath Health', category: 'fitness', tagline: 'Habits that stick, workouts that fit', domain: 'pulsepath.example', features: ['10-minute workouts', 'Habit streak freezes', 'Heart-rate zones', 'Simple meal log'], colors: { primary: '#FF4F7B', secondary: '#8B5CFF', accent: '#4DE6C8' }, pricing: { monthly_cents: 999, annual_cents: 5999, trial_days: 7 }, avg_first_payment_cents: 3399, rating: 4.6, rating_count: 9400, hashtags: ['#pulsepath', '#homeworkout', '#healthyhabits'] },
  { slug: 'parlo', name: 'Parlo', company: 'Parlo Languages', category: 'language', tagline: 'Speak on day one', domain: 'parlo.example', features: ['Live AI conversation', 'Pronunciation scoring', 'Travel phrasebooks', 'Five-minute daily lessons'], colors: { primary: '#FF9F1C', secondary: '#2EC4B6', accent: '#E71D36' }, pricing: { monthly_cents: 1299, annual_cents: 6999, trial_days: 7 }, avg_first_payment_cents: 3899, rating: 4.7, rating_count: 24100, hashtags: ['#parlo', '#languagelearning', '#learnspanish'] },
  { slug: 'wordwave', name: 'Wordwave', company: 'Wordwave Learning', category: 'language', tagline: 'Vocabulary that sticks', domain: 'wordwave.example', features: ['Spaced-repetition decks', 'Camera to flashcard', 'Podcast mode', 'Quiz duels'], colors: { primary: '#4361EE', secondary: '#4CC9F0', accent: '#F72585' }, pricing: { monthly_cents: 799, annual_cents: 4799, trial_days: 7 }, avg_first_payment_cents: 2799, rating: 4.5, rating_count: 8800, hashtags: ['#wordwave', '#studytok', '#vocabulary'] },
  { slug: 'tasklane', name: 'Tasklane', company: 'Tasklane Software', category: 'productivity', tagline: 'Your day, planned in 60 seconds', domain: 'tasklane.example', features: ['Auto-schedule tasks', 'Calendar sync', 'Focus timer', 'Weekly review'], colors: { primary: '#6C63FF', secondary: '#00C2A8', accent: '#FFB020' }, pricing: { monthly_cents: 799, annual_cents: 4999, trial_days: 14 }, avg_first_payment_cents: 2999, rating: 4.6, rating_count: 13900, hashtags: ['#tasklane', '#productivity', '#plannerapp'] },
  { slug: 'focusfern', name: 'Focusfern', company: 'Focusfern', category: 'productivity', tagline: 'Grow a forest while you focus', domain: 'focusfern.example', features: ['Focus sessions', 'App blocker', 'Deep-work stats', 'Shared focus rooms'], colors: { primary: '#3CB371', secondary: '#A7F070', accent: '#FFE27A' }, pricing: { monthly_cents: 499, annual_cents: 2999, trial_days: 7 }, avg_first_payment_cents: 1999, rating: 4.8, rating_count: 31200, hashtags: ['#focusfern', '#studywithme', '#deepwork'] },
  { slug: 'inkdock', name: 'Inkdock', company: 'Inkdock Notes', category: 'productivity', tagline: 'Notes that organise themselves', domain: 'inkdock.example', features: ['Handwriting to text', 'Auto-tags', 'Linked notes', 'Home-screen widgets'], colors: { primary: '#7B61FF', secondary: '#F9A8D4', accent: '#38BDF8' }, pricing: { monthly_cents: 699, annual_cents: 3999, trial_days: 7 }, avg_first_payment_cents: 2599, rating: 4.6, rating_count: 6900, hashtags: ['#inkdock', '#notetaking', '#studytok'] },
  { slug: 'budgetbee', name: 'Budgetbee', company: 'Budgetbee', category: 'finance', tagline: 'Know where your money went', domain: 'budgetbee.example', features: ['Bank-synced categories', 'Bill reminders', 'Goal buckets', 'Spending insights'], colors: { primary: '#FFC300', secondary: '#FF8C00', accent: '#2ED573' }, pricing: { monthly_cents: 799, annual_cents: 5499, trial_days: 14 }, avg_first_payment_cents: 3099, rating: 4.7, rating_count: 18300, hashtags: ['#budgetbee', '#budgeting', '#moneytok'] },
  { slug: 'subhawk', name: 'Subhawk', company: 'Subhawk', category: 'finance', tagline: 'Find the subscriptions you forgot', domain: 'subhawk.example', features: ['Subscription finder', 'Cancel reminders', 'Price-hike alerts', 'Shared household view'], colors: { primary: '#FF5252', secondary: '#FFB142', accent: '#34ACE0' }, pricing: { monthly_cents: 599, annual_cents: 3999, trial_days: 7 }, avg_first_payment_cents: 2399, rating: 4.5, rating_count: 11200, hashtags: ['#subhawk', '#savemoney', '#subscriptions'] },
  { slug: 'rainyday', name: 'Rainyday', company: 'Rainyday Savings', category: 'finance', tagline: 'Save automatically, in small amounts', domain: 'rainyday.example', features: ['Round-up saving', 'Goal vaults', 'Saving rules', 'Savings streaks'], colors: { primary: '#00A8E8', secondary: '#00D1B2', accent: '#FFD166' }, pricing: { monthly_cents: 699, annual_cents: 4499, trial_days: 14 }, avg_first_payment_cents: 2699, rating: 4.6, rating_count: 9700, hashtags: ['#rainyday', '#savingmoney', '#financetok'] },
  { slug: 'dozely', name: 'Dozely', company: 'Dozely Sleep', category: 'sleep_mind', tagline: 'Fall asleep in minutes', domain: 'dozely.example', features: ['Sleep stories', 'Smart alarm', 'Snore log', 'Wind-down routines'], colors: { primary: '#5B4BFF', secondary: '#2A1B7A', accent: '#FFB3DE' }, pricing: { monthly_cents: 999, annual_cents: 5999, trial_days: 7 }, avg_first_payment_cents: 3299, rating: 4.8, rating_count: 26500, hashtags: ['#dozely', '#sleeptok', '#bedtimeroutine'] },
  { slug: 'stillwater', name: 'Stillwater', company: 'Stillwater Mind', category: 'sleep_mind', tagline: 'Five calm minutes, anywhere', domain: 'stillwater.example', features: ['Guided meditations', 'Breath coach', 'Mood check-ins', 'Sleep sounds'], colors: { primary: '#3AA6B9', secondary: '#9ADCFF', accent: '#FFE8B0' }, pricing: { monthly_cents: 1199, annual_cents: 6999, trial_days: 7 }, avg_first_payment_cents: 3599, rating: 4.7, rating_count: 17400, hashtags: ['#stillwater', '#meditation', '#anxietyrelief'] },
  { slug: 'moodloom', name: 'Moodloom', company: 'Moodloom Wellbeing', category: 'sleep_mind', tagline: 'Understand your moods in a minute a day', domain: 'moodloom.example', features: ['Daily mood log', 'Pattern insights', 'CBT-style prompts', 'Private by design'], colors: { primary: '#B388FF', secondary: '#FF8FAB', accent: '#7DE2D1' }, pricing: { monthly_cents: 899, annual_cents: 5499, trial_days: 7 }, avg_first_payment_cents: 3099, rating: 4.6, rating_count: 8300, hashtags: ['#moodloom', '#moodtracker', '#selfcare'] },
  { slug: 'loopnest', name: 'Loopnest', company: 'Loopnest Audio', category: 'music_audio', tagline: 'Make a beat in your pocket', domain: 'loopnest.example', features: ['Drum machine', 'Loop packs', 'Vocal recorder', 'Export stems'], colors: { primary: '#FF3D00', secondary: '#FFB300', accent: '#00E5FF' }, pricing: { monthly_cents: 999, annual_cents: 5999, trial_days: 7 }, avg_first_payment_cents: 3399, rating: 4.6, rating_count: 10100, hashtags: ['#loopnest', '#beatmaking', '#musicproducer'] },
  { slug: 'tunefox', name: 'Tunefox', company: 'Tunefox', category: 'music_audio', tagline: 'Learn any song by ear', domain: 'tunefox.example', features: ['Chord detector', 'Slow-down player', 'Looping practice', 'Tab view'], colors: { primary: '#FF6D00', secondary: '#FFCA28', accent: '#7C4DFF' }, pricing: { monthly_cents: 799, annual_cents: 4799, trial_days: 7 }, avg_first_payment_cents: 2899, rating: 4.7, rating_count: 12600, hashtags: ['#tunefox', '#guitartok', '#learnmusic'] },
  { slug: 'wanderlist', name: 'Wanderlist', company: 'Wanderlist Travel', category: 'lifestyle', tagline: 'Plan the trip in one place', domain: 'wanderlist.example', features: ['Shared itineraries', 'Offline maps', 'Budget split', 'Reservation import'], colors: { primary: '#00BFA6', secondary: '#3D5AFE', accent: '#FFAB40' }, pricing: { monthly_cents: 699, annual_cents: 3999, trial_days: 7 }, avg_first_payment_cents: 2599, rating: 4.7, rating_count: 14800, hashtags: ['#wanderlist', '#traveltok', '#tripplanning'] },
  { slug: 'pantrypal', name: 'Pantrypal', company: 'Pantrypal', category: 'lifestyle', tagline: 'What is for dinner, solved', domain: 'pantrypal.example', features: ['Pantry scanner', 'Weekly meal plans', 'Grocery lists', 'Leftover recipes'], colors: { primary: '#FF7043', secondary: '#8BC34A', accent: '#FFEB3B' }, pricing: { monthly_cents: 799, annual_cents: 4799, trial_days: 7 }, avg_first_payment_cents: 2799, rating: 4.6, rating_count: 9200, hashtags: ['#pantrypal', '#mealprep', '#whatsfordinner'] },
  { slug: 'nestly', name: 'Nestly', company: 'Nestly Home', category: 'lifestyle', tagline: 'A calmer home, one habit at a time', domain: 'nestly.example', features: ['Chore rotation', 'Shared lists', 'Plant care', 'Home reminders'], colors: { primary: '#26A69A', secondary: '#FFCC80', accent: '#CE93D8' }, pricing: { monthly_cents: 599, annual_cents: 3499, trial_days: 7 }, avg_first_payment_cents: 2199, rating: 4.5, rating_count: 5600, hashtags: ['#nestly', '#homeorganization', '#cleaningmotivation'] },
];
/** flowd's own app: hosts the always-on content-about-us bounty and starter bounties (platform brand br_flowd). */
export const FLOWD_APP = { slug: 'flowd', name: 'flowd', company: 'flowd, Inc.', category: 'productivity', tagline: 'Money follows what works.', domain: 'joinflowd.io', features: ['Funded bounties', 'Money Clock', 'Brief-aware Studio', 'Weekly payouts'], colors: { primary: '#5B5BFF', secondary: '#2DA8FF', accent: '#2FE6C8' }, pricing: { monthly_cents: 0, annual_cents: 0, trial_days: 0 }, avg_first_payment_cents: 0, rating: 4.9, rating_count: 3100, hashtags: ['#flowd', '#getpaid', '#ugc'] };
/** fictional agency workspace and its clients */
export const AGENCY = { slug: 'northstar', name: 'Northstar Growth', tagline: 'Growth for subscription apps', domain: 'northstargrowth.example', manages: ['glowkit', 'subhawk', 'moodloom'] };

/** SKUs per app: <slug>_pro_monthly and <slug>_pro_annual */
export const skuFor = (app, period = 'annual') => `${app.slug}_pro_${period}`;
export const bundleIdFor = (app) => `com.${app.company.toLowerCase().replace(/[^a-z0-9]+/g, '')}.${app.slug}`;
export const appStoreIdFor = (index) => String(6_448_900_000 + index * 7919);

/** Platform URL shapes (text only, never fetched, never an image) */
export const PLATFORM_URLS = {
  tiktok: (handle, id) => `https://www.tiktok.com/@${handle}/video/${id}`,
  instagram: (_handle, id) => `https://www.instagram.com/reel/${id}/`,
  youtube: (_handle, id) => `https://www.youtube.com/shorts/${id}`,
};

export * from './pools-text.mjs';
export * from './pools-content.mjs';
