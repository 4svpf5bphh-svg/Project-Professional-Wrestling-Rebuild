import {test,expect} from "@playwright/test";
const overview={world:{revision:5,name:"Genesis",year:3,week:1,phase:"OPEN",
 nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
 membership:"ACTIVE",promotion:{id:"home",name:"CWA",tier:"INDEPENDENT",
 cash:2000000,debt:0,lastWeeklyNet:0,financialDistress:"HEALTHY"}};
const stories=[
 {id:"week52:official",year:2,week:52,desk:"OFFICIAL",
  certainty:"CONFIRMED",promotionId:"home",promotionName:"CWA",
  showId:"s52",showName:"Winter Crown",title:"The Year Ends With a Champion",summary:"A certified title change.",
  sourceKind:"TITLE"},
 {id:"signing:brief",year:2,week:52,desk:"OFFICIAL",certainty:"CONFIRMED",promotionId:"rival",promotionName:"Rival Wrestling",showId:"s52",title:"Rival Wrestling signs a prospect",summary:"A public signing, not a debut.",sourceKind:"EVENT"},
 {id:"programme:official:under-card",year:2,week:52,desk:"OFFICIAL",certainty:"CONFIRMED",promotionId:"home",
  promotionName:"CWA",showId:"s52",showName:"Winter Crown",title:"Alix Vale answers a challenge",summary:"Vale responded on screen.",sourceKind:"ANGLE"},
 {id:"week51:official",year:2,week:51,desk:"OFFICIAL",
  certainty:"CONFIRMED",promotionId:"home",promotionName:"CWA",
  showId:"s51",title:"The Road to the Finale",summary:"The official rivalry grew.",
  sourceKind:"MATCH"},
 {id:"week52:dirt",year:2,week:52,desk:"DIRT",
  certainty:"SPECULATION",promotionId:"home",promotionName:"CWA",
  showId:"s52",title:"A Champion With Enemies?",summary:"The rumour mill is busy.",
  sourceKind:"CROWD",editorial:{headline:"A Champion With Enemies?",
   commentary:"Could the new champion face a colder reception after Winter Crown?",
   fans:["Let the champion enjoy the first night.",null,null]}},
 {id:"week51:dirt",year:2,week:51,desk:"DIRT",
  certainty:"SPECULATION",promotionId:"home",promotionName:"CWA",
  showId:"s51",title:"Locker Room Whisper",summary:"Speculation from last week.",
  sourceKind:"CROWD"}
];
for(const width of [320,390]){
 test(`Both News desks distinguish certified This Week from previous weeks at ${width}px`,
 async({page},info)=>{
  await page.setViewportSize({width,height:width===320?568:844});
  const calls:string[]=[];
  await page.route("**/api/session",r=>r.fulfill({json:{
   worldId:"world",playerId:"manager",csrfToken:"opaque",
   overview,availablePromotions:[],unseenLegendReveal:false
  }}));
  await page.route("**/api/card",r=>{
   const method=r.request().postDataJSON().method as string;
   calls.push(method);
   if(method==="industry")return r.fulfill({json:{
    worldName:"Genesis",year:3,week:1,ownPromotionId:"home",
    ownPromotionName:"CWA",promotions:[],headlines:[],broadcasts:[]
   }});
   if(method==="industryNews")return r.fulfill({json:{
    latestEdition:{year:2,week:52},awards:[],annualAwards:[],
    voices:[],stories:[...stories,{...stories[0]!,id:"duplicate-editorial-source"}]
   }});
   return r.fulfill({json:{}});
  });
  await page.goto("/#/news");
  for(const [desk,current,older] of [
   ["Official News","The Year Ends With a Champion","The Road to the Finale"],
   ["Dirt Sheets","A Champion With Enemies?","Locker Room Whisper"]
  ] as const){
   await page.getByRole("button",{name:desk}).click();
   const news=page.locator(".ppw-news");
   await expect(news.locator(".ppw-news-edition-label")).toHaveText("THIS WEEK");
   await expect(news.locator(".ppw-news-edition-clock"))
    .toHaveText("YEAR 2 · WEEK 52");
   await expect(news.locator(".ppw-news-edition-current")).toContainText(current);
   await expect(news.locator(".ppw-news-edition-current")).not.toContainText(older);
   await expect(news.locator(".ppw-news-previous-weeks")).toHaveAttribute("open","");
   await expect(news.locator(".ppw-news-previous-summary")).toHaveText("PREVIOUS WEEKS");
   await expect(news.locator(".ppw-news-previous-clock")).toHaveText("YEAR 2 · WEEK 51");
   await expect(news.locator(".ppw-news-previous-weeks")).toContainText(older);
   await expect(news.locator(".ppw-hot-tag-thread")).toHaveCount(2);
   if(desk==="Official News"){
    const article=news.locator(".ppw-news-story.ppw-news-lead").first();
    const contrast=await article.evaluate(root=>{
     const rgb=(value:string)=>[...value.matchAll(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/g)]
      .map(match=>match.slice(1,4).map(Number));
     const luminance=(colors:number[])=>colors.map(channel=>channel/255)
      .map(channel=>channel<=0.04045?channel/12.92:((channel+0.055)/1.055)**2.4)
      .reduce((total,channel,i)=>total+channel*[0.2126,0.7152,0.0722][i]!,0);
     const paper=rgb(getComputedStyle(root).backgroundImage).map(luminance);
     const text=[...root.querySelectorAll(":scope > .ppw-news-eyebrow, :scope > .ppw-news-desk, :scope > .ppw-news-story-title, :scope > p, :scope > small")];
     return {paper:paper.length,text:text.map(element=>{
      const color=luminance(rgb(getComputedStyle(element).color)[0]!);
      return {label:element.textContent,
       ratio:Math.min(...paper.map(bg=>(Math.max(color,bg)+0.05)/(Math.min(color,bg)+0.05)))};
     })};
    });
    expect(contrast.paper).toBe(2);
    expect(contrast.text.length).toBeGreaterThanOrEqual(5);
    for(const text of contrast.text)expect(text.ratio,text.label??"Official story text").toBeGreaterThanOrEqual(4.5);
    const digest=news.locator(".ppw-news-edition-current .ppw-news-digest");
    await expect(digest).toContainText("ELSEWHERE THIS WEEK");
    await digest.getByText("Rival Wrestling signs a prospect").click();
    await expect(digest.getByText("A public signing, not a debut.")).toBeVisible();
    const signing=digest.locator(".ppw-news-brief").filter({hasText:"Rival Wrestling signs a prospect"});
    await expect(signing.locator(".ppw-hot-tag-thread")).toHaveCount(0);
    await digest.getByText("Alix Vale answers a challenge").click();
    await expect(digest.getByRole("link",{name:"Read results"})).toHaveAttribute("href","#/results");
    await expect(article).toContainText("Winter Crown");
   }else{
    await expect(news.getByText("Could the new champion face a colder reception after Winter Crown?")).toBeVisible();
    await expect(news.locator(".ppw-news-edition-current .ppw-news-lead .ppw-hot-tag-thread")).toBeVisible();
   }
   await expect(news.getByText(/View confirmed facts|View source report/)).toHaveCount(0);
   await page.screenshot({path:info.outputPath((desk==="Official News"?"official-news-":"dirt-sheets-")+width+".png")});
   const safe=await page.evaluate(()=>
    document.documentElement.scrollWidth-innerWidth);
   expect(safe,`No ${desk} iPhone horizontal overflow`).toBeLessThanOrEqual(1);
  }
  expect(calls,
   "Chronology is client-side over the existing single cached News read").toEqual(["industry","industryNews"]);
 });
}
