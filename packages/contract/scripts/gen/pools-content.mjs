// Content pools: the 11 format templates, 10 Academy lessons with quizzes, trends, crews, tournaments, changelog, testimonials,
// case studies, model definitions, spec and auction titles. Written to be used as-is by the ext generator (formats.json and
// lessons.json are essentially fixed content). All fictional; no income promises; "not tax advice" where relevant. No imports.

// ── formats (tmpl_*) ────────────────────────────────────────────────────────────────────────────
/**
 * The 11 winning app-ad formats. beats: [beat id, label, t_start_s, t_end_s, required, tip]. `lift` is the relative trial rate of the
 * format against the library median (used to generate FormatStats); `views_mult` the relative median views.
 */
export const FORMAT_DEFS = [
  {
    id: 'tmpl_screen_reaction', name: 'Screen record + reaction', rank: 1, mvp: true, min_s: 18, max_s: 30, difficulty: 'medium', faceless: false, lift: 1.28, views_mult: 1.12,
    summary: 'Face cam in a corner reacting to using the app for the first time, with the screen recording full-frame and a reaction peak at the wow moment.',
    categories: ['ai_photo', 'ai_assistant', 'productivity', 'music_audio'], niches: ['ai_tools', 'tech', 'productivity'], hook_types: ['confession', 'curiosity_gap', 'pov'], cta: ['link_in_bio', 'try_free'],
    beats: [['hook', 'Hook on your face', 0, 2, true, 'Say the hook while looking at the camera.'], ['app_reveal', 'Cut to the app', 2, 4, true, 'Screen recording full-frame by 0:04.'], ['demo', 'Use it for the first time', 4, 14, true, 'Keep your face cam small in the corner.'], ['reaction', 'The wow moment', 14, 18, true, 'React honestly when the result lands.'], ['payoff', 'Show the result', 18, 23, true, 'Hold the result for two seconds.'], ['offer', 'State the trial', 23, 26, false, 'Once, near the end.'], ['cta', 'One call to action', 26, 29, true, 'Link in bio or your code.']],
    script: '{hook} [face] So I opened {app} for the first time and tried {feature}. [screen recording] Wait, what? [reaction] That is {outcome}. [result] It is free to try for {days} days. {cta}',
    shots: ['Face to camera, hook line', 'Screen recording of {feature} (full-frame)', 'Reaction shot at the result', 'Close on the result', 'Face to camera, offer and call to action'],
    why: 'Shows the product and a human together, and the reaction is the proof. Named the best-performing app-install format in 2026 by an AI-UGC vendor (reported).',
  },
  {
    id: 'tmpl_hidden_gem', name: 'Hidden gem', rank: 2, mvp: true, min_s: 15, max_s: 28, difficulty: 'easy', faceless: false, lift: 1.12, views_mult: 1.05,
    summary: '"This app is so slept on." One killer feature on screen, then "and it is free to try".',
    categories: ['ai_photo', 'productivity', 'finance', 'lifestyle', 'music_audio'], niches: ['tech', 'lifestyle', 'productivity', 'money'], hook_types: ['direct_question', 'curiosity_gap'], cta: ['link_in_bio', 'search_app_store'],
    beats: [['hook', 'Slept-on hook', 0, 3, true, 'Name the feeling: nobody talks about this.'], ['app_reveal', 'Show the app', 3, 5, true, 'Show the app by 0:05.'], ['key_feature', 'The one killer feature', 5, 16, true, 'Pick one feature, not three.'], ['proof', 'Why it earned a spot', 16, 21, false, 'A number or a before/after.'], ['offer', 'Free to try', 21, 24, true, 'Say the trial once.'], ['cta', 'One call to action', 24, 27, true, 'Link in bio.']],
    script: '{hook} Everyone talks about the big {noun}s, but {app} has {feature} and I do not know how I lived without it. [screen] {outcome}. It is free to try for {days} days. {cta}',
    shots: ['Face to camera, slept-on hook', 'Screen recording of {feature}', 'Result close-up', 'Face to camera, offer and call to action'],
    why: 'Feels like organic discovery instead of an ad, so it earns attention from cold audiences.',
  },
  {
    id: 'tmpl_confession', name: 'Confession hook', rank: 3, mvp: true, min_s: 18, max_s: 30, difficulty: 'easy', faceless: false, lift: 1.18, views_mult: 1.08,
    summary: '"I did not expect to use this app every day, but here we are." Then why, a demo and one call to action.',
    categories: ['fitness', 'sleep_mind', 'language', 'finance', 'ai_assistant'], niches: ['fitness', 'wellness', 'study', 'money', 'lifestyle'], hook_types: ['confession', 'specific_number'], cta: ['link_in_bio', 'use_code'],
    beats: [['hook', 'Confession', 0, 3, true, 'Specific and slightly funny beats generic.'], ['problem', 'Why you doubted it', 3, 8, true, 'One honest sentence.'], ['app_reveal', 'Show the app', 8, 10, true, 'Screen recording by 0:10 at the latest.'], ['demo', 'What changed', 10, 20, true, 'Show one real moment from your week.'], ['payoff', 'Where you are now', 20, 25, true, 'Say the result in your own words.'], ['cta', 'One call to action', 25, 28, true, 'Use my code or link in bio.']],
    script: '{hook} I used to think {noun}s were a waste. But {pain} kept happening. So I tried {app}. [screen] {feature}. Now I have {outcome}. {cta}',
    shots: ['Face to camera, confession', 'B-roll of the problem moment', 'Screen recording of {feature}', 'Face to camera, where you are now'],
    why: 'Confession and controversy hooks are reported to beat others for app installs.',
  },
  {
    id: 'tmpl_problem_solution', name: 'Problem, solution, result', rank: 4, mvp: true, min_s: 18, max_s: 28, difficulty: 'medium', faceless: false, lift: 1.05, views_mult: 1.0,
    summary: 'The pain in one line, the app solving it on screen, the result, one call to action.',
    categories: ['finance', 'productivity', 'sleep_mind', 'lifestyle', 'fitness'], niches: ['money', 'productivity', 'wellness', 'lifestyle'], hook_types: ['direct_question', 'pov', 'specific_number'], cta: ['try_free', 'link_in_bio'],
    beats: [['problem', 'The pain in one line', 0, 4, true, 'This is your hook. Make it feel familiar.'], ['app_reveal', 'Show the app', 4, 7, true, 'App on screen by 0:07 at the latest.'], ['demo', 'The app solving it', 7, 17, true, 'One workflow, start to finish.'], ['payoff', 'The result', 17, 23, true, 'Show the number or the finished thing.'], ['offer', 'Free to try', 23, 26, false, 'Once.'], ['cta', 'One call to action', 26, 28, true, 'Link in bio.']],
    script: '{pain}. [face] Here is how {app} fixes it. [screen] {feature}. [result] {outcome}. {cta}',
    shots: ['Face or b-roll of the problem', 'Screen recording of {feature}', 'Result close-up', 'Call to action'],
    why: 'One of the most consistent converting formats: the viewer sees the pain, the fix and the result in 25 seconds.',
  },
  {
    id: 'tmpl_faceless_slideshow', name: 'Faceless slideshow', rank: 5, mvp: true, min_s: 15, max_s: 28, difficulty: 'easy', faceless: true, lift: 0.92, views_mult: 0.95,
    summary: 'Five to eight slides telling a story or tips; the app appears on slide 4, never first or last. No face needed.',
    categories: ['finance', 'productivity', 'language', 'lifestyle', 'fitness'], niches: ['money', 'study', 'productivity', 'food', 'travel'], hook_types: ['specific_number', 'curiosity_gap'], cta: ['link_in_bio', 'comment_for_link'],
    beats: [['hook', 'Slide 1: the hook', 0, 3, true, 'Big text, one line.'], ['problem', 'Slides 2-3: the setup', 3, 9, true, 'One idea per slide.'], ['app_reveal', 'Slide 4: the app', 9, 13, true, 'Show the app here, never first or last.'], ['proof', 'Slides 5-6: proof', 13, 20, true, 'A screenshot or a number.'], ['payoff', 'Slide 7: the result', 20, 24, false, 'The takeaway.'], ['cta', 'Last slide: one call to action', 24, 27, true, 'Comment for the link.']],
    script: '{hook} 1. {pain}. 2. Most {noun}s make it worse. 3. Then I found {app}. [app slide] 4. {feature}. 5. {outcome}. Comment LINK.',
    shots: ['Slide 1 big text', 'Slide 4 screenshot of {app}', 'Slide 5 result screenshot', 'Last slide call to action'],
    why: 'Carousels outperform many video concepts for organic reach, and no face means more creators can join.',
  },
  {
    id: 'tmpl_green_screen', name: 'Green screen', rank: 6, mvp: true, min_s: 18, max_s: 30, difficulty: 'medium', faceless: false, lift: 1.0, views_mult: 1.02,
    summary: 'You in front of the app store page, a viral comment, a screenshot or a stat, talking over it.',
    categories: ['ai_assistant', 'finance', 'fitness', 'language', 'sleep_mind'], niches: ['tech', 'money', 'fitness', 'study'], hook_types: ['direct_question', 'curiosity_gap'], cta: ['link_in_bio', 'search_app_store'],
    beats: [['hook', 'Hook over the background', 0, 3, true, 'Point at the stat or comment.'], ['key_feature', 'Explain the one thing', 3, 12, true, 'Talk to camera over the screenshot.'], ['proof', 'Show it on the phone', 12, 19, true, 'Cut to the real app.'], ['offer', 'State the trial', 19, 23, false, 'Once.'], ['cta', 'One call to action', 23, 27, true, 'Link in bio.']],
    script: '{hook} [green screen: store page] This is {app}, and look at {feature}. [cut to phone] {outcome}. {cta}',
    shots: ['Green-screen shot over the store page', 'Screen recording of {feature}', 'Face to camera, call to action'],
    why: 'Feels native on TikTok and lets the creator argue a point with evidence behind them.',
  },
  {
    id: 'tmpl_results_update', name: 'Results update', rank: 7, mvp: false, min_s: 20, max_s: 30, difficulty: 'medium', faceless: false, lift: 1.10, views_mult: 1.06,
    summary: '"Day 30 of using the app." Before versus now, then the feature that did it.',
    categories: ['fitness', 'language', 'finance', 'sleep_mind', 'productivity'], niches: ['fitness', 'study', 'money', 'wellness'], hook_types: ['specific_number', 'confession'], cta: ['link_in_bio', 'use_code'],
    beats: [['hook', 'Day N hook', 0, 3, true, 'Say the day count and one real number.'], ['proof', 'Before versus now', 3, 12, true, 'Show both on screen.'], ['key_feature', 'The feature that did it', 12, 20, true, 'One feature, one sentence.'], ['payoff', 'What changed', 20, 25, true, 'Honest and specific.'], ['cta', 'One call to action', 25, 28, true, 'Link in bio.']],
    script: '{hook} Day {days} of {activity} with {app}. [before] This was me. [now] This is me now. The thing that did it: {feature}. {cta}',
    shots: ['Face to camera, day count', 'Before clip or screenshot', 'Now clip or screenshot', 'Screen recording of {feature}'],
    why: 'Proof beats claims, and the format serialises into a recurring post (Day 7, Day 30).',
  },
  {
    id: 'tmpl_identity_shift', name: 'Identity transformation', rank: 8, mvp: false, min_s: 20, max_s: 30, difficulty: 'medium', faceless: false, lift: 0.98, views_mult: 1.0,
    summary: '"I became someone who..." with the app as the habit behind it.',
    categories: ['fitness', 'language', 'sleep_mind', 'productivity', 'finance'], niches: ['wellness', 'fitness', 'productivity', 'study'], hook_types: ['confession', 'pov'], cta: ['link_in_bio', 'try_free'],
    beats: [['hook', 'Identity hook', 0, 3, true, '"I became someone who..."'], ['problem', 'Who you used to be', 3, 8, true, 'One honest line.'], ['app_reveal', 'The app as the habit', 8, 12, true, 'Show the app by 0:12.'], ['demo', 'The habit in action', 12, 20, true, 'A real moment from the routine.'], ['win_state', 'Who you are now', 20, 25, true, 'End on the win.'], ['cta', 'One call to action', 25, 28, true, 'Link in bio.']],
    script: '{hook} I used to be someone who {pain}. [b-roll] Then I started using {app}. [screen] {feature}. Now I am someone who has {outcome}. {cta}',
    shots: ['Face to camera, identity hook', 'B-roll of the old habit', 'Screen recording of {feature}', 'The new routine'],
    why: 'Recommended for subscription apps, along with leading with the free trial.',
  },
  {
    id: 'tmpl_free_trial_lead', name: 'Free-trial lead', rank: 9, mvp: false, min_s: 15, max_s: 26, difficulty: 'easy', faceless: false, lift: 1.22, views_mult: 0.98,
    summary: 'The offer in the first 3 seconds ("try it free for 7 days"), a quick demo, then value per day.',
    categories: ['fitness', 'sleep_mind', 'language', 'finance', 'ai_photo'], niches: ['fitness', 'wellness', 'study', 'money'], hook_types: ['risk_reversal', 'specific_number'], cta: ['try_free', 'link_in_bio'],
    beats: [['offer', 'Lead with the trial', 0, 3, true, 'Say the trial length in the first sentence.'], ['app_reveal', 'Show the app', 3, 6, true, 'Screen recording by 0:06.'], ['demo', 'Quick demo', 6, 16, true, 'One feature, fast.'], ['payoff', 'Value per day', 16, 21, true, 'Say what it costs after, honestly.'], ['cta', 'One call to action', 21, 25, true, 'Try it free.']],
    script: '{hook} [face] Here is what you get. [screen] {feature}. After the trial it is the price of a coffee a week, and you can cancel in two taps. {cta}',
    shots: ['Face to camera, trial hook', 'Screen recording of {feature}', 'Price screen', 'Call to action'],
    why: 'Risk reversal reduces the leap to install; recommended for subscription apps.',
  },
  {
    id: 'tmpl_reply_comment', name: 'Reply to a comment', rank: 10, mvp: false, min_s: 18, max_s: 28, difficulty: 'medium', faceless: false, lift: 1.04, views_mult: 1.03,
    summary: 'Pin a skeptical comment ("does this actually work?") and answer it with a demo.',
    categories: ['ai_photo', 'ai_assistant', 'finance', 'fitness', 'sleep_mind'], niches: ['ai_tools', 'tech', 'money', 'fitness'], hook_types: ['direct_question', 'confession'], cta: ['link_in_bio', 'comment_for_link'],
    beats: [['hook', 'The pinned comment', 0, 3, true, 'Show the comment and read it out.'], ['demo', 'Answer with a demo', 3, 15, true, 'Show, do not tell.'], ['payoff', 'The honest answer', 15, 21, true, 'Include one limitation to stay credible.'], ['cta', 'One call to action', 21, 26, true, 'Comment for the link.']],
    script: '[comment on screen] "{hook}" Fair question. Let me show you. [screen] {feature}. So yes, it works, with one honest limit: it will not do everything. {cta}',
    shots: ['Reply-to-comment sticker', 'Screen recording of {feature}', 'Face to camera, the honest answer'],
    why: 'Uses the comment as a built-in hook and answers the objection directly.',
  },
  {
    id: 'tmpl_carousel_video', name: 'Carousel turned video', rank: 11, mvp: false, min_s: 15, max_s: 28, difficulty: 'easy', faceless: true, lift: 0.88, views_mult: 0.92,
    summary: 'A slideshow rendered as a video with a text block mid-way naming the app.',
    categories: ['finance', 'lifestyle', 'productivity', 'language'], niches: ['money', 'lifestyle', 'food', 'travel'], hook_types: ['specific_number', 'curiosity_gap'], cta: ['link_in_bio', 'search_app_store'],
    beats: [['hook', 'Title slide', 0, 3, true, 'Big text, one promise.'], ['key_feature', 'Slides 2-4: the tips', 3, 12, true, 'Short text, one idea each.'], ['app_reveal', 'Mid-way: name the app', 12, 16, true, 'A text block that names {app}.'], ['proof', 'Slides 6-7: the proof', 16, 22, false, 'A screenshot.'], ['cta', 'Last slide', 22, 26, true, 'One call to action.']],
    script: '{hook} 1. {pain}. 2. Try this instead. 3. {feature}. [app slide] Made with {app}. 4. {outcome}. {cta}',
    shots: ['Title slide', 'Tip slides', 'App slide', 'Result slide'],
    why: 'Gets carousel-style storytelling into video placements and paid ads.',
  },
];

// ── Academy ─────────────────────────────────────────────────────────────────────────────────────
/** Ten core lessons, five minutes or less each, free and never required. blocks: [kind, title, body]; quiz: [prompt, options, answerIndex, explanation]. */
export const LESSON_OUTLINES = [
  {
    topic: 'first_video', slug: 'first-video-in-15-minutes', title: 'Your first video in 15 minutes', summary: 'Pick a format, write a hook that lands in two seconds, film once, check the score.', badge: 'First take', minutes: 5,
    blocks: [['text', null, 'You do not need a studio. You need a brief, one format and a hook. Pick a format from the library, then write the first line before anything else: it decides whether anyone watches the rest.'], ['steps', 'The 15 minutes', 'Read the brief TL;DR (2 min)\nPick a format and a hook (3 min)\nFilm once, one take, phone upright (5 min)\nCheck the Hook Score and fix the top item (3 min)\nSubmit (2 min)'], ['tip', 'Land the hook by 2 seconds', 'Say the hook line in the first second and put the same words on screen. The Hook Score checks both.'], ['example', 'A good opening', '"I was wrong about workout apps." [on screen: same words] Face on camera, the app on screen by 0:03.'], ['warning', 'Common slip', 'A slow intro. If your first 3 seconds are setup, cut them.']],
    quiz: [['By when should your hook land?', ['2 seconds', '8 seconds', 'Before the call to action'], 0, 'The Hook Score gives full points when the hook lands by 2.0 seconds.'], ['Where should the spoken hook also appear?', ['In the caption only', 'On screen as text within a second', 'Nowhere, it is spoken'], 1, 'Matching on-screen text within the first second keeps viewers who watch on mute.'], ['When should the app appear?', ['By 3 seconds', 'Only at the end', 'Never first'], 0, 'The app must be visible early, not only at the end.']],
  },
  {
    topic: 'briefs_and_rights', slug: 'reading-a-brief-and-a-rights-card', title: 'Reading a brief and a Rights Card', summary: 'What you must say, what you must not, and what the brand may do with your video.', badge: 'Brief reader', minutes: 5,
    blocks: [['text', null, 'Every bounty has a brief (what to make) and a Rights Card (what the brand may do with it). Read both before you film.'], ['steps', 'What to check', 'Required beats (the must-say list)\nThe do and do not list\nOne call to action\nRights Card: organic is always included\nPaid-ad usage: how many days, and the renewal price\nAI likeness: off unless you agree separately'], ['tip', 'Organic is always yours', 'Posting on your own account is always included. Paid ads are extra and have a term.'], ['warning', 'Perpetual rights', 'A Rights Card never says "forever". If a brief does, report it.'], ['example', 'Reading the card', 'Paid ads: 90 days. Renewal: 25% of the base fee per 30 days. AI likeness: off.']],
    quiz: [['What is always included in a Rights Card?', ['Organic posting on your own account', 'Paid ads forever', 'Use of your face by AI'], 0, 'Organic posting is always included; everything else is explicit and time-limited.'], ['What is the default paid-ad term?', ['30 days', '90 days', 'No limit'], 1, 'The default is 90 days, renewable at 25% of the base fee per 30 days.'], ['Is AI likeness included by default?', ['Yes', 'No, it is off by default'], 1, 'AI likeness needs separate, explicit consent.']],
  },
  {
    topic: 'usage_rights', slug: 'usage-rights-and-what-to-charge', title: 'Usage rights and what to charge', summary: 'Whitelisting, Spark codes, partnership ads, renewals, and how paid usage changes the price.', badge: 'Rights savvy', minutes: 5,
    blocks: [['text', null, 'When a brand runs your video as an ad, it is using your content to sell. That is worth more than an organic post, so it is priced separately.'], ['steps', 'The words', 'Whitelisting: the ad runs from your handle\nSpark code (TikTok): a code that lets a brand boost your post\nPartnership permission (Meta): lets a brand run your post as an ad\nUsage term: how long\nRenewal: priced up front'], ['tip', 'Price paid usage up front', 'On your rate card, set paid usage days and the renewal price. A common starting point is 25% of the base fee per extra 30 days.'], ['warning', 'Ask about the end date', 'Ads should stop when your rights end. flowd stops them automatically and alerts at 30, 14 and 7 days.'], ['example', 'Example', 'Base fee $200 with 90 days of paid usage. Renewal: $50 per extra 30 days.']],
    quiz: [['A Spark code lets a brand...', ['Boost your post as an ad', 'Edit your video', 'Post for you'], 0, 'A Spark code authorises ads from your post; it has its own expiry.'], ['Renewal is priced at...', ['25% of the base fee per 30 days', 'Free', 'Whatever the brand decides later'], 0, 'Renewals are priced up front on the Rights Card.'], ['When do ads stop?', ['When the rights end', 'Never', 'When the brand forgets'], 0, 'Ads stop automatically at the end of the term.']],
  },
  {
    topic: 'contract_red_flags', slug: 'contract-red-flags', title: 'Contract red flags', summary: 'Perpetual rights, pay-to-join, burner accounts, unpaid trials and view-minimum bases.', badge: 'Red-flag spotter', minutes: 5,
    blocks: [['text', null, 'Most bad deals have the same few traps. Learn them and you will spot them in seconds.'], ['steps', 'The red flags', 'Perpetual or unlimited usage\nPay to join or a deposit\nA new account just for the brand\nUnpaid test videos\nBase pay only after a view minimum\nBeing asked to move to WhatsApp or Telegram'], ['warning', 'Brief Lint blocks most of these', 'flowd blocks briefs that contain unpaid trials, view-minimum bases or burner-account demands. If you still see one, report it.'], ['tip', 'Keep it in the app', 'In-app chat only. flowd never asks you to pay and never asks you to move off the platform.'], ['example', 'A real trap', '"Pay $25 to unlock the bounty and we will refund you after your first payout." Never.']],
    quiz: [['A brand asks for $25 to join. You should...', ['Pay quickly', 'Report it', 'Ask for a discount'], 1, 'Real bounties never ask creators to pay.'], ['A new account just for the brand is...', ['Required', 'Not allowed in a flowd bounty', 'Recommended'], 1, 'Bounties may not require burner or fresh accounts.'], ['"Move to Telegram to finalise"', ['Fine', 'A warning sign', 'Required by flowd'], 1, 'flowd never asks you to leave the app.']],
  },
  {
    topic: 'platform_rules', slug: 'platform-rules-and-ad-disclosure', title: 'Platform rules and #ad', summary: 'Originality, reposts, watermarks and how to disclose properly.', badge: 'Rule follower', minutes: 4,
    blocks: [['text', null, 'TikTok and Instagram penalise unoriginal content, and the FTC expects clear disclosure. Both are easy to get right.'], ['steps', 'Disclosure checklist', 'Say it out loud ("this is a paid partnership with the app")\nShow #ad on screen for 2 seconds\nPut #ad at the start of the caption\nTurn on the platform paid-partnership label'], ['tip', 'flowd adds it for you', 'Studio and the post screen add #ad and the brand wording and lock them so they cannot be forgotten.'], ['warning', 'Originality', 'Do not repost the same video on many accounts and do not reuse other people\'s footage. Duplicate detection protects you as well.'], ['example', 'A caption', '#ad Paid partnership with Lumi. Watch the glow-up.']],
    quiz: [['Where must #ad appear?', ['Only in the caption', 'Spoken, on screen and in the caption', 'Nowhere if it is a review'], 1, 'Disclosure belongs in the video itself, not only in the caption.'], ['Reposting the same video on many accounts can...', ['Get accounts flagged', 'Earn more', 'Be required'], 0, 'Low-originality reposts are penalised.'], ['Who adds the disclosure text in flowd?', ['Nobody', 'flowd adds and locks it', 'The brand after posting'], 1, 'Auto-disclosure is locked in the post flow.']],
  },
  {
    topic: 'taxes', slug: 'taxes-w9-and-1099', title: 'Taxes: W-9 and 1099', summary: 'When flowd asks for a W-9, what a 1099-NEC is and how to set money aside. Not tax advice.', badge: 'Tax-ready', minutes: 4,
    blocks: [['text', null, 'You are paid as an independent creator, so you are responsible for your own taxes. flowd asks for a W-9 when your first video is approved, before your first payout. This is general information, not tax advice.'], ['steps', 'What happens', 'First approval: we ask for a W-9\nYear to date: shown in Tax Desk\n$2,000 or more paid in 2026: US creators receive a 1099-NEC\nSet-aside estimate: 25% by default, adjustable'], ['tip', 'Set money aside as you go', 'Many creators set aside 25 to 30 percent of earnings. Ask a tax professional what is right for you.'], ['warning', 'Gifts are taxable too', 'Free products or perks can count as income.'], ['example', 'Example', 'You earn $1,640 in a quarter. A 25% set-aside is $410.']],
    quiz: [['When does flowd ask for a W-9?', ['At sign-up', 'At your first approval, before your first payout', 'Never'], 1, 'Just-in-time: we ask when it matters.'], ['A 1099-NEC is issued at what amount (2026 payments)?', ['$600', '$2,000', '$20,000'], 1, 'The threshold for 2026 payments is $2,000.'], ['Is this tax advice?', ['Yes', 'No, ask a professional'], 1, 'flowd gives general information only.']],
  },
  {
    topic: 'scams', slug: 'spotting-scams', title: 'Spotting scams', summary: 'The five patterns and how Scam Shield helps.', badge: 'Scam shield', minutes: 4,
    blocks: [['text', null, 'Scams in creator marketplaces are repetitive. Once you know the patterns they stop working.'], ['steps', 'The five patterns', 'They ask you to pay\nThey want to move to another app\nThe brand is not verified\nThe bounty is not Funded\nThe link goes somewhere strange'], ['tip', 'Look for the Funded badge', 'If a bounty is not Funded, the money is not in escrow. Do not start work until it is.'], ['warning', 'Report it', 'Tap Report on any bounty, message or brand. A human reads every report and replies within 24 hours.'], ['example', 'Example', 'A "brand" messages you on Instagram offering $500 for a video and asks you to buy a gift card first. Report and block.']],
    quiz: [['What does the Funded badge mean?', ['The full budget is in escrow', 'The brand is famous', 'You will definitely be approved'], 0, 'Funded = the full budget and fee reserve are escrowed.'], ['A "brand" asks for gift cards. You...', ['Send them', 'Report them', 'Ask for more money'], 1, 'Never pay to work.'], ['Where should chat happen?', ['In flowd', 'Telegram', 'Email only'], 0, 'In-app chat is protected by Scam Shield.']],
  },
  {
    topic: 'rate_cards', slug: 'rate-cards-and-negotiating', title: 'Rate cards and negotiating', summary: 'Set a price that fits your audience, with paid usage priced up front.', badge: 'Price setter', minutes: 5,
    blocks: [['text', null, 'From Silver tier you can publish a rate card: your price per video, your minimum CPM and what paid usage costs. Brands can buy directly at your ask.'], ['steps', 'Setting your price', 'Look at the market-suggested band\nStart near the median for your tier\nPrice paid usage separately\nSet a turnaround\nChoose your availability'], ['tip', 'Use the suggestion', 'The market-suggested price shows the p25 to p75 range for creators like you.'], ['warning', 'Counter, do not give in', 'You can counter up to three rounds. Know your minimum before you start.'], ['example', 'Example', 'Median 14k views, $2.10 CPM suggests about $45 at the median per video. A rate card at $180 for a dedicated video with 90 days of paid usage is a fair ask for Silver.']],
    quiz: [['From which tier can you have a rate card?', ['Bronze', 'Silver', 'Elite'], 1, 'Rate cards unlock at Silver.'], ['How many counter rounds are allowed?', ['1', '3', 'Unlimited'], 1, 'A maximum of three counter rounds keeps negotiations short.'], ['Paid usage should be...', ['Included free', 'Priced separately up front', 'Decided later'], 1, 'Price paid usage up front.']],
  },
  {
    topic: 'analytics', slug: 'reading-analytics-and-retention', title: 'Reading analytics and retention curves', summary: 'What the retention curve and the funnel tell you about your next video.', badge: 'Data-curious', minutes: 5,
    blocks: [['text', null, 'Every post has a retention curve: the share of viewers still watching at each point. The steepest drop is the part to fix.'], ['steps', 'How to read it', 'Look for the first drop (usually the hook)\nLook at the middle (the demo)\nLook at the end (the call to action)\nCompare with your last three posts'], ['tip', 'Fix the first drop', 'Most improvement comes from the first 3 seconds. Rewrite the hook, not the whole video.'], ['warning', 'Views are not outcomes', 'A post with fewer views can drive more trials. Check the funnel: views, clicks, installs, trials, paid.'], ['example', 'Example', 'A drop to 48% at 0:03 and a flat curve after: the hook lost people, the body held them.']],
    quiz: [['Where is the retention drop usually biggest?', ['At the first seconds', 'At the end', 'In the middle always'], 0, 'The hook decides who stays.'], ['Fewer views always means a worse post.', ['True', 'False'], 1, 'Trial rate per install can be higher on a smaller post.'], ['What should you fix first?', ['The call to action', 'The first 3 seconds', 'The caption'], 1, 'The hook is the highest-leverage fix.']],
  },
  {
    topic: 'sustainable_cadence', slug: 'sustainable-cadence-and-burnout', title: 'Sustainable cadence and burnout', summary: 'Weekly streaks, freezes, rest weeks and a pace that you can keep.', badge: 'Steady pace', minutes: 4,
    blocks: [['text', null, 'The best creators keep a pace they can sustain. flowd streaks are weekly, forgiving and never guilt you.'], ['steps', 'How streaks work', 'Post at least once in an ISO week to count\nEarn one freeze for every 4-week streak (max 2 banked)\nDeclare up to 2 rest weeks per quarter\nMissing a week without a freeze simply ends the streak; nothing is lost'], ['tip', 'Use Wellbeing Mode', 'Quiet hours, numbers-off and Pause keep your tier and your streak safe while you rest.'], ['warning', 'Burnout is real', 'If it stops being fun, take a rest week. Your tier does not drop for 30 days after a dip.'], ['example', 'Example', 'Six weeks in a row and one freeze banked: you can skip a week and keep your streak.']],
    quiz: [['A streak week counts when you...', ['Post at least once in the ISO week', 'Post every day', 'Earn $100'], 0, 'One post per week is enough.'], ['How many freezes can you bank?', ['2', '10', 'None'], 0, 'Max 2 banked; you earn one per 4-week streak.'], ['Does your tier drop right away after a dip?', ['Yes', 'No, there is a 30-day grace'], 1, 'No tier drop for 30 days after a dip.']],
  },
];

// ── trends ──────────────────────────────────────────────────────────────────────────────────────
/** 18 Trend radar items. direction: rising | steady | fading. kind: format | hook | topic | sound. */
export const TREND_DEFS = [
  { kind: 'format', label: 'Screen record + reaction', direction: 'rising', change: 0.31, format_id: 'tmpl_screen_reaction', categories: ['ai_photo', 'ai_assistant'], niches: ['ai_tools', 'tech'], why: 'Shows the app and a real reaction in one frame.', desc: 'Face cam in the corner while the app does something surprising.' },
  { kind: 'format', label: 'Free-trial lead', direction: 'rising', change: 0.22, format_id: 'tmpl_free_trial_lead', categories: ['fitness', 'sleep_mind', 'language'], niches: ['fitness', 'wellness'], why: 'Risk reversal in the first three seconds lifts installs.', desc: 'Open with the trial and a value per day, then demo.' },
  { kind: 'format', label: 'Results update', direction: 'steady', change: 0.04, format_id: 'tmpl_results_update', categories: ['fitness', 'finance'], niches: ['fitness', 'money'], why: 'Proof beats claims and serialises.', desc: 'Day 7 and Day 30 check-ins with before and now.' },
  { kind: 'format', label: 'Faceless slideshow', direction: 'fading', change: -0.18, format_id: 'tmpl_faceless_slideshow', categories: ['finance', 'productivity'], niches: ['money', 'study'], why: 'Fatigue: carousels saturated the feed this quarter.', desc: 'Five to eight text slides with the app on slide four.' },
  { kind: 'format', label: 'Reply to a comment', direction: 'rising', change: 0.14, format_id: 'tmpl_reply_comment', categories: ['ai_assistant', 'finance'], niches: ['ai_tools', 'money'], why: 'The skeptical comment is a built-in hook.', desc: 'Pin a doubtful comment and answer with a demo.' },
  { kind: 'hook', label: 'Specific number in the first line', direction: 'rising', change: 0.19, hook_type: 'specific_number', categories: ['fitness', 'finance', 'productivity'], niches: ['fitness', 'money', 'productivity'], why: 'A real number from your own use signals honesty.', desc: '"12 minutes a day, 30 days." beats a vague promise.' },
  { kind: 'hook', label: 'I owe this app an apology', direction: 'steady', change: 0.03, hook_type: 'confession', categories: ['ai_photo', 'language'], niches: ['lifestyle', 'study'], why: 'Confessions disarm cold audiences.', desc: 'A short, funny confession about doubting the app.' },
  { kind: 'hook', label: 'POV of the first open', direction: 'rising', change: 0.11, hook_type: 'pov', categories: ['sleep_mind', 'lifestyle'], niches: ['wellness', 'lifestyle'], why: 'Relatable and quick to film.', desc: 'POV: you open the app for the first time.' },
  { kind: 'hook', label: 'Why is nobody talking about...', direction: 'fading', change: -0.12, hook_type: 'direct_question', categories: ['ai_assistant', 'productivity'], niches: ['tech', 'productivity'], why: 'Overused; viewers scroll past the phrase.', desc: 'The classic hidden-gem question.' },
  { kind: 'hook', label: 'No intro, straight to the feature', direction: 'rising', change: 0.27, hook_type: 'pattern_interrupt', categories: ['ai_photo', 'music_audio'], niches: ['ai_tools', 'tech'], why: 'Starting mid-action stops the scroll.', desc: 'Begin on the result and rewind.' },
  { kind: 'topic', label: 'Subscription audit', direction: 'rising', change: 0.35, categories: ['finance'], niches: ['money', 'lifestyle'], why: 'Everyone has a forgotten subscription.', desc: 'Showing the number of subscriptions you pay for and what to cancel.' },
  { kind: 'topic', label: 'Sunday reset routines', direction: 'steady', change: 0.02, categories: ['productivity', 'lifestyle'], niches: ['productivity', 'lifestyle'], why: 'A weekly ritual with a clear structure.', desc: 'A calm planning routine with one app.' },
  { kind: 'topic', label: 'Travel planning in one place', direction: 'rising', change: 0.16, categories: ['lifestyle'], niches: ['travel', 'lifestyle'], why: 'Trip season pushes planning content.', desc: 'Planning a weekend trip in 10 minutes.' },
  { kind: 'topic', label: 'Sleep stories for adults', direction: 'steady', change: 0.05, categories: ['sleep_mind'], niches: ['wellness', 'parenting'], why: 'Evenings are the peak for sleep content.', desc: 'A wind-down routine built around sleep stories.' },
  { kind: 'topic', label: 'AI headshots for the job hunt', direction: 'fading', change: -0.09, categories: ['ai_photo'], niches: ['ai_tools', 'beauty'], why: 'Novelty is wearing off; proof matters more now.', desc: 'Before and after profile photo results.' },
  { kind: 'sound', label: 'Lo-fi study loop', direction: 'rising', change: 0.21, categories: ['productivity', 'language'], niches: ['study', 'productivity'], why: 'A calm, recognisable sound under screen recordings.', desc: 'Not licensed for ads: flag on promotion.', sound: false },
  { kind: 'sound', label: 'Commercial-library upbeat pop', direction: 'steady', change: 0.01, categories: ['fitness', 'lifestyle'], niches: ['fitness', 'lifestyle'], why: 'Licensed for ads, safe to promote.', desc: 'Commercial-library track, cleared for paid usage.', sound: true },
  { kind: 'sound', label: 'Trending voiceover audio', direction: 'fading', change: -0.24, categories: ['ai_assistant', 'lifestyle'], niches: ['ai_tools', 'lifestyle'], why: 'Peaked three weeks ago.', desc: 'Not licensed for ads: flag on promotion.', sound: false },
];

// ── crews and tournaments ───────────────────────────────────────────────────────────────────────
export const CREW_DEFS = [
  { name: 'Late Night Edits', tagline: 'We cut videos after the kids are asleep.', niche: 'ai_tools' },
  { name: 'Pocket Studio', tagline: 'Phone-only creators making ad-quality video.', niche: 'tech' },
  { name: 'Sunday Resetters', tagline: 'Plan the week, film the week.', niche: 'productivity' },
  { name: 'Hook Lab', tagline: 'Three-second openings, tested in public.', niche: 'ai_tools' },
  { name: 'Screen Time Club', tagline: 'Apps we actually keep.', niche: 'lifestyle' },
  { name: 'Quiet Hours Collective', tagline: 'Calm content, calm cadence.', niche: 'wellness' },
  { name: 'Golden Hour Gang', tagline: 'Good light, honest reviews.', niche: 'beauty' },
  { name: 'Budget Buddies', tagline: 'Money content without the hype.', niche: 'money' },
];
export const TOURNAMENT_DEFS = [
  { title: 'Hook Battle: Fitness Week', tagline: 'Best first three seconds wins.', format: 'bracket', pool_cents: 100_000, niche: 'fitness', sponsor: 'stridely' },
  { title: 'The 3-Second Open', tagline: 'Open on the hook. Judged by Hook Score and 3-second hold.', format: 'hook_battle', pool_cents: 75_000, niche: null, sponsor: null },
  { title: 'Confession Season', tagline: 'Your best "I was wrong about..." hook.', format: 'bracket', pool_cents: 60_000, niche: 'lifestyle', sponsor: null },
  { title: 'Best First Trial', tagline: 'Most trials started in a week.', format: 'leaderboard', pool_cents: 150_000, niche: null, sponsor: 'dozely' },
  { title: 'Screen Record Sprint', tagline: 'Fastest clean demo wins.', format: 'bracket', pool_cents: 50_000, niche: 'tech', sponsor: 'tasklane' },
  { title: 'Back-to-school Study Hooks', tagline: 'Study apps, one great opener.', format: 'hook_battle', pool_cents: 80_000, niche: 'study', sponsor: 'parlo' },
  { title: 'October Glow-up Brackets', tagline: 'Before and after, head to head.', format: 'bracket', pool_cents: 120_000, niche: 'beauty', sponsor: 'lumi' },
  { title: 'Sleep Story Showdown', tagline: 'The calmest 20 seconds on flowd.', format: 'leaderboard', pool_cents: 40_000, niche: 'wellness', sponsor: 'dozely' },
];
export const TOURNAMENT_RULES = ['Free entry; one hook video per creator.', 'Originality required; no reposted videos.', '#ad and the brand wording are required on every entry.', 'Judged on verified results and Hook Score; ties go to the faster entry.', 'Prizes are paid from the flowd promo account as cleared earnings.'];

// ── public content ──────────────────────────────────────────────────────────────────────────────
export const CHANGELOG_DEFS = [
  ['2026-07-05', 'flowd is live', 'Funded bounties, the Money Clock and weekly payouts are open to the first 200 founding creators and three design-partner apps.', ['new', 'money'], null],
  ['2026-07-10', 'First weekly payout run', 'Payouts run every Friday at 18:00 UTC. Every item shows when it clears and why it is waiting.', ['money'], null],
  ['2026-07-18', 'Timecoded feedback', 'Brands can leave notes anchored to the exact second, with a category and a severity. Must-fix notes carry to your next version.', ['new', 'trust'], null],
  ['2026-07-25', 'Brief Lint', 'Briefs with unpaid trials, view-minimum bases or burner-account demands can no longer be published.', ['trust'], null],
  ['2026-08-01', 'View Ledger and one-tap disputes', 'See every view snapshot for a post, the source mix, and the reason any view was excluded. Dispute from the post in one tap.', ['new', 'trust'], null],
  ['2026-08-08', 'Rate cards and direct offers', 'Silver creators can publish a rate card. Brands can buy at your ask or counter up to three rounds.', ['new'], null],
  ['2026-08-15', 'Daily Drop', 'One drop a day at 16:00 UTC with real spot counts.', ['new'], null],
  ['2026-08-22', 'Instant cash-out', 'Cash out in minutes for 1.5% (minimum $0.50, maximum $15). The fee is shown before you confirm. Weekly payouts stay free.', ['money'], null],
  ['2026-08-29', 'Tiers go live', 'Bronze to Elite, earned from cleared earnings, approved work and reliability. No drop for 30 days after a dip.', ['new'], null],
  ['2026-09-05', 'Winner promotion', 'Brands can run a cleared winner as a Spark or partnership ad with the creator\'s consent. The fee is 1% of ad spend.', ['new', 'money'], null],
  ['2026-09-12', 'Tax Desk', 'Just-in-time W-9, year-to-date totals, a set-aside estimate and a CSV export. Not tax advice.', ['new', 'trust'], null],
  ['2026-09-19', 'Auto-approve with guardrails', 'Rules with a mandatory dry run on the last 50, a 10% human spot-check and a kill switch.', ['new'], null],
  ['2026-09-26', 'Auctions and the Spec Market', 'Platinum creators can auction slots (second price). Approved-but-unused videos are released to the Spec Market after 30 days.', ['new'], null],
  ['2026-10-01', 'Wellbeing Mode', 'Quiet hours, numbers-off, a pace goal that never affects your tier, and a Pause that keeps your streak.', ['new', 'trust'], null],
];
export const TESTIMONIAL_DEFS = [
  { kind: 'creator', author: 'Dani O.', role: 'Lifestyle creator, 31k followers', quote: 'The Money Clock is the first time a platform has told me exactly when money lands and why. No more guessing what "pending" means.', stat_label: 'Median 30-day earnings (my tier)', stat_value: '$62' },
  { kind: 'creator', author: 'Theo B.', role: 'Tech creator, 58k followers', quote: 'I got a no with a reason and a timecode. I fixed it in ten minutes and it was approved. That never happened on other platforms.', stat_label: 'Resubmitted and approved', stat_value: 'in 1 round' },
  { kind: 'creator', author: 'Ines R.', role: 'Study creator, 22k followers', quote: 'The Hook Score told me my opening was late at 2.6 seconds. I moved one line and the next one landed.', stat_label: 'Hook Score', stat_value: 'C to A' },
  { kind: 'creator', author: 'Kofi A.', role: 'Fitness creator, 74k followers', quote: 'The Rights Card showed me the ad term before I filmed. 90 days, renewal priced. Finally, no surprises.', stat_label: 'Paid-usage term', stat_value: '90 days' },
  { kind: 'brand', author: 'Priya N.', role: 'Head of Growth, a subscription app', quote: 'I can see which hooks make trials, not just views. Our cost per trial fell by a third in six weeks.', stat_label: 'Cost per trial', stat_value: '-31%' },
  { kind: 'brand', author: 'Marcus L.', role: 'Founder, an indie productivity app', quote: 'Funded means funded. I put in $1,500, flowd matched $500, and creators were submitting that afternoon.', stat_label: 'Time to first submission', stat_value: '4 h' },
  { kind: 'brand', author: 'Sofia V.', role: 'Growth lead, a language app', quote: 'The review queue is built for speed. I cleared 22 videos in a lunch break with the keyboard.', stat_label: 'Median decision time', stat_value: '9 h' },
  { kind: 'brand', author: 'Jun K.', role: 'Marketing lead at an agency', quote: 'Client approval links without a seat were the thing that closed the loop with my clients.', stat_label: 'Clients on one workspace', stat_value: '3' },
];
export const CASE_STUDY_DEFS = [
  { app: 'lumi', title: 'Lumi: from views to trials', angle: 'Stacked pay with a fast review queue.', quote: 'We stopped counting views and started counting trials. Creators got paid on time and we found three hooks that carried the quarter.', author: 'Jordan E.', role: 'Growth lead (fictional)' },
  { app: 'dozely', title: 'Dozely: a sleep app that found its hook', angle: 'Specific-number hooks and risk reversal.', quote: 'The seven free days in the first three seconds lifted our trial rate more than any thumbnail ever did.', author: 'Rhea S.', role: 'Marketing manager (fictional)' },
  { app: 'stridely', title: 'Stridely: install-only, no risk', angle: 'An install-only bounty for a small team.', quote: 'We paid nothing for views and only for installs we could track. It was the easiest yes our CFO has given.', author: 'Marcus L.', role: 'Founder (fictional)' },
  { app: 'budgetbee', title: 'Budgetbee: the winner promotion loop', angle: 'Organic winner to Spark ad with commission.', quote: 'We promoted the one post that drove trials. The creator earned a share and our payback day dropped from 31 to 19.', author: 'Anya P.', role: 'Head of Growth (fictional)' },
  { app: 'parlo', title: 'Parlo: ten creators in ten days', angle: 'Daily Drop and early-access tiers.', quote: 'Our bounty filled in 38 hours and the first submissions were better than our agency tests.', author: 'Sofia V.', role: 'Growth lead (fictional)' },
  { app: 'wanderlist', title: 'Wanderlist: travel season in a week', angle: 'Spec Market and re-buys.', quote: 'We licensed four ready-made videos and re-bought the winner with three new hooks. Total setup: an afternoon.', author: 'Kai M.', role: 'Co-founder (fictional)' },
];
export const MODEL_DEFS = [
  { kind: 'video_understanding', name: 'Video understanding', version: 'heuristic-1.0', stage: 'heuristic', description: 'Transcript (speech-to-text), scene cuts, on-screen text and embeddings. Tags every settled post by format, hook type, hook words, time to app reveal and CTA type.' },
  { kind: 'hook_coach', name: 'Hook coach (on device)', version: 'vision-1.0', stage: 'heuristic', description: 'First-3-seconds checks for face, on-screen text, motion and app visibility, running on the phone with no server round-trip.' },
  { kind: 'auto_qa', name: 'Auto-QA', version: 'rules-1.2', stage: 'heuristic', description: 'Brief beats against the transcript, disclosure audio and on-screen, perceptual-hash duplicates, music and watermark checks, moderation.' },
  { kind: 'fraud', name: 'View-fraud detection', version: 'rules-1.1', stage: 'heuristic', description: 'Ten weighted signals on view curves and account history produce a 0 to 100 risk score.' },
  { kind: 'creative_scorer', name: 'Creative scorer', version: 'checklist-1.0', stage: 'heuristic', description: 'The Hook Score and Flow Score checklists. A learned model runs in shadow once about 1,000 posts have settled.' },
  { kind: 'matching', name: 'Matching', version: 'rules-1.0', stage: 'heuristic', description: 'Match score from niche overlap, platform, audience region, price fit, brand reliability and recency, with binary eligibility gates.' },
  { kind: 'pricing', name: 'Pricing model', version: 'curve-1.0', stage: 'heuristic', description: 'Suggested CPM and price-versus-fill-time curve from the live market series, with a confidence score.' },
  { kind: 'fatigue', name: 'Fatigue detection', version: 'rules-1.0', stage: 'heuristic', description: 'Alert when the trial-start rate of a winner falls 30% from its peak.' },
];
export const SPEC_TITLES = ['The 20-second glow-up', 'Slept-on feature, one tap', 'I owe this app an apology', 'Sunday reset in one app', 'Subscription audit, live', 'Day 7 results update', 'Night routine, calmer', 'Beat in five minutes', 'Plan the trip, split the cost', 'Budget in ten seconds', 'My first run with a coach', 'Pantry scan, no waste', 'Reply: does this really work?', 'The 3-second open', 'Faceless tips, five slides', 'Before and after, no filter', 'Study with me, 25 minutes', 'Chord detector, live', 'Morning pages, but fast', 'Free trial lead: seven days'];
export const AUCTION_TITLES = ['One dedicated video, 90-day usage', 'Two hooks, same body', 'Launch week slot', 'Weekend slot: fitness', 'Trend slot: first look', 'Evergreen explainer', 'Holiday campaign slot', 'Creator-led demo'];
export const STATE_METHODOLOGY = 'Clearing CPMs are the median CPM of bounties that filled or are live and receiving submissions in the quarter. View-to-trial rates are tracked (link and code) conversions per verified view on settled posts; estimated conversions are excluded. Hook types and formats are tagged by the video-understanding model and checked by a human on a 5% sample. Figures are from flowd data only, in the demo from the fixtures, and are labelled estimates where they are modelled.';
export const STATE_CAVEATS = ['Demo data: all numbers come from the demo fixtures.', 'Small samples (under 8 bounties) are marked as thin and excluded from rankings.', 'Checklist scores are not a prediction of results.'];
export const INTEGRATION_DEFS = {
  revenuecat: { label: 'RevenueCat', scopes: ['webhook:write', 'subscribers:read'] }, appsflyer: { label: 'AppsFlyer', scopes: ['onelink:read', 'installs:read'] }, adjust: { label: 'Adjust', scopes: ['installs:read'] }, branch: { label: 'Branch', scopes: ['links:read'] },
  meta_ads: { label: 'Meta Ads', scopes: ['partnership_ads:write', 'insights:read'] }, tiktok_ads: { label: 'TikTok Ads', scopes: ['spark_ads:write', 'insights:read'] }, slack: { label: 'Slack', scopes: ['chat:write', 'channels:read'] },
  zapier: { label: 'Zapier', scopes: ['webhooks:write'] }, app_store_connect: { label: 'App Store Connect', scopes: ['offer_codes:write', 'listing:read'] },
};
