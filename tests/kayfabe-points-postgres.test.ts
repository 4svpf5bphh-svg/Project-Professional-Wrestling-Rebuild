import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {originalGenesisFixture} from "./fixtures/original-genesis.js";
import {importOriginalGenesis} from "../src/db/import-original-genesis.js";
import {joinWorld} from "../src/db/membership-operations.js";
import {submitPromotionClaim} from "../src/db/promotion-commands.js";
import {readKayfabeWorkspace,readPromoterAchievementWorkspace,claimKayfabeWeek,applyKayfabeAction}
 from "../src/db/kayfabe-points.js";
import {readWrestlerDirectory} from "../src/db/wrestler-directory.js";
import {readStaffWorkspace} from "../src/db/staff-workspace.js";
import {dispatchCardRpc} from "../src/web/card-rpc.js";

const url=process.env.PPW_NEON_TEST_URL;
test("two managers earn account KP once, purchase only cosmetics and create a shared free agent",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const world="kp-"+randomUUID(),a="kp-a-"+randomUUID(),b="kp-b-"+randomUUID();
 const db=postgresPool(url!,3);
 try{
  await importOriginalGenesis(db.pool,originalGenesisFixture(world,72));
  assert.equal((await joinWorld(db.pool,{worldId:world,playerId:a,
   requestId:"kp-a-join",expectedRevision:0})).status,"APPLIED");
  assert.equal((await submitPromotionClaim(db.pool,{worldId:world,playerId:a,
   promotionId:"promotion-0",requestId:"kp-a-claim",expectedRevision:1})).status,"APPLIED");
  assert.equal((await joinWorld(db.pool,{worldId:world,playerId:b,
   requestId:"kp-b-join",expectedRevision:2})).status,"APPLIED");
  assert.equal((await submitPromotionClaim(db.pool,{worldId:world,playerId:b,
   promotionId:"promotion-1",requestId:"kp-b-claim",expectedRevision:3})).status,"APPLIED");
  const aa={worldId:world,promotionId:"promotion-0",playerId:a},
   bb={worldId:world,promotionId:"promotion-1",playerId:b};
  assert.equal((await claimKayfabeWeek(db.pool,aa)).awarded,0);
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query("INSERT INTO ppw_world_news_weeks(world_id,year,week) VALUES($1,1,1)",[world]);
   await tx.query(`INSERT INTO ppw_completed_shows(world_id,promotion_id,show_id,
     year,week,resolution_id,crowd_response,receipt_json,receipt_digest)
     VALUES($1,'promotion-0','kp-result',1,1,'kp-resolution',80,
      '{}'::jsonb,repeat(md5('kp-result'),2))`,[world]);
   await tx.query(`INSERT INTO ppw_staff_employments(world_id,employment_id,staff_id,
     promotion_id,role,status,weekly_salary,start_week_index,term_weeks,
     expires_week_index,morale)
     VALUES($1,'kp-agent','staff-road-agent-001','promotion-0','ROAD_AGENT',
     'ACTIVE',1000,0,52,51,80)`,[world]);
  });
  const first=await claimKayfabeWeek(db.pool,aa);
  assert.equal(first.awarded,100);
  assert.equal((await claimKayfabeWeek(db.pool,aa)).awarded,0);
  assert.equal((await claimKayfabeWeek(db.pool,bb)).awarded,0);
  const scope={pool:db.pool,actor:{playerId:a}};
  assert.equal((await dispatchCardRpc(scope,"kpWorkspace",{
   worldId:world,promotionId:"promotion-0"} ) as {balance:number}).balance,100);
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query(`UPDATE ppw_kp_wallets
    SET balance=5000,lifetime_earned=5000 WHERE player_id=$1`,[a]);
  });
  const brand={kind:"BUY" as const,sku:"BRAND_CHROME" as const,requestId:"buy-chrome"};
  const paid=await applyKayfabeAction(db.pool,aa,brand) as {price:number};
  assert.equal(paid.price,200);
  assert.equal((await applyKayfabeAction(db.pool,aa,brand)).replayed,true);
  await assert.rejects(applyKayfabeAction(db.pool,aa,{
   kind:"BUY",sku:"BADGE_GOLD",requestId:"buy-chrome"}),/request ID/);
  const rename=await applyKayfabeAction(db.pool,aa,{
   kind:"RENAME_STAFF",staffId:"staff-road-agent-001",name:"Riley The Agent",
   requestId:"rename-agent"}) as {price:number};
  assert.equal(rename.price,350);
  const office=await readStaffWorkspace(db.pool,aa);
  assert.equal(office.employees.find(e=>e.staffId==="staff-road-agent-001")?.name,"Riley The Agent");
  assert.equal((await readStaffWorkspace(db.pool,bb)).employees.length,0);
  const added=await applyKayfabeAction(db.pool,aa,{
   kind:"CREATE_WRESTLER",name:"Taylor Comet",division:"WOMEN",
   gimmickId:"UNDERDOG",alignment:"TWEENER",primaryStyle:"HIGH_FLYER",
   signatureMove:"Shooting Star Dive",finishingMove:"Comet Driver",requestId:"create-comet"}) as unknown as {market:string;price:number;personId:string};
  assert.equal(added.market,"FREE_AGENT");
  assert.equal(added.price,3000);
  assert.equal((await applyKayfabeAction(db.pool,aa,{
   kind:"CREATE_WRESTLER",name:"Taylor Comet",division:"WOMEN",
   gimmickId:"UNDERDOG",alignment:"TWEENER",primaryStyle:"HIGH_FLYER",
   signatureMove:"Shooting Star Dive",finishingMove:"Comet Driver",requestId:"create-comet"})).replayed,true);
  await assert.rejects(applyKayfabeAction(db.pool,aa,{
   kind:"CREATE_WRESTLER",name:"Taylor Star",division:"MEN",
   gimmickId:"VILLAIN",alignment:"HEEL",primaryStyle:"STRIKER",
   signatureMove:"Spear",finishingMove:"Tornado Kick",requestId:"second-caw"}),/One created wrestler/);
  const rookie=await withWorldTransaction(db.pool,tx=>tx.query<{
   person_id:string;in_ring_quality:number;popularity:number;booking_division:string}>(
   `SELECT person_id,in_ring_quality,popularity,booking_division
     FROM ppw_people WHERE world_id=$1 AND name='Taylor Comet'`,[world]));
  assert.equal(rookie.length,1);
  assert.equal(rookie[0]!.in_ring_quality,52);
  assert.equal(rookie[0]!.popularity,12);
  assert.equal(rookie[0]!.booking_division,"WOMEN");
  const identities=await withWorldTransaction(db.pool,tx=>tx.query<{persona:{
   primaryStyle:string;gimmickId:string;signatureMoves:{name:string}[];
   finishingMoves:{name:string}[]};provenance:string;default_alignment:string}>(`
    SELECT pp.persona,pp.provenance,p.default_alignment FROM ppw_portable_personas pp
    JOIN ppw_people p ON p.world_id=pp.world_id AND p.person_id=pp.person_id
    WHERE pp.world_id=$1 AND pp.person_id=$2`,[world,added.personId]));
  assert.equal(identities.length,1);
  assert.equal(identities[0]!.provenance,"GAME_AUTHORED");
  assert.equal(identities[0]!.persona.primaryStyle,"HIGH_FLYER");
  assert.equal(identities[0]!.persona.gimmickId,"UNDERDOG");
  assert.equal(identities[0]!.default_alignment,"TWEENER");
  assert.equal(identities[0]!.persona.finishingMoves[0]?.name,"Comet Driver");
  const market=await readWrestlerDirectory(db.pool,bb,{
   view:"MARKET",availability:"FREE_AGENT",division:"WOMEN",search:"Taylor Comet"});
  assert.ok(market.people.some(p=>p.personId===added.personId));
  const contracts=await withWorldTransaction(db.pool,tx=>tx.query<{contract_id:string}>(
   "SELECT contract_id FROM ppw_contracts WHERE world_id=$1 AND person_id=$2",
   [world,added.personId]));
  assert.equal(contracts.length,0,"Creating a wrestler never assigns them to the spender");
  const wallet=await readKayfabeWorkspace(db.pool,aa);
  assert.equal(wallet.balance,1450);
  assert.equal(wallet.activeBrand,"CHROME");
  assert.equal(wallet.createdTalent.length,1);
  assert.equal(wallet.achievements.length,47);
  const dedicated=await readPromoterAchievementWorkspace(db.pool,aa);
  assert.equal(dedicated.total,47);
  assert.equal(dedicated.achievements.find(a=>a.key==="FIRST_BELL")?.earned,true);
  assert.equal(dedicated.achievements.find(a=>a.key==="PREMIUM_PROFIT")?.earned,false);
  await assert.rejects(readPromoterAchievementWorkspace(db.pool,{...aa,playerId:b}),
   /active promotion/);
  assert.equal(wallet.achievements.find(a=>a.key==="FIRST_BELL")?.earned,true);
  assert.equal(wallet.achievements.find(a=>a.key==="FIRST_PROFIT")?.unit,"profitable shows");
  assert.equal(wallet.achievements.find(a=>a.key==="FIRST_CLASSIC")?.unit,"4★ matches");
  await applyKayfabeAction(db.pool,aa,{
   kind:"BUY",sku:"BADGE_GOLD",requestId:"buy-gold"});
  assert.equal((await readKayfabeWorkspace(db.pool,aa)).activeBadge,"GOLD");
  const reset=await applyKayfabeAction(db.pool,aa,{
   kind:"CLEAR_BADGE",requestId:"restore-original-frame"}) as {price:number};
  assert.equal(reset.price,0);
  const standard=await readKayfabeWorkspace(db.pool,aa);
  assert.equal(standard.activeBadge,null);
  assert.ok(standard.entitlements.includes("BADGE_GOLD"));
  assert.equal(standard.balance,1100);
  await applyKayfabeAction(db.pool,aa,{
   kind:"APPLY_BADGE",sku:"BADGE_GOLD",requestId:"restore-gold-frame"});
  assert.equal((await readKayfabeWorkspace(db.pool,aa)).activeBadge,"GOLD");
  const beforeSkin=await readKayfabeWorkspace(db.pool,aa);
  assert.equal(beforeSkin.balance,1100);
  assert.equal(beforeSkin.activeResultsSkin,null);
  await assert.rejects(applyKayfabeAction(db.pool,aa,{
   kind:"APPLY_RESULTS_SKIN",sku:"RESULTS_TERRITORY_TV",requestId:"not-owned"
  }),/Unlock this results skin/);
  const purchase={kind:"BUY" as const,sku:"RESULTS_TERRITORY_TV" as const,
   requestId:"buy-territory"};
  const paidSkin=await applyKayfabeAction(db.pool,aa,purchase) as {price:number};
  assert.equal(paidSkin.price,1000);
  assert.equal((await applyKayfabeAction(db.pool,aa,purchase)).replayed,true);
  const themed=await readKayfabeWorkspace(db.pool,aa);
  assert.equal(themed.activeResultsSkin,"TERRITORY_TV");
  assert.equal(themed.balance,100);
  assert.ok(themed.entitlements.includes("RESULTS_TERRITORY_TV"));
  await assert.rejects(applyKayfabeAction(db.pool,aa,{
   kind:"BUY",sku:"RESULTS_TERRITORY_TV",requestId:"buy-again"}),/already own/);
  const clear=await applyKayfabeAction(db.pool,aa,{
   kind:"CLEAR_RESULTS_SKIN",requestId:"remove-results-skin"}) as {price:number};
  assert.equal(clear.price,0);
  assert.equal((await readKayfabeWorkspace(db.pool,aa)).activeResultsSkin,null);
  await applyKayfabeAction(db.pool,aa,{
   kind:"APPLY_RESULTS_SKIN",sku:"RESULTS_TERRITORY_TV",requestId:"reapply-territory"});
  const selected=await readKayfabeWorkspace(db.pool,aa);
  assert.equal(selected.activeResultsSkin,"TERRITORY_TV");
  assert.equal(selected.balance,100);
  assert.equal((await readKayfabeWorkspace(db.pool,bb)).activeResultsSkin,null);
  // Paid once per distinct skin; selection changes never debit the wallet.
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query("UPDATE ppw_kp_wallets SET balance=2500 WHERE player_id=$1",[a]);
  });
  const fight={kind:"BUY" as const,sku:"RESULTS_FIGHT_NIGHT" as const,
   requestId:"buy-fight-night"};
  assert.equal((await applyKayfabeAction(db.pool,aa,fight) as {price:number}).price,1000);
  assert.equal((await applyKayfabeAction(db.pool,aa,fight)).replayed,true);
  let switched=await readKayfabeWorkspace(db.pool,aa);
  assert.equal(switched.activeResultsSkin,"FIGHT_NIGHT");
  assert.equal(switched.balance,1500);
  assert.ok(switched.entitlements.includes("RESULTS_TERRITORY_TV"));
  assert.ok(switched.entitlements.includes("RESULTS_FIGHT_NIGHT"));
  await assert.rejects(applyKayfabeAction(db.pool,bb,{
   kind:"APPLY_RESULTS_SKIN",sku:"RESULTS_FIGHT_NIGHT",requestId:"unauthorised-fight"
  }),/Unlock this results skin/);
  await applyKayfabeAction(db.pool,aa,{
   kind:"APPLY_RESULTS_SKIN",sku:"RESULTS_TERRITORY_TV",requestId:"back-to-territory"});
  switched=await readKayfabeWorkspace(db.pool,aa);
  assert.equal(switched.activeResultsSkin,"TERRITORY_TV");
  await applyKayfabeAction(db.pool,aa,{
   kind:"APPLY_RESULTS_SKIN",sku:"RESULTS_FIGHT_NIGHT",requestId:"back-to-fight"});
  switched=await readKayfabeWorkspace(db.pool,aa);
  assert.equal(switched.activeResultsSkin,"FIGHT_NIGHT");
  assert.equal(switched.balance,1500);
  assert.equal((await readKayfabeWorkspace(db.pool,bb)).activeResultsSkin,null);

  // Third paid skin, independently owned: duplicate purchase and replays are safe.
  await assert.rejects(applyKayfabeAction(db.pool,bb,{
   kind:"APPLY_RESULTS_SKIN",sku:"RESULTS_UNDERGROUND_ZINE",requestId:"other-owner-zine"
  }),/Unlock this results skin/);
  await withWorldTransaction(db.pool,tx=>tx.query(
   "UPDATE ppw_kp_wallets SET balance=2500 WHERE player_id=$1",[a]));
  const zine={kind:"BUY" as const,sku:"RESULTS_UNDERGROUND_ZINE" as const,
   requestId:"zine-purchase"};
  assert.equal((await applyKayfabeAction(db.pool,aa,zine) as {price:number}).price,1000);
  assert.equal((await applyKayfabeAction(db.pool,aa,zine)).replayed,true);
  let owned=await readKayfabeWorkspace(db.pool,aa);
  assert.equal(owned.activeResultsSkin,"UNDERGROUND_ZINE");
  assert.equal(owned.balance,1500);
  assert.ok(owned.entitlements.includes("RESULTS_TERRITORY_TV"));
  assert.ok(owned.entitlements.includes("RESULTS_FIGHT_NIGHT"));
  assert.ok(owned.entitlements.includes("RESULTS_UNDERGROUND_ZINE"));
  await assert.rejects(applyKayfabeAction(db.pool,aa,{
   kind:"BUY",sku:"RESULTS_UNDERGROUND_ZINE",requestId:"duplicate-zine"
  }),/already own/);
  await applyKayfabeAction(db.pool,aa,{
   kind:"CLEAR_RESULTS_SKIN",requestId:"zine-reset-original"});
  assert.equal((await readKayfabeWorkspace(db.pool,aa)).activeResultsSkin,null);
  for(const [i,sku,style] of [
   [1,"RESULTS_TERRITORY_TV","TERRITORY_TV"],
   [2,"RESULTS_FIGHT_NIGHT","FIGHT_NIGHT"],
   [3,"RESULTS_UNDERGROUND_ZINE","UNDERGROUND_ZINE"]
  ] as const){
   await applyKayfabeAction(db.pool,aa,{
    kind:"APPLY_RESULTS_SKIN",sku,requestId:"zine-select-"+i});
   owned=await readKayfabeWorkspace(db.pool,aa);
   assert.equal(owned.activeResultsSkin,style);
   assert.equal(owned.balance,1500);
  }
  assert.equal((await readKayfabeWorkspace(db.pool,bb)).activeResultsSkin,null);
  // Retro Booker remains an account-owned 1000 KP entitlement.
  await assert.rejects(applyKayfabeAction(db.pool,bb,{
   kind:"APPLY_RESULTS_SKIN",sku:"RESULTS_RETRO_BOOKER_02",requestId:"other-retro"
  }),/Unlock this results skin/);
  await withWorldTransaction(db.pool,tx=>tx.query(
   "UPDATE ppw_kp_wallets SET balance=2500 WHERE player_id=$1",[a]));
  const retro={kind:"BUY" as const,sku:"RESULTS_RETRO_BOOKER_02" as const,
   requestId:"retro-purchase"};
  assert.equal((await applyKayfabeAction(db.pool,aa,retro) as {price:number}).price,1000);
  assert.equal((await applyKayfabeAction(db.pool,aa,retro)).replayed,true);
  const four=await readKayfabeWorkspace(db.pool,aa);
  assert.equal(four.balance,1500);
  assert.equal(four.activeResultsSkin,"RETRO_BOOKER_02");
  assert.ok(four.entitlements.includes("RESULTS_RETRO_BOOKER_02"));
  await assert.rejects(applyKayfabeAction(db.pool,aa,{
   kind:"BUY",sku:"RESULTS_RETRO_BOOKER_02",requestId:"retro-duplicate"
  }),/already own/);
  await applyKayfabeAction(db.pool,aa,{
   kind:"APPLY_RESULTS_SKIN",sku:"RESULTS_FIGHT_NIGHT",requestId:"retro-to-fight"});
  await applyKayfabeAction(db.pool,aa,{
   kind:"APPLY_RESULTS_SKIN",sku:"RESULTS_RETRO_BOOKER_02",requestId:"back-to-retro"});
  assert.equal((await readKayfabeWorkspace(db.pool,aa)).activeResultsSkin,"RETRO_BOOKER_02");
  assert.equal((await readKayfabeWorkspace(db.pool,aa)).balance,1500);
  await applyKayfabeAction(db.pool,aa,{kind:"CLEAR_RESULTS_SKIN",requestId:"retro-original"});
  assert.equal((await readKayfabeWorkspace(db.pool,aa)).activeResultsSkin,null);
  assert.equal((await readKayfabeWorkspace(db.pool,bb)).activeResultsSkin,null);

  // One-price-per-design, free re-selection, secure multiplayer ownership.
  await withWorldTransaction(db.pool,tx=>tx.query(
   "UPDATE ppw_kp_wallets SET balance=5000 WHERE player_id=$1",[a]));
  await assert.rejects(applyKayfabeAction(db.pool,bb,{
   kind:"APPLY_EVENT_POSTER",sku:"POSTER_EMPIRE",requestId:"rival-poster"
  }),/Unlock this poster/);
  const stormPurchase={kind:"BUY" as const,sku:"POSTER_THUNDER_STRIKE" as const,
   requestId:"purchase-storm"};
  const storm=await applyKayfabeAction(db.pool,aa,stormPurchase) as {price:number};
  assert.equal(storm.price,1250);
  assert.equal((await applyKayfabeAction(db.pool,aa,stormPurchase)).replayed,true);
  let posterWallet=await readKayfabeWorkspace(db.pool,aa);
  assert.equal(posterWallet.balance,3750);
  assert.equal(posterWallet.activeEventPoster,"THUNDER_STRIKE");
  assert.ok(posterWallet.entitlements.includes("POSTER_THUNDER_STRIKE"));
  await assert.rejects(applyKayfabeAction(db.pool,aa,{
   kind:"BUY",sku:"POSTER_THUNDER_STRIKE",requestId:"poster-duplicate"
  }),/already own/);
  const empirePurchase={kind:"BUY" as const,sku:"POSTER_EMPIRE" as const,
   requestId:"purchase-empire"};
  assert.equal((await applyKayfabeAction(db.pool,aa,empirePurchase) as {price:number}).price,1250);
  posterWallet=await readKayfabeWorkspace(db.pool,aa);
  assert.equal(posterWallet.balance,2500);
  assert.equal(posterWallet.activeEventPoster,"EMPIRE");
  await applyKayfabeAction(db.pool,aa,{
   kind:"APPLY_EVENT_POSTER",sku:"POSTER_THUNDER_STRIKE",requestId:"switch-storm"});
  posterWallet=await readKayfabeWorkspace(db.pool,aa);
  assert.equal(posterWallet.balance,2500);
  assert.equal(posterWallet.activeEventPoster,"THUNDER_STRIKE");
  await applyKayfabeAction(db.pool,aa,{
   kind:"CLEAR_EVENT_POSTER",requestId:"standard-poster"});
  assert.equal((await readKayfabeWorkspace(db.pool,aa)).activeEventPoster,null);
  assert.equal((await readKayfabeWorkspace(db.pool,bb)).activeEventPoster,null);
    // Staff Office cosmetics belong only to their paying manager. All mechanics
  // continue to use the original nine department and staff payroll rules.
  await withWorldTransaction(db.pool,tx=>tx.query(
   "UPDATE ppw_kp_wallets SET balance=5000 WHERE player_id=$1",[a]));
  assert.equal((await readStaffWorkspace(db.pool,aa)).staffOfficeTheme,null);
  await assert.rejects(applyKayfabeAction(db.pool,bb,{
   kind:"APPLY_STAFF_OFFICE_THEME",sku:"STAFF_OFFICE_GORILLA_CONTROL",requestId:"rival-office"
  }),/Unlock this Staff Office theme/);
  const gorilla={kind:"BUY" as const,sku:"STAFF_OFFICE_GORILLA_CONTROL" as const,
   requestId:"first-staff-theme"};
  assert.equal((await applyKayfabeAction(db.pool,aa,gorilla) as {price:number}).price,1250);
  assert.equal((await applyKayfabeAction(db.pool,aa,gorilla)).replayed,true);
  let themeWallet=await readKayfabeWorkspace(db.pool,aa);
  assert.equal(themeWallet.balance,3750);
  assert.equal(themeWallet.activeStaffOfficeTheme,"GORILLA_CONTROL");
  assert.equal((await readStaffWorkspace(db.pool,aa)).staffOfficeTheme,"GORILLA_CONTROL");
  assert.equal((await readStaffWorkspace(db.pool,bb)).staffOfficeTheme,null);
  await assert.rejects(applyKayfabeAction(db.pool,aa,{
   kind:"BUY",sku:"STAFF_OFFICE_GORILLA_CONTROL",requestId:"duplicate-office"
  }),/already own/);
  const executive={kind:"BUY" as const,sku:"STAFF_OFFICE_EXECUTIVE_SUITE" as const,
   requestId:"second-staff-theme"};
  assert.equal((await applyKayfabeAction(db.pool,aa,executive) as {price:number}).price,1250);
  themeWallet=await readKayfabeWorkspace(db.pool,aa);
  assert.equal(themeWallet.balance,2500);
  assert.equal(themeWallet.activeStaffOfficeTheme,"EXECUTIVE_SUITE");
  await applyKayfabeAction(db.pool,aa,{
   kind:"APPLY_STAFF_OFFICE_THEME",sku:"STAFF_OFFICE_GORILLA_CONTROL",requestId:"switch-office"
  });
  themeWallet=await readKayfabeWorkspace(db.pool,aa);
  assert.equal(themeWallet.balance,2500);
  assert.equal((await readStaffWorkspace(db.pool,aa)).staffOfficeTheme,"GORILLA_CONTROL");
  await applyKayfabeAction(db.pool,aa,{kind:"CLEAR_STAFF_OFFICE_THEME",requestId:"original-office"});
  assert.equal((await readKayfabeWorkspace(db.pool,aa)).activeStaffOfficeTheme,null);
  assert.equal((await readStaffWorkspace(db.pool,aa)).staffOfficeTheme,null);
  assert.ok((await readKayfabeWorkspace(db.pool,aa)).entitlements.includes(
   "STAFF_OFFICE_EXECUTIVE_SUITE"));
    await assert.rejects(readKayfabeWorkspace(db.pool,{...aa,playerId:b}),/active promotion/);
 }finally{await db.close();}
});
