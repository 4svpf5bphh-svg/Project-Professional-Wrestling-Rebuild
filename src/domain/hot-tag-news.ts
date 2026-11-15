/** HOT TAG — Tag in. Sound off.
 * Public, deterministic fan conversation about *published* World News.
 * No account identifiers, new World facts, API requests, timers or DB writes.
 * Fan comments never establish that the rumour is real. */
export const HOT_TAG_NAME="HOT TAG";
export const HOT_TAG_TAGLINE="Tag in. Sound off.";
import {COMMERCIAL_COMPANIES} from "./commercial-offers.js";
export interface HotTagBroadcasterPost{
 networkCode:string;handle:string;displayName:string;avatar:string;text:string;
 likes:number;replies:number;reposts:number;
}
/** An official network only speaks when a certified World News statement
 * already quotes that exact brand. Unverified gossip never impersonates it. */
export function projectHotTagBroadcasterPost(story:HotTagNewsStory):
 HotTagBroadcasterPost|null{
 if(story.desk!=="OFFICIAL")return null;
 const match=/^broadcast:network:(BROADCAST_[A-Z]+):(warning|final-warning|recovery):/
  .exec(story.id);
 if(!match)return null;
 const code=match[1]!,brand=COMMERCIAL_COMPANIES[code];
 if(!brand)return null;
 const quoted=story.summary.match(/responded: "([^"]{1,260})"/)?.[1];
 if(!quoted)return null;
 const hash=stableHotTagHash(story.id);
 return {networkCode:code,displayName:brand.name,avatar:brand.mark,
  handle:"@"+brand.name.replace(/[^a-zA-Z0-9]/g,""),
  text:quoted,likes:80+hash%1700,replies:12+(hash>>>8)%250,
  reposts:6+(hash>>>16)%180};
}
export interface HotTagNewsStory{
 id:string;year:number;week:number;title:string;summary:string;
 desk:"OFFICIAL"|"DIRT";promotionName:string;promotionId?:string;sourceKind?:string;
}
export interface HotTagNewsPost{
 handle:string;displayName:string;avatar:string;text:string;
 likes:number;replies:number;reposts:number;
 /** A fan can reply to another fan, never pretend to be a verified source. */
 replyTo?:string;
}
const commentators=[
 {handle:"@WorkratePolice",displayName:"The Workrate Police",avatar:"🧐"},
 {handle:"@CurtainWatcher",displayName:"Curtain Watcher",avatar:"👀"},
 {handle:"@HeelApologist",displayName:"Heel Apologist",avatar:"😈"},
 {handle:"@TapeTrader92",displayName:"Tape Trader '92",avatar:"📼"},
 {handle:"@FrontRowFran",displayName:"Fran | Ringside",avatar:"🔥"},
 {handle:"@FeudEnjoyer",displayName:"Feud Enjoyer",avatar:"🍿"},
 {handle:"@TheCheapSeats",displayName:"The Cheap Seats",avatar:"😂"},
 {handle:"@BellToBellBen",displayName:"Bell To Bell Ben",avatar:"💥"},
 {handle:"@TurnbuckleTwat",displayName:"Turnbuckle Twat",avatar:"🪑"},
 {handle:"@RatingsWarGoblin",displayName:"Ratings War Goblin",avatar:"📉"},
 {handle:"@ChairshotBarry",displayName:"Barry From Row G",avatar:"🧢"},
 {handle:"@KayfabeKaren",displayName:"Kayfabe Karen",avatar:"📢"},
 {handle:"@SmarkyMcSmark",displayName:"Smarky McSmark",avatar:"🤓"},
 {handle:"@PiledriverPigeon",displayName:"Piledriver Pigeon",avatar:"🐦"},
 {handle:"@SuplexTax",displayName:"The Suplex Accountant",avatar:"🧾"},
 {handle:"@MumsBasementBooker",displayName:"Basement Booker",avatar:"🛋️"},
 {handle:"@HeelHeatHarry",displayName:"Heel Heat Harry",avatar:"😤"},
 {handle:"@GorillaPosition",displayName:"Gorilla Gossip",avatar:"🦍"},
 {handle:"@BotchSpotter",displayName:"Botch Spotter",avatar:"🔍"},
 {handle:"@FourPointNineStars",displayName:"4.99 Stars",avatar:"⭐"},
 {handle:"@TablesLaddersTea",displayName:"Tables, Ladders & Tea",avatar:"🫖"},
 {handle:"@WrestlingNan",displayName:"Nan Watches Wrestling",avatar:"👵"},
 {handle:"@TheRealestMark",displayName:"Mark Markson",avatar:"🥸"},
 {handle:"@PromoGoblin",displayName:"Promo Goblin",avatar:"🎙️"},
 {handle:"@BigFightBrian",displayName:"Big Fight Brian",avatar:"🥊"},
 {handle:"@BackRowBec",displayName:"Back Row Bec",avatar:"🥤"},
 {handle:"@WrestlingIsMyTherapy",displayName:"Monday Night Meltdown",avatar:"🛎️"},
 {handle:"@BeltCollector",displayName:"Belt Collector",avatar:"🏆"},
 {handle:"@HeadlockHooligan",displayName:"Headlock Hooligan",avatar:"💀"},
 {handle:"@TuesdayNightTodd",displayName:"Tuesday Night Todd",avatar:"📅"},
 {handle:"@TerritoryTruther",displayName:"Territory Truther",avatar:"🗺️"},
 {handle:"@MeltzerMaths",displayName:"Star Maths",avatar:"📊"},
 {handle:"@PopcornAndPain",displayName:"Popcorn & Pain",avatar:"🍿"},
 {handle:"@CheapHeatMerchant",displayName:"Cheap Heat Merchant",avatar:"🔥"},
 {handle:"@NoSellNelly",displayName:"No Sell Nelly",avatar:"🫠"},
 {handle:"@BookingCommitteeOfOne",displayName:"Booking Committee Of One",avatar:"📝"},
 {handle:"@SteelChairStan",displayName:"Steel Chair Stan",avatar:"🪑"},
 {handle:"@SpotMonkey9000",displayName:"Spot Monkey 9000",avatar:"🐒"},
 {handle:"@RefWasBlind",displayName:"Ref Was Blind",avatar:"🦓"},
 {handle:"@JustHereForTheEntrance",displayName:"Entrance Theme Enjoyer",avatar:"🎶"},
 {handle:"@OneMoreMatchJanet",displayName:"One More Match Janet",avatar:"🙋"},
 {handle:"@PpvPirate",displayName:"PPV Pirate",avatar:"🏴‍☠️"},
 {handle:"@DropkickDarren",displayName:"Dropkick Darren",avatar:"👟"},
 {handle:"@ArmchairAgent",displayName:"Armchair Road Agent",avatar:"🪑"},
 {handle:"@TowelThrower",displayName:"Towel Thrower",avatar:"🏳️"},
 {handle:"@ScorpioInTheFrontRow",displayName:"Front Row Scorpio",avatar:"🦂"},
 {handle:"@TheStipulationStation",displayName:"Stipulation Station",avatar:"🚉"},
 {handle:"@RespectTheMidcard",displayName:"Midcard Appreciation Society",avatar:"🎖️"},
 {handle:"@NobodyAskedDave",displayName:"Nobody Asked Dave",avatar:"🙄"},
 {handle:"@SuplexAndChill",displayName:"Suplex & Chill",avatar:"📺"},
 {handle:"@TheFinishWasWrong",displayName:"The Finish Was Wrong",avatar:"❌"},
 {handle:"@ContractNegotiator69",displayName:"Contract Expert (Apparently)",avatar:"💸"},
 {handle:"@HardcamHelen",displayName:"Hardcam Helen",avatar:"📷"},
 {handle:"@CrowdNoiseCarl",displayName:"Crowd Noise Carl",avatar:"📣"},
 {handle:"@VHSVintageVince",displayName:"VHS Enthusiast",avatar:"📼"},
 {handle:"@BiscuitAndBrawls",displayName:"Biscuits & Brawls",avatar:"🍪"},
 {handle:"@AbsolutelyNotAPlant",displayName:"Definitely Not A Plant",avatar:"🪴"},
 {handle:"@NoContextSuplex",displayName:"No Context Suplex",avatar:"🤼"},
 {handle:"@BookerTears",displayName:"Booker's Tears",avatar:"😭"}
] as const;
export function stableHotTagHash(value:string){
 let n=2166136261;
 for(const c of value){n^=c.charCodeAt(0);n=Math.imul(n,16777619);}
 return n>>>0;
}
export function dirtSheetByline(id:string){
 const outlets=[
  {name:"THE GRAPEVINE",byline:"Backstage Desk"},
  {name:"RINGSIDE CONFIDENTIAL",byline:"The Inside Line"},
  {name:"THE LOCKER ROOM LEDGER",byline:"Sources & Whispers"},
  {name:"THE BACK ROW",byline:"The Rumour Report"}
 ] as const;
 return outlets[stableHotTagHash(id)%outlets.length]!;
}
/** The official feed reacts to the *kind* of verified story, not a generic
 * score or template. Dirt-sheet theories remain explicitly unverified.
 * Feed is deterministic from the article; zero write amplification on Neon.
 */
export function projectHotTagNewsThread(story:HotTagNewsStory):HotTagNewsPost[]{
 const seed=stableHotTagHash([story.id,story.year,story.week,story.desk].join(":"));
 const text=(story.title+" "+story.summary).toLowerCase();
 const rumour=story.desk==="DIRT";
 const kind=rumour?"RUMOUR":
  story.id.startsWith("broadcast:")?"BROADCAST":
  story.id.startsWith("press:")?"PRESS":
  /challeng|call(?:s|ed)? out|contract sign/.test(text)?"CHALLENGE":
  /champion|title (?:win|chang|loss|defen)|new titleholder/.test(text)?"TITLE":
  /heel turn|face turn|betray|turned on|walkout|stable split/.test(text)?"TURN":
  /debut|arriv|first appear|new signing/.test(text)?"DEBUT":
  /attack|assault|ambush|brawl/.test(text)?"ATTACK":
  /\bvs\.?\s|\bversus\b|steals the show|\d(?:\.\d{1,2})?-star match/.test(text)?"MATCH":"OTHER";
 const reactions:Record<typeof kind,string[]>={
  PRESS:[
   "A press conference and the internet is treating every word like a conspiracy. 🎤",
   "The quote is right there. Let's not invent backstage facts from it. 🧐",
   "One actual answer and seventeen completely different theories. 😂",
   "A wrestling press scrum has become its own main event. 🍿"
  ],
  BROADCAST:[
   "This is the ratings war I wanted. Same hour, actual viewers on the line. 📺",
   "A strong card matters, but now you've got to keep that audience next week. 👀",
   "Three rough TV nights? That network is absolutely watching the numbers. 💀",
   "You cannot just move a weekly show and expect the audience to find it. 😂",
   "Nielsen-watchers have entered the group chat. Let's see what happens next. 🍿",
   "Good wrestling and a reliable schedule. Imagine both at once. 🧐",
   "The network has spoken. The next broadcast better deliver. 🔥",
   "Everybody says ratings don't matter until their company loses a head-to-head. 📼",
   "TV competition without any actual match spoilers? I'm here for it. 📺",
   "If they won the time slot, give them their flowers. They earned those viewers. 💐",
   "The numbers are official, which won't stop anybody arguing about them. 😂"
  ],
  RUMOUR:[
   "The 'sources' on this one are doing some seriously heavy lifting. Show receipts. 🧐",
   "Three versions of the same rumour and zero names on the record. Incredible business. 😂",
   "Could be a work, could be backstage heat, could be someone's group chat. 👀",
   "The denial is going to get more coverage than the allegation, I can feel it. 🍿",
   "Wild theory, zero proof. I'm reading the replies anyway. 💀",
   "I'm not treating this as fact until someone actually backs it up. ❤️",
   "If this is invented, the retraction needs to be the main event. 📼",
   "Wrestling fans: everything is scripted. Also wrestling fans: THIS IS REAL. 😂",
   "Nobody knows what went down; apparently everybody has an insider cousin. 🤔",
   "I'll believe a named source before the seventh anonymous locker-room account. 👀",
   "Let's not turn a rumour into someone's official record, yeah? 🧐"
  ],
  CHALLENGE:[
   "The absolute nerve it takes to issue that challenge on air. I respect the audacity. 😂",
   "Okay but who is actually signing up to answer this? I'm invested already. 👀",
   "The challenge is easy. Now make them earn the match. 🍿",
   "If the next show doesn't follow up on this I'm filing a complaint with the booker. 💀",
   "Give me a face-to-face and then get out of the way. 🔥",
   "One microphone and suddenly the whole timeline has fantasy-booked the PPV. 😂",
   "No more vague teases. Put a date on the fight! 🧐",
   "Bold words. Interested to see who actually shows up to answer them. 📼",
   "This is how you turn one promo into a proper feud. LET THEM COOK. 🔥",
   "We got a challenge and people are already fighting over the imaginary finish. 👀",
   "That was a declaration, not a result. The next chapter matters. 🍿"
  ],
  TITLE:[
   "The championship picture has changed and so have my next twelve fantasy cards. 😂",
   "A title story with actual stakes? This is the sort of thing I tune in for. 🔥",
   "Now show me what the rest of the division does about it. 👀",
   "The belt doesn't book itself. The next challenger matters just as much. 🧐",
   "I'm already waiting for the follow-up promo. Give the moment some room. 📼",
   "People can argue about the finish. The record books will remember the result. 🍿",
   "Somebody on this timeline is coping HARD right now. 💀",
   "Please don't rush straight to six identical rematches. 😂",
   "The next show has to feel different after a championship moment like this. 🔥",
   "Can't wait to see whether they build on this or go back to business as usual. 👀",
   "The title scene just gave the group chat a week's worth of arguments. 🤔"
  ],
  TURN:[
   "That changes every alliance chart I've drawn this month. 💀",
   "Nobody trusts anybody in wrestling and THIS is why. 👀",
   "The character work after this is going to be the real test. 🧐",
   "I need the follow-up promo immediately. Not tomorrow. NOW. 🔥",
   "Some fans say they saw it coming. You definitely did not. 😂",
   "A turn means nothing without consequences. Let's see who gets hurt next. 🍿",
   "Time to revisit every awkward handshake from the last few weeks. 📼",
   "Wrestling friendships should come with a cancellation clause. 😂",
   "Give this story space to breathe rather than undoing it next week. ❤️",
   "I have three conspiracy boards and none of them are helping. 👀",
   "One decision, a dozen new possibilities. That's the good stuff. 🔥"
  ],
  DEBUT:[
   "New face, new possibilities. Don't waste the first impression. 🔥",
   "The fantasy booking threads are writing themselves already. 😂",
   "Show me who they're going after before I make up a twenty-match dream card. 👀",
   "Fresh blood in the roster? This could shake up the whole pecking order. 🍿",
   "The entrance is one thing. The first rivalry will tell us everything. 🧐",
   "Someone check whether the merch printers are awake. 😂",
   "A good arrival makes you want to see the very next episode. 📼",
   "That is the kind of surprise I'm perfectly happy to be spoiled by. 💥",
   "Potential is exciting. Let's see what they do with it now. 👀",
   "Here come the inevitable 'should've debuted elsewhere' arguments. 💀",
   "One debut and this entire fandom has become a contract expert. 🤔"
  ],
  ATTACK:[
   "That was personal. Or that's exactly what they wanted us to think. 👀",
   "I need to see the response on the next show, not another unrelated recap. 🔥",
   "That confrontation has escalation written all over it. 🍿",
   "Wrestling security must be getting paid by the coffee break. 😂",
   "Now give the person on the receiving end an actual reaction. 🧐",
   "Was there a plan or did this just completely go off the rails? 💀",
   "The replay is going to be watched frame by frame for weeks. 📼",
   "I am absolutely here for the fallout, not five identical repeats. 👀",
   "Somebody get a microphone. We need an explanation. 🔥",
   "That is one way to make everyone remember your name. 😂",
   "Waiting for the inevitable 'I was provoked' speech. 🍿"
  ],
  MATCH:[
   "That was the kind of wrestling that makes you watch the replay. 🔥",
   "Give those two another spotlight when they have a reason to meet. 👀",
   "This is going straight into my best bouts of the year list. 📼",
   "The crowd had a reason to care. Now can they follow it up? 🧐",
   "Good match. I want to know what they do NEXT, not just see it repeated. 🍿",
   "I could watch that sort of work all evening. Bell-to-bell quality. 🔔",
   "All the talking stops when the wrestling is that good. 🤼",
   "Tell me what this result means for their next programme. 💥"
  ],
  OTHER:[
   "This week's wrestling discourse is already out of control. 😂",
   "I need the replay before I pick a side on this one. 📼",
   "Something worth actually talking about, at last. 👀",
   "This story is going straight into the group chat. 🍿",
   "The next episode had better follow through on this. 🧐",
   "People somehow have a definitive take before they've watched it. 💀",
   "I have questions, but at least they're interesting questions. 🤔",
   "A good wrestling moment lives on through the reactions. 🔥",
   "Now I'm curious what the other wrestlers have to say about it. 👀",
   "Never underestimate wrestling fans' ability to argue over one headline. 😂",
   "I'll judge it on where the story goes next. ❤️"
  ]
 };
 // Previously published fan threads stay unchanged. New episodes get
 // additional fictional voices without new requests, timers or Neon writes.
 const expanded:Record<typeof kind,string[]>={
  PRESS:["A promoter said something and my timeline is on fire. 🎤",
   "Just wait until the journalists ask about the next show. 👀",
   "I trust the transcript more than the anonymous 'sources'. 🧐"],
  BROADCAST:["Networks are about to become the main characters. 📺",
   "A fixed broadcast night means the fans know where to find you. 🔥",
   "The partner's reaction is public, and the ratings will be too. 👀",
   "A big ratings win means nothing if you miss next week's slot. 🍿"],
  RUMOUR:["Somebody's cousin's barber has become an anonymous source. 😂",
   "Six theories and not one screenshot. That's wrestling journalism for you. 👀",
   "The conspiracy board has sixteen strings and zero evidence. 🧵",
   "The story's unverified, but the comments are an absolute car crash. 🍿"],
  CHALLENGE:["Sign the match or stop posting the graphics. 🖊️",
   "One challenge and wrestling Twitter has booked a trilogy. 😂",
   "The microphone won round one. Now ring the bell. 🎤",
   "This better lead somewhere other than stare-down number seventeen. 💀"],
  TITLE:["The belt has become the main character and I'm here for it. 🏆",
   "Every locker room just developed a sudden interest in rankings. 👀",
   "Actual stakes? In THIS economy? Beautiful. 😂",
   "That championship discussion is about to get unbelievably petty. 🍿"],
  TURN:["The friendship montage has just become a betrayal montage. 💀",
   "I will never trust another suspiciously long handshake. 🤝",
   "Someone get the replay team. We're checking every old promo. 📼",
   "One turn and the comments have changed sides four times. 😂"],
  DEBUT:["Thirty fantasy opponents announced before their first entrance. 😂",
   "The entrance is cool. Now give them a proper first story. 🔥",
   "This has officially broken the imaginary power rankings. 👀",
   "A new era has apparently begun. Again. 🍿"],
  ATTACK:["Arena security might be the least effective faction in wrestling. 😂",
   "That escalated faster than a contract negotiation. 😳",
   "The next promo needs an explanation, not just threatening music. 🎤",
   "Forget the rematch. I need to see the fallout first. 🍿"],
  MATCH:["They'd better put this one on the replay queue. 📼",
   "That got the in-ring argument settled for tonight. 🔔",
   "The wrestler interviews after a bout like this should be interesting. 👀",
   "A strong match deserves a strong follow-up, not a rerun. 🍿"],
  OTHER:["The discourse entered overtime before the show even ended. 😂",
   "I'm going to need a recap, a replay and probably a flow chart. 📼",
   "My timeline has opinions. None of them agree. 👀",
   "Professional wrestling remains the strangest thing I voluntarily watch. 💀"]
 };
 // Chaotic fans are not verified witnesses. Punchlines and occasional mild
 // swearing add texture without asserting anything the certified show didn't do.
 const rowdy:Record<typeof kind,string[]>={
  PRESS:[
   "A press conference with this much ducking should come with a referee. 😂",
   "Booker answered like I answer the boss when I haven't done the spreadsheet. 💀",
   "We're all reading the same quote and somehow half the replies invented a different one.",
   "Not every pause is a secret signing, you absolute goblins. 🎤",
   "If evasive answers paid the bills, wrestling would never go bankrupt. 😭",
   "Could you lot stop treating a microphone like it's a lie detector? Bloody hell.",
   "Twelve-page conspiracy thread based on a six-word answer. Peak wrestling internet.",
   "The post-show scrum has more plot twists than my entire love life. 🤡"
  ],
  BROADCAST:[
   "Three weeks of shit ratings and now the network's discovered a backbone. 📺",
   "My nan has more viewers watching pigeons in the garden. Sorry, that's brutal. 🐦",
   "Imagine a TV executive powerbombing the ratings spreadsheet through a table. 😂",
   "The ratings-war goblins have crawled out of the walls. Hide your calculators. 📉",
   "The network paid for Friday. You can't just rock up on bloody Tuesday. 💀",
   "SOMEONE CALL THE ADVERTISERS, THE NUMBERS ARE ON FIRE. 🔥",
   "We used to argue about headlocks. Now we're beefing over decimal points. Christ.",
   "Turn this network meeting into a steel cage match. I'd buy that PPV.",
   "Imagine being buried by a graph. That's wrestling in 2026. 📊",
   "They're arguing about 0.2 like it's the finish to WrestleMania. I love this nonsense.",
   "The network wants a better show. Bold request from people who schedule cooking reruns.",
   "Ratings discourse is just fantasy football for people who yell at referees."
  ],
  RUMOUR:[
   "Source: trust me bro, I stood near a loading bay once. 🤡",
   "This sounds like absolute bollocks. I'll read all 300 replies anyway. 🍿",
   "My mate's cousin's barber said the opposite. Really makes you think. 💀",
   "Zero receipts but the comments are already throwing chairs. Bloody hell.",
   "The inside source is probably a bloke who once delivered pizza to the arena.",
   "My conspiracy board is just string and receipts from Tesco at this point.",
   "Anonymous report? My anonymous mate says you're full of shit. 🤷",
   "Imagine getting this angry over a rumour nobody has actually confirmed.",
   "I'm not saying it's true. I'm saying the memes are absolutely incredible.",
   "How's the entire timeline got more backstage sources than actual wrestlers?"
  ],
  CHALLENGE:[
   "STOP TALKING AND SIGN THE DAMN MATCH. 📋",
   "Every fan in the replies just booked themselves as special guest referee.",
   "That challenge has more confidence than my bank account. Bloody hell.",
   "Promos are free. Actually accepting the match? Apparently a luxury.",
   "My fantasy booking had nine run-ins and a flaming table. No regrets.",
   "Someone book this before I write a 4,000-word thread about it.",
   "The internet has already decided the finish. Nobody tell the actual wrestlers.",
   "The microphone's undefeated. Shame it can't cash a cheque. 💀"
  ],
  TITLE:[
   "New title discourse unlocked. Please send help. 🏆",
   "The comments have changed champions three times in ten minutes. Amazing.",
   "Someone just typed a 30-tweet explanation of why the belt is cursed. 😂",
   "I swear half the fans care more about belt shapes than the matches.",
   "If I hear 'transitional champion' one more time I'm putting my phone in the bin.",
   "The title looks lovely. The replies look like an absolute car crash.",
   "My championship rankings are written on the back of a takeaway menu.",
   "A belt changed hands and the whole timeline started crying. Peak wrestling."
  ],
  TURN:[
   "I trusted that alliance for twelve seconds. Never again. 💀",
   "This heel turn has ruined six fantasy-booking spreadsheets. Magnificent.",
   "Wrestling friendships last about as long as a cheap folding chair.",
   "Somebody check on the one bloke still defending that handshake. 😂",
   "Betrayal? In PRO WRESTLING? Somebody alert the bloody authorities.",
   "The betrayal compilations are going to feed this app for months.",
   "I knew the trust was doomed. I have absolutely no evidence.",
   "My group chat is arguing whether the chair was symbolic. PLEASE."
  ],
  DEBUT:[
   "One entrance and everybody's suddenly a contract lawyer. 🤡",
   "Who's the new signing feuding with? Wrong answers only. 🍿",
   "The debut's not even cold and someone's screaming 'buried' already.",
   "My mate says they've never heard of them so obviously it's the worst signing ever. 😂",
   "Announce a debut and the fantasy bookers start drawing 52-week calendars.",
   "If this newcomer gets a decent rivalry I'll eat my replica championship. 🏆",
   "New talent, new opinions, same absolute chaos on this timeline.",
   "My whole personality this week is guessing the first feud."
  ],
  ATTACK:[
   "Arena security couldn't stop a queue jumping at Tesco. 💀",
   "That brawl had more chaos than a Friday night taxi rank.",
   "The refs saw that and thought 'not in my job description'. 😂",
   "Somebody tell these people there's a perfectly good match bell.",
   "If I got jumped at work my manager would just ask about my shift targets.",
   "The comments are angrier than the wrestlers. Brilliant.",
   "This is what happens when you let grudges book the show, bloody hell.",
   "I want the fallout, not 400 identical replays of the same scrap."
  ],
  MATCH:[
   "That match made me forget my dinner was in the oven. Shit. 🔥",
   "The star-rating police are already fighting in the car park.",
   "A five-star match? The replies are still complaining about the collar-and-elbow.",
   "I need a cigarette and I don't even smoke. 💀",
   "Put this on a compilation and stop asking me to be normal about wrestling.",
   "My fantasy league just died, but at least the match ruled.",
   "Someone's written a twelve-paragraph essay about one near fall. I love us.",
   "I rewound the finish so much my imaginary VHS ate the tape."
  ],
  OTHER:[
   "The group chat is on fire and none of us know why. Lovely.",
   "Professional wrestling: an endless source of silly little arguments. 💀",
   "The replies are pure bollocks today. Five stars.",
   "I'm giving this discourse thirty minutes before someone posts a spreadsheet.",
   "My nan just asked why everyone's yelling about a fake sports press release. 🫠",
   "I came here for wrestling and somehow got an economics lecture.",
   "Can the timeline go one day without a civil war over a poster? 😂",
   "This app should offer a free folding chair with every comment section."
  ]
 };
 const lead:Record<typeof kind,string[]>={
  PRESS:[],
  BROADCAST:[
   "The network has spoken and the ratings goblins are losing their minds. 📺",
   "A TV warning is not a match result, but it certainly has consequences. 📉",
   "If ratings are dropping, the next broadcast needs to earn those viewers back.",
   "The schedule is in the contract. Fans shouldn't need a treasure map to find TV."],
  RUMOUR:reactions.RUMOUR,
  CHALLENGE:[
   "That challenge sounds big. Who actually answers the call?",
   "A match challenge and we're already fantasy booking six different finishes.",
   "They issued the challenge. Let's see who shows up with a reply."],
  TITLE:[
   "The championship picture has changed. Now give the next challenger a story.",
   "The title scene just started an argument in every group chat.",
   "Championship stakes on screen, instant chaos in the replies."],
  TURN:[
   "That turn has completely changed the relationship map. 👀",
   "A betrayal in the ring and now nobody trusts anybody.",
   "One heel turn and the conspiracy theories are already multiplying."],
  DEBUT:[
   "New debut, new signing, immediate fantasy opponents. 😂",
   "First appearance is done. Now make that roster debut matter.",
   "The new arrival hasn't even finished waving and the timeline's arguing."],
  ATTACK:[
   "An attack like that demands an answer on the next show.",
   "A wrestling assault got everybody arguing about the response.",
   "The brawl might be over; the feud certainly has something to answer."],
  MATCH:reactions.MATCH,
  OTHER:reactions.OTHER
 };
 // Certified match headlines contain genuine public names and, often, a
 // star rating. Make fan opinions about THAT bout instead of reusing three
 // generic comments beneath every four/five-star article.
 const named=kind==="MATCH"?story.title.match(/^(.+?)\s+(?:vs\.?|versus)\s+(.+?)\s+(?:steals the show|at\s)/i):null;
 const pairing=named?named[1]!.trim()+" vs "+named[2]!.trim():null;
 const stars=kind==="MATCH"?
  story.summary.match(/\b(\d(?:\.\d{1,2})?)-star match\b/i)?.[1]??null:null;
 const specific=kind==="MATCH"&&pairing?[
  pairing+" is the match I'd send to a friend who asks why I watch wrestling. 🔥",
  "Everyone's debating "+pairing+". I'm looking at what happens to those two next. 👀",
  stars?stars+" stars for "+pairing+"? I'd still watch it again before arguing ratings. 📼":
   "I need a second watch of "+pairing+" before I pick a favourite spot. 📼",
  "That "+pairing+" result has to matter for the next card. Don't waste it. 🧐",
  "Please let "+pairing+" breathe before the inevitable rematch discourse starts. 😂",
  "The real question after "+pairing+": who gets the next opportunity? 🍿",
  story.promotionName+" has something to follow up after "+pairing+". Book it with purpose. 💥"
 ]:[];
 // A published manager answer deserves an opinion about what was ACTUALLY
 // said, not an invented press quote or the same generic rumour under every
 // event. These are fan reactions, never attributed to the manager.
 const press=story.id.startsWith("press:");
 const pressFollowup=story.id.startsWith("press:followup:");
 const pressMode=/ends the press conference without taking questions|no answers from/i.test(story.title)?"SKIPPED":
  /no comment|declined/i.test(story.title)?"DECLINED":
  /details close|no concrete/i.test(story.title)?"EVASIVE":"DIRECT";
 const pressSpecific=press?
  pressFollowup?[
   "That is an actual on-air follow-up after the press scrum. Now we're talking wrestling again. 🎤",
   "Last week the microphones, this week the matches. At least we have a real broadcast to discuss. 📺",
   "The press debate can continue, but the next show gave fans something concrete to watch. 👀"
  ]:
  pressMode==="SKIPPED"?[
   "The manager ended the scrum without answering anything. No quote to dissect this time. 🎤",
   "Three questions prepared, zero answers. That is a very short press conference. 😂",
   "A skipped scrum is not a secret contract announcement. We have no statement to work with. 🧐"
  ]:
  pressMode==="DECLINED"?[
   "The microphone went to the booker and the answer was NO COMMENT. The group chat has exploded. 🎤",
   "A refusal is on the record. Any grand theory about the reason is still fan-fiction. 🧐",
   "No comment? That's three words and approximately three thousand fantasy bookings. 😂"
  ]:pressMode==="EVASIVE"?[
   "That is an all-time promoter sidestep. A full answer without a single new detail. 😂",
   "Journalist asks about the next move; booker keeps the cards face down. Classic. 👀",
   "The answer is public. The follow-up card is not. I'm watching the next show. 🍿"
  ]:[
   "At least someone actually answered a question after the bell. More of this. 🎤",
   "On-record words beat six anonymous locker-room theories. I respect that. 🧐",
   "The manager has spoken; now we'll see whether the next show backs it up. 👀"
  ]:[];
 const pool=[...specific,...pressSpecific,...reactions[kind],...expanded[kind],...rowdy[kind]];
 const used=new Set<string>(),handles=new Set<string>(),posts:HotTagNewsPost[]=[];
 const count=3+seed%4; // Three to six actual comments, not an identical trio every time.
 for(let i=0;i<count;i++){
  const key=story.id+":"+story.year+":"+story.week+":"+i;
  let person=stableHotTagHash(key+":persona")%commentators.length;
  while(handles.has(commentators[person]!.handle))person=(person+1)%commentators.length;
  const voice=commentators[person]!;handles.add(voice.handle);
  // The first reaction anchors itself to real story context. The other fans
  // can be sarcastic, insightful or utterly unhelpful without inventing facts.
  const candidates=i===0&&pressSpecific.length?pressSpecific:
   i===0&&specific.length?specific:
   i===0?lead[kind]:i===1?rowdy[kind]:pool;
  let choice=stableHotTagHash(key+":dialogue")%candidates.length;
  let message=candidates[choice]!;
  while(used.has(message)){
   choice=(choice+1)%candidates.length;
   message=candidates[choice]!;
  }
  const replies=count>=5&&i===count-1&&seed%3===0;
  const response=[
   "You read all that and THAT'S your take? Mate. 😂",
   "I disagree with every word but I respect the chaos. 🤝",
   "We both watched the same thing and somehow understood different planets.",
   "Please log off before you book yourself as world champion. 💀",
   "This is absolute bollocks and yet I've liked it. Help.",
   "There are three genuine facts here and you've dodged all of them. 🤡",
   "Stop shouting and watch next week's bloody show."];
  if(replies){message=response[stableHotTagHash(key+":reply")%response.length]!;}
  used.add(message);
  const h=stableHotTagHash(key+":"+voice.handle);
  posts.push({...voice,text:message,
   ...(replies?{replyTo:posts[0]!.handle}:{}),
   likes:13+h%1300,replies:2+(h>>>7)%130,reposts:1+(h>>>12)%170});
 }
 return posts;
}
