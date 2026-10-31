import {test} from "node:test";
import {strict as assert} from "node:assert";
import {readCompletedShowView} from "../src/db/show-results-view.js";
import {showReactionWire} from "../src/domain/show-reaction-wire.js";
import {showCrowdFlow} from "../src/domain/show-crowd-flow.js";
import type {TransactionPool} from "../src/db/transaction.js";
const scope={worldId:"world",promotionId:"prom",showId:"show",playerId:"owner"};
const receipt={worldId:"world",promotionId:"prom",showId:"show",year:1,week:1,
 resolutionId:"res",crowdResponse:77,
 matches:[{matchId:"m",position:0,crowdResponse:85,actualFinish:"CLEAN_PIN",actualWinnerSide:"A"}],
 segments:[{slotId:"a",position:1,kind:"PROMO",outcome:"REFUSED",crowdResponse:64}]};
function fake(authorized=true,canonical=false,historicPersona=false,withProgrammes=false,resultsSkin:string|null=null){
 let calls=0;
 const pool:TransactionPool={async connect(){return {release(){},
  async query<T extends Record<string,unknown>>(sql:string,params:readonly unknown[]=[]){
   if(["BEGIN","COMMIT","ROLLBACK"].includes(sql))return [] as T[];
   calls++;
   if(sql.includes("FROM ppw_completed_shows"))return (authorized?[{receipt_json:withProgrammes?
    {...receipt,year:2,week:3,
     segments:[{...receipt.segments[0]!,outcome:"HAPPENS"}]}:receipt,
    results_skin:resultsSkin}]:[]) as unknown as T[];
   if(sql.includes("FROM ppw_card_slots"))return [
    {slot_id:"m",kind:"MATCH",position:0,payload:canonical?{
     matchType:"SINGLES",family:"INDIVIDUAL",
     scriptedWinnerSide:"A",plannedFinish:"CLEAN_PIN",intent:"TECHNICAL",
     plannedLengthMinutes:18,championshipId:"world-title",
     participants:[{personId:"a",contractId:"c"},{personId:"b",contractId:"d"}],
     sides:[{sideId:"A",participants:[{personId:"a",contractId:"c"}]},
      {sideId:"B",participants:[{personId:"b",contractId:"d"}]}],
    }:{participants:[{personId:"a",contractId:"c"}]}},
    {slot_id:"a",kind:"SEGMENT",position:1,payload:{participants:[{personId:"a",contractId:"c"}]}},
   ] as unknown as T[];
   if(sql.includes("FROM ppw_people")){
    if(historicPersona){
     assert.match(sql,/ended_week_index>\$3/);
     assert.deepEqual(params,["world",["a","b"],0]);
     return [
      {person_id:"a",name:"Star",portable_gimmick_id:"AUTHENTIC",
       persona_record:{personaName:"Original Star",gimmickId:"AUTHENTIC",
        primaryStyle:"TECHNICAL",secondaryStyle:null,signatureMoves:[],
        finishingMoves:[{name:"The Original Finish",category:"GRAPPLE",
         source:"PPW_AUTHORED"}],source:"NEGOTIATED"}},
      {person_id:"b",name:"Rival",portable_gimmick_id:null,persona_record:null}
     ] as unknown as T[];
    }
    return [{person_id:"a",name:"Star"},{person_id:"b",name:"Rival"}] as unknown as T[];
   }
   if(sql.includes("FROM ppw_completed_show_matches m"))return [{
    match_id:"m",evidence_json:null,championship_name:null,title_changed:null,
    title_winner_name:null,title_prior_holder_name:null,injuries:[],
   }] as unknown as T[];
   if(sql.includes("FROM ppw_completed_show_segments")){
    assert.match(sql,/UNION ALL/);
    assert.match(sql,/prior\.week_index BETWEEN greatest\(0,activity\.week_index-12\)/);
    assert.match(sql,/AND activity\.week_index-1/);
    assert.deepEqual(params,["world","show","prom"]);
    const history=withProgrammes?[{
     source:"PROGRAMME",slot_id:"m",story_json:null,
     programme_context:{programmeId:"joe-riddle",sideA:"Star",sideB:"Rival",
      precedingMatches:2,precedingAngles:1,previousWinner:"B",
      previousMatchWeek:52,currentWinner:"A"}
    },{
     source:"PROGRAMME",slot_id:"a",story_json:null,
     programme_context:{programmeId:"joe-riddle",sideA:"Star",sideB:"Rival",
      precedingMatches:2,precedingAngles:1,previousWinner:"B",
      previousMatchWeek:52,currentWinner:null}}
    ]:[];
    return [{source:"STORY",slot_id:"a",story_json:{slotId:"a",position:1,
      kind:"PROMO",outcome:withProgrammes?"HAPPENS":"REFUSED",headline:"In-ring promo",
      summary:withProgrammes?"The wrestler spoke on screen.":"The wrestler refuses the promo.",
      actorIds:["a"],targetIds:[],intent:null},
      programme_context:null},...history] as unknown as T[];
   }
   throw new Error("Unexpected SQL: "+sql);
  }};}};
 return {pool,calls:()=>calls};
}
test("published card is ordered, named, scored and does not change authored outcomes",async()=>{
 const {pool,calls}=fake();
 const result=await readCompletedShowView(pool,scope);
 assert.equal(result.entries.length,2);
 assert.equal(result.entries[0]!.crowdResponse,85);
 assert.equal(result.entries[1]!.outcome,"REFUSED");
 assert.equal(result.entries[1]!.headline,"In-ring promo");
 assert.equal(calls(),5);
 assert.equal(result.entries[0]!.matchContext,undefined); // Legacy slot without sides is tolerated.
 assert.equal(result.entries[1]!.segmentKind,"PROMO");
 assert.deepEqual(result.entries[1]!.segmentContext?.actorNames,["Star"]);
});
test("foreign player cannot read another promotion's private broadcast",async()=>{
 const {pool,calls}=fake(false);
 await assert.rejects(readCompletedShowView(pool,scope),/unavailable/);
 assert.equal(calls(),1);
});

test("completed match narrative is derived from the actual finish",async()=>{
 const result=await readCompletedShowView(fake().pool,scope);
 assert.match(result.entries[0]!.summary,/clean pinfall/);
 assert.equal(result.entries[1]!.intent,null);
});

test("Ringside broadcast derives billing, intent and title-contest context from locked card",async()=>{
 const {pool,calls}=fake(true,true);
 const show=await readCompletedShowView(pool,scope);
 const match=show.entries[0]!;
 assert.equal(match.matchContext?.format,"SINGLES");
 assert.deepEqual(match.matchContext?.sides,[["Star"],["Rival"]]);
 assert.deepEqual(match.matchContext?.winnerNames,["Star"]);
 assert.equal(match.matchContext?.intent,"TECHNICAL");
 assert.equal(match.matchContext?.plannedMinutes,18);
 assert.equal(match.matchContext?.isMainEvent,true);
 assert.equal(match.matchContext?.championshipContested,true);
 assert.equal(match.crowdResponse,85);
 assert.equal(calls(),5); // Single evidence+fallout read adds only one bounded query.
});

test("Crowd Noise is computed from the private five-read completed result, without polling",async()=>{
 const {pool,calls}=fake(true,true);
 const report=await readCompletedShowView(pool,scope);
 const first=showReactionWire(report);
 assert.deepEqual(showReactionWire(report),first);
 assert.equal(calls(),5);
 assert.equal(first.length,2);
 assert.deepEqual(first.map(x=>x.slotId),["a","m"]);
 assert.match(first[0]!.text,/refused/i);
 assert.match(first[1]!.text,/crowd|building|audience|noise/i);
 assert.equal(calls(),5,"Opening generated reactions performs no extra database reads");
});

test("Crowd Flow reads the exact same certified five-query broadcast without extra traffic",async()=>{
 const {pool,calls}=fake(true,true);
 const view=await readCompletedShowView(pool,scope);
 assert.equal(calls(),5);
 const flow=showCrowdFlow(view);
 assert.deepEqual(flow.map(x=>x.slotId),["m","a"]);
 assert.deepEqual(flow.map(x=>x.crowdResponse),[85,64]);
 assert.equal(flow.filter(x=>x.standout).length,1);
 assert.equal(flow[0]!.standout,true);
 assert.equal(flow[1]!.kind,"SEGMENT");
 assert.equal(calls(),5);
});

test("historic show preserves as-of-show wrestler moveset and excludes the following persona era",async()=>{
 const view=await readCompletedShowView(fake(true,true,true).pool,scope);
 assert.deepEqual(view.entries[0]!.matchContext?.sides,[["Original Star (Star)"],["Rival"]]);
 assert.equal(view.entries[0]!.performerIdentities?.[0]?.ringName,"Original Star");
 assert.deepEqual(view.entries[0]!.performerIdentities?.[0]?.finishingMoves,["The Original Finish"]);
 assert.equal(view.entries[1]!.performerIdentities?.[0]?.ringName,"Original Star");
});

test("certified rivalry history reaches matches and angles in the existing five-read broadcast",async()=>{
 const {pool,calls}=fake(true,true,false,true);
 const result=await readCompletedShowView(pool,scope);
 assert.equal(calls(),5,"Rivalry context must not add a sixth database round trip");
 const match=result.entries[0]!;
 const angle=result.entries[1]!;
 assert.deepEqual(match.programmeChapters,[{
  programmeId:"joe-riddle",sideA:"Star",sideB:"Rival",
  precedingMatches:2,precedingAngles:1,previousWinner:"B",
  previousMatchWeek:52,currentWinner:"A"
 }]);
 assert.equal(angle.programmeChapters?.[0]?.previousWinner,"B");
 assert.equal(angle.programmeChapters?.[0]?.currentWinner,null);
 assert.equal(angle.outcome,"HAPPENS",
  "Only a completed on-screen segment may be a certified rivalry chapter");
});

test("Account skin travels with authorised results without a sixth Neon read",async()=>{
 const {pool,calls}=fake(true,true,false,false,"TERRITORY_TV");
 const show=await readCompletedShowView(pool,scope);
 assert.equal(show.resultsSkin,"TERRITORY_TV");
 assert.equal(calls(),5);
 assert.equal((await readCompletedShowView(fake().pool,scope)).resultsSkin,null);
 await assert.rejects(readCompletedShowView(fake(false,false,false,false,
  "TERRITORY_TV").pool,scope),/unavailable/);
});

test("Fight Night results are owner-only and need no sixth Neon query",async()=>{
 const {pool,calls}=fake(true,true,false,false,"FIGHT_NIGHT");
 const show=await readCompletedShowView(pool,scope);
 assert.equal(show.resultsSkin,"FIGHT_NIGHT");
 assert.deepEqual(show.entries[0]?.matchContext?.winnerNames,["Star"]);
 assert.equal(calls(),5);
 await assert.rejects(readCompletedShowView(fake(false,true,false,false,"FIGHT_NIGHT").pool,
  scope),/unavailable/);
});

test("Zine stays private; the same five verified results reads retain the actual winner",async()=>{
 const {pool,calls}=fake(true,true,false,false,"UNDERGROUND_ZINE");
 const view=await readCompletedShowView(pool,scope);
 assert.equal(view.resultsSkin,"UNDERGROUND_ZINE");
 assert.deepEqual(view.entries[0]?.matchContext?.winnerNames,["Star"]);
 assert.equal(view.entries[0]?.crowdResponse,85);
 assert.equal(calls(),5);
 await assert.rejects(readCompletedShowView(fake(false,true,false,false,
  "UNDERGROUND_ZINE").pool,scope),/unavailable/);
});

test("Retro Booker keeps real winners, account privacy and five Neon reads",async()=>{
 const {pool,calls}=fake(true,true,false,false,"RETRO_BOOKER_02");
 const show=await readCompletedShowView(pool,scope);
 assert.equal(show.resultsSkin,"RETRO_BOOKER_02");
 assert.deepEqual(show.entries[0]?.matchContext?.winnerNames,["Star"]);
 assert.equal(calls(),5);
 await assert.rejects(readCompletedShowView(fake(false,true,false,false,
  "RETRO_BOOKER_02").pool,scope),/unavailable/);
});
