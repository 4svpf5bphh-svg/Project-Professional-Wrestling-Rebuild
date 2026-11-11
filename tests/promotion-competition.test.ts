import test from "node:test";
import assert from "node:assert/strict";
import {selectPromotionCompetition,type CompetitionCandidate} from
 "../src/domain/promotion-competition.js";
const company=(id:string,tier:string,reach:number,
 human=false,market="regional",previous:string|null=null,
 since:number|null=null):CompetitionCandidate=>({
 promotionId:id,tier,mediaReach:reach,homeMarketId:market,
 humanManaged:human,completedShows:6,averageCrowd:70,
 averageTvRating:null,previousRivalId:previous,
 previousSinceWeekIndex:since
});
test("two small human managers naturally compete before anyone has TV",()=>{
 const companies=[
  company("cwa","LOCAL",15,true,"east"),
  company("friend","LOCAL",17,true,"east"),
  company("ai-national","NATIONAL",74,false,"west"),
  company("ai-indie","INDEPENDENT",28,false,"east")
 ];
 const assessed=selectPromotionCompetition(companies,0);
 assert.equal(assessed.find(x=>x.promotionId==="cwa")?.rivalId,"friend");
 assert.equal(assessed.find(x=>x.promotionId==="friend")?.rivalId,"cwa");
 assert.equal(assessed.find(x=>x.promotionId==="cwa")?.ownTvRating,null);
 assert.equal(assessed.find(x=>x.promotionId==="cwa")?.rivalTvRating,null);
});
test("tier growth moves the circuit challenge to a comparable AI promotion",()=>{
 const first=[
  company("cwa","LOCAL",16,true,"east","friend",0),
  company("friend","LOCAL",17,true,"east"),
  company("ai-rising","RISING",45,false,"east"),
  company("ai-national","NATIONAL",72,false,"west")
 ];
 const grown=first.map(p=>p.promotionId==="cwa"?
  {...p,tier:"RISING",mediaReach:45}:p);
 const result=selectPromotionCompetition(grown,24).find(x=>x.promotionId==="cwa")!;
 assert.equal(result.rivalId,"ai-rising");
 assert.equal(result.changed,true);
 assert.equal(result.sinceWeekIndex,24);
});
test("near-equal competitive scoring retains old rivalry; an extinct rival is replaced",()=>{
 const cwa=company("cwa","RISING",41,true,"east","a",8);
 const old=company("a","RISING",47,false,"east");
 const newcomer=company("b","RISING",42,false,"east");
 const retained=selectPromotionCompetition([cwa,old,newcomer],16);
 assert.equal(retained.find(x=>x.promotionId==="cwa")?.rivalId,"a");
 assert.equal(retained.find(x=>x.promotionId==="cwa")?.sinceWeekIndex,8);
 const replaced=selectPromotionCompetition([cwa,newcomer],24);
 assert.equal(replaced.find(x=>x.promotionId==="cwa")?.rivalId,"b");
});
test("no World opponent creates no fake rivalry and duplicate IDs fail closed",()=>{
 assert.deepEqual(selectPromotionCompetition([company("solo","LOCAL",8)],0)
  .map(x=>x.rivalId),[null]);
 assert.throws(()=>selectPromotionCompetition([
  company("same","LOCAL",8),company("same","LOCAL",8)],0),/Duplicate/);
});
