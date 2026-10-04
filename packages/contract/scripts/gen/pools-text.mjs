// Text pools: hook building blocks, QA flag texts, reason-code summaries, timecoded feedback comments, captions, bios, titles,
// briefs, transcripts, trust and notification copy. All fictional, calm and specific. Slots in {braces} are filled with lib.fill().
// No imports. Voice: confident, clear, a little playful; plain English; rejections talk about the video, never the person.

// ── hooks ───────────────────────────────────────────────────────────────────────────────────────
/**
 * 7 hook types x 12 templates. Slots: {app} {feature} {noun} {activity} {pain} {outcome} {days} {number}.
 * {noun} {activity} {pain} {outcome} come from CATEGORIES; {days} is the trial length; {number} a small count.
 */
export const HOOK_TEMPLATES = {
  confession: [
    'I was wrong about every {noun} I tried before {app}.',
    "I didn't expect to use {app} every single day, but here we are.",
    'Okay, I owe {app} an apology.',
    'I deleted three {noun}s this month. I kept this one.',
    'Confession: I only downloaded {app} to prove it was overrated.',
    "I swore I'd never pay for a {noun}. Then I found {feature}.",
    "I've been {activity} the hard way for years and {app} just showed me.",
    "Nobody told me {app} could do this, and I'm a little mad.",
    'I almost skipped {app} because the icon looked boring.',
    'I thought {feature} was a gimmick. It is not.',
    'My honest {app} review is not what I planned to say.',
    "I came here to roast {app}. I can't.",
  ],
  curiosity_gap: [
    'Wait until you see what {app} did to my {activity}.',
    'This {noun} has one setting I wish I knew about sooner.',
    "There's a button in {app} that most people never tap.",
    'Watch what happens when I turn on {feature}.',
    'I tried {feature} for a week. The last day surprised me.',
    'The one thing {app} does that no other {noun} does.',
    "I almost didn't film this, but you need to see {feature}.",
    'Three taps in {app} and look at the difference.',
    'Something in {app} changed how I think about {activity}.',
    'Stay for the last five seconds. {feature} is wild.',
    'Nobody talks about this part of {app}.',
    'What {app} does with one tap is a little unfair.',
  ],
  specific_number: [
    '{number} minutes a day, {days} days, here is what changed.',
    'I used {app} for {days} days. These are the {number} things I noticed.',
    '{number} seconds with {feature} and I am done.',
    'I saved {number} hours a week with one {noun}.',
    'Day {days} of using {app}: the numbers.',
    '{number} {noun}s tested. One stayed on my phone.',
    '{days} days with {feature}, zero skipped.',
    'From {number} steps to one tap.',
    'I showed {app} to ten friends and nine downloaded it.',
    'My {noun} habit went from {number} apps to one.',
    '{number} reasons {app} lives on my home screen.',
    'Under {number} minutes: {outcome}.',
  ],
  pov: [
    "POV: you finally found a {noun} you don't quit.",
    'POV: {pain} is not your problem anymore.',
    'POV: you let {app} handle {activity}.',
    'POV: your friend sees you using {feature}.',
    'POV: day {days} with {app}.',
    'POV: you stopped {activity} the hard way.',
    'POV: you found out about {app} a year too late.',
    'POV: {outcome}, and it took one tap.',
    'POV: you open {app} for the first time.',
    'POV: you stop {pain}.',
    'POV: your {noun} actually pays attention.',
    'POV: the {feature} moment hits.',
  ],
  direct_question: [
    'Why is nobody talking about {app}?',
    'Are you still {activity} the hard way?',
    'What if {pain} just stopped?',
    'Do you know what {feature} does?',
    'Is {app} actually worth it? I tested it for {days} days.',
    'Why are we all still using a worse {noun}?',
    'What would you do with {number} extra minutes a day?',
    'Which {noun} do you actually open every day?',
    'Can a {noun} really fix {pain}?',
    'Did you know {app} has {feature}?',
    'Still {pain}? Try this.',
    'Be honest: when did you last enjoy {activity}?',
  ],
  risk_reversal: [
    "I didn't pay a cent for the first {days} days.",
    '{app} gave me {days} days free and I did not cancel.',
    'Try {app} free for {days} days and cancel in two taps.',
    'You can try {feature} before paying for anything.',
    'Zero risk: {days} free days of {app}.',
    'I hate subscriptions. {days} free days changed my mind.',
    'Free for {days} days, and it reminds you before it charges.',
    'Just {days} days of {app} to see if it sticks.',
    'Test {feature} for free first, then decide.',
    'The trial is {days} days and I used every one.',
    'I tried {app} for free so you do not have to guess.',
    "If {app} doesn't work for you, you've lost {number} minutes.",
  ],
  pattern_interrupt: [
    'Stop scrolling. {app}.',
    '...and that is why {feature} is the only reason I am awake.',
    'Nope. Watch this first.',
    'Hold on. Look at this.',
    'This is the worst video I have made. {app} fixed it.',
    "Don't tap away, {feature} is about to happen.",
    'Okay but why does {app} do this?',
    'No intro. {feature}. Go.',
    'Delete this app. Just kidding, download {app}.',
    'Pause. This is {app}.',
    "I'm not supposed to show you this.",
    'Quick: {app}, {feature}, done.',
  ],
};
export const HOOK_WHEN_TO_USE = {
  confession: 'Cold audiences and app installs. Works best when the confession is specific and slightly funny.',
  curiosity_gap: 'Transformations and reveals. Promise one surprising thing and deliver it inside 20 seconds.',
  specific_number: 'Results updates and proof. A real number from the creator beats a round one.',
  pov: 'Relatability. Pair with a screen recording so the app shows up by second 3.',
  direct_question: 'Hidden-gem videos. Ask the question the viewer already has.',
  risk_reversal: 'Subscription apps with a free trial. State the trial in the first 3 seconds.',
  pattern_interrupt: 'Any format. Start mid-action or mid-sentence and stack it with a spoken hook.',
};
export const HOOK_NUMBER_WORDS = ['two', 'three', 'five', 'seven', '10', '12', '15', '20', '30'];

// ── QA check texts ──────────────────────────────────────────────────────────────────────────────
/** One pool per QaCheckType and result. {t} = timecode "00:03", {n} a count. */
export const QA_TEXTS = {
  disclosure_audio: { pass: ['Spoken disclosure heard at {t}.', 'You say "paid partnership" at {t}.'], warn: ['Disclosure is spoken but very quietly at {t}.', 'The disclosure line is rushed at {t}.'], fail: ['No spoken disclosure found.', '#ad is never said out loud.'] },
  disclosure_onscreen: { pass: ['#ad is on screen at {t}.', 'On-screen #ad found for 2.1 s from {t}.'], warn: ['#ad is on screen for under 1 second at {t}.', '#ad is partly covered by the caption bar at {t}.'], fail: ['No on-screen #ad found.', '#ad appears only in the caption, not in the video.'] },
  music_licence: { pass: ['No music, original audio only.', 'Audio matches commercial-library tracks only.'], warn: ['A background track could not be matched to the commercial library.'], fail: ['A track outside the commercial music library plays from {t}.', 'Chart music detected from {t}; not licensed for ads.'] },
  banned_claims: { pass: ['No disallowed claims in the transcript or on-screen text.'], warn: ['"Best app ever" at {t} may read as an unsubstantiated claim.'], fail: ['"Guaranteed results" at {t} is on the brand\'s do-not-say list.', 'A health claim at {t} is disallowed for this category.'] },
  ai_content: { pass: ['No AI-generated media detected.', 'AI-generated b-roll at {t} is labelled.'], warn: ['Possible AI-generated voice; confirm the label.'], fail: ['AI-generated imagery at {t} is not labelled.'] },
  duplicate: { pass: ['No near-duplicate found among {n} videos.'], warn: ['Visually similar to one of your earlier videos (distance 5).'], fail: ['Matches another submission already on this bounty (distance 2).', 'Reused footage from another creator\'s video (distance 3).'] },
  watermark: { pass: ['No watermark or logo detected.'], warn: ['A faint corner mark at {t} may be a watermark.'], fail: ['Another app\'s watermark is visible from {t}.'] },
  brief_beats: { pass: ['All {n} required beats found.'], warn: ['One required beat is thin: the offer is mentioned only in text.', 'One required beat is thin: the call to action is said but never shown on screen.'], fail: ['Required beat missing: the app is not shown by 0:03.', 'Required beat missing: the free-trial offer is never stated.'] },
  safe_zone: { pass: ['On-screen text is inside the safe zones.'], warn: ['Caption at {t} touches the bottom UI zone.'], fail: ['Key text at {t} sits under the platform buttons.'] },
  aspect_ratio: { pass: ['9:16 (1080 x 1920).'], warn: ['Aspect is 9:16 but resolution is 720 x 1280.'], fail: ['Aspect is 4:5; this bounty needs 9:16.'] },
  length: { pass: ['{n} seconds, inside the 15 to 30 second range.'], warn: ['{n} seconds is slightly over the 30 second target.'], fail: ['{n} seconds is outside the allowed range.'] },
  resolution: { pass: ['1080 x 1920 at 30 fps.'], warn: ['720 x 1280: acceptable, 1080 x 1920 preferred.'], fail: ['480 x 854 is below the 720 x 1280 minimum.'] },
  audio_clarity: { pass: ['Speech is clear, no dead air over 1 second.'], warn: ['One pause of 1.8 s at {t}.', 'Speech level is low between {t} and the end.'], fail: ['Three gaps over 1 second and background noise over the voice.'] },
  moderation: { pass: ['No safety issues found.'], warn: ['Mild language at {t}; check the brand\'s safety rules.'], fail: ['Content at {t} is outside the brand-safety rules.'] },
};

// ── decisions: reason summaries and evidence ───────────────────────────────────────────────────
/** Brand-written decision summaries per reason code (about the video, never the person). Slots: {t} timecode, {app}, {feature}. */
export const REASON_SUMMARIES = {
  app_not_shown_early: ['The app first appears at {t}; the brief needs it on screen in the first 3 seconds.', 'Great energy, but {app} only shows up at {t}. Bring the screen recording to the opening.'],
  hook_too_late: ['The hook line lands at {t}. Open on it so it lands by 2 seconds.', 'The first 3 seconds are setup. Start on the hook line.'],
  missing_required_beat: ['The brief requires a payoff beat and the video ends before the result shows.', 'The {feature} demo is missing; it is a required beat in the brief.'],
  missing_disclosure: ['#ad is not shown on screen. It needs to be both spoken and visible.', 'No spoken disclosure. Add "this is a paid partnership with {app}".'],
  offer_not_stated: ['The free-trial offer is never mentioned; the brief asks for it once, before the call to action.', 'Say the trial offer out loud near the end.'],
  face_not_shown: ['This bounty requires a face on camera in the first seconds and none appears until {t}.'],
  audio_unclear: ['Speech is hard to hear between {t} and the end; re-record the voice-over.', 'Background noise covers the voice from {t}.'],
  music_not_licensed: ['The track at {t} is not in the commercial music library, so it cannot run as an ad.'],
  banned_claim: ['The claim at {t} is on the do-not-say list. Use the approved wording from the brief.'],
  off_brief: ['The concept is a general app review; this bounty asks for a before/after reveal.', 'This follows a different format from the brief. Pick one of the suggested formats.'],
  low_video_quality: ['Footage is too dark and shaky to read the screen. Film near a window and hold steady.'],
  wrong_format: ['The video is 4:5 and 47 seconds; the bounty needs 9:16 between 15 and 30 seconds.'],
  duplicate_content: ['This matches a video already submitted to this bounty.'],
  unoriginal_clip: ['The footage appears to come from another account. Use your own footage and recordings.'],
  watermark_present: ['Another app\'s watermark is visible from {t}. Re-export the screen recording without overlays.'],
  competitor_shown: ['A competing app is visible at {t}. Crop it or re-record that moment.'],
  ai_content_undisclosed: ['AI-generated imagery at {t} needs a visible "AI-generated" label.'],
  brand_safety: ['Content at {t} is outside the brand-safety rules in the brief.'],
  region_mismatch: ['This bounty targets the US, UK and Canada and the account\'s audience is mostly elsewhere.'],
  other_requirement: ['The brief requires "show the price after the trial" and the video does not.'],
  suspected_fraud: ['Views on this post were found to be invalid after review. Legitimate views delivered are still paid.'],
};
/** Evidence excerpts per kind. */
export const EVIDENCE_TEXTS = {
  transcript: ['"...so yeah, this is the app I use for everything now"', '"Just download it and see for yourself"', '"It is honestly the best one out there, guaranteed"'],
  brief_requirement: ['"The app must be visible within the first 3 seconds."', '"Say the free-trial offer once before the call to action."', '"Show #ad on screen for at least 2 seconds and say it out loud."', '"No claims about medical outcomes."'],
};

// ── timecoded feedback comments ─────────────────────────────────────────────────────────────────
/** Brand feedback per category and severity. About the video, never the person. Slots: {app} {feature}. */
export const FEEDBACK_TEXTS = {
  hook: {
    must_fix: ['Hook lands late. Cut straight to the question.', 'Open on the line, not the intro. Trim the first 1.5 s.', 'The hook text on screen does not match what you say. Make them the same.', 'Start on your face, then jump to the app.', 'The opening is a wide shot with no movement. Add a cut.'],
    suggestion: ['A quick zoom on the first word would help it pop.', 'Try the "wait until you see this" version of this opening.', 'The hook works. A 0.5 s faster start would be even better.', 'Consider leading with the result, then rewinding.', 'Try putting the hook text a little higher.'],
  },
  offer: {
    must_fix: ['Say the free trial out loud here, once, before the call to action.', 'The trial length is not stated. The brief needs "7 days free".', 'Show the price screen for a full second.', 'Mention the offer before the link, not after.', 'The offer text is on screen for under a second. Hold it for two.'],
    suggestion: ['Say "free for 7 days" with a smile. It lands better.', 'Try naming what the trial unlocks.', 'Consider showing the trial banner in the app.', 'A tiny pause before the offer would give it weight.', 'Keep the offer to one sentence.'],
  },
  disclosure: {
    must_fix: ['#ad needs to be on screen for at least 2 seconds here.', 'Say "this is a paid partnership with {app}" out loud.', 'The #ad is hidden behind the caption bar. Move it up.', 'Add #ad to the first line of the caption too.', 'The disclosure is spoken too quickly to hear. Slow it down.'],
    suggestion: ['Put #ad in the top-left so it is never covered.', 'A lower-third with "Paid partnership" reads well.', 'Say the disclosure early so it does not feel tacked on.', 'Keep #ad the same colour as your captions.', 'Try the on-screen text in white with a thin shadow.'],
  },
  audio: {
    must_fix: ['Voice is hard to hear here. Move closer to the mic.', 'Background noise covers the line. Re-record this part.', 'There is a 1.8 second pause here. Cut it.', 'The music is louder than the voice. Lower it.', 'Audio drops out for a moment here.'],
    suggestion: ['A tiny bit of room echo, but fine. Quieter room next time.', 'Consider a lower music level under the demo.', 'The voice is clear. A touch more energy at the end would help.', 'Normalise the volume between clips.', 'Try a sound effect on the reveal.'],
  },
  brand: {
    must_fix: ['Use "{app}" (capital A) in the on-screen text.', 'A competing app is visible here. Crop it.', 'The logo is cropped on the end card. Show it fully.', 'Another app watermark is in the corner. Re-export without it.', 'The tagline is quoted wrong. Use the one in the brief.'],
    suggestion: ['Use the app\'s brand colour in the caption highlight.', 'A glimpse of the app icon at the start would help recognition.', 'The brand name is great here; say it once more at the end.', 'Show the home screen before the demo.', 'Consider using the end card from the brand pack.'],
  },
  pacing: {
    must_fix: ['This section drags for 4 seconds. Cut it down.', 'Over 30 seconds. Trim the middle demo.', 'Too many cuts in a row here make the screen unreadable.', 'The demo is too fast to follow. Hold the key screen for 2 seconds.', 'The ending runs long after the payoff. End on the win.'],
    suggestion: ['Tighten the first demo by a second or two.', 'A beat of silence before the reveal would help.', 'Try speeding up the scrolling by 1.5x.', 'End a touch earlier; the last line repeats the first.', 'A jump cut here would feel snappier.'],
  },
  captions: {
    must_fix: ['Caption sits under the platform buttons. Move it up.', 'Captions have a typo in "{feature}".', 'Captions are too small to read on a phone.', 'Caption text overlaps the on-screen #ad.', 'Auto-captions are missing for this section.'],
    suggestion: ['Highlight the key word in each caption.', 'Two lines of captions max will read better.', 'The caption style is clean. Try a bolder weight.', 'Consider burning the captions in the app\'s font colour.', 'Match caption timing to your speech by a few frames.'],
  },
  claims: {
    must_fix: ['"Best app ever" is not allowed. Say what you like about it instead.', 'The claim about results is on the do-not-say list.', 'Do not promise outcomes. Say what you experienced.', 'Remove "guaranteed" here.', 'The price claim is wrong. Use the current price from the brief.'],
    suggestion: ['"It worked for me" is safer than "it works".', 'Add "your results may vary" lightly in the caption.', 'Back the claim with a screen recording.', 'Prefer a specific number from your own use.', 'Say "I noticed" instead of "it will".'],
  },
};
export const FEEDBACK_REPLIES = [
  'Fixed in v2: moved the app reveal to 0:02.', 'Re-recorded the voice-over in a quieter room.', 'Added the trial line before the CTA.', 'Trimmed the middle demo by 4 seconds.', 'Disclosure is now spoken and on screen.',
];

// ── captions, bios, titles, briefs ──────────────────────────────────────────────────────────────
export const DISCLOSURE_TEXT = '#ad Paid partnership with {brand}';
export const CAPTION_TEMPLATES = [
  '{hook} {disclosure} {tags}', '{hook}\n\n{disclosure}\nLink in bio {tags}', '{hook} {tags} {disclosure}', '{disclosure}\n{hook} Use my code {code} {tags}', '{hook}\n{disclosure} {tags}',
];
export const BIO_TEMPLATES = [
  '{age}. {niche_a}. {niche_b}. {city}.', '{niche_a} and {niche_b}. Posting {cadence}. {city}.', '{city}-based. {niche_a}. I film what I actually use.', '{age}, {city}. {niche_a}, {niche_b}, and too many open tabs.',
  'Posting {cadence}: {niche_a}. {niche_b} on the side.', '{niche_a} for people who hate {pet_peeve}. {city}.', 'I test apps so you do not have to. {niche_a}. {city}.', '{niche_b}, {niche_a}, and the occasional rant. {city}.',
];
export const BIO_PET_PEEVES = ['long intros', 'paywalls', 'tutorial videos', 'spreadsheets', 'alarm clocks', 'complicated apps', 'clickbait', 'perfect feeds'];
export const BIO_CADENCES = ['three times a week', 'every Tuesday and Friday', 'most mornings', 'when I have something real to say', 'twice a week', 'daily-ish'];
export const CITIES = {
  US: ['Austin', 'Chicago', 'Brooklyn', 'Portland', 'Atlanta', 'Denver', 'San Diego', 'Nashville', 'Minneapolis', 'Phoenix', 'Raleigh', 'Seattle', 'Columbus', 'Tampa'],
  GB: ['Manchester', 'Bristol', 'Leeds', 'Glasgow', 'Brighton', 'London'], CA: ['Toronto', 'Vancouver', 'Calgary', 'Montreal'], AU: ['Melbourne', 'Brisbane', 'Perth', 'Sydney'],
  DE: ['Hamburg', 'Cologne', 'Leipzig'], BR: ['Sao Paulo', 'Recife', 'Curitiba'], FR: ['Lyon', 'Marseille', 'Nantes'], ES: ['Valencia', 'Seville', 'Bilbao'], MX: ['Guadalajara', 'Monterrey', 'Puebla'],
  NL: ['Utrecht', 'Rotterdam'], PH: ['Cebu', 'Davao', 'Manila'], IE: ['Cork', 'Galway', 'Dublin'],
};
export const PORTFOLIO_TITLES = ['Morning routine, app edition', 'I tried it for 7 days', 'Three apps I deleted this month', 'My honest review', 'Setup tour and the apps on it', 'Day in my life with one new app', 'The app I almost skipped', 'Before and after, no filter', 'What I use on Sundays', 'Screen time, but make it useful'];

/** Bounty titles per category. {app} slot. */
export const BOUNTY_TITLES = {
  ai_photo: ['Glow-up reveal', '30-second retouch challenge', 'Before and after, one tap', 'Fix a bad photo live', 'Headshots in 60 seconds', 'The photo I almost deleted', 'Edit with me', 'Camera roll rescue'],
  ai_assistant: ['Write it in one take', 'The inbox I cleared in 5 minutes', 'Research in 10 minutes', 'Draft to done', 'My morning with {app}', 'Ask it anything: 5 prompts that work', 'Summarise my week', 'Reply in my voice'],
  fitness: ['My first week with {app}', 'The workout I stopped skipping', '10 minutes, no excuses', 'Rep counting, live', 'Plan to PR', 'Run club test drive', 'Recovery day with {app}', 'Gym bag essentials: one app'],
  language: ['Day 1 vs day 30', 'I spoke it on day one', 'The 5-minute lesson', 'Ordering lunch in a new language', 'My pronunciation score, live', 'Flashcards from my camera', 'Learn with me', 'Trip prep in one week'],
  productivity: ['Plan my day in 60 seconds', 'The Sunday reset', 'Focus session with me', 'Notes that file themselves', 'My weekly review', 'Study with {app}', 'The system that finally stuck', 'Inbox to done'],
  finance: ['Where my paycheck went', 'The subscription I forgot for a year', 'Round-up saving, tested', 'Budget in 10 seconds', 'My no-spend week', 'Goal vault challenge', 'The bills I almost missed', 'Month-end check-in'],
  sleep_mind: ['Asleep before the story ends', 'My wind-down routine', 'Five calm minutes', 'Sleep stories, tested', 'Mood log, week one', 'The 3 a.m. thought spiral', 'Night routine with {app}', 'A calmer Monday'],
  music_audio: ['A beat in 5 minutes', 'Learn the riff by ear', 'Loop pack challenge', 'Slow it down, play it back', 'Vocal take, one phone', 'Make a beat with me', 'Chord detector, live', 'Practice with {app}'],
  lifestyle: ['Plan the whole trip in one place', 'What is for dinner, solved', 'The chore chart we both use', 'Meal plan Sunday', 'Weekend trip in 10 minutes', 'Pantry scan, no waste', 'The house reset', 'Itinerary, split the cost'],
};
/** Brief building blocks per category (talking points, do, do not). {app} {feature}. */
export const BRIEF_BITS = {
  default: {
    talking: ['Show the app on screen within the first 3 seconds.', 'Demo {feature} for at least 5 seconds.', 'Say what the app does for you in one sentence.', 'Mention the free trial once, before the call to action.', 'End on the result, then one call to action.'],
    dos: ['Film vertically, 9:16, in good light.', 'Use your own screen recordings and footage.', 'Keep it between 15 and 30 seconds.', 'Say and show #ad.'],
    donts: ['Do not make income, health or guaranteed-result claims.', 'Do not show other apps in the same category.', 'Do not use music outside the commercial library.', 'Do not post from a new or dedicated account just for this.'],
  },
  ai_photo: { talking: ['Show a before photo, then the edit, in one continuous take.', 'Use a photo you took yourself.', 'Say "no filters, just {app}" only if true.'], dos: ['Show the slider or one-tap moment clearly.', 'Pick a photo with a real problem: harsh light, a stranger in the background.'], donts: ['Do not edit people who have not agreed to appear.', 'Do not claim the result is photographic proof.'] },
  ai_assistant: { talking: ['Show a real task from your week.', 'Read the prompt aloud so the viewer can copy it.'], dos: ['Show the output on screen, not just the prompt.', 'Say what you changed by hand.'], donts: ['Do not present the output as flawless.', 'Do not use confidential material in the demo.'] },
  fitness: { talking: ['Show the workout screen mid-set.', 'Say how long the session took.'], dos: ['Warm up before filming anything strenuous.', 'Show the app tracking something real.'], donts: ['Do not promise weight-loss or health outcomes.', 'Do not give medical advice.'] },
  language: { talking: ['Say one phrase in the language, then show the app scoring it.', 'Mention how many minutes a day you spent.'], dos: ['Subtitle anything not in English.', 'Show a real conversation moment.'], donts: ['Do not claim fluency in weeks.', 'Do not mock accents.'] },
  productivity: { talking: ['Show your day before and after planning with the app.', 'Name one thing the app moved for you automatically.'], dos: ['Show the calendar or list on screen.', 'Keep the demo to a single workflow.'], donts: ['Do not imply it replaces professional advice.', 'Do not show private data.'] },
  finance: { talking: ['Use your own numbers or clearly labelled sample numbers.', 'Say what you changed after seeing the data.'], dos: ['Blur account numbers and balances you do not want public.', 'Say "not financial advice" where relevant.'], donts: ['Do not promise savings or returns.', 'Do not show real account numbers.'] },
  sleep_mind: { talking: ['Describe the night you tried it, honestly.', 'Show the wind-down screen, not a sleeping person.'], dos: ['Use calm lighting and a calm voice.', 'Say it is not a medical treatment.'], donts: ['Do not claim to treat anxiety, insomnia or depression.', 'Do not film anyone who is actually asleep.'] },
  music_audio: { talking: ['Play what you made or learned, even if it is rough.', 'Show the loop or chord screen while the audio plays.'], dos: ['Use only audio you made or commercial-library tracks.', 'Keep headphone leakage out of the take.'], donts: ['Do not play copyrighted songs from the radio.', 'Do not claim the app will make you a professional.'] },
  lifestyle: { talking: ['Plan something real, not a staged trip.', 'Show the shared plan on screen.'], dos: ['Show the app in two different moments.', 'Mention how much time it saved.'], donts: ['Do not show other people\'s home addresses.', 'Do not imply sponsorships from venues.'] },
};
export const CTA_LINES = {
  link_in_bio: ['Link in my bio.', 'The link is in my bio, tap it.'], use_code: ['Use my code {code} for the trial.', 'Code {code}, it is in the link too.'], try_free: ['Try it free for {days} days.', 'Free for {days} days, link in bio.'],
  download_now: ['Download it and see.', 'Go download it.'], search_app_store: ['Search "{app}" in the App Store.', 'Find {app} in the App Store.'], comment_for_link: ['Comment "{app}" and I will send you the link.', 'Comment LINK for the link.'],
};
export const OFFER_LINES = ['Try it free for {days} days.', 'There is a {days}-day free trial, cancel any time.', 'First {days} days are free.', 'It is free to try for {days} days.'];
export const TRANSCRIPT_LINES = {
  problem: ['I used to spend ages {activity} and still hate the result.', 'My biggest problem was {pain}.', 'Every week I was {pain}.'],
  app_reveal: ['So I tried {app}.', 'This is {app}.', 'Then I found {app}.', 'Okay, {app}.'],
  demo: ['Watch this. {feature}.', 'You just tap {feature} and it is done.', 'Here is {feature} in action.', 'I turn on {feature} and look.'],
  payoff: ['And that is {outcome}.', 'Now I have {outcome}.', 'That took ten seconds.', 'It does that every time.'],
  proof: ['Look at the before and after.', 'That is day {days}.', 'Same {noun}, same me, one tap.'],
  disclosure: ['This is a paid partnership with {app}.', 'Paid partnership with {app}.', 'Quick disclosure, this is an ad for {app}.'],
  reaction: ['Wait, what?', 'No way that is real.', 'Okay that is actually good.'],
  win_state: ['And that is the whole thing.', 'Done. That is it.', 'That is the result.'],
  end_card: ['{app}. Link in bio.', '{app}, free to try.'],
};

// ── trust, offers, chat, notifications ──────────────────────────────────────────────────────────
export const DISPUTE_TEXTS = {
  view_count: { reason: ['Verified views look low against the platform count.', 'The view count dropped between two snapshots.', 'Views stopped counting at hour 40.'], note: ['The platform shows 38,200 and flowd shows 31,900. Can you check the snapshot at hour 48?', 'My post was featured and views jumped, but the ledger only shows part of it.'] },
  flagged_botting: { reason: ['I was flagged for bot views and I did not buy any.', 'The fraud flag cites "other" traffic, which was a repost on a larger account.'], note: ['A bigger account reposted this and sent most of the traffic. I have screenshots from the platform analytics.'] },
  late_payment: { reason: ['My weekly payout did not arrive on Friday.', 'A cleared item is not in the payout.'], note: ['The Money Clock said it would pay Friday 6:00 PM. It shows held with no reason.'] },
  rights_misuse: { reason: ['My video is running as an ad after my rights ended.'], note: ['The 90-day term ended on the 12th and I still see it running.'] },
  wrong_attribution: { reason: ['A trial I drove was not credited.', 'A conversion was credited to the wrong link.'], note: ['A friend used my code and started a trial on Tuesday. It is not on my post.'] },
  rejection_appeal: { reason: ['The rejection cites something that is in the video.', 'The reason does not match the brief.'], note: ['The app is on screen at 0:02. Please check the timecode in the feedback.', 'The brief did not require a face; the rejection says it does.'] },
  held_funds: { reason: ['My earnings are held with no clear next step.'], note: ['The hold says tax info but I submitted my W-9 on Monday.'] },
  other: { reason: ['Something else.'], note: ['Describing the issue in detail below.'] },
};
export const DISPUTE_OUTCOMES = {
  upheld: ['We re-checked the platform snapshots and agree. The difference has been added back and will clear at the next run.', 'You are right. The decision is reversed and the money is released.'],
  partially_upheld: ['Part of the views were counted twice by the platform and have been removed; the rest is restored.', 'We credited the conversions we could verify and could not verify the others.'],
  rejected: ['The snapshots match the platform within 0.5%. The excluded views came from an external source and the evidence is attached.', 'The brief required a face on camera and the first 3 seconds have none. The rejection stands.'],
};
export const SCAM_TEXTS = {
  pay_to_join: ['They asked me for $25 to "unlock" the bounty.', 'The brand wants a deposit before they will send the brief.'],
  off_platform_chat: ['They asked me to move to Telegram to "finalise the details".', 'Asked for my WhatsApp number in the first message.'],
  fake_brand: ['The account uses the name of a real app but the domain is different.', 'No app exists in the store with this name.'],
  burner_account_demand: ['They want me to make a new account just for this brand.', 'The brief says to post from a fresh account with no other content.'],
  no_escrow_claim: ['The bounty says "fully funded" but there is no Funded badge.', 'They told me the money is "in the bank" but the wallet shows nothing.'],
  suspicious_link: ['The tracking link goes to a login page, not the app store.', 'A link in the chat looks like a phishing page.'],
  harassment: ['The reviewer was rude and personal in the comments.'],
  other: ['Something felt off. Details below.'],
};
export const SCAM_WARNING_TEXT = {
  off_platform_chat: 'flowd never asks you to move to WhatsApp, Telegram or email. Keep the conversation here so it is protected.',
  pay_to_join: 'Real bounties never ask you to pay. If someone asks for money, report it.',
  burner_account_demand: 'Bounties may not require a new or dedicated account. Report this brief.',
  suspicious_link: 'This link does not go to joinflowd.io or the app store. Do not open it.',
};
export const OFFER_MESSAGES = {
  opening: [
    'Hi {creator}, we loved your {topic} video. We would like two new hooks on {app} for {amount}. Rights are in the card; renewals are priced up front.',
    'Hey {creator}! Your last post drove the best trial rate we have seen on {app}. Would you make a follow-up with a different hook at {amount}?',
    'We are re-buying your winning video with three new openings. {amount} for the set, organic posting plus a 90-day paid usage term.',
  ],
  counter: ['Thanks! My usual rate for two videos with paid usage is {amount}. Happy to do 90 days of usage.', 'I can do it at {amount} if the turnaround is 5 days.', 'Could we do {amount} with a 60-day usage term instead?'],
  accept: ['Sounds good, accepted.', 'Deal. I will start on the script today.'],
  decline: ['Thank you, I am fully booked this month.', 'Not a fit for my audience right now, thanks for thinking of me.'],
  brand_reply: ['That works for us. We have funded the offer from our wallet.', 'We can meet you at {amount}.', 'We cannot go higher than {amount}, but we can add a second video.'],
};
export const THREAD_SNIPPETS = {
  submission: [['brand', 'Quick question on the second scene: can you re-record that line a bit slower?'], ['creator', 'Sure, I can do that tonight.'], ['brand', 'Thank you, that is the only change.']],
  support: [['creator', 'My payout shows held. What do I need to do?'], ['system', 'Your payout is held for tax info. Add your W-9 in Settings > Tax Desk to release it.'], ['creator', 'Done, thanks.']],
  bounty: [['creator', 'Does the video need to show my face?'], ['brand', 'A face in the first 3 seconds is required. Faceless formats are okay for the slideshow bounty.']],
};
/** Notification copy per kind. Slots: {amount} {brand} {bounty} {tier} {n} {eta} {hours} */
export const NOTIFICATION_TEXTS = {
  approval: ['Approved by {brand}', 'Your video for {bounty} is approved. Post it with the link and code ready.'],
  changes_requested: ['Changes requested', '{brand} left {n} timecoded notes on {bounty}. Two rounds are included.'],
  rejection: ['Not approved', '{brand} could not approve {bounty}. See the reason and what to change; you can appeal once.'],
  appeal_decided: ['Appeal decided', 'Ops reviewed your appeal on {bounty}. See the decision.'],
  post_live: ['Views are counting', 'Your {bounty} post is live. The 72-hour window closes {eta}.'],
  cash_event: ['You just earned +{amount}', 'New earnings from {bounty}. Clears {eta}.'],
  payout_cleared: ['{amount} cleared', 'Your earnings cleared and will pay out on the next weekly run.'],
  payout_paid: ['{amount} is on its way', 'Your weekly payout is on its way. It usually arrives in 1 to 2 business days.'],
  payout_held: ['Payout held: {n}', 'Your payout is held. Next step is in the Money Clock.'],
  tier_up: ['You reached {tier}', 'New perks unlocked. See what changed on your Tiers screen.'],
  streak_milestone: ['{n} weeks in a row', 'You posted every week for {n} weeks. A freeze is banked if you need a break.'],
  streak_freeze_used: ['A freeze covered last week', 'You did not post last week, so a banked freeze kept your streak.'],
  drop_live: ['Today\'s Daily Drop is live', '{n} bounties, real spots. Claim before they are gone.'],
  offer_received: ['New offer from {brand}', '{brand} sent you an offer for {amount}.'],
  offer_countered: ['Counter-offer', '{brand} countered at {amount}.'],
  offer_accepted: ['Offer accepted', '{brand} accepted your terms. The bounty is funded.'],
  tournament_update: ['Round results', 'Round 1 results are in. You advanced.'],
  rights_expiring: ['Rights end in {n} days', 'Paid-ad usage of your {bounty} video ends soon. Renewal is priced up front.'],
  fatigue_alert: ['A winner is wearing out', 'Trial-start rate is down {n}% from its peak on {bounty}.'],
  review_waiting: ['{n} videos waiting', '{n} submissions are waiting for your decision.'],
  review_sla_warning: ['A decision is due', '{n} submissions are close to the 72-hour limit.'],
  bounty_filled: ['{bounty} is filled', 'All spots on {bounty} are taken. New submissions are paused.'],
  bounty_funded: ['{bounty} is funded and live', 'The full budget is in escrow. Creators can submit now.'],
  funding_needed: ['Top up to keep going', 'Your wallet is short by {amount} for {bounty}.'],
  auto_approve_paused: ['Auto-approve paused', 'A guardrail paused your rule after a fraud event.'],
  ad_live: ['{bounty} is running as an ad', 'Your post is promoted. Commission accrues for 60 days.'],
  dispute_update: ['Dispute update', 'A reply or decision is waiting on your dispute.'],
  tax_info_needed: ['Add your tax info', 'We need a W-9 to release your payout. It takes two minutes. Not tax advice.'],
  scam_warning: ['Careful with this message', 'This message asks you to leave flowd. Keep chat here, it is protected.'],
  flo_tip: ['A tip from Flo', 'Your hook lands at 2.6 seconds. Move the app reveal up for a higher score.'],
  academy_badge: ['Badge earned', 'You finished a lesson and earned a badge.'],
  referral_joined: ['{n} friend joined', 'Someone joined with your code. Your reward starts at their first dollar.'],
  system_notice: ['Product update', 'We shipped something new. See the changelog.'],
  views_milestone: ['Your post passed {n} views', 'Batched view milestone for {bounty}.'],
  drop_reminder: ['Drop in one hour', 'You asked for a reminder: today\'s Daily Drop is live at 16:00 UTC.'],
  crew_invite: ['Crew invite', 'You were invited to join a crew.'],
  rights_renewed: ['Rights renewed', '{brand} renewed paid usage. A renewal fee of {amount} is coming.'],
};
export const ACTIVITY_TEXTS = {
  bounty_created: '{actor} created the bounty {target}', bounty_published: '{actor} published {target}', bounty_funded: '{actor} funded {target} with {amount}', bounty_paused: '{actor} paused {target}', bounty_ended: '{actor} ended {target}',
  submission_approved: '{actor} approved a video from {target}', submission_changes_requested: '{actor} requested changes from {target}', submission_rejected: '{actor} rejected a video from {target}',
  rule_created: '{actor} created the auto-approve rule {target}', rule_enabled: '{actor} enabled {target}', rule_killed: '{actor} used the kill switch on {target}',
  member_invited: '{actor} invited {target}', member_role_changed: '{actor} changed {target}\'s role', member_removed: '{actor} removed {target}',
  api_key_created: '{actor} created the API key {target}', api_key_revoked: '{actor} revoked {target}', webhook_created: '{actor} added a webhook to {target}',
  integration_connected: '{actor} connected {target}', integration_disconnected: '{actor} disconnected {target}', plan_changed: '{actor} changed the plan to {target}',
  wallet_topped_up: '{actor} topped up the wallet by {amount}', auto_topup_changed: '{actor} changed the auto top-up', ad_promoted: '{actor} promoted {target} as an ad', rights_renewed: '{actor} renewed rights for {target}',
  offer_sent: '{actor} sent an offer to {target}', offer_accepted: '{actor} accepted the offer from {target}', dispute_responded: '{actor} responded to a dispute from {target}', export_created: '{actor} exported {target}', invoice_downloaded: '{actor} downloaded {target}',
};
export const FLO_PROMPTS = {
  script: ['Write 3 scripts for the confession format for {app}.', 'Give me a 20-second script for {bounty}.'],
  hook_rewrite: ['Rewrite this hook so it lands in 2 seconds: "{hook}"', 'Make this opening a confession: "{hook}"'],
  brief_tldr: ['TL;DR this brief in three bullets.'], caption: ['Caption ideas with #ad for this video.'], score_fix: ['How do I fix my Hook Score?'], rate_advice: ['What should I charge for two videos with paid usage?'],
  next_action: ['What should I do today?'], bounty_draft: ['Draft a bounty from this App Store link: {url}'],
};
export const FLO_SCRIPT_BEATS = [
  ['Hook', 'Open on the line: "{hook}"'], ['Problem', 'One sentence about {pain}.'], ['App reveal', 'Cut to the screen recording of {app} by 0:03.'], ['Demo', 'Show {feature} for five seconds.'], ['Payoff', 'Show {outcome}.'], ['Offer + CTA', 'Say the {days}-day trial once, then one call to action.'],
];
