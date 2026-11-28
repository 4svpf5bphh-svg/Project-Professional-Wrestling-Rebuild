import {createHash} from "node:crypto";
import type {TransactionPool} from "../../src/db/transaction.js";
import {withWorldTransaction} from "../../src/db/transaction.js";
import {addPromotion,createWorld} from "../../src/db/world-operations.js";
import {decideBackstageRequest} from "../../src/db/backstage-conversations.js";
import {saveOwnerDisplayName} from "../../src/db/owner-identities.js";
import {worldStaff} from "../../src/domain/world-staff.js";
import {startProgramme} from "../../src/db/programme-workspace.js";

export const managerId="m8-booker";
export const rivalManagerId="m8-rival";
export const promotionId="promotion-009";
export const rivalPromotionId="promotion-010";
export const accessCode="m8-local-evidence-invite-only";
export const inviteHash=createHash("sha256").update(accessCode).digest("hex");

const entrants=[
 ["samoa-joe","Samoa Joe"],["will-ospreay","Will Ospreay"],
 ["alex-shelley","Alex Shelley"],["chris-sabin","Chris Sabin"],
 ["aj-styles","AJ Styles"],["kurt-angle","Kurt Angle"],
 ["ricochet","Ricochet"],["cody-rhodes","Cody Rhodes"],
 ["iyo-sky","Iyo Sky"],["mercedes-mone","Mercedes Moné"],
 ["asuka","Asuka"],["mickie-james","Mickie James"]
] as const;

export function disposableDatabaseUrl(raw:string|undefined){
 if(!raw)throw new Error("Set PPW_M8_DATABASE_URL to a migrated, disposable PostgreSQL database.");
 const url=new URL(raw);
 if(!["postgres:","postgresql:"].includes(url.protocol)||
    !["127.0.0.1","[::1]"].includes(url.hostname)||
    !/^\/ppw_m8(?:_[a-z0-9_]+)?$/.test(url.pathname)||url.search)
  throw new Error("Milestone 8 tests require a loopback-only ppw_m8 database and no connection overrides.");
 return url;
}

export async function seedMilestone8World(pool:TransactionPool,worldId:string,options:{
 companies?:number;secondManager?:boolean;coldStart?:boolean;benchmark?:boolean;commercial?:boolean;
}={}){
 const count=options.companies??2;
 await withWorldTransaction(pool,async tx=>{
  await createWorld(tx,{id:worldId,name:"North American Wrestling World",seed:8213,rulesetVersion:"test"});
  await tx.query(`UPDATE ppw_worlds SET injury_rate_multiplier=0,show_economics_enabled=$2,
   major_event_interval_weeks=52 WHERE world_id=$1`,[worldId,options.commercial===true]);
  await tx.query(`INSERT INTO ppw_markets(world_id,market_id,name,audience_potential,wrestling_interest,spending_index)
   VALUES($1,'home','New England',70,78,100)`,[worldId]);
  for(let company=0;company<count;company++){
   const owned=company===0||company===1&&options.secondManager;
   const id=company===0?promotionId:company===1?rivalPromotionId:"rival-"+company;
   const name=company===0?"Crown Wrestling":company===1?"Atlas Wrestling":"Territory Wrestling "+company;
   const arena="arena-"+company;
   await addPromotion(tx,worldId,{id,name,tier:"LOCAL"});
   await tx.query(`UPDATE ppw_promotions SET management_mode=$3,home_market_id='home',
    cash=2400000,media_reach=75,weekly_fixed_overhead=5000,event_cadence_weeks=1,
    ai_risk_tolerance=52,ai_match_quality_preference=70,ai_star_preference=60,ai_financial_caution=60,
    financial_distress='HEALTHY' WHERE world_id=$1 AND promotion_id=$2`,
    [worldId,id,owned?"HUMAN":"AI"]);
   if(options.commercial)await tx.query(`INSERT INTO ppw_promotion_market_states
    (world_id,promotion_id,market_id,awareness,live_strength,loyalty)
    VALUES($1,$2,'home',64,70,59)`,[worldId,id]);
   await tx.query(`INSERT INTO ppw_venues(world_id,venue_id,name,market_id,capacity,weekly_hire_cost,
    prestige,production_suitability)
    VALUES($1,$2,$3,'home',2500,8500,68,80)`,[worldId,arena,company===0?"Crown Pavilion":name+" Arena"]);
   await tx.query(`INSERT INTO ppw_show_series(world_id,promotion_id,series_id,name,role,
    event_type,cadence_weeks,anchor_week,importance)
    VALUES($1,$2,$3,$4,'FLAGSHIP','REGULAR',1,0,65)`,
    [worldId,id,id+"-flagship",company===0?"Ascension":name+" Live"]);
   await tx.query(`INSERT INTO ppw_commercial_deals
    (world_id,deal_id,promotion_id,kind,offer_code,status,baseline_income,agreed_income,
     baseline_reach,agreed_reach,start_week_index,end_week_index,source,airing_day,airing_hour)
    VALUES($1,$2,$3,'BROADCAST','BROADCAST_GROWTH','ACTIVE',25000,30000,70,76,0,51,$4,$5,20)`,
    [worldId,id+"-network",id,owned?"HUMAN":"AI",company===0?3:5]);
   for(const [i,[slug,name]] of entrants.entries()){
    const personId=company===0?slug:"talent-"+company+"-"+i;
    await tx.query(`INSERT INTO ppw_people(world_id,person_id,name,booking_division,
     in_ring_quality,match_craft,presentation,stamina,safety,fatigue,wear,popularity,
     recognition,momentum,default_alignment,career_stage,morale,weekly_service_capacity)
     VALUES($1,$2,$3,$4,$5,85,82,90,98,5,3,$6,70,65,$7,'PRIME',78,3)`,
     [worldId,personId,company===0?name:"Wrestler "+company+"-"+i,i<8?"MEN":"WOMEN",
      88-i,82-i,i%2===0?"HEEL":"FACE"]);
    await tx.query(`INSERT INTO ppw_contracts(world_id,contract_id,person_id,promotion_id,family,
     status,remaining_dates,expires_week_index,appearance_fee,weekly_guarantee)
     VALUES($1,$2,$3,$4,'LIMITED_NON_EXCLUSIVE','SIGNED',36,$5,1750,1250)`,
     [worldId,"deal-"+personId,personId,id,company===0&&i===7?3:51]);
   }
   if(!owned)continue;
   const player=company===0?managerId:rivalManagerId;
   if(!(company===0&&options.coldStart)){
    await tx.query("INSERT INTO ppw_players(player_id) VALUES($1) ON CONFLICT DO NOTHING",[player]);
    await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status) VALUES($1,$2,'ACTIVE')",[worldId,player]);
    await tx.query("INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id) VALUES($1,$2,$3)",[worldId,player,id]);
   }
   for(const week of (options.benchmark?[1]:options.secondManager?[1,2,3,4]:[1,2,4])){
    const showId=company===0?"tv-"+week:"atlas-"+week;
    await tx.query(`INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,year,
     week,status,show_day,venue_id,market_id,booking_class,event_type,show_name,
     show_series_id,event_importance,ticket_strategy)
     VALUES($1,$2,$3,1,$4,'DRAFT',$5,$6,'home','REGULAR','REGULAR',$7,$8,65,'STANDARD')`,
     [worldId,showId,id,week,company===0?3:5,arena,company===0?"Ascension":"Atlas Live",id+"-flagship"]);
   }
  }
  if(!options.benchmark){
   await tx.query(`INSERT INTO ppw_show_series(world_id,promotion_id,series_id,name,role,
    event_type,cadence_weeks,anchor_week,importance)
    VALUES($1,$2,'lottery-series','The Lottery','PREMIUM','MAJOR',52,1,91)`,[worldId,promotionId]);
   await tx.query(`INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,year,week,
    status,show_day,venue_id,market_id,booking_class,event_type,show_name,show_series_id,event_importance,ticket_strategy)
    VALUES($1,'the-lottery',$2,1,2,'DRAFT',7,'arena-0','home','PREMIUM','MAJOR',
     'The Lottery','lottery-series',91,'STANDARD')`,[worldId,promotionId]);
   await tx.query(`INSERT INTO ppw_championships
    (world_id,promotion_id,championship_id,name,division,status,prestige,current_reign_id)
    VALUES($1,$2,'crown-world','Crown World Championship','SINGLES','ACTIVE',87,'initial-reign')`,[worldId,promotionId]);
   await tx.query(`INSERT INTO ppw_championship_reigns
    (world_id,promotion_id,championship_id,reign_id,holder_type,person_id,status,start_week_index)
    VALUES($1,$2,'crown-world','initial-reign','PERSON','samoa-joe','ACTIVE',0)`,[worldId,promotionId]);
   await tx.query(`INSERT INTO ppw_backstage_requests(world_id,request_id,promotion_id,person_id,kind,
    created_week_index,source_contract_id)
    VALUES($1,'shelley-wants-a-match',$2,'alex-shelley','MORALE',0,'deal-alex-shelley')`,[worldId,promotionId]);
   const staff=worldStaff(8213);
   await tx.query(`INSERT INTO ppw_staff_employments(world_id,employment_id,staff_id,role,promotion_id,
    status,weekly_salary,start_week_index,expires_week_index,term_weeks,morale)
    VALUES($1,'road-agent',$3,'ROAD_AGENT',$2,'ACTIVE',750,0,51,52,75),
          ($1,'talent-manager',$4,'TALENT_MANAGER',$2,'ACTIVE',750,0,51,52,75)`,[worldId,promotionId,
     staff.find(member=>member.role==="ROAD_AGENT")!.staffId,staff.find(member=>member.role==="TALENT_MANAGER")!.staffId]);
  }
 });
 if(!options.coldStart){
  await saveOwnerDisplayName(pool,managerId,"Jamie Mercer");
  if(options.secondManager)await saveOwnerDisplayName(pool,rivalManagerId,"Charlie King");
  if(!options.benchmark)await seedMilestone8Programme(pool,worldId);
 }
}

export async function seedMilestone8Programme(pool:TransactionPool,worldId:string){
 const [state]=await withWorldTransaction(pool,tx=>tx.query<{revision:string}>(
  "SELECT revision FROM ppw_worlds WHERE world_id=$1",[worldId]));
 const result=await startProgramme(pool,{worldId,promotionId,playerId:managerId,
  requestId:"seed-programme",expectedRevision:Number(state?.revision),
  sideA:[{kind:"PERSON",refId:"samoa-joe"}],sideB:[{kind:"PERSON",refId:"will-ospreay"}],
  championshipId:"crown-world"});
 if(result.status!=="APPLIED")throw new Error("The fixture title programme was not created");
 const promised=await decideBackstageRequest(pool,{worldId,promotionId,playerId:managerId,
  requestId:"seed-appearance-agreement",expectedRevision:result.revision,
  conversationId:"shelley-wants-a-match",decision:"PROMISE_APPEARANCE"});
 if(promised.status!=="APPLIED")throw new Error("The fixture appearance promise was not recorded");
 return result.result.programmeId;
}
