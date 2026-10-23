/** Wikimedia Commons portrait candidates. External file existence and licensing\n * must be independently audited; local tests alone cannot verify remote media.
 * Client media only: NO live search, AI, Neon metadata, database reads/writes.
 * Match the base legal name as well as stable ring aliases. Never invent photos.
 * Full attribution and license links: /portrait-credits.html
 */
export interface PhotoCredit{file:string;author:string;license:"CC BY 4.0"|"CC BY 2.0"|"CC BY-SA 2.0"|"CC BY-SA 3.0"|"CC BY-SA 4.0"|"CC0";}
const catalogue:Readonly<Record<string,PhotoCredit>>={
 // Portraits vetted against each Commons source page; remote metadata gated in CI.
 // New 38-photo expansion: real Genesis wrestlers and specific credited Commons files.
 "mike bailey":{file:"Mike Bailey in February 2024.jpg",author:"J O Y F U L 🐻 V I O L E N C E",license:"CC BY 2.0"},
 "adam priest":{file:"Adam Priest in April 2025.jpg",author:"J O Y F U L 🐻 V I O L E N C E",license:"CC BY 2.0"},
 "blake christian":{file:"Blake Christian in June 2024 (cropped).jpg",author:"J O Y F U L 🐻 V I O L E N C E",license:"CC BY 2.0"},
 "lee moriarty":{file:"Lee Moriarty in February 2024.jpg",author:"J O Y F U L 🐻 V I O L E N C E",license:"CC BY 2.0"},
 "lio rush":{file:"Lio Rush in February 2024.jpg",author:"J O Y F U L 🐻 V I O L E N C E",license:"CC BY 2.0"},
 "rocky romero":{file:"Rocky Romero in April 2025.jpg",author:"J O Y F U L 🐻 V I O L E N C E",license:"CC BY 2.0"},
 "shane haste":{file:"Shane Haste (cropped).jpg",author:"J O Y F U L 🐻 V I O L E N C E",license:"CC BY 2.0"},
 "chris bey":{file:"Chris Bey in February 2024 (cropped).jpg",author:"J O Y F U L 🐻 V I O L E N C E",license:"CC BY 2.0"},
 "alan angels":{file:"Alan Angels in April 2025 (cropped).jpg",author:"J O Y F U L 🐻 V I O L E N C E",license:"CC BY 2.0"},
 "gringo loco":{file:"Gringo Loco in April 2024.jpg",author:"J O Y F U L 🐻 V I O L E N C E",license:"CC BY 2.0"},
 "luke jacobs":{file:"Luke Jacobs in April 2025.jpg",author:"J O Y F U L 🐻 V I O L E N C E",license:"CC BY 2.0"},
 "mance warner":{file:"Mance Warner in February 2024.jpg",author:"J O Y F U L 🐻 V I O L E N C E",license:"CC BY 2.0"},
 "esfinge":{file:"Esfinge in April 2025 (cropped).jpg",author:"J O Y F U L 🐻 V I O L E N C E",license:"CC BY 2.0"},
 "megan bayne":{file:"Megan Bayne in April 2024 (cropped).jpg",author:"J O Y F U L 🐻 V I O L E N C E",license:"CC BY 2.0"},
 "mina shirakawa":{file:"Mina Shirakawa in April 2024 (cropped).jpg",author:"J O Y F U L 🐻 V I O L E N C E",license:"CC BY 2.0"},
 "queen aminata":{file:"Queen Aminata in April 2025 (cropped).jpg",author:"BEAR FROM SPACE",license:"CC BY 2.0"},
 "dani luna":{file:"Dani Luna in April 2025 (cropped).jpg",author:"J O Y F U L 🐻 V I O L E N C E",license:"CC BY 2.0"},
 "thekla":{file:"Thekla in April 2025.jpg",author:"J O Y F U L 🐻 V I O L E N C E",license:"CC BY 2.0"},
 "xia brookside":{file:"Xia Brookside in April 2024 (cropped).jpg",author:"J O Y F U L 🐻 V I O L E N C E",license:"CC BY 2.0"},
 "masha slamovich":{file:"Masha Slamovich in April 2025 (cropped).jpg",author:"J O Y F U L 🐻 V I O L E N C E",license:"CC BY 2.0"},
 "indi hartwell":{file:"Indi Hartwell in April 2025 (cropped).jpg",author:"J O Y F U L 🐻 V I O L E N C E",license:"CC BY 2.0"},
 "jody threat":{file:"Jody Threat in April 2025.jpg",author:"J O Y F U L 🐻 V I O L E N C E",license:"CC BY 2.0"},
 "syuri":{file:"Syuri in April 2025 (cropped).jpg",author:"J O Y F U L 🐻 V I O L E N C E",license:"CC BY 2.0"},
 "azm":{file:"AZM in April 2025 (cropped).jpg",author:"J O Y F U L 🐻 V I O L E N C E",license:"CC BY 2.0"},
 "mei seira":{file:"Mei Seira in April 2024.jpg",author:"J O Y F U L 🐻 V I O L E N C E",license:"CC BY 2.0"},
 "natsuko tora":{file:"Natsuko Tora (2) in April 2025 (cropped).jpg",author:"J O Y F U L 🐻 V I O L E N C E",license:"CC BY 2.0"},
 "momo watanabe":{file:"Momo Watanabe in April 2024.jpg",author:"J O Y F U L 🐻 V I O L E N C E",license:"CC BY 2.0"},
 "konami":{file:"Konami in April 2024 (cropped).jpg",author:"J O Y F U L 🐻 V I O L E N C E",license:"CC BY 2.0"},
 "suzu suzuki":{file:"Suzu Suzuki in April 2025 (cropped).jpg",author:"J O Y F U L 🐻 V I O L E N C E",license:"CC BY 2.0"},
 "rina yamashita":{file:"Rina Yamashita in April 2025 (cropped).jpg",author:"J O Y F U L 🐻 V I O L E N C E",license:"CC BY 2.0"},
 "saya iida":{file:"Saya Iida in April 2025 (cropped).jpg",author:"J O Y F U L 🐻 V I O L E N C E",license:"CC BY 2.0"},
 "momo kohgo":{file:"Momo Kohgo in April 2024.jpg",author:"J O Y F U L 🐻 V I O L E N C E",license:"CC BY 2.0"},
 "maika":{file:"Maika in April 2025 (cropped).jpg",author:"J O Y F U L 🐻 V I O L E N C E",license:"CC BY 2.0"},
 "hanako":{file:"Hanako in April 2025 (cropped).jpg",author:"J O Y F U L 🐻 V I O L E N C E",license:"CC BY 2.0"},
 "lana austin":{file:"Lana Austin in April 2024.jpg",author:"J O Y F U L 🐻 V I O L E N C E",license:"CC BY 2.0"},
 "trish adora":{file:"Trish Adora in February 2024 (cropped).jpg",author:"J O Y F U L 🐻 V I O L E N C E",license:"CC BY 2.0"},
 "mayu iwatani":{file:"Iwatani mayu.jpg",author:"Joshifan888",license:"CC BY-SA 4.0"},
 "shotzi blackheart":{file:"Shotzi Blackheart, April 2019 (cropped).jpg",author:"grenwail",license:"CC BY 2.0"},
 // Nine additional real, specifically identified/licensed Commons performers.
 "tonga loa":{file:"Tanga Roa IWGP Tag Team Champion.jpg",author:"ゾーヒョー",license:"CC BY-SA 4.0"},
 "carlito":{file:"Carlito in Burlington, Vermont in February 09.jpg",author:"shstrng",license:"CC BY 2.0"},
 "britt baker":{file:"Britt Baker (cropped).jpg",author:"John Manard",license:"CC BY-SA 2.0"},
 "mariah may":{file:"Mariah May in August 2024 05.jpg",author:"McPhail",license:"CC0"},
 "daniel garcia":{file:"Daniel Garcia Dec 2019 (cropped).jpg",author:"grenwail",license:"CC BY 2.0"},
 "kyle o'reilly":{file:"Kyle O'Reilly.jpg",author:"Steve Wright Jr.",license:"CC BY 2.0"},
 "powerhouse hobbs":{file:"Will \"Powerhouse\" Hobbs, 2022 (headshot).jpg",author:"West Smith",license:"CC BY 2.0"},
 "natalya":{file:"Natalya March 2015.jpg",author:"Miguel Discart",license:"CC BY-SA 2.0"},
 "cedric alexander":{file:"Cedric Alexander 2026.png",author:"TNA Wrestling",license:"CC BY 4.0"},

 "tiffany stratton":{file:"Tiffany Stratton August 2024 (cropped).jpg",author:"Diego Serrano",license:"CC BY 2.0"},
 "trick williams":{file:"Trick Williams FOS 2026 version 3 (cropped).png",author:"Front Office Sports",license:"CC BY 4.0"},
 "the miz":{file:"The Miz (29036397881).jpg",author:"Greg2600",license:"CC BY-SA 2.0"},
 "kofi kingston":{file:"Kofi Kingston (43601442611).jpg",author:"Gage Skidmore",license:"CC BY-SA 2.0"},
 "ilja dragunov":{file:"Ilja Dragunov 2019.jpg",author:"Photos N Effect",license:"CC BY-SA 2.0"},
 "bron breakker":{file:"Bron Breakker 2026 (cropped).jpg",author:"HHH Pedrigree",license:"CC BY-SA 4.0"},
 "zoey stark":{file:"Zoey Stark.jpg",author:"KMcWrestling Photography",license:"CC BY-SA 4.0"},
 "solo sikoa":{file:"Solo Sikoa, October 2024 (1).jpg",author:"Diego Serrano",license:"CC BY 2.0"},
 "andrade":{file:"Andrade El Idolo AEW (cropped).jpg",author:"KMcWrestling Photography",license:"CC BY-SA 4.0"},
 "xavier woods":{file:"Xavier Woods March 2023 (cropped).jpg",author:"diegofernandophotography",license:"CC BY 2.0"},
 "sheamus":{file:"Sheamus March 2018.jpg",author:"Mmsnapplez",license:"CC BY-SA 4.0"},
 "zelina vega":{file:"Zelina Vega 2018-04-07 20-50-02 ILCE-6500 DSC06809 (cropped).jpg",author:"Miguel Discart",license:"CC BY-SA 2.0"},
 "grayson waller":{file:"Grayson Waller - 2023 (cropped).jpg",author:"Mechanical Elephant",license:"CC0"},
 "tama tonga":{file:"Tama Tonga IWGP Tag Team Champion.jpg",author:"ゾーヒョー",license:"CC BY-SA 4.0"},
 "dragon lee":{file:"Dragon Lee, April 2019 (cropped).jpg",author:"grenwail",license:"CC BY 2.0"},
 "ludwig kaiser":{file:"Marcel Barthel June 2018.jpg",author:"Miguel Discart (Shared Account)",license:"CC BY-SA 2.0"},
 "chad gable":{file:"Chad Gable NXT Takeover Dallas 2016.jpg",author:"Miguel Discart",license:"CC BY-SA 2.0"},
 "otis":{file:"Otis Dozovic 2018.jpg",author:"Miguel Discart (Shared Account)",license:"CC BY-SA 2.0"},

 // New audited candidates: precise Commons files and verified creator/licence pages.
 "orange cassidy":{file:"Orange Cassidy (53197325636).jpg",author:"Tim Blackmon for Galaxy Con",license:"CC BY 2.0"},
 "toni storm":{file:"Toni Storm, September 2023.jpg",author:"zuko1312",license:"CC BY 2.0"},
 "swerve strickland":{file:"Swerve Strickland as AEW World Champion, August 2024.jpg",author:"McPhail",license:"CC0"},
 "mjf":{file:"MJF in August 2024 as AEW American Champion.jpg",author:"McPhail",license:"CC0"},
 "willow nightingale":{file:"Willow Nightingale 2018 (cropped).jpg",author:"grenwail",license:"CC BY 2.0"},
 "chris jericho":{file:"Chris Jericho as FTW Champion (cropped).jpg",author:"McPhail",license:"CC0"},
 "rey fenix":{file:"Rey Fenix.jpg",author:"grenwail",license:"CC BY 2.0"},
 "adam cole":{file:"Adam Cole, June 2022 (cropped).jpg",author:"Carter Sterling",license:"CC BY-SA 2.0"},
 "claudio castagnoli":{file:"Claudio Castagnoli, June 2022 (cropped).jpg",author:"Carter Sterling",license:"CC BY-SA 2.0"},
 "hikaru shida":{file:"20220717shida1.jpg",author:"Yuzunet",license:"CC BY-SA 4.0"},
 "kris statlander":{file:"Kris Statlander - Independent Wrestling Champion (cropped).jpg",author:"grenwail",license:"CC BY 2.0"},
 "zack sabre jr.":{file:"Zack Sabre Jr, June 2022.jpg",author:"Carter Sterling",license:"CC BY-SA 2.0"},
 "jeff hardy":{file:"Jeff Hardy.jpg",author:"EGGE",license:"CC BY-SA 3.0"},
 "matt hardy":{file:"Matt Hardy.jpg",author:"EGGE",license:"CC BY-SA 3.0"},
 "aj lee":{file:"AJ Lee.jpg",author:"David Seto",license:"CC BY-SA 2.0"},
 "jordynne grace":{file:"Jordynne Grace at Smash Canusa 2018.jpg",author:"Tabercil",license:"CC BY-SA 3.0"},
 "bandido":{file:"Bandido ROH.jpg",author:"KMcWrestling Photography",license:"CC BY-SA 4.0"},
 "matt cardona":{file:"Matt Cardona at World Series Wrestling.jpg",author:"BigDaddyFam64",license:"CC BY-SA 4.0"},
 "nic nemeth":{file:"Nic Nemeth 2023.jpg",author:"Super Festivals",license:"CC BY 2.0"},
 "christian cage":{file:"ChristianCage1.JPG",author:"KnightNephrite",license:"CC BY-SA 3.0"},
 "athena":{file:"Athena - August 29 2025.jpg",author:"KMcWrestling Photography",license:"CC BY-SA 4.0"},
 "pac":{file:"Pac as AEW World Trios Champion.jpg",author:"McPhail",license:"CC0"},
 "darby allin":{file:"Darby Allin, June 2022 (cropped).jpg",author:"Carter Sterling",license:"CC BY-SA 2.0"},
 "cash wheeler":{file:"Cash Wheeler, June 2022 (cropped).jpg",author:"Carter Sterling",license:"CC BY-SA 2.0"},
 "dax harwood":{file:"Dax Harwood, June 2022 (cropped).jpg",author:"Carter Sterling",license:"CC BY-SA 2.0"},
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
 "bobby lashley":{file:"Bobby Lashley March 2023 (headshot).jpg",author:"diegofernandophotography",license:"CC BY 2.0"},
 "braun strowman":{file:"Braun Strowman March 2023 (cropped).jpg",author:"Diego Serrano",license:"CC BY 2.0"},
 "bray wyatt":{file:"Bray Wyatt, 2022 (cropped).jpg",author:"diegofernandophotography",license:"CC BY 2.0"},
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
 "shinsuke nakamura":{file:"Shinsuke Nakamura 2024 (cropped).jpg",author:"Carter Sterling",license:"CC BY-SA 2.0"},




















 "santos escobar":{file:"Santos Escobar RR25.jpg",author:"Diego Serrano",license:"CC BY 2.0"},



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
 "mercedes moné":{file:"Mercedes Moné DYNAMITE 2024 07 17 038.jpg",author:"All Elite Wrestling",license:"CC BY-SA 4.0"},
 // Metadata corroborated from Commons photographer category.
 "alec price":{file:"Alec Price in March 2025 (cropped).jpg",author:"✨ JOYFUL VI0LENCE ✨",license:"CC BY-SA 4.0"},
 "the dkc":{file:"The D.K.C. in January 2024.jpg",author:"J O Y F U L 🐻 V I O L E N C E",license:"CC BY 2.0"},
 "matt vandagriff":{file:"Matt Vandagriff.jpg",author:"J O Y F U L 🐻 V I O L E N C E",license:"CC BY 2.0"},
 "royce isaacs":{file:"Royce Isaacs 20241214.jpg",author:"J O Y F U L 🐻 V I O L E N C E",license:"CC BY 2.0"},
 "alex hammerstone":{file:"Alexander Hammerstone in February 2024.jpg",author:"J O Y F U L 🐻 V I O L E N C E",license:"CC BY 2.0"},
 "jack cartwheel":{file:"Jack Cartwheel in June 2024.jpg",author:"J O Y F U L 🐻 V I O L E N C E",license:"CC BY 2.0"},
 "kerry morton":{file:"Kerry Morton in February 2024.jpg",author:"J O Y F U L 🐻 V I O L E N C E",license:"CC BY 2.0"},
 "man like dereiss":{file:"Man Like DeReiss in April 2024.jpg",author:"J O Y F U L 🐻 V I O L E N C E",license:"CC BY 2.0"},
 "charles mason":{file:"Charles Mason in April 2025 (cropped).jpg",author:"✨ JOYFUL VI0LENCE ✨",license:"CC BY 4.0"},
 "effy":{file:"Effy in March 2025.jpg",author:"✨ JOYFUL VI0LENCE ✨",license:"CC BY-SA 4.0"},
 "kzy":{file:"Kzy in April 2025 (cropped).jpg",author:"J O Y F U L 🐻 V I O L E N C E",license:"CC BY 2.0"},
 "zayda steel":{file:"Zayda Steel in March 2025 (cropped).jpg",author:"✨ JOYFUL VI0LENCE ✨",license:"CC BY 4.0"},
 "lena kross":{file:"Lena Kross in April 2025 (cropped).jpg",author:"J O Y F U L 🐻 V I O L E N C E",license:"CC BY 2.0"},
 "rina":{file:"Rina Yamashita in April 2025.jpg",author:"J O Y F U L 🐻 V I O L E N C E",license:"CC BY 2.0"},
 "nina samuels":{file:"Nina Samuels in April 2025.jpg",author:"J O Y F U L 🐻 V I O L E N C E",license:"CC BY 2.0"},
 "rhio":{file:"Rhio in April 2024.jpg",author:"J O Y F U L 🐻 V I O L E N C E",license:"CC BY 2.0"},
 "janai kai":{file:"Janai Kai Kitsune Wrestling March 2024.jpg",author:"J O Y F U L 🐻 V I O L E N C E",license:"CC BY 2.0"},
};
const knownAliases:Readonly<Record<string,string>>={
 "nattie":"natalya",
 "paige":"saraya",
 "andrade el ídolo":"andrade",
 "otís":"otis",
 "tanga loa":"tonga loa",
 "shotzi":"shotzi blackheart",
 "speedball mike bailey":"mike bailey",
 "aminata":"queen aminata",
 "tanga roa":"tonga loa",
 "carly colón":"carlito",
 "blake monroe":"mariah may",
 "will hobbs":"powerhouse hobbs",
 "nattie neidhart":"natalya",
 "otis dozovic":"otis",
 "andrade el idolo":"andrade",
 "marcel barthel":"ludwig kaiser",
 "hangman page":"hangman adam page",
 "“hangman” adam page":"hangman adam page",
 "\"hangman\" adam page":"hangman adam page",
 "zack sabre jr":"zack sabre jr.",
 "cesaro":"claudio castagnoli",
 "dolph ziggler":"nic nemeth",
 "rey fénix":"rey fenix",
 "christian":"christian cage",

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
export const portraitCatalogue:Readonly<Record<string,PhotoCredit>>=catalogue;
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
