import test from "node:test";
import assert from "node:assert/strict";
import {chooseAiWorldCard,type AiRosterCandidate} from "../src/domain/ai-world-card.js";
const roster=Array.from({length:22},(_,i):AiRosterCandidate=>({
 personId:"talent-"+String(i).padStart(2,"0"),contractId:"deal-"+i,
 bookingDivision:i%3===0?"WOMEN":"MEN",weeklyCapacity:7,
 popularity:85-i,recognition:88-i,momentum:82-i,
 presentation:84-i,matchCraft:81-i,
}));
const base={
 worldId:"w",worldSeed:"51",year:1,week:4,promotionId:"p",showId:"s",
 roster,bookedShows:[],activeVenues:["a","b"],eventType:"REGULAR" as const,
 riskTolerance:80,matchQualityPreference:75,starPreference:70,
};
test("Original ranked AI fills a real 2-5 match card with distinct contracted wrestlers and a strong main event",()=>{
 const card=chooseAiWorldCard(base);
 assert.equal(card.status,"READY");
 if(card.status!=="READY")return;
 assert.ok(card.matches.length>=3&&card.matches.length<=5);
 const members=card.matches.flatMap(x=>x.participants.map(p=>p.personId));
 assert.equal(members.length,card.matches.length*2);
 assert.equal(new Set(members).size,members.length);
 assert.ok(members.length<=10);
 assert.ok(card.matches.some(m=>m.bookingDivision==="WOMEN"));
 assert.ok(card.matches.some(m=>m.bookingDivision==="MEN"));
 assert.equal(card.matches.at(-1)?.mainEvent,true);
 assert.equal(card.matches.slice(0,-1).every(m=>!m.mainEvent),true);
 const push=(id:string)=>{const p=roster.find(x=>x.personId===id)!;return p.momentum*.4+p.popularity*.3+p.recognition*.2+p.presentation*.1;};
 const powers=card.matches.map(m=>m.participants.reduce((s,p)=>s+push(p.personId),0)/2);
 assert.deepEqual(powers,[...powers].sort((a,b)=>a-b));
 for(const m of card.matches){
  assert.equal(m.participants.length,2);
  assert.equal(m.participants.every(x=>roster.find(p=>p.personId===x.personId)?.bookingDivision===m.bookingDivision),true);
  assert.ok(m.participants.some(p=>p.personId===m.scriptedWinner));
  assert.ok(m.plannedLengthMinutes>=3&&m.plannedLengthMinutes<=60);
  assert.ok(["CLEAN_PIN","FLASH_PIN","SUBMISSION","PROTECTED_FINISH"].includes(m.plannedFinish));
 }
 assert.deepEqual(card,chooseAiWorldCard({...base,roster:[...roster].reverse(),
  bookedShows:[...base.bookedShows].reverse(),activeVenues:["b","a"]}));
});
test("Major main event runs the original EPIC choice; booking repeat avoidance uses narrow recent history",()=>{
 const major=chooseAiWorldCard({...base,eventType:"MAJOR"});
 assert.equal(major.status,"READY");
 if(major.status!=="READY")return;
 assert.equal(major.matches.at(-1)?.intent,"EPIC");
 assert.equal(major.matches.at(-1)?.plannedLengthMinutes,28);
 const prior=chooseAiWorldCard(base);
 assert.equal(prior.status,"READY");
 if(prior.status!=="READY")return;
 const pair=prior.matches.at(-1)!.participants.map(x=>x.personId).sort().join(":");
 const altered=chooseAiWorldCard({...base,recentPairs:[pair]});
 assert.equal(altered.status,"READY");
 if(altered.status!=="READY")return;
 assert.ok(!altered.matches.some(m=>m.participants.map(x=>x.personId).sort().join(":")===pair) ||
  altered.matches.length!==prior.matches.length);
});
test("AI honors World capacity, original division eligibility, live booking and short rosters",()=>{
 const min=chooseAiWorldCard({...base,roster:roster.slice(0,2)});
 assert.equal(min.status,"UNFILLED"); // mixed divisions; do not force unsafe mixed matchup
 const small=chooseAiWorldCard({...base,roster:roster.filter(x=>x.bookingDivision==="MEN").slice(0,2)});
 assert.equal(small.status,"READY");
 if(small.status==="READY")assert.equal(small.matches.length,1);
 const days=Array.from({length:7},(_,i)=>({showId:"busy-"+i,day:i+1,
  venueId:"a",personIds:[]}));
 assert.deepEqual(chooseAiWorldCard({...base,activeVenues:["a"],bookedShows:days}),
  {status:"UNFILLED",reason:"NO_VENUE_OR_DAY"});
 const blocked=chooseAiWorldCard({...base,roster:roster.map(p=>({...p,weeklyCapacity:1})),
  bookedShows:[{showId:"other",day:1,venueId:"b",personIds:roster.map(p=>p.personId)}]});
 assert.equal(blocked.status,"UNFILLED");
 assert.throws(()=>chooseAiWorldCard({...base,roster:[{...roster[0]!,presentation:NaN}]}),/Invalid/);
});

test("active hot programmes headline without changing existing human bookings; teams are not split into accidental singles opponents",()=>{
 const input={...base,featuredPairs:[{aId:"talent-04",bId:"talent-07",
  kind:"PROGRAMME" as const,programmeId:"feud-main",heat:94}],
  establishedPartners:[{aId:"talent-01",bId:"talent-02"}]};
 const card=chooseAiWorldCard(input);
 assert.equal(card.status,"READY");
 if(card.status!=="READY")return;
 const main=card.matches.at(-1)!;
 assert.equal(main.programmeId,"feud-main");
 assert.deepEqual(main.participants.map(p=>p.personId).sort(),["talent-04","talent-07"]);
 assert.ok(!card.matches.some(m=>m.participants.map(p=>p.personId).sort().join(":")==="talent-01:talent-02"));
 assert.deepEqual(card,chooseAiWorldCard({...input,roster:[...roster].reverse()}));
});
test("singles titles trump programmes on a major show only when the champion and challenger are available",()=>{
 const featured=[
  {aId:"talent-04",bId:"talent-07",kind:"PROGRAMME" as const,programmeId:"hot-feud",heat:100},
  {aId:"talent-01",bId:"talent-02",kind:"SINGLES_TITLE" as const,
   championshipId:"world-title",holderId:"talent-01",heat:75},
 ];
 const card=chooseAiWorldCard({...base,eventType:"MAJOR",featuredPairs:featured});
 assert.equal(card.status,"READY");
 if(card.status!=="READY")return;
 assert.equal(card.matches.at(-1)?.championshipId,"world-title");
 assert.equal(card.matches.at(-1)?.intent,"EPIC");
 assert.ok(card.matches.at(-1)?.participants.some(x=>x.personId==="talent-01"));
 const other=chooseAiWorldCard({...base,eventType:"MAJOR",featuredPairs:featured,
  bookedShows:[{showId:"conflict",day:1,venueId:"a",personIds:["talent-01"]}],
 });
 if(other.status==="READY")
  assert.ok(other.matches.every(m=>!m.championshipId)||
   other.matches.at(-1)?.championshipId==="world-title");
 assert.throws(()=>chooseAiWorldCard({...base,featuredPairs:[
  {aId:"talent-01",bId:"talent-02",kind:"SINGLES_TITLE" as const,
   championshipId:"belt",holderId:"talent-02",heat:50}]}),/Invalid canonical/);
});
