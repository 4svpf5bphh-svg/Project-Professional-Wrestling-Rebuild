import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction,type TransactionPool} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {readChampionshipDirectory} from "../src/db/championship-history.js";
import {MeasuredQuerySession} from "../src/db/query-meter.js";

const url=process.env.PPW_NEON_TEST_URL;
test("owned men, women and genuine two-person teams earn contenders from sealed results in five bounded SQL reads",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const db=postgresPool(url!,3),uid=randomUUID(),
  world="contenders-"+uid,promotion="club-"+uid,player="owner-"+uid;
 const read=async()=>readChampionshipDirectory(db.pool,world,player,promotion);
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:world,name:"Real Contenders",seed:519,rulesetVersion:"test"});
   await addPromotion(tx,world,{id:promotion,name:"Union Pro",tier:"INDEPENDENT"});
   await tx.query("UPDATE ppw_worlds SET year=1,week=20 WHERE world_id=$1",[world]);
   await tx.query("INSERT INTO ppw_players(player_id) VALUES($1)",[player]);
   await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status) VALUES($1,$2,'ACTIVE')",[world,player]);
   await tx.query("INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id,active) VALUES($1,$2,$3,true)",
    [world,player,promotion]);
   const names:[string,string,"MEN"|"WOMEN",number,number][]=[
    ["champ","Reigning Champion","MEN",90,95],
    ["star","Famous Loser","MEN",95,98],
    ["worker","Earned Challenger","MEN",55,40],
    ["w1","Women's Challenger","WOMEN",65,55],
    ["w2","Women's Opponent","WOMEN",40,42],
    ["a","First Team A","MEN",66,65],["b","First Team B","MEN",64,65],
    ["c","Second Team A","MEN",62,60],["d","Second Team B","MEN",60,59],
    ["outsider","Unsigned Wrestler","MEN",99,100]
   ];
   for(const [personId,name,division,momentum,popularity] of names){
    await tx.query(`INSERT INTO ppw_people(world_id,person_id,name,booking_division,
     momentum,popularity) VALUES($1,$2,$3,$4,$5,$6)`,
     [world,personId,name,division,momentum,popularity]);
    if(personId!=="outsider")
     await tx.query(`INSERT INTO ppw_contracts(world_id,contract_id,person_id,
      promotion_id,family,status,remaining_dates,expires_week_index)
      VALUES($1,$2,$3,$4,'LIMITED_NON_EXCLUSIVE','SIGNED',20,52)`,
      [world,"deal-"+personId,personId,promotion]);
   }
   await tx.query(`INSERT INTO ppw_tag_teams(world_id,team_id,name,status)
    VALUES($1,'team-a','Union Aces','ACTIVE'),($1,'team-b','Young Guns','ACTIVE')`,[world]);
   await tx.query(`INSERT INTO ppw_tag_team_members(world_id,team_id,person_id)
    VALUES($1,'team-a','a'),($1,'team-a','b'),
          ($1,'team-b','c'),($1,'team-b','d')`,[world]);
   await tx.query(`INSERT INTO ppw_championships(
    world_id,promotion_id,championship_id,name,division,booking_division,
    status,prestige,current_reign_id)
    VALUES($1,$2,'men','Men World','SINGLES','MEN','ACTIVE',85,'r1'),
          ($1,$2,'women','Women World','SINGLES','WOMEN','ACTIVE',75,NULL),
          ($1,$2,'tag','Tag Team','TAG','MEN','ACTIVE',70,NULL)`,
    [world,promotion]);
   await tx.query(`INSERT INTO ppw_championship_reigns(
    world_id,promotion_id,championship_id,reign_id,holder_type,
    person_id,status,start_week_index)
    VALUES($1,$2,'men','r1','PERSON','champ','ACTIVE',0)`,[world,promotion]);
   const show=(id:string,week:number)=>tx.query(`
    INSERT INTO ppw_completed_shows(
     world_id,promotion_id,show_id,year,week,resolution_id,crowd_response,
     receipt_json,receipt_digest)
    VALUES($1,$2,$3,1,$4,$5,77,'{}'::jsonb,repeat('a',64))`,
    [world,promotion,id,week,"resolve-"+id]);
   const match=(id:string,winner:"A"|"B")=>tx.query(`
    INSERT INTO ppw_completed_show_matches(
     world_id,show_id,match_id,position,crowd_response,
     actual_finish,actual_winner_side)
    VALUES($1,$2,'match',0,77,'CLEAN_PIN',$3)`,[world,id,winner]);
   const effect=async(family:"INDIVIDUAL"|"TAG",id:string,p:string,
    side:"A"|"B",won:boolean,strength:number)=>{
    await tx.query(`INSERT INTO ${family==="TAG"?
      "ppw_tag_match_career_effects":"ppw_individual_field_career_effects"}(
     world_id,show_id,match_id,person_id,actual_winner_side,
     performer_side,won,before_stats,after_stats)
     VALUES($1,$2,'match',$3,'A',$4,$5,$6::jsonb,$6::jsonb)`,
     [world,id,p,side,won,JSON.stringify({
      popularity:strength,momentum:50,recognition:50,fatigue:10,wear:5
     })]);
   };
   await show("mens",18);await match("mens","A");
   await effect("INDIVIDUAL","mens","worker","A",true,40);
   await effect("INDIVIDUAL","mens","star","B",false,98);
   await show("womens",19);await match("womens","A");
   await effect("INDIVIDUAL","womens","w1","A",true,55);
   await effect("INDIVIDUAL","womens","w2","B",false,40);
   await show("tags",20);await match("tags","A");
   for(const id of ["a","b"])await effect("TAG","tags",id,"A",true,65);
   for(const id of ["c","d"])await effect("TAG","tags",id,"B",false,60);
   // Signed-only candidates: the very popular outsider has no match licence.
  });
  const meter=new MeasuredQuerySession("owner-championship-contenders");
  const counted:TransactionPool={async connect(){
   const client=await db.pool.connect();
   return {release(){client.release();},
    query<T extends Record<string,unknown>>(sql:string,args:readonly unknown[]){
     return meter.execute(()=>client.query<T>(sql,args));
    }};
  }};
  const directory=await readChampionshipDirectory(counted,world,player,promotion);
  assert.equal(meter.sample().queryCount,5,
   "A whole owner contender page must not query per belt or wrestler");
  assert.deepEqual(directory.contenders?.men?.map(x=>x.id),["worker","star"],
   "Actual recent winner outranks the bigger celebrity who lost");
  assert.equal(directory.contenders?.men?.[0]?.wins,1);
  assert.equal(directory.contenders?.men?.[1]?.losses,1);
  assert.equal(directory.contenders?.men?.some(x=>x.id==="champ"),false);
  assert.equal(directory.contenders?.men?.some(x=>x.id==="outsider"),false);
  assert.deepEqual(directory.contenders?.women?.map(x=>x.id),["w1","w2"]);
  assert.deepEqual(directory.contenders?.tag?.map(x=>x.id),["team-a","team-b"],
   "Only teams that actually teamed together earn 2v2 rankings");
  await assert.rejects(
   readChampionshipDirectory(db.pool,world,"rival",promotion),/access denied/);
  const repeat=await read();
  assert.deepEqual(repeat.contenders,directory.contenders,
   "Reopening the same World week cannot reroll title rankings");
  await withWorldTransaction(db.pool,tx=>tx.query(
   "UPDATE ppw_championships SET booking_division=NULL WHERE world_id=$1",
   [world]));
  const legacy=await read();
  assert.deepEqual(legacy.contenders?.men?.map(x=>x.id),["worker","star"],
   "An original unassigned men's world title still has a real ranking");
  assert.deepEqual(legacy.contenders?.tag?.map(x=>x.id),["team-a","team-b"],
   "A legacy universal tag belt still recognises certified 2v2 form");
  assert.ok(legacy.contenders?.women?.some(x=>x.id==="w1"),
   "A vacant unassigned legacy championship can find an eligible winner");
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_tag_match_career_effects",
    "ppw_individual_field_career_effects","ppw_completed_show_matches",
    "ppw_completed_shows","ppw_championship_reigns","ppw_championships",
    "ppw_tag_team_members","ppw_tag_teams","ppw_contracts","ppw_people",
    "ppw_promotion_controls","ppw_memberships","ppw_promotions"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[world]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[player]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>db.close());
 }
});
