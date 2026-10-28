import assert from "node:assert/strict";
import test from "node:test";
import {chooseAiWorldCard,chooseAiTitleChallenger,type AiRosterCandidate}
 from "../src/domain/ai-world-card.js";
import {aiPromotionStrategy} from "../src/domain/ai-promotion-strategy.js";

/** Five season stress of the actual seeded AI planner, not certified World
 * outcomes. Frozen champions, stable 28-person contracts, mixed divisions
 * and persistent tag teams intentionally make rotation harder to achieve.
 * Real recruitment/settlement and ownership remain in PostgreSQL journeys.
 */
test("five seasons: AI keeps credible champions, tag teams and genuinely uses its roster",()=>{
 const profiles=[
  {id:"workrate",riskTolerance:35,matchQualityPreference:95,starPreference:55},
  {id:"spectacle",riskTolerance:95,matchQualityPreference:75,starPreference:50},
  {id:"star-power",riskTolerance:45,matchQualityPreference:58,starPreference:97}
 ] as const;
 const diagnostics=[];
 for(const profile of profiles){
  const roster:AiRosterCandidate[]=Array.from({length:28},(_,i)=>({
   personId:profile.id+"-"+String(i).padStart(2,"0"),contractId:profile.id+"-deal-"+i,
   bookingDivision:i%4===0?"WOMEN":"MEN",weeklyCapacity:4,
   popularity:Math.max(25,92-i*2),recognition:Math.max(27,90-i*2),
   momentum:Math.max(32,87-i),presentation:Math.max(37,88-i),
   matchCraft:Math.max(39,90-i)
  }));
  const appearances=new Map<string,number>(),titleOpponents=new Set<string>(),
   mainEvents=new Set<string>(),recent:string[]=[];
  let previousMain="",backToBack=0,womensMatches=0,tagMatches=0,titleDefences=0;
  const teams=[
   {teamId:profile.id+"-team-a",aId:roster[5]!.personId,bId:roster[6]!.personId},
   {teamId:profile.id+"-team-b",aId:roster[9]!.personId,bId:roster[10]!.personId}
  ];
  for(let index=0;index<260;index++){
   const year=Math.floor(index/52)+1,week=index%52+1;
   const major=week%4===0,holder=roster[1]!;
   const opponent=major?chooseAiTitleChallenger({
    roster,holderId:holder.personId,championshipId:"world-title",
    worldSeed:"8291",promotionId:profile.id,year,week,
    recentPairs:recent.slice(-18),
   }):null;
   assert.equal(!!opponent,major);
   const input={
    worldId:"isolated-five-season-world",worldSeed:"8291",promotionId:profile.id,
    showId:profile.id+"-"+year+"-"+week,year,week,
    roster,bookedShows:[],activeVenues:["local-hall","civic-arena"],
    eventType:major?"MAJOR" as const:"REGULAR" as const,
    riskTolerance:profile.riskTolerance,
    matchQualityPreference:profile.matchQualityPreference,
    starPreference:profile.starPreference,
    strategy:aiPromotionStrategy({worldSeed:"8291",promotionId:profile.id,year,week,
     riskTolerance:profile.riskTolerance,
     matchQualityPreference:profile.matchQualityPreference,
     starPreference:profile.starPreference}),
    recentPairs:recent.slice(-18),establishedTeams:teams,
    featuredPairs:opponent?[{kind:"SINGLES_TITLE" as const,
     aId:holder.personId,bId:opponent.personId,holderId:holder.personId,
     championshipId:"world-title",heat:94}]:[]
   };
   const card=chooseAiWorldCard(input);
   assert.equal(card.status,"READY",profile.id+" year "+year+" week "+week);
   if(card.status!=="READY")continue;
   assert.deepEqual(card,chooseAiWorldCard({...input,roster:[...roster].reverse(),
    establishedTeams:[...teams].reverse(),activeVenues:["civic-arena","local-hall"]}),
    "AI world card must be independent of DB row order");
   assert.ok(card.matches.length>=2&&card.matches.length<=5);
   const individuals=card.matches.flatMap(m=>m.participants.map(x=>x.personId));
   assert.equal(individuals.length,new Set(individuals).size,"never double-book workers");
   assert.ok(individuals.every(x=>roster.some(p=>p.personId===x)));
   assert.equal(card.matches.filter(m=>m.mainEvent).length,1);
   const main=card.matches.at(-1)!;
   assert.equal(main.mainEvent,true);
   const k=main.participants.map(p=>p.personId).sort().join(":");
   if(k===previousMain)backToBack++;
   previousMain=k;mainEvents.add(k);
   if(major){
    titleDefences++;
    assert.equal(main.championshipId,"world-title");
    assert.equal(main.intent,"EPIC");
    assert.deepEqual(main.participants.map(p=>p.personId).sort(),
     [holder.personId,opponent!.personId].sort());
    titleOpponents.add(opponent!.personId);
   }else{
    assert.ok(card.matches.every(m=>m.championshipId!=="world-title"));
   }
   for(const m of card.matches){
    if(m.bookingDivision==="WOMEN")womensMatches++;
    if(m.matchType==="TAG"){
     tagMatches++;
     assert.equal(m.participants.length,4);
     assert.ok(m.sides?.every(side=>side.participants.length===2));
    }
    assert.ok(m.participants.some(p=>p.personId===m.scriptedWinner));
    for(const p of m.participants)appearances.set(p.personId,
     (appearances.get(p.personId)??0)+1);
    if(m.participants.length===2)
     recent.push(m.participants.map(p=>p.personId).sort().join(":"));
   }
   if(recent.length>40)recent.splice(0,recent.length-40);
  }
  const womenUsed=[...appearances.keys()].filter(id=>
   roster.find(p=>p.personId===id)?.bookingDivision==="WOMEN").length;
  assert.ok(appearances.size>=16,"midcard must not be permanently invisible");
  assert.ok(womenUsed>=4,"the women's division must have more than two faces");
  assert.ok(titleOpponents.size>=3,"the champion needs credible distinct challengers");
  assert.ok(mainEvents.size>=10,"the top-card scene must evolve");
  assert.ok(womensMatches>=200,"women must remain on cards");
  assert.ok(tagMatches>=190,"established teams must keep wrestling");
  assert.equal(titleDefences,65,"all fictional major shows retain title defences");
  diagnostics.push({promotion:profile.id,uniqueWorkers:appearances.size,womenUsed,
   titleChallengers:titleOpponents.size,mainEventPairings:mainEvents.size,
   consecutiveRepeatedHeadliners:backToBack,womensMatches,tagMatches});
 }
 console.log("Phase 13 five-season actual AI planner diagnostics:",JSON.stringify(diagnostics));
});
test("title challenger rotation respects champion eligibility, divisions, shortlists and determinism",()=>{
 const roster:AiRosterCandidate[]=Array.from({length:12},(_,i)=>({
  personId:"w-"+i,contractId:"contract-"+i,bookingDivision:i<7?"MEN":"WOMEN",
  weeklyCapacity:4,popularity:90-i*2,recognition:88-i*2,
  momentum:85-i,presentation:80-i,matchCraft:80-i
 }));
 const base={roster,holderId:"w-0",championshipId:"singles",worldSeed:"19",
  promotionId:"ai",year:1,week:4};
 const choices=Array.from({length:13},(_,i)=>
  chooseAiTitleChallenger({...base,week:(i+1)*4})?.personId);
 assert.ok(new Set(choices).size>=3);
 assert.ok(choices.every(id=>id!==base.holderId&&
  roster.find(x=>x.personId===id)?.bookingDivision==="MEN"));
 assert.deepEqual(choices,Array.from({length:13},(_,i)=>
  chooseAiTitleChallenger({...base,week:(i+1)*4,
   roster:[...roster].reverse()})?.personId));
 assert.equal(chooseAiTitleChallenger({...base,holderId:"not-contracted"}),null);
 assert.equal(chooseAiTitleChallenger({...base,roster:[roster[0]!,roster[7]!]}),null);
 assert.throws(()=>chooseAiTitleChallenger({...base,week:53}),/Invalid/);
 const first=choices[0]!;
 const alternate=chooseAiTitleChallenger({...base,recentPairs:[
  [base.holderId,first].sort().join(":")
 ]});
 assert.notEqual(alternate?.personId,first,"recent title rematches have alternatives");
});

