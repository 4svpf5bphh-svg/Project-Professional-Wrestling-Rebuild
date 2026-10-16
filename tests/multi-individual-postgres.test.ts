import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {resolveCanonicalShow} from "../src/db/resolve-canonical-show.js";
import {previewArchivedShowMatchScores} from "../src/db/legacy-match-scoring.js";
import {previewLegacyShowMatchStyles} from "../src/db/legacy-match-projection.js";
const url=process.env.PPW_NEON_TEST_URL;
for(const count of [3,4]){
 test(`Canonical ${count}-person individual match persists exact participants, title result and career effects once`,
 {skip:!url?"No disposable PostgreSQL":false},async()=>{
  const db=postgresPool(url!,3),world="field-"+count+"-"+randomUUID();
  const promotion="promotion",show="show",ids=["a","b","c","d"].slice(0,count);
  const champ=ids[0]!,winner=ids.at(-1)!;
  try{
   await withWorldTransaction(db.pool,async tx=>{
    await createWorld(tx,{id:world,name:"Multi-person CI",seed:77,rulesetVersion:"test"});
    await addPromotion(tx,world,{id:promotion,name:"Competition",tier:"LOCAL"});
    await tx.query(`INSERT INTO ppw_venues(world_id,venue_id,name)
     VALUES($1,'arena','Arena')`,[world]);
    await tx.query(`UPDATE ppw_promotions SET media_reach=86
     WHERE world_id=$1 AND promotion_id=$2`,[world,promotion]);
    for(let i=0;i<count;i++){
     await tx.query(`INSERT INTO ppw_people(world_id,person_id,name,
      booking_division,in_ring_quality,match_craft,presentation,
      stamina,safety,fatigue,wear,popularity,recognition,momentum)
      VALUES($1,$2,$2,'MEN',80,81,77,82,95,11,8,65,71,75)`,[world,ids[i]!]);
     await tx.query(`INSERT INTO ppw_contracts
       (world_id,contract_id,person_id,promotion_id,family,status,
        remaining_dates,expires_week_index)
      VALUES($1,$2,$3,$4,'LIMITED_NON_EXCLUSIVE','SIGNED',5,52)`,
      [world,"deal-"+ids[i],ids[i],promotion]);
    }
    await tx.query(`INSERT INTO ppw_booking_drafts(
      world_id,draft_id,promotion_id,year,week,status,show_day,venue_id,event_importance)
      VALUES($1,$2,$3,1,1,'SUBMITTED',3,'arena',83)`,[world,show,promotion]);
    const people=ids.map(id=>({personId:id,contractId:"deal-"+id}));
    const payload={matchType:"SINGLES",family:"INDIVIDUAL",participants:people,
     sides:people.map((x,i)=>({sideId:"ABCD"[i],participants:[x]})),
     scriptedWinnerSide:"ABCD"[count-1],scriptedWinner:winner,
     plannedFinish:"CLEAN_PIN",plannedLengthMinutes:22,
     intent:"TECHNICAL",championshipId:"belt"};
    await tx.query(`INSERT INTO ppw_card_slots(
      world_id,draft_id,slot_id,position,kind,payload)
      VALUES($1,$2,'main',0,'MATCH',$3::jsonb)`,
      [world,show,JSON.stringify(payload)]);
    await tx.query(`INSERT INTO ppw_championships(world_id,promotion_id,
      championship_id,name,division,status,prestige,current_reign_id)
      VALUES($1,$2,'belt','World Singles','SINGLES','ACTIVE',90,'first')`,
      [world,promotion]);
    await tx.query(`INSERT INTO ppw_championship_reigns(
      world_id,promotion_id,championship_id,reign_id,holder_type,
      person_id,status,start_week_index)
      VALUES($1,$2,'belt','first','PERSON',$3,'ACTIVE',0)`,
      [world,promotion,champ]);
    await tx.query(`UPDATE ppw_worlds SET phase='RESOLVING',
      injury_rate_multiplier=0.1 WHERE world_id=$1`,[world]);
    await tx.query(`INSERT INTO ppw_week_resource_clearances(
      world_id,year,week,eligible_promotions,inspected_slots,command_request_id)
      VALUES($1,1,1,1,1,'field-fixture')`,[world]);
   });
   const scope={worldId:world,promotionId:promotion,showId:show};
   const styles=await previewLegacyShowMatchStyles(db.pool,scope);
   assert.equal(styles.projections[0]!.status,"READY");
   const projected=await previewArchivedShowMatchScores(db.pool,scope);
   assert.equal(projected.projections[0]!.multi?.result.members.length,count);
   const recorded=await resolveCanonicalShow(db.pool,{...scope,year:1,week:1,
    resolutionId:"multi-1"});
   assert.equal(recorded,"RECORDED");
   const re=await resolveCanonicalShow(db.pool,{...scope,year:1,week:1,
    resolutionId:"multi-1"});
   assert.equal(re,"IDENTICAL_RETRY");
   const evidence=await withWorldTransaction(db.pool,tx=>tx.query<{
    evidence_json:{booking:{family:string;participants:string[]}}}>(`
    SELECT evidence_json FROM ppw_completed_match_evidence WHERE world_id=$1`,[world]));
   assert.equal(evidence[0]?.evidence_json.booking.family,"INDIVIDUAL");
   assert.deepEqual(evidence[0]?.evidence_json.booking.participants,ids);
   const effects=await withWorldTransaction(db.pool,tx=>tx.query<{
    person_id:string;won:boolean;after_stats:{fatigue:number;momentum:number}}>(`
    SELECT person_id,won,after_stats FROM ppw_individual_field_career_effects
    WHERE world_id=$1 ORDER BY person_id`,[world]));
   assert.equal(effects.length,count);
   assert.deepEqual(effects.map(x=>x.person_id),ids);
   assert.equal(effects.filter(x=>x.won).length,1);
   assert.equal(effects.find(x=>x.won)?.person_id,winner);
   const states=await withWorldTransaction(db.pool,tx=>tx.query<{
    person_id:string;fatigue:number;momentum:number}>(`
    SELECT person_id,fatigue,momentum FROM ppw_people
    WHERE world_id=$1 ORDER BY person_id`,[world]));
   assert.deepEqual(states.map(x=>x.fatigue),
    effects.map(x=>x.after_stats.fatigue));
   const holders=await withWorldTransaction(db.pool,tx=>tx.query<{
    person_id:string;defenses:number}>(`
    SELECT r.person_id,r.defenses FROM ppw_championships c
     JOIN ppw_championship_reigns r ON r.world_id=c.world_id
      AND r.promotion_id=c.promotion_id
      AND r.championship_id=c.championship_id
      AND r.reign_id=c.current_reign_id WHERE c.world_id=$1`,[world]));
   assert.equal(holders[0]?.person_id,winner);
   const contests=await withWorldTransaction(db.pool,tx=>tx.query<{
    winner_person_id:string;title_changed:boolean}>(`
    SELECT winner_person_id,title_changed FROM ppw_championship_contests
    WHERE world_id=$1`,[world]));
   assert.deepEqual(contests,[{winner_person_id:winner,title_changed:true}]);
  }finally{
   await withWorldTransaction(db.pool,async tx=>{
    for(const table of ["ppw_individual_field_career_effects",
     "ppw_championship_contests","ppw_championship_reigns","ppw_championships",
     "ppw_ledger_events","ppw_completed_match_evidence",
     "ppw_completed_show_matches","ppw_completed_shows",
     "ppw_week_resource_clearances","ppw_card_slots","ppw_booking_drafts",
     "ppw_contracts","ppw_people","ppw_venues","ppw_promotions"])
     await tx.query(`DELETE FROM ${table} WHERE world_id=$1`,[world]);
    await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
   }).finally(()=>db.close());
  }
 });
}
