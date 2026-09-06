export const ZONES = {
  woods: "Customer Woods",
  plains: "Product Plains",
  highlands: "Reach Highlands",
  village: "Founder's Hollow"
}

export const MODULE_NAMES = {
  A: "The Customer",
  B: "The Offer",
  C: "The Machine",
  D: "The Strategy"
}

export const FACTS = [
  { id: "fact-course", title: "The Course", cat: "Known to the CMO", text: "An online English course for Uzbek learners, 3 months long. Live lessons with one dedicated teacher, supported by a coordinator." },
  { id: "fact-price", title: "The Price", cat: "Known to the CMO", text: "$40 per month. Roughly $120 for the full 3-month journey." },
  { id: "fact-budget", title: "The War Chest", cat: "Known to the CMO", text: "Marketing budget for this quarter: $200. Every dollar must be aimed, not scattered." },
  { id: "fact-team", title: "The Ranks", cat: "Known to the CMO", text: "Team: 1 teacher, 1 coordinator, 1 salesman. Capacity is precious — marketing must never outrun delivery." },
  { id: "fact-assets", title: "The Fortress", cat: "Known to the CMO", text: "A Telegram channel with ~1,000 subscribers, plus a working website." },
  { id: "fact-students", title: "The Rear Guard", cat: "Known to the CMO", text: "20 active students currently march with us." }
]

export const BATTLES = [
  {
    id: "b01", module: "A", zone: "woods", enemy: "rat", hard: false, key: "persona",
    title: "Your Best Student",
    lesson: "I refuse to market to \u201ceveryone who wants English\u201d — that is marketing to no one. Give me one real person to write for, and every dollar and every word will speak straight into their life, and they will lean in.",
    question: "Describe the student you serve best: first name, age, city, occupation, and what English must change for them.",
    example: "Dilnoza, 24, Tashkent, junior accountant. English is her door to an international firm and a doubled salary within two years.",
    minLen: 25
  },
  {
    id: "b02", module: "A", zone: "woods", enemy: "rat", hard: false, key: "motivation",
    title: "Why They Buy",
    lesson: "Nobody buys English for English. They buy the IELTS band, the promotion, the remote job, the visa. The motive decides the words I write into your ads and the promise we lead with — so tell me the truth of why they pay.",
    question: "In your experience, what is the #1 reason students buy your course — and the #2? (emigration, IELTS, career, remote work, study abroad, travel...)",
    example: "#1: emigration — they need IELTS for visas to the UK or Poland. #2: remote work — Uzbek IT and support jobs now pay in dollars.",
    minLen: 20
  },
  {
    id: "b03", module: "A", zone: "woods", enemy: "fox", hard: false, key: "levels",
    title: "Level & Destination",
    lesson: "A promise I cannot verify kills trust. Give me the exact journey — the level they arrive at and the level they leave with — so our ads can say \u201cFrom A2 to B2 in 90 days\u201d instead of the vague \u201clearn English fast\u201d that everyone ignores.",
    question: "What level do most students start at (A1\u2013C1), and what level do they reach after your 3-month course?",
    example: "Most start at A2 (some A1) and reach solid B1 in 3 months; the most disciplined reach B2.",
    minLen: 15
  },
  {
    id: "b04", module: "A", zone: "woods", enemy: "fox", hard: true, key: "pains",
    title: "The Old Wounds",
    lesson: "Every student tried to learn before you and failed somewhere else. If I know exactly what broke — the price, the boring drills, the fear of speaking — our message becomes the bandage for that exact wound, and trust arrives before we even say hello.",
    question: "Why didn't your current students manage to learn English before you? What was broken or missing in the options they tried?",
    example: "Local centers were far and taught grammar by rote; apps felt lonely; tutors were $10 an hour and unstructured. Nothing gave speaking practice with feedback.",
    minLen: 25
  },
  {
    id: "b05", module: "A", zone: "woods", enemy: "boar", hard: true, key: "competitors",
    title: "The Enemy Schools",
    lesson: "You do not sell in an empty field — students weigh you against local centers, free YouTube and Telegram channels. Show me the battlefield and your sharpest weapon, and I will position you where you cannot lose.",
    question: "Name the alternatives your students consider instead of you (local centers, YouTube, apps, private tutors) — and the one thing you give them that none of them can.",
    example: "They compare IELTS centers and free YouTube. We win on live speaking practice in small groups, in an Uzbek-friendly atmosphere, at a fair price.",
    minLen: 25
  },
  {
    id: "b06", module: "A", zone: "woods", enemy: "boar", hard: true, key: "decision",
    title: "The Money Decision",
    lesson: "$40 a month is a real decision in an Uzbek household. I must know who pays, what they compare us against, and which objections your salesman hears — then I can remove the fear before it ever reaches him.",
    question: "How do students decide to pay $40/month? Who pays — the student, parents, an employer? What do they compare the price against, and what objection does your salesman hear most?",
    example: "Young professionals pay themselves; parents pay for IELTS-bound students. They compare against private tutors and IELTS centers. Most common objection: \u201cWhat if I miss live lessons?\u201d",
    minLen: 30
  },
  {
    id: "b07", module: "A", zone: "woods", enemy: "wolf", hard: false, key: "proof",
    title: "Proof of Victory",
    lesson: "One real student's before-and-after outweighs a hundred clever slogans. I need three named victories — with results and a sentence in their own words — to carry your ads, your Telegram posts and your site. Proof is the loudest trumpet we own.",
    question: "Give me your 3 happiest students: first name, their result (level passed, score, job), and one sentence they actually said about the course.",
    example: "Aziza — IELTS 7.0, applying to a Polish university: \u201cI finally stopped being afraid to speak.\u201d Timur — got a remote job paying $500/month. Malika — A2 to B1 in one course.",
    minLen: 30
  },
  {
    id: "b08", module: "B", zone: "plains", enemy: "wolf", hard: false, key: "product",
    title: "Inside the Machine",
    lesson: "I cannot sell a chest if I do not know what treasure lies inside. Open it for me: the lessons, the format, the group, the support. Vague products get vague sales — precise products get devoted students.",
    question: "Describe exactly what a student gets in the 3-month course: lessons per week, format (live Zoom? Telegram?), group size, materials, homework, support, certificate.",
    example: "3 live Zoom lessons per week in groups of 8, recordings for missed days, weekly homework checked by the teacher, daily Telegram support, completion certificate.",
    minLen: 30
  },
  {
    id: "b09", module: "B", zone: "plains", enemy: "wolf", hard: false, key: "promise",
    title: "The Promise",
    lesson: "One sentence will sit at the top of every page and every post — the transformation promise. Bold, specific, checkable. Forge it now: from what, to what, in how long.",
    question: "Write the transformation promise of the course in ONE sentence: from what level or state, to what result, in how long.",
    example: "From afraid-to-speak A2 to confident B1 in 3 months — live speaking practice every single week.",
    minLen: 20
  },
  {
    id: "b10", module: "B", zone: "plains", enemy: "bear", hard: true, key: "usp",
    title: "Why You Win",
    lesson: "Local centers have classrooms; YouTube is free; yet twenty people chose you. There is a reason, and it is your sword in every campaign. Name the single sharpest difference — the thing none of them can copy cheaply.",
    question: "What is the ONE thing your course gives that local schools, free YouTube and Telegram channels cannot or will not?",
    example: "Live speaking practice with a teacher who corrects you by name, in a group that feels safe — something no recorded video can give.",
    minLen: 25
  },
  {
    id: "b11", module: "B", zone: "plains", enemy: "bear", hard: false, key: "bonus",
    title: "The Value Boost",
    lesson: "We cannot outspend anyone — so we will out-value them. A small, cheap, high-perceived-value addition makes the same $40 feel like a richer deal. Tell me what we forge into the offer.",
    question: "What bonus could we add to the course that costs you almost nothing but feels valuable to students? (weekly speaking club, mock IELTS, e-book, community events...)",
    example: "A free Saturday speaking club for all students, plus one recorded mock IELTS speaking test with feedback.",
    minLen: 20
  },
  {
    id: "b12", module: "B", zone: "plains", enemy: "bear", hard: true, key: "pricing",
    title: "The Price Levers",
    lesson: "Price is not a number, it is a machine with levers: how they pay, what is guaranteed, what is bundled. Moving one small lever often decides whether a hesitant family says yes. Show me your levers.",
    question: "Lay out the payment logic: is $40 paid month by month or upfront? Should we offer installments, a guarantee (e.g., first week free to quit), or a referral discount? Decide and defend it.",
    example: "Monthly by Payme/Click. First lesson free as a trial. 10% referral discount when a friend enrolls. No upfront lock-in — trust first.",
    minLen: 30
  },
  {
    id: "b13", module: "C", zone: "highlands", enemy: "owl", hard: false, key: "channels",
    title: "How Twenty Found You",
    lesson: "The surest map to the next twenty students is the road the last twenty took. Give me the honest breakdown of where they came from — and I will aim our $200 where it already works instead of where fashion says.",
    question: "Of your current ~20 students, roughly how many came from each: friend referrals, Telegram channel, Instagram, website/Google, salesman outreach? Estimate as numbers.",
    example: "8 referrals, 6 Telegram, 3 Instagram, 2 website, 1 salesman outreach.",
    minLen: 15
  },
  {
    id: "b14", module: "C", zone: "highlands", enemy: "owl", hard: false, key: "telegram",
    title: "The Telegram Truth",
    lesson: "A thousand subscribers is either a fortress or a ghost town — views per post will tell me which. If they trust you, we monetize; if they have gone quiet, we revive the channel before we spend a single dollar on ads.",
    question: "How many views does a typical post in your Telegram channel get? How often do you post, and what kind of post gets the biggest reaction?",
    example: "Typical post: 250\u2013400 views. I post 3 times a week. Polls and student-win posts get the most reactions.",
    minLen: 20
  },
  {
    id: "b15", module: "C", zone: "highlands", enemy: "owl", hard: false, key: "website",
    title: "The Website's Duty",
    lesson: "A site without a single clear job is a visiting card in a drawer. I want it to capture the shy ones: book a trial lesson, take a placement test, join Telegram. Tell me its duty today, and the one duty you will give it.",
    question: "What does your website do today, and what ONE job should it do for this quarter's plan? (capture trial-lesson signups, placement test, big Telegram button...)",
    example: "Today it describes the course. This quarter: one page with a \u201cFree trial lesson\u201d form + prominent Telegram link, so every visitor can raise a hand.",
    minLen: 25
  },
  {
    id: "b16", module: "C", zone: "highlands", enemy: "owl", hard: true, key: "capacity",
    title: "The Ranks' Strength",
    lesson: "Marketing that outruns delivery forges refunds, not growth. I must know your onboarding limit and how the ranks divide their work, so we scale to your strength and not to a dream.",
    question: "How many NEW students per month can your team onboard comfortably? And what does each — teacher, coordinator, salesman — actually do every week?",
    example: "Comfortably 8\u201310 new per month. Teacher runs lessons and checks homework; coordinator handles schedules, group chats, payments; salesman answers leads, does trial calls, follows up.",
    minLen: 30
  },
  {
    id: "b17", module: "D", zone: "highlands", enemy: "elder", hard: true, key: "goal",
    title: "The One Number",
    lesson: "A quarter without one defining number becomes busywork. Choose the single figure that will mean victory — students, revenue or retention — and every decision I draft will kneel to it.",
    question: "What ONE number, reached by the end of the quarter, means this plan succeeded? (e.g., \u201c40 active students\u201d, \u201c$4,800/month revenue\u201d, \u201c85% course completion\u201d)",
    example: "40 active students by the end of the quarter, without dropping below 85% completion.",
    minLen: 15
  },
  {
    id: "b18", module: "D", zone: "highlands", enemy: "elder", hard: true, key: "bet",
    title: "The $200 Bet",
    lesson: "Two hundred dollars scattered on five channels buys nothing but noise; the same two hundred on one clear bet buys knowledge and, if the bet is right, a growth engine. Place the bet, founder — and tell me what you expect it to bring.",
    question: "Where exactly should the $200 go this quarter, and what result do you expect? (e.g., \u201c$150 Telegram post boosts in 5 Uzbek channels + $50 referral bonuses \u2192 30 leads, 10 students\u201d)",
    example: "$120 on posts in 4 popular Uzbek Telegram channels, $50 on referral bonuses for current students, $30 on Telegram ads for the trial-lesson page. Expect 30+ leads, 8\u201310 enrollments.",
    minLen: 30
  },
  {
    id: "b19", module: "D", zone: "highlands", enemy: "elder", hard: true, key: "test",
    title: "The First Test",
    lesson: "A plan is a row of bets, and bets deserve scoreboards. We test one thing each month, keep what wins, bury what loses. Name the first test and the number that will judge it.",
    question: "What will we test in month one — one offer, one ad, one channel? And which number decides if it worked (cost per lead, trial lessons booked, signups)?",
    example: "Test Telegram channel posts with the trial-lesson offer. Success = cost per lead under $2 and at least 10 trial lessons booked in month one.",
    minLen: 25
  },
  {
    id: "b20", module: "D", zone: "highlands", enemy: "elder", hard: true, key: "metric",
    title: "The Monday Flag",
    lesson: "Before we march, we plant the flag on the mountain and agree who salutes it each Monday: the metric, the target, the owner. This is what turns a plan into discipline instead of a wish.",
    question: "Which metric will we check every Monday? What is the target, and who on the team owns watching it?",
    example: "Leads per week — target 10 per week by month two; the coordinator owns the scoreboard and reports every Monday morning.",
    minLen: 20
  }
]

export const BOSS = {
  enemy: "bull",
  name: "The Bull Market",
  intro: "So. The founder returns. Words are cheap, founder — the Bull only bows to those who know their numbers. Answer, and the CMO's plan will stand before you forged in gold.",
  challenges: [
    {
      key: "boss1", title: "Show the Bull Your Promise", minLen: 15,
      lesson: "\u201cRepeat the promise you carved in the Product Plains — the Bull tests whether it still rings true.\u201d",
      question: "State your transformation promise again — sharper, if you can.",
      example: "From afraid-to-speak A2 to confident B1 in 3 months — live speaking practice every week."
    },
    {
      key: "boss2", title: "Defend the $200", minLen: 25,
      lesson: "\u201cA bet without a defense is a gamble. What could kill your channel bet, and what is your second move?\u201d",
      question: "What could go wrong with your $200 bet, and what will you do then?",
      example: "If Telegram posts bring leads but no trials, I move the budget to referral bonuses and Instagram micro-influencers."
    },
    {
      key: "boss3", title: "The Path of a Stranger", minLen: 25,
      lesson: "\u201cWalk the Bull the road: where does a stranger first see you, what do they do next, and who closes them?\u201d",
      question: "Describe your funnel in 2\u20133 sentences: first touch \u2192 trust \u2192 trial \u2192 enrollment.",
      example: "A post in an Uzbek Telegram channel \u2192 free useful content + link to our channel \u2192 the student messages us \u2192 salesman books a free trial lesson \u2192 enrolls."
    },
    {
      key: "boss4", title: "The Bull Respects Math", minLen: 25,
      lesson: "\u201cTwenty students, one thousand followers, two hundred dollars. Is your goal honest arithmetic or a birthday wish?\u201d",
      question: "Check your goal against your machine: is it realistic with your team, price and channels? Adjust the number if you must.",
      example: "20 active + 8\u201310 new per month for 3 months \u2248 40\u201345 active by quarter end — realistic with our onboarding capacity."
    },
    {
      key: "boss5", title: "The Final Vow", minLen: 25,
      lesson: "\u201cLast gate, founder. Speak the goal, the Monday metric, and the first test — the Bull will remember them.\u201d",
      question: "State in one short paragraph: your quarter goal, the Monday metric, and the first test of month one.",
      example: "Goal: 40 active students. Monday metric: 10 leads per week, tracked by the coordinator. First test: trial-lesson offer in Uzbek Telegram channels, $120."
    }
  ]
}

export const PRAISES = [
  "Good. This changes the shape of my plan.",
  "Now the plan has bones. Continue, founder.",
  "That will serve. The Bull will hear of this.",
  "Written in the ledger. Onward."
]

export const NUDGES = [
  "Give me more, founder. A general does not march on a one-word map.",
  "Deeper. The devil — and the gold — is in the details.",
  "That is a start, not an answer. Write it as you would tell it to a merchant.",
  "I need the truth, not the slogan. What would you say to me across a table?"
]

export const TIMEOUT_NUDGES = [
  "The candle burned down! Decide faster — a slow decision is a lost battle. Again.",
  "Time is a blade, founder. Cut quicker. Once more."
]

export const COIN_LESSONS = [
  { zone: "woods", title: "Fish where the fish are", tip: "Do not advertise where marketers hang out. Find where ambitious Tashkent 20-somethings already spend evenings: Telegram channels and Instagram Reels." },
  { zone: "woods", title: "One persona beats ten guesses", tip: "Write your best student on a card and tape it to your monitor. Every post, every ad should be written to that one person by name." },
  { zone: "woods", title: "Sell the destination", tip: "Uzbeks do not want English lessons; they want the IELTS band, the remote job, the visa interview won. Sell the destination, not the vehicle." },
  { zone: "woods", title: "Fear of speaking is the silent killer", tip: "Many Uzbek learners understand but freeze when speaking. A course that promises a safe speaking environment wins hearts that grammar-only schools lose." },
  { zone: "woods", title: "Mothers decide too", tip: "For younger students, parents often pay. One line for mothers — \u201cyour child will thank you\u201d — can double conversions." },
  { zone: "woods", title: "Referrals are gold", tip: "A referred student costs nothing to acquire and trusts you on day one. Ask every happy student for one name, every month." },
  { zone: "woods", title: "Name the enemy", tip: "Bad local schools with boring grammar drills are your shared enemy. Contrast stories work: \u201cNo more memorizing word lists alone.\u201d" },
  { zone: "woods", title: "Voices beat text", tip: "Uzbeks trust voices over text. Collect 20\u201330 second audio testimonials in Uzbek — they convert like written reviews never will." },
  { zone: "woods", title: "Price is relative", tip: "$40 sounds heavy alone; beside \u201cprivate tutor: $15/hour\u201d or \u201cIELTS retake: $200\u201d it sounds like the bargain of the year. Always anchor." },
  { zone: "woods", title: "The 5-minute rule", tip: "A lead contacted within 5 minutes is many times likelier to enroll. Your salesman's speed is a marketing channel by itself." },
  { zone: "woods", title: "Community is retention", tip: "Students stay where they belong. A Telegram group where progress is celebrated weekly is a product feature, not a nicety." },
  { zone: "woods", title: "Ask \u201cwhat changed?\u201d", tip: "Every month ask a student: what changed in your life since joining? Their answers are your next ads, written by fate itself." },
  { zone: "plains", title: "Promise one transformation", tip: "One course, one promise: \u201cFrom A2 to B2 in 3 months.\u201d Ten promises sound like zero." },
  { zone: "plains", title: "Features tell, outcomes sell", tip: "\u201c24 live lessons\u201d is a feature. \u201cSpeak without fear in 90 days\u201d is the outcome. Lead with the second." },
  { zone: "plains", title: "The guarantee disarms fear", tip: "A simple promise — \u201cif after week one it is not for you, full refund\u201d — removes the risk that stops the hesitant majority." },
  { zone: "plains", title: "Bonus > discount", tip: "A free mock IELTS or speaking club raises perceived value without cutting your price. Discounts teach students to wait; bonuses teach them to act now." },
  { zone: "plains", title: "Scarcity, honestly used", tip: "\u201c20 seats per group — the teacher knows every name\u201d is true and motivating. Real limits beat fake countdown timers." },
  { zone: "plains", title: "Show the syllabus", tip: "Publish week-by-week what students will master. Visible structure turns \u201cmaybe\u201d into \u201cI start Monday\u201d." },
  { zone: "plains", title: "Certificate = trophy", tip: "People display what they earn. A beautiful named certificate, shareable on Instagram, is free marketing by your own graduates." },
  { zone: "plains", title: "Name your method", tip: "Give your teaching approach a name. \u201cThe 90-Day Speaking Sprint\u201d is memorable; \u201cour course\u201d is not." },
  { zone: "plains", title: "Onboarding is marketing", tip: "The first 48 hours decide word-of-mouth. A welcome call, a study plan, a buddy — delight early, and students will sell for you." },
  { zone: "plains", title: "Record the wins", tip: "Screenshot every \u201cI passed!\u201d message with permission. A folder of proof is your ad library." },
  { zone: "plains", title: "Trial lessons close doubters", tip: "Let hesitant leads sit in one real lesson free. Experiencing the group beats any pitch your salesman can give." },
  { zone: "highlands", title: "One channel, one test", tip: "$200 on five channels buys noise; $200 on one channel with a clear test buys knowledge. Bet, measure, then scale or kill." },
  { zone: "highlands", title: "Cost per lead, not likes", tip: "Likes are applause; leads are soldiers. Judge every channel by cost per lead, then cost per student." },
  { zone: "highlands", title: "Telegram ads in local channels", tip: "Buying posts in popular Uzbek Telegram channels puts you inside a trusted conversation — often the cheapest quality attention in the market." },
  { zone: "highlands", title: "Micro-influencers over celebrities", tip: "A teacher with 5k engaged followers beats a star with 500k strangers. Small audiences, big trust." },
  { zone: "highlands", title: "The site has one job", tip: "One page, one button: \u201cBook a free trial lesson.\u201d Every extra link is an exit door." },
  { zone: "highlands", title: "Retarget the lurkers", tip: "Most visitors leave silently. A Telegram-follow reminder or a simple lead form catches the shy ones." },
  { zone: "highlands", title: "Monday scoreboard", tip: "Check leads, trials, signups every Monday, same time, same sheet. What is measured improves; what is ignored decays." },
  { zone: "highlands", title: "Content compounds", tip: "A useful post — \u201c10 words Uzbeks always mispronounce\u201d — works for years. Teach in public; students arrive pre-convinced." },
  { zone: "highlands", title: "The funnel in one line", tip: "Stranger sees a post \u2192 joins free Telegram \u2192 watches proof \u2192 books trial \u2192 salesman closes. Know your line, fix its weakest link." },
  { zone: "highlands", title: "Seasons matter", tip: "IELTS deadlines, university admissions, New Year resolutions: plan campaigns on Uzbekistan's calendar, not on vibes." },
  { zone: "highlands", title: "Track the ask", tip: "Every week log what objections the salesman hears. Those objections are next month's content plan." },
  { zone: "highlands", title: "The follow-up fortune", tip: "Most enrollments happen after the 2nd or 3rd touch. A polite follow-up sequence is often worth more than new ads." },
  { zone: "highlands", title: "Quarterly review ritual", tip: "Every 90 days, sit with your numbers and this notebook. Keep what worked, bury what did not, write the next plan." }
]
