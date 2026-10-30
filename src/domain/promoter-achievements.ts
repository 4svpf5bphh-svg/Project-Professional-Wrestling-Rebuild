/** Read-only promoter milestones. Every score comes from certified World facts.
 *  No XP write, no purchased achievement, and no effect on booked outcomes.
 */
export const PROMOTER_ACHIEVEMENT_CATEGORIES={
 CAREER:{label:"Promoter Career",icon:"★",subtitle:"The long road from opening bell to institution"},
 EVENTS:{label:"Live Events",icon:"▣",subtitle:"Big nights and crowds worth remembering"},
 MATCHES:{label:"Matchmaking",icon:"✦",subtitle:"Great wrestling earns its own reputation"},
 CREATIVE:{label:"Creative Legacy",icon:"◆",subtitle:"Rivalries and moments that moved the audience"},
 BUSINESS:{label:"Business",icon:"$",subtitle:"An ambitious promotion still has bills to pay"},
 TITLES:{label:"Championships",icon:"♛",subtitle:"A title should mean something"}
} as const;
export type AchievementCategory=keyof typeof PROMOTER_ACHIEVEMENT_CATEGORIES;
export type AchievementTier="FOUNDATION"|"SILVER"|"GOLD"|"ICON";
export type AchievementMetric=
 "shows"|"premiumShows"|"profitableShows"|"profitablePremiumShows"|
 "greatMatches"|"excellentMatches"|"fiveStarMatches"|"liveSegments"|
 "hotSegments"|"rivalriesStarted"|"rivalriesConcluded"|"hotShows"|
 "totalAttendance"|"titleDefences"|"completedTitleReigns";
export type PromoterAchievementCounters=Record<AchievementMetric,number>;
export const EMPTY_PROMOTER_COUNTERS:PromoterAchievementCounters={
 shows:0,premiumShows:0,profitableShows:0,profitablePremiumShows:0,
 greatMatches:0,excellentMatches:0,fiveStarMatches:0,liveSegments:0,
 hotSegments:0,rivalriesStarted:0,rivalriesConcluded:0,hotShows:0,
 totalAttendance:0,titleDefences:0,completedTitleReigns:0
};
type Definition={key:string;label:string;description:string;category:AchievementCategory;
 metric:AchievementMetric;target:number;unit:string;tier:AchievementTier};
const D=(key:string,label:string,description:string,category:AchievementCategory,
 metric:AchievementMetric,target:number,unit:string,tier:AchievementTier):Definition=>
 ({key,label,description,category,metric,target,unit,tier});
/** Unique, immutable keys preserve prior trophy progress as the catalogue grows. */
export const PROMOTER_ACHIEVEMENT_DEFINITIONS:readonly Definition[]=[
 D("FIRST_BELL","First Bell","Finish your first certified show.","CAREER","shows",1,"shows","FOUNDATION"),
 D("FIVE_SHOWS","Five Alive","Put five completed shows in the record books.","CAREER","shows",5,"shows","FOUNDATION"),
 D("TEN_SHOWS","The Regular","Make ten shows happen, not just promises.","CAREER","shows",10,"shows","SILVER"),
 D("TWENTY_FIVE_SHOWS","Quarter Century","Reach 25 certified broadcasts.","CAREER","shows",25,"shows","SILVER"),
 D("YEAR_OF_SHOWS","Iron Booker","Reach 52 completed shows.","CAREER","shows",52,"shows","GOLD"),
 D("HUNDRED_SHOWS","Centurion","Deliver 100 completed shows.","CAREER","shows",100,"shows","GOLD"),
 D("TWO_HUNDRED_SHOWS","The Institution","Deliver 200 completed shows.","CAREER","shows",200,"shows","ICON"),
 D("FIVE_HUNDRED_SHOWS","Still Running Wild","Five hundred completed shows. The show never ends.","CAREER","shows",500,"shows","ICON"),
 D("FIRST_PREMIUM","First Pay-Per-View","Run a certified premium event.","EVENTS","premiumShows",1,"premium events","FOUNDATION"),
 D("FIVE_PREMIUMS","Big Show Energy","Deliver five premium events.","EVENTS","premiumShows",5,"premium events","SILVER"),
 D("TWELVE_PREMIUMS","PPV Machine","Produce twelve completed premium events.","EVENTS","premiumShows",12,"premium events","GOLD"),
 D("TWENTY_FIVE_PREMIUMS","The Stadium Circuit","Stage 25 premium events.","EVENTS","premiumShows",25,"premium events","ICON"),
 D("FIRST_HOT_SHOW","Crowd Goes Wild","Finish a show with an audience response of at least 80.","EVENTS","hotShows",1,"hot shows","FOUNDATION"),
 D("FIVE_HOT_SHOWS","Hot Streak","Produce five shows with audience response of at least 80.","EVENTS","hotShows",5,"hot shows","SILVER"),
 D("TWENTY_HOT_SHOWS","Certified Crowd-Pleaser","Produce 20 shows with audience response of at least 80.","EVENTS","hotShows",20,"hot shows","GOLD"),
 D("THOUSAND_FANS","Packed House","Bring 1,000 fans through your gates in total.","EVENTS","totalAttendance",1000,"total fans","FOUNDATION"),
 D("TEN_THOUSAND_FANS","Full House","Bring 10,000 fans through your gates in total.","EVENTS","totalAttendance",10000,"total fans","SILVER"),
 D("HUNDRED_THOUSAND_FANS","A Sea Of Signs","Welcome 100,000 fans across completed events.","EVENTS","totalAttendance",100000,"total fans","ICON"),
 D("FIRST_CLASSIC","Matchmaker","Produce a certified match rated at least four stars.","MATCHES","greatMatches",1,"4★ matches","FOUNDATION"),
 D("FIVE_CLASSICS","Show Stealer","Produce five certified four-star matches.","MATCHES","greatMatches",5,"4★ matches","SILVER"),
 D("TWENTY_FIVE_CLASSICS","Match Legend","Put 25 four-star matches on the record.","MATCHES","greatMatches",25,"4★ matches","GOLD"),
 D("FIFTY_CLASSICS","Banger Factory","Fifty four-star matches. Not a bad night's work.","MATCHES","greatMatches",50,"4★ matches","ICON"),
 D("FIRST_EXCELLENT","Main Event Magic","Deliver a match rated at least four and a half stars.","MATCHES","excellentMatches",1,"4½★ matches","SILVER"),
 D("FIVE_EXCELLENT","Can't Miss Wrestling","Deliver five matches rated at least four and a half stars.","MATCHES","excellentMatches",5,"4½★ matches","GOLD"),
 D("TWENTY_EXCELLENT","Workrate Royalty","Deliver twenty matches rated at least four and a half stars.","MATCHES","excellentMatches",20,"4½★ matches","ICON"),
 D("FIRST_FIVE_STAR","The Five-Star Club","Deliver one certified five-star match.","MATCHES","fiveStarMatches",1,"5★ matches","GOLD"),
 D("THREE_FIVE_STARS","Wrestling Nirvana","Deliver three certified five-star matches.","MATCHES","fiveStarMatches",3,"5★ matches","ICON"),
 D("FIRST_ANGLE","Let Them Talk","Complete your first live on-screen segment.","CREATIVE","liveSegments",1,"on-screen segments","FOUNDATION"),
 D("TEN_ANGLES","The Storyteller","Complete ten live on-screen segments.","CREATIVE","liveSegments",10,"on-screen segments","SILVER"),
 D("FIFTY_ANGLES","Television Gold","Complete fifty live on-screen segments.","CREATIVE","liveSegments",50,"on-screen segments","GOLD"),
 D("FIRST_HOT_ANGLE","Pipe Bomb","Deliver an on-screen segment rated at least 80 by the crowd.","CREATIVE","hotSegments",1,"hot segments","SILVER"),
 D("FIVE_HOT_ANGLES","Talk Is Money","Deliver five on-screen segments rated at least 80.","CREATIVE","hotSegments",5,"hot segments","GOLD"),
 D("FIRST_RIVALRY","Bad Blood","Give a rivalry its first recorded chapter.","CREATIVE","rivalriesStarted",1,"rivalries","FOUNDATION"),
 D("FIVE_RIVALRIES","Creative Department","Start five rivalries with recorded activity.","CREATIVE","rivalriesStarted",5,"rivalries","SILVER"),
 D("FIRST_PAYOFF","The Payoff","Bring a recorded rivalry to a documented ending.","CREATIVE","rivalriesConcluded",1,"concluded rivalries","SILVER"),
 D("FIVE_PAYOFFS","Long-Term Booking","Complete five rivalries rather than abandoning them.","CREATIVE","rivalriesConcluded",5,"concluded rivalries","GOLD"),
 D("FIRST_PROFIT","In The Black","Complete one profitable event.","BUSINESS","profitableShows",1,"profitable shows","FOUNDATION"),
 D("FIVE_PROFITS","Money Maker","Complete five profitable events.","BUSINESS","profitableShows",5,"profitable shows","SILVER"),
 D("TWENTY_PROFITS","Business Mogul","Complete twenty profitable events.","BUSINESS","profitableShows",20,"profitable shows","GOLD"),
 D("HUNDRED_PROFITS","The Money Printer","Record a hundred profitable events.","BUSINESS","profitableShows",100,"profitable shows","ICON"),
 D("PREMIUM_PROFIT","Box Office Smash","Turn a profit on a completed premium event.","BUSINESS","profitablePremiumShows",1,"profitable premium events","SILVER"),
 D("FIVE_PREMIUM_PROFITS","PPV Pays The Bills","Make five completed premium events profitable.","BUSINESS","profitablePremiumShows",5,"profitable premium events","GOLD"),
 D("FIRST_DEFENCE","Fighting Champion","Record one championship defence.","TITLES","titleDefences",1,"title defences","FOUNDATION"),
 D("FIVE_DEFENCES","Defend The Gold","Record five championship defences.","TITLES","titleDefences",5,"title defences","SILVER"),
 D("TWENTY_FIVE_DEFENCES","Legacy Of Champions","Record 25 championship defences.","TITLES","titleDefences",25,"title defences","GOLD"),
 D("FIRST_TITLE_ERA","Changing Of The Guard","Complete a documented championship reign.","TITLES","completedTitleReigns",1,"completed title reigns","SILVER"),
 D("FIVE_TITLE_ERAS","The Title Historian","Document the end of five championship reigns.","TITLES","completedTitleReigns",5,"completed title reigns","GOLD")
] as const;
export interface PromoterAchievement{
 key:string;label:string;description:string;category:AchievementCategory;
 tier:AchievementTier;metric:AchievementMetric;progress:number;target:number;
 earned:boolean;unit:string;percent:number;
}
const weights:Record<AchievementTier,number>={FOUNDATION:1,SILVER:2,GOLD:4,ICON:7};
export function derivePromoterAchievements(input:PromoterAchievementCounters){
 const achievements:PromoterAchievement[]=PROMOTER_ACHIEVEMENT_DEFINITIONS.map(d=>{
  const raw=input[d.metric];
  const value=Number.isFinite(raw)?Math.max(0,Math.floor(raw)):0;
  return {...d,earned:value>=d.target,progress:Math.min(value,d.target),
   percent:Math.min(100,Math.round(value/d.target*100))};
 });
 const earnedCount=achievements.filter(a=>a.earned).length;
 const prestigeScore=achievements.reduce((sum,a)=>sum+(a.earned?weights[a.tier]:0),0);
 const rank=prestigeScore>=85?"HALL OF FAME":prestigeScore>=45?"MAIN EVENT":
  prestigeScore>=22?"HEADLINER":prestigeScore>=8?"RISING STAR":"ROOKIE BOOKER";
 return {achievements,earnedCount,total:achievements.length,prestigeScore,rank};
}
