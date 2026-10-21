/** Small, verified Wikimedia Commons portrait catalogue.
 * Client media only: NO live search, AI, Neon metadata, database reads/writes.
 * Match the base legal name as well as stable ring aliases. Never invent photos.
 * Full attribution and license links: /portrait-credits.html
 */
export interface PhotoCredit{file:string;author:string;license:"CC BY 2.0"|"CC BY-SA 2.0"|"CC BY-SA 4.0"|"CC0";}
const catalogue:Readonly<Record<string,PhotoCredit>>={
 "bianca belair":{file:"Bianca Belair RR25.jpg",author:"Diego Serrano",license:"CC BY 2.0"},
 "sami zayn":{file:"Sami Zayn, April 2024.jpg",author:"Diego Serrano",license:"CC BY 2.0"},
 "john cena":{file:"John Cena RR25.jpg",author:"Diego Serrano",license:"CC BY 2.0"},
 "jade cargill":{file:"All Elite Wrestling TBS Champion - Jade Cargill (headshot).jpg",author:"All Elite Wrestling",license:"CC BY-SA 4.0"},
 "thunder rosa":{file:"All Elite Wrestling Women's World Champion - Thunder Rosa (cropped).jpg",author:"All Elite Wrestling",license:"CC BY-SA 4.0"},
 "brody king":{file:"Brody King, 2022 (cropped).jpg",author:"All Elite Wrestling",license:"CC BY-SA 4.0"},
 "dante martin":{file:"Dante Martin, December 2022 (cropped).jpg",author:"All Elite Wrestling",license:"CC BY-SA 4.0"},
 "darius martin":{file:"Darius Martin, December 2022 (cropped).jpg",author:"All Elite Wrestling",license:"CC BY-SA 4.0"},
 "eddie kingston":{file:"Eddie Kingston Worlds End 2023 12 30 004 (cropped).jpg",author:"All Elite Wrestling",license:"CC BY-SA 4.0"},
 "harley cameron":{file:"Harley Cameron DYNAMITE 2024 01 03 043 (cropped).jpg",author:"All Elite Wrestling",license:"CC BY-SA 4.0"},
 "jamie hayter":{file:"Jamie Hayter, March 2023 (cropped).jpg",author:"All Elite Wrestling",license:"CC BY-SA 4.0"},
 "jay white":{file:"Jay White - AEW Dynamite - 2023-04-26050 (cropped).jpg",author:"All Elite Wrestling",license:"CC BY-SA 4.0"},
 "juice robinson":{file:"Juice Robinson DYNAMITE 2024 06 12 020 (cropped).jpg",author:"All Elite Wrestling",license:"CC BY-SA 4.0"},
 "julia hart":{file:"Julia Hart, December 2022 (cropped).jpg",author:"All Elite Wrestling",license:"CC BY-SA 4.0"},
 "jun akiyama":{file:"Jun Akiyama, 2022 (cropped).jpg",author:"All Elite Wrestling",license:"CC BY-SA 4.0"},
 "konosuke takeshita":{file:"Konosuke Takeshita Forbidden Door 2024 06 30 008 (headshot).jpg",author:"All Elite Wrestling",license:"CC BY-SA 4.0"},
 "kota ibushi":{file:"Kota Ibushi 2023 07 19-0001 (cropped).jpg",author:"All Elite Wrestling",license:"CC BY-SA 4.0"},
 "kyle fletcher":{file:"Kyle Fletcher - 07-03-2024 EDIT-7 (cropped).jpg",author:"All Elite Wrestling",license:"CC BY-SA 4.0"},
 "leila grey":{file:"Leila Grey - DYNAMITE - 2023-05-17 011 (cropped).jpg",author:"All Elite Wrestling",license:"CC BY-SA 4.0"},
 "marina shafir":{file:"Marina Shafir 2022 11 18 Rampage-31 (cropped).jpg",author:"All Elite Wrestling",license:"CC BY-SA 4.0"},
 "matt menard":{file:"Matt Menard, June 2022 (cropped).jpg",author:"All Elite Wrestling",license:"CC BY-SA 4.0"},
 "ricochet":{file:"Ricochet ALL IN 2024 08 25 127 (headshot).jpg",author:"All Elite Wrestling",license:"CC BY-SA 4.0"},
 "riho":{file:"Riho, 2021 (cropped).jpg",author:"All Elite Wrestling",license:"CC BY-SA 4.0"},
 "saraya":{file:"Saraya Bevis, September 2022 (headshot).jpg",author:"All Elite Wrestling",license:"CC BY-SA 4.0"},
 "serena deeb":{file:"Serena Deeb DYNAMITE 2024 06 12 017 (cropped).jpg",author:"All Elite Wrestling",license:"CC BY-SA 4.0"},
 "yuka sakazaki":{file:"Yuka Sakazaki Dynamite 2023 12 27 008.jpg",author:"All Elite Wrestling",license:"CC BY-SA 4.0"},
 "skye blue":{file:"Skye Blue, August 2022.jpg",author:"All Elite Wrestling",license:"CC BY-SA 4.0"},
 "angelo parker":{file:"Angelo Parker, June 2022 (cropped).jpg",author:"All Elite Wrestling",license:"CC BY-SA 4.0"},
 "alexa bliss":{file:"Alexa Bliss RR25 (1).jpg",author:"Diego Serrano",license:"CC BY 2.0"},
 "angelo dawkins":{file:"Angelo Dawkins, WrestleMania XL.jpg",author:"Diego Serrano",license:"CC BY 2.0"},
 "asuka":{file:"Asuka, WrestleMania XL.jpg",author:"Diego Serrano",license:"CC BY 2.0"},
 "austin theory":{file:"Austin Theory WM39.jpg",author:"Diego Serrano",license:"CC BY 2.0"},
 "b-fab":{file:"B-Fab, WrestleMania XL 2024 (cropped).jpg",author:"Diego Serrano",license:"CC BY 2.0"},
 "bayley":{file:"Bayley RR25 (1).jpg",author:"Diego Serrano",license:"CC BY 2.0"},
 "bobby lashley":{file:"Bobby Lashley March 2023 (headshot).jpg",author:"Diego Serrano",license:"CC BY 2.0"},
 "braun strowman":{file:"Braun Strowman March 2023 (cropped).jpg",author:"Diego Serrano",license:"CC BY 2.0"},
 "bray wyatt":{file:"Bray Wyatt, 2022 (cropped).jpg",author:"Diego Serrano",license:"CC BY 2.0"},
 "brock lesnar":{file:"Brock Lesnar At SummerSlam 2023.jpg",author:"Diego Serrano",license:"CC BY 2.0"},
 "bubba ray dudley":{file:"Bubba Ray Dudley, WrestleMania XL (cropped).jpg",author:"Diego Serrano",license:"CC BY 2.0"},
 "candice lerae":{file:"Candice LeRae RR25.jpg",author:"Diego Serrano",license:"CC BY 2.0"},
 "carmelo hayes":{file:"Carmelo Hayes RR25.jpg",author:"Diego Serrano",license:"CC BY 2.0"},
 "charlotte flair":{file:"Charlotte Flair RR25.jpg",author:"Diego Serrano",license:"CC BY 2.0"},
 "chelsea green":{file:"Chelsea Green RR25 (1).jpg",author:"Diego Serrano",license:"CC BY 2.0"},
 "dakota kai":{file:"Dakota Kai, WrestleMania XL 2024 (headshot).jpg",author:"Diego Serrano",license:"CC BY 2.0"},
 "damian priest":{file:"Damian Priest, WrestleMania XL (2).jpg",author:"Diego Serrano",license:"CC BY 2.0"},
 "dominik mysterio":{file:"Dominik Mysterio RR25.jpg",author:"Diego Serrano",license:"CC BY 2.0"},
 "drew mcintyre":{file:"Drew McIntyre RR25.jpg",author:"Diego Serrano",license:"CC BY 2.0"},
 "finn bálor":{file:"Finn Bálor RR25.jpg",author:"Diego Serrano",license:"CC BY 2.0"},
 "giulia":{file:"Giulia RR25.jpg",author:"Diego Serrano",license:"CC BY 2.0"},
 "gunther":{file:"Gunther August 2024 (headshot).jpg",author:"Diego Serrano",license:"CC BY 2.0"},
 "ivy nile":{file:"Ivy Nile RR25.jpg",author:"Diego Serrano",license:"CC BY 2.0"},
 "iyo sky":{file:"Iyo Sky RR25.jpg",author:"Diego Serrano",license:"CC BY 2.0"},
 "jacob fatu":{file:"Jacob Fatu RR25.jpg",author:"Diego Serrano",license:"CC BY 2.0"},
 "akam":{file:"Akam, WrestleMania XL.jpg",author:"Diego Serrano",license:"CC BY 2.0"},
 "jaida parker":{file:"Jaida Parker RR25.jpg",author:"Diego Serrano",license:"CC BY 2.0"},
 "jey uso":{file:"Jey Uso RR25 (1).jpg",author:"Diego Serrano",license:"CC BY 2.0"},
 "jimmy uso":{file:"Jimmy Uso RR25.jpg",author:"Diego Serrano",license:"CC BY 2.0"},
 "joe hendry":{file:"Joe Hendry RR25.jpg",author:"Diego Serrano",license:"CC BY 2.0"},
 "kairi sane":{file:"Kairi Sane, WrestleMania XL 2024 (cropped).jpg",author:"Diego Serrano",license:"CC BY 2.0"},
 "karrion kross":{file:"Karrion Kross, WrestleMania XL (2).jpg",author:"Diego Serrano",license:"CC BY 2.0"},
 "kevin owens":{file:"Kevin Owens RR25.jpg",author:"Diego Serrano",license:"CC BY 2.0"},
 "la knight":{file:"LA Knight RR25.jpg",author:"Diego Serrano",license:"CC BY 2.0"},
 "liv morgan":{file:"Liv Morgan RR25 (1).jpg",author:"Diego Serrano",license:"CC BY 2.0"},
 "logan paul":{file:"Logan Paul RR25.jpg",author:"Diego Serrano",license:"CC BY 2.0"},
 "lyra valkyria":{file:"Lyra Valkyria RR25.jpg",author:"Diego Serrano",license:"CC BY 2.0"},
 "michin":{file:"Michin RR25.jpg",author:"Diego Serrano",license:"CC BY 2.0"},
 "montez ford":{file:"Montez Ford, WrestleMania XL.jpg",author:"Diego Serrano",license:"CC BY 2.0"},
 "naomi":{file:"Naomi RR25.jpg",author:"Diego Serrano",license:"CC BY 2.0"},
 "nia jax":{file:"Nia Jax RR25.jpg",author:"Diego Serrano",license:"CC BY 2.0"},
 "nikki bella":{file:"Nikki Bella RR25 (1).jpg",author:"Diego Serrano",license:"CC BY 2.0"},
 "penta":{file:"Penta RR25.jpg",author:"Diego Serrano",license:"CC BY 2.0"},
 "r-truth":{file:"R-Truth RR24 (2).jpg",author:"Diego Serrano",license:"CC BY 2.0"},
 "randy orton":{file:"Randy Orton RR24.jpg",author:"Diego Serrano",license:"CC BY 2.0"},
 "raquel rodriguez":{file:"Raquel Rodriguez RR25.jpg",author:"Diego Serrano",license:"CC BY 2.0"},
 "rey mysterio":{file:"Rey Mysterio RR25.jpg",author:"Diego Serrano",license:"CC BY 2.0"},
 "rezar":{file:"Rezar, WrestleMania XL.jpg",author:"Diego Serrano",license:"CC BY 2.0"},
 "roxanne perez":{file:"Roxanne Perez RR25.jpg",author:"Diego Serrano",license:"CC BY 2.0"},
 "stephanie vaquer":{file:"Stephanie Vaquer RR25.jpg",author:"Diego Serrano",license:"CC BY 2.0"},
 "roman reigns":{file:"Roman Reigns RR25 (1) (headshot).jpg",author:"Diego Serrano",license:"CC BY 2.0"},
 "cody rhodes":{file:"Cody Rhodes RR25.jpg",author:"Diego Serrano",license:"CC BY 2.0"},
 "seth rollins":{file:"Seth Rollins RR25.jpg",author:"Diego Serrano",license:"CC BY 2.0"},
 "rhea ripley":{file:"Rhea Ripley, April 2024 (cropped) (cropped).jpg",author:"Diego Serrano",license:"CC BY 2.0"},
 "kenny omega":{file:"Kenny Omega October 2019.jpg",author:"grenwail",license:"CC BY 2.0"},
 "cm punk":{file:"CM Punk 2022-03-23 (headshot).jpg",author:"Ralph Arvesen",license:"CC BY-SA 2.0"},
 "will ospreay":{file:"Will Ospreay at All In 2024.jpg",author:"McPhail",license:"CC0"},
 "becky lynch":{file:"Becky Lynch 2024 (cropped).jpg",author:"Carter Sterling",license:"CC BY-SA 2.0"},
 "jon moxley":{file:"Jon Moxley Oct 2021 (headshot).jpg",author:"West Smith",license:"CC BY-SA 4.0"},
 "bryan danielson":{file:"Bryan Danielson 2022-03-23 (cropped).jpg",author:"Ralph Arvesen",license:"CC BY-SA 2.0"},
 "hangman adam page":{file:"Hangman Adam Page Oct 2019 (cropped).jpg",author:"grenwail",license:"CC BY 2.0"},
 "samoa joe":{file:"Samoa Joe, 2022 (cropped).jpg",author:"All Elite Wrestling",license:"CC BY-SA 4.0"},
 "hiroshi tanahashi":{file:"Hiroshi Tanahashi 2016.png",author:"Courtney Rose",license:"CC BY-SA 2.0"},
 "aj styles":{file:"AJ Styles RR24 (1).jpg",author:"Diego Serrano",license:"CC BY 2.0"},
 "kazuchika okada":{file:"Kazuchika Okada - 03-07-2024 EDIT-12.jpg",author:"All Elite Wrestling",license:"CC BY-SA 4.0"},
 "mercedes moné":{file:"Mercedes Moné DYNAMITE 2024 07 17 038.jpg",author:"All Elite Wrestling",license:"CC BY-SA 4.0"}
};
const knownAliases:Readonly<Record<string,string>>={
 "hangman page":"hangman adam page",
 "adam page":"hangman adam page",
 "hangman adam page":"hangman adam page",
 "sasha banks":"mercedes moné",
 "dean ambrose":"jon moxley",
 "daniel bryan":"bryan danielson",
 "tyler black":"seth rollins",
 "the american nightmare":"cody rhodes",
 "the tribal chief":"roman reigns",
 "the visionary":"seth rollins",
 "the best in the world":"cm punk",
 "the cleaner":"kenny omega",
 "the rainmaker":"kazuchika okada",
 "the man":"becky lynch"
};
export const normalizePortraitName=(name:string)=>name.trim().toLowerCase().replace(/[‘’]/g,"'").replace(/\s+/g," ");
export function portraitCredit(name:string):PhotoCredit|null{
 const key=normalizePortraitName(name);
 return catalogue[knownAliases[key]??key]??null;
}
export function portraitSource(name:string,width=220):string|null{
 const photo=portraitCredit(name);
 if(!photo)return null;
 return "https://commons.wikimedia.org/wiki/Special:FilePath/"+
  encodeURIComponent(photo.file)+"?width="+Math.max(100,Math.min(420,Math.round(width)));
}
/** A real photo or no image. Do not impersonate real talent with AI silhouettes. */
export function createWrestlerPortrait(name:string,width=220):HTMLImageElement|null{
 const credit=portraitCredit(name),src=portraitSource(name,width);
 if(!credit||!src)return null;
 const img=document.createElement("img");
 img.className="ppw-real-wrestler-photo";
 img.src=src;img.alt="";img.loading="lazy";img.decoding="async";
 img.width=width;img.height=Math.round(width*1.3);
 img.title="Photo: "+credit.author+" · "+credit.license+" · Wikimedia Commons (credits in portrait-credits.html)";
 return img;
}
