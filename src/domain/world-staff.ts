/** Shared World-local deterministic staff. The original eight Talent Managers
 * retain their exact identities; other departments are generated without Neon
 * rows or consuming the genesis RNG. An ID always identifies one person.
 */
export const STAFF_ROLES=["TALENT_MANAGER","ROAD_AGENT","MEDICAL","CREATIVE",
 "COMMENTATOR","REFEREE","PRODUCTION","TRAINER","SCOUT"] as const;
export type StaffRole=typeof STAFF_ROLES[number];
export interface WorldManager{
 staffId:string;name:string;insight:number;weeklySalary:number;
}
export interface WorldStaffMember extends WorldManager{
 role:StaffRole;craft:number;people:number;reliability:number;
 personality:"FRANK"|"PATIENT"|"AMBITIOUS"|"LOYAL"|"ECCENTRIC";
 specialism:string;
 /** Present only for one verified retired wrestler entering the staff market. */
 formerWrestlerId?:string;careerNote?:string;
}
export function worldTalentManagers(seed:string|number|bigint):WorldManager[]{
 const first=["Morgan","Jamie","Casey","Rowan","Riley","Taylor","Avery","Drew"];
 const last=["Keane","Mercer","Hartley","Vale","Cross","Sutton","Bennett","Shaw"];
 const parsed=BigInt(seed),offset=Number((parsed<0n?-parsed:parsed)%8n);
 return first.map((_,index)=>{
  const insight=40+((index*7+offset*3)%46);
  return {staffId:"staff-"+String(index+1).padStart(3,"0"),
   name:first[(index+offset)%8]+" "+last[(index*3+offset)%8],
   insight,weeklySalary:250+insight*9};
 });
}
// Generated specialists have unique given names; original identities stay unchanged.
const first=["Aisha","Mateo","Priya","Hugo","Keiko","Tariq","Beatrice","Sanjay","Freya","Diego","Amara","Rafael","Yuna","Idris","Lucia","Noah","Zara","Kenji","Sofia","Darius","Mei","Oliver","Fatima","Callum","Lena","Andres","Nadia","Emilio","Jasmine","Kazuo","Ruby","Hassan","Niamh","Luis","Imani","Felix","Anika","Aarav","Eloise","Micah","Sora","Dalia","Oscar","Zanele","Gianni","Cleo","Kaito","Simone","Malik","Helena","Vikram","Ada","Pavel","Isabel","Thea","Rohan","Estelle","Akira","Nabil","Georgia","Finn","Selina","Marco","Mina","Jonah","Yasmin","Niko","Camila","Reuben","Ayumi","Leila","Ezra","Carmen","Bryn","Naomi","Thiago","Ines","Amir","Elena","Dexter","Hana","Maya","Xavier","Kiran","Tessa","Omar","Celeste","Ethan","Laila","Bastien","Aria","Mariam","Isaac","Soraya","Theo","Valeria","Tobias","Farah","Riku","Bianca","Khalil","Maeve","Paolo","Sasha","Nina","Ravi","Evelyn","Jamal","Haruto","Greta","Adrian","Noor","Nerea","Benedict","Pooja","Selma","Yusuf","Iris","Gabe","Renata","Mira","Elias","Marta","Samira","Orla","Musa","Ingrid","Ansel","Rosa","Ilya","Eden","Marek","Anya","Renee","Tomas","Luca","Jude","Grace","Amina","Rhea","Bruno","Farid","Sana","Lorenzo","Olivia","Zain","Vivienne","Aksel","Hector","Daphne","Esme","Cyrus","Kaya","Hamza","Marina","Leon","Elif","Holly","Miles","Alina"] as const;
const last=["Maddox","Hawthorne","Knox","Sterling","Quinn","Calloway","Brooks","Voss","Winters","Pike","Hale","Monroe","Reed","Sterling-Jones","Fox","Stone","Navarro","Basu","Tanaka","Okafor","Romero","Nguyen","Patel","Farouk","Rossi","Morales","Singh","Larsson","Ibrahim","Kowalski","Sato","Moretti","Mensah","Dubois","Ahmed","Costa","Clarke","Okada","Fernandez","Sharma","Ito","Silva","Haddad","Mercado","Khan","Alvarez","Park","Ali","Chambers","Gonzalez","Kim","Novak","Blake","Santos","Berg","Rahman","Chen","Osei","Mendoza","Kapoor","Lopez","Hughes","Takahashi","Bennani","Bello","Nakamura","Miller","Diaz","Doyle","Pearson","Watanabe","Haddock","Rao","Marquez","Muller","Desai"] as const;
const legacyFirst=["Alex","Billie","Cameron","Devon","Ellis","Frankie","Gray","Harper",
 "Indigo","Jules","Kit","Lane","Marlow","Nico","Oakley","Parker"] as const;
const legacyLast=["Maddox","Hawthorne","Knox","Sterling","Quinn","Calloway","Brooks",
 "Voss","Winters","Pike","Hale","Monroe","Reed","Sterling-Jones","Fox","Stone"] as const;
const specialists:Record<StaffRole,readonly string[]>={
 TALENT_MANAGER:["renewals","contract trust","talent relations","negotiation"],
 ROAD_AGENT:["main events","tag wrestling","technical bouts","live improvisation"],
 MEDICAL:["injury assessment","availability","workload","return-to-ring caution"],
 CREATIVE:["long-term arcs","character work","promos","fresh rivalries"],
 COMMENTATOR:["big-match calls","story continuity","live reactions","colour analysis"],
 REFEREE:["multi-person matches","discipline","safety","complex finishes"],
 PRODUCTION:["live broadcasts","small venues","lighting","efficient travel"],
 TRAINER:["new wrestlers","conditioning","ring psychology","fundamentals"],
 SCOUT:["emerging prospects","technical upside","character potential","undiscovered value"],
};
const personalities=["FRANK","PATIENT","AMBITIOUS","LOYAL","ECCENTRIC"] as const;
export function worldStaff(seed:string|number|bigint, legacyStaffIds:readonly string[]=[]):WorldStaffMember[]{
 const original=worldTalentManagers(seed);
 const magnitude=BigInt(seed)<0n?-BigInt(seed):BigInt(seed);
 const offset=Number(magnitude%16n);
 const nameOffset=Number(magnitude%BigInt(first.length));
 const retained=new Set(legacyStaffIds);
 const managers=original.map((m,i)=>({...m,role:"TALENT_MANAGER" as const,
  craft:m.insight,people:45+((i*11+offset)%45),
  reliability:50+((i*9+offset)%42),
  personality:personalities[(i+offset)%5]!,
  specialism:specialists.TALENT_MANAGER[i%4]!}));
 const others=STAFF_ROLES.slice(1).flatMap((role,j)=>
  Array.from({length:16},(_,i)=>{
   const craft=38+((i*11+j*17+offset*3)%57);
   const people=34+((i*17+j*7+offset)%63);
   const reliability=40+((i*13+j*11+offset)%56);
   const insight=Math.round((craft*2+people+reliability)/4);
   const serial=j*16+i;
   return {staffId:"staff-"+role.toLowerCase().replaceAll("_","-")+"-"+String(i+1).padStart(3,"0"),
    name:retained.has("staff-"+role.toLowerCase().replaceAll("_","-")+"-"+String(i+1).padStart(3,"0"))?
     legacyFirst[(serial+offset)%16]!+" "+legacyLast[(Math.floor(serial/16)+serial+offset)%16]!:
     first[(serial+nameOffset)%first.length]!+" "+last[(serial*5+j*7+offset)%last.length]!,
    role,insight,craft,people,reliability,
    weeklySalary:Math.round((180+craft*9+(j===0?140:0))/10)*10,
    personality:personalities[(i+j+offset)%5]!,
    specialism:specialists[role][(i+j)%4]!};
  }));
 return [...managers,...others];
}
/** Deterministic offer decision. A sensible asking wage is always accepted;
 * below-ask offers depend on temperament, skill and the offered security.
 * No RNG, database lookup, or repeated negotiation requests.
 */
export function evaluateStaffOffer(member:WorldStaffMember,weeklySalary:number,
 termWeeks:52|104):{accepted:boolean;minimum:number}{
 const minimum=Math.ceil(member.weeklySalary*(
  member.personality==="AMBITIOUS"?0.98:
  member.personality==="LOYAL"&&termWeeks===104?0.83:
  member.personality==="PATIENT"?0.88:0.92));
 return {accepted:weeklySalary>=minimum,minimum};
}
export function staffBuyout(weeklySalary:number,expiresWeekIndex:number,currentWeekIndex:number){
 if(![weeklySalary,expiresWeekIndex,currentWeekIndex].every(Number.isSafeInteger)||
  weeklySalary<0||expiresWeekIndex<currentWeekIndex-1||currentWeekIndex<0)
  throw new Error("Invalid staff contract buyout");
 const cost=weeklySalary*Math.max(0,expiresWeekIndex-currentWeekIndex+1);
 if(!Number.isSafeInteger(cost))throw new Error("Staff buyout exceeds safe money range");
 return cost;
}
