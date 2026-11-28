import {test,expect} from "@playwright/test";
const cast=[
 {refId:"joe",kind:"PERSON",name:"Samoa Joe"},
 {refId:"riddle",kind:"PERSON",name:"Matt Riddle"},
 {refId:"kevin",kind:"PERSON",name:"Kevin Owens"},
 {refId:"sami",kind:"PERSON",name:"Sami Zayn"},
 {refId:"becky",kind:"PERSON",name:"Becky Lynch"}
] as const;
const session={worldId:"world",playerId:"owner",csrfToken:"csrf",
 overview:{world:{revision:8,name:"Genesis",year:1,week:7,phase:"OPEN",
  nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
  membership:"ACTIVE",promotion:{id:"cwa",name:"CWA",tier:"LOCAL",cash:1000000,debt:0}},
 availablePromotions:[]};
for(const width of [320,390]){
 test("single, relationship and five-person faction stories are real saved Programmes at "+width+"px",async({page})=>{
  await page.setViewportSize({width,height:844});
  let revision=8;
  const started:{programmeFormat:string;sideA:{refId:string}[];sideB:{refId:string}[]}[]=[];
  const programmes:Record<string,unknown>[]=[];
  const calls:string[]=[];
  await page.route("**/api/session",r=>r.fulfill({json:session}));
  await page.route("**/api/card",r=>{
   const body=r.request().postDataJSON() as Record<string,unknown>;
   const method=String(body.method);calls.push(method);
   if(method==="startProgramme"){
    const format=String(body.programmeFormat);
    const sideA=body.sideA as {kind:"PERSON";refId:string}[];
    const sideB=body.sideB as {kind:"PERSON";refId:string}[];
    expect(sideB,"Non-rival stories cannot invent an opposing wrestler").toEqual([]);
    if(format==="SOLO")expect(sideA).toHaveLength(1);
    if(format==="RELATIONSHIP")expect(sideA).toHaveLength(2);
    if(format==="FACTION")expect(sideA).toHaveLength(5);
    expect(body.expectedRevision).toBe(revision);
    started.push({programmeFormat:format,sideA,sideB});
    programmes.push({
     programmeId:"story-"+programmes.length,programmeFormat:format,
     status:"ACTIVE",heat:null,repetition:0,activityCount:0,matchCount:0,
     segmentCount:0,sideAWins:0,sideBWins:0,draws:0,championshipId:null,
     startedWeekIndex:6,endedWeekIndex:null,
     creativeIntent:null,blueprintProgress:null,
     sideA:sideA.map(x=>cast.find(c=>c.refId===x.refId)!),
     sideB:[],recentActivity:[],plannedActivity:[],
     medicalHolds:[],eligibleCreativePeople:[],creativeAgreements:[],
     wrestlerChanges:[],latestFollowUp:null,finale:null
    });
    revision++;
    return r.fulfill({json:{status:"APPLIED",result:{programmeId:"story-"+(programmes.length-1)}}});
   }
   if(method==="programmes")return r.fulfill({json:{
    year:1,week:7,worldRevision:revision,canEdit:true,
    people:cast.map(({refId,kind,name})=>({refId,kind,name})),teams:[],
    championships:[],programmes
   }});
   throw Error("Unrequested World action: "+method);
  });
  await page.goto("/#/programmes");
  const create=page.locator(".ppw-programme-create-fold");
  await create.locator("summary").click();
  const pick=async(format:string,people:readonly string[])=>{
   await create.getByRole("button",{name:format,exact:false}).first().click();
   const selects=create.getByRole("button",{name:/^Story participant/});
   if(format==="Relationship"||format==="Faction story"){
    // An author may remove a third/fourth optional character again instead
    // of having to fill every available faction slot.
    const original=await selects.count();
    await create.getByRole("button",{name:"+ Add another"}).click();
    await expect(selects).toHaveCount(original+1);
    await create.getByRole("button",{name:"− Remove extra"}).click();
    await expect(selects).toHaveCount(original);
   }
   const current=await selects.count();
   for(let i=current;i<people.length;i++)
    await create.getByRole("button",{name:"+ Add another"}).click();
   expect(await selects.count()).toBe(people.length);
   for(const [index,id] of people.entries()){
    await selects.nth(index).click();
    await page.getByRole("dialog",{name:"Story participant "+(index+1)})
     .getByRole("button",{name:cast.find(wrestler=>wrestler.refId===id)!.name,exact:true}).click();
   }
   await create.getByRole("button",{name:"Start story",exact:true}).click();
   await expect(page.locator(".ppw-programme-switch")).toHaveCount(started.length);
   // The normal selected story view has no fictitious "VS" rival.
   await expect(page.locator(".ppw-programme-versus")).toHaveCount(0);
  };
  await pick("Solo journey",["joe"]);
  await pick("Relationship",["riddle","kevin"]);
  await pick("Faction story",["joe","riddle","kevin","sami","becky"]);
  expect(started.map(x=>x.programmeFormat)).toEqual(
   ["SOLO","RELATIONSHIP","FACTION"]);
  await page.reload();
  await expect(page.locator(".ppw-programme-switch")).toHaveCount(3);
  expect(calls.filter(x=>x==="startProgramme")).toHaveLength(3);
  expect(calls).not.toContain("save");
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
   .toBeLessThanOrEqual(1);
 });
}
