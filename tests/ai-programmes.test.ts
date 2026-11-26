import test from "node:test";
import assert from "node:assert/strict";
import { aiTagPairKey, planAiProgrammeBeat, type AiProgramme } from "../src/domain/ai-programmes.js";
import { chooseAiTelevisionCard, chooseAiWorldCard, type AiRosterCandidate } from "../src/domain/ai-world-card.js";

const roster: AiRosterCandidate[] = Array.from({ length: 10 }, (_, i) => ({
 personId: "w" + i, contractId: "c" + i, bookingDivision: "MEN", weeklyCapacity: 2,
 momentum: 65 + i, popularity: 55 + i, recognition: 62, presentation: 69, matchCraft: 77,
 contractExpires: 50, remainingDates: 10,
}));
const strategy = { identity: "WORKRATE", focus: "PAY_OFF_RIVALRIES" } as const;
const title = { championshipId: "belt", holderId: "w1", bookingDivision: "MEN" as const };
const rivalry: AiProgramme = {
 programmeId: "story", format: "RIVALRY", sideA: ["w0"], sideB: ["w1"], championshipId: "belt",
 intent: { blueprintId: "TITLE_CHASE", motivation: "Earn a title shot", audienceGoal: "Anticipation", destination: "Premium show" },
 started: 1, angleCount: 1, matchCount: 0, lastWeek: 1, lastCrowd: 76, lastFinish: null, lastWinnerSide: null,
};
const result = { id: "w0", format: "SINGLES" as const, weekIndex: 2, won: true,
 opponentStrength: 62, ratingStars: 3.8, titleMatch: false, majorEvent: false };
const card = {
 worldId: "w", worldSeed: "8", year: 1, week: 5, promotionId: "p", showId: "e",
 roster, bookedShows: [], activeVenues: ["v"], eventType: "MAJOR" as const,
 riskTolerance: 35, matchQualityPreference: 90, starPreference: 65, strategy,
};

test("a losing contender must build form and cannot get a premature PPV title shot", () => {
 const first = { programme: rivalry, roster, week: 4, title, strategy, nextPremium: 6,
  results: [{ ...result, won: false }] };
 const beat = planAiProgrammeBeat({ ...first, premium: false });
 assert.ok(beat?.kind === "MATCH" && beat.support && !beat.payoff);
 assert.equal(planAiProgrammeBeat({ ...first, premium: true }), null);
 const qualified = { ...first, programme: { ...rivalry, angleCount: 2 }, results: [result] };
 const teaser = planAiProgrammeBeat({ ...qualified, premium: false, week: 5 });
 assert.ok(teaser?.kind === "ANGLE" && teaser.angle.kind === "VIDEO_PACKAGE");
 const booked = chooseAiWorldCard({
  ...card, creative: planAiProgrammeBeat({ ...qualified, week: 6, premium: true }),
 });
 assert.equal(booked.status, "READY");
 if (booked.status !== "READY") return;
 const main = booked.matches.at(-1)!;
 assert.equal(main.championshipId, "belt");
 assert.equal(main.creativePayoff, "TITLE_SHOWDOWN");
 assert.equal(main.plannedFinish, "SUBMISSION");
});

test("a medical absence suspends the chapter, and a new champion can close the old chase", () => {
 const context = { programme: rivalry, roster, week: 4, title, strategy, nextPremium: 6,
  results: [result], premium: false };
 assert.equal(planAiProgrammeBeat({ ...context, roster: roster.slice(1) }), null);
 const changed = planAiProgrammeBeat({ ...context, title: { ...title, holderId: "w8" } });
 assert.ok(changed?.kind === "ANGLE" && changed.payoff === "FINAL_CHAPTER");
});

test("an established tag rivalry settles through the original two-sided match", () => {
 const programme = { ...rivalry, championshipId: null, sideA: ["w0", "w2"], sideB: ["w1", "w3"],
  angleCount: 2, intent: { ...rivalry.intent, blueprintId: "RESPECT" } };
 const beat = planAiProgrammeBeat({ programme, roster, week: 5, title: undefined, strategy,
  nextPremium: 5, results: [], premium: true });
 const booked = chooseAiWorldCard({ ...card, creative: beat });
 assert.equal(booked.status, "READY");
 if (booked.status !== "READY") return;
 const main = booked.matches.at(-1)!;
 assert.equal(main.matchType, "TAG");
 assert.equal(main.creativePayoff, "DECISIVE_MATCH");
 assert.equal(main.programmeId, "story");
 assert.deepEqual(main.sides?.map(side => side.participants.map(p => p.personId)),
  [["w0", "w2"], ["w1", "w3"]]);
});

test("premium cast resting retries full TV eligibility on the contracted broadcast night", () => {
 const premiumCast = new Set(["w0", "w1"]);
 const bookedShows = [{ showId: "submitted-human", day: 3, venueId: "human-arena",
  personIds: roster.slice(2).map(p => p.personId) }];
 const input = { ...card, eventType: "REGULAR" as const, contractedDay: 3, bookedShows };
 const book = (available: AiRosterCandidate[]) => chooseAiWorldCard({ ...input, roster: available });
 const rested = roster.filter(p => !premiumCast.has(p.personId));
 assert.equal(rested.length, 8);
 assert.equal(book(rested).status, "UNFILLED", "The old reduced-roster attempt drops legal TV");
 const tv = chooseAiTelevisionCard(roster, premiumCast, book);
 assert.equal(tv.status, "READY");
 if (tv.status !== "READY") return;
 assert.equal(tv.schedule.day, 3);
 assert.deepEqual(tv.matches.flatMap(match => match.participants.map(p => p.personId)).sort(), ["w0", "w1"]);
 const ppv = chooseAiWorldCard({ ...card, excludedDays: [3], bookedShows: [...bookedShows, {
  showId: "tv", day: 3, venueId: tv.schedule.venueId, personIds: ["w0", "w1"],
 }] });
 assert.equal(ppv.status, "READY");
 if (ppv.status === "READY") assert.notEqual(ppv.schedule.day, 3);
});

test("a vacancy frees the title and the former contender can address it alone", () => {
 const aftermath=planAiProgrammeBeat({
  programme:rivalry,roster:roster.filter(p=>p.personId!=="w1"),week:3,
  title:{...title,holderId:null},strategy,nextPremium:9,results:[],premium:false,
 });
 assert.ok(aftermath?.kind==="ANGLE"&&aftermath.payoff==="FINAL_CHAPTER");
 assert.deepEqual(aftermath.angle.actorIds,["w0"]);
 assert.deepEqual(aftermath.angle.targetIds,[]);
 const booked=chooseAiWorldCard({
  ...card,creative:aftermath,
  featuredPairs:[{aId:"w2",bId:"w3",kind:"VACANT_SINGLES_TITLE",championshipId:"belt",heat:70}],
 });
 assert.equal(booked.status,"READY");
 if(booked.status!=="READY")return;
 assert.equal(booked.angle?.payoff,"FINAL_CHAPTER");
 assert.equal(booked.matches.at(-1)?.championshipId,"belt");
});

test("aired tensions keep partners apart on ordinary, makeshift title and Programme tag cards", () => {
 const teams=[
  {teamId:"established",aId:"w8",bId:"w9"},
  {teamId:"second",aId:"w6",bId:"w7"},
 ];
 const separatedTagPairs=new Set([aiTagPairKey("w8","w9")]);
 const tv={...card,eventType:"REGULAR" as const,establishedTeams:teams};
 const united=chooseAiWorldCard(tv);
 assert.equal(united.status,"READY");
 if(united.status!=="READY")return;
 const paired=(result:ReturnType<typeof chooseAiWorldCard>)=>result.status==="READY"&&result.matches.some(m=>
  m.sides?.some(s=>s.participants.some(p=>p.personId==="w8")&&s.participants.some(p=>p.personId==="w9")));
 assert.equal(paired(united),true);
 assert.equal(paired(chooseAiWorldCard({...tv,separatedTagPairs})),false);
 assert.equal(paired(chooseAiWorldCard({...card,separatedTagPairs,tagTitles:[
  {championshipId:"tag",holderTeamId:null,heat:65}]})),false);
 const programme={...rivalry,format:"RELATIONSHIP" as const,sideA:["w8","w9"],sideB:[],championshipId:null};
 assert.equal(paired(chooseAiWorldCard({...tv,separatedTagPairs,
  creative:{kind:"MATCH",programme,leadId:"w8",winnerId:"w8",tagPartnerId:"w9"}})),false);
});

test("protecting a rivalry replaces a stranded undercard pairing with eligible alternatives", () => {
 const rosterWithAlternates=Array.from({length:14},(_,i)=>({
  personId:"w"+i,contractId:"c"+i,bookingDivision:(i%3===0?"WOMEN":"MEN") as "MEN"|"WOMEN",
  weeklyCapacity:2,popularity:45+(i*31+7)%43,momentum:45+(i*11+3)%40,
  recognition:53+i,matchCraft:52+i,presentation:58+i,
 }));
 const result=chooseAiWorldCard({
  worldId:"depth",worldSeed:"1",year:2,week:2,promotionId:"p",showId:"tv",
  roster:rosterWithAlternates,activeVenues:["arena"],bookedShows:[],eventType:"REGULAR",
  starPreference:62,matchQualityPreference:78,riskTolerance:40,protectedProgrammePair:["w1","w2"],
 });
 assert.equal(result.status,"READY");
 if(result.status!=="READY")return;
 assert.equal(result.matches.length,5,"The protected match does not cost an otherwise bookable undercard bout");
 assert.ok(!result.matches.some(match=>match.participants.every(p=>["w1","w2"].includes(p.personId))));
 assert.equal(new Set(result.matches.flatMap(match=>match.participants.map(p=>p.personId))).size,10);
});
