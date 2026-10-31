/** Approved, lightweight CSS/SVG event poster identities. */
export const EVENT_POSTER_SKINS=[
 {sku:"POSTER_THUNDER_STRIKE",style:"THUNDER_STRIKE",label:"Thunder Strike"},
 {sku:"POSTER_HIGH_NOON",style:"HIGH_NOON",label:"High Noon"},
 {sku:"POSTER_NEON_NIGHTS",style:"NEON_NIGHTS",label:"Neon Nights"},
 {sku:"POSTER_SPOTLIGHT_SHOWDOWN",style:"SPOTLIGHT_SHOWDOWN",label:"Spotlight Showdown"},
 {sku:"POSTER_EMPIRE",style:"EMPIRE",label:"Empire"},
 {sku:"POSTER_INFERNO",style:"INFERNO",label:"Inferno"},
 {sku:"POSTER_RETRO_BROADCAST",style:"RETRO_BROADCAST",label:"Retro Broadcast"},
 {sku:"POSTER_VEGAS_LIGHTS",style:"VEGAS_LIGHTS",label:"Vegas Lights"},
 {sku:"POSTER_ECLIPSE",style:"ECLIPSE",label:"Eclipse"},
 {sku:"POSTER_RIOT_SIGNAL",style:"RIOT_SIGNAL",label:"Riot Signal"},
 {sku:"POSTER_STEELWORKS",style:"STEELWORKS",label:"Steelworks"},
 {sku:"POSTER_FROZEN_CROWN",style:"FROZEN_CROWN",label:"Frozen Crown"},
 {sku:"POSTER_LASER_GRID",style:"LASER_GRID",label:"Laser Grid"},
 {sku:"POSTER_CROWN_THEATRE",style:"CROWN_THEATRE",label:"Crown Theatre"},
 {sku:"POSTER_TIDAL_FORCE",style:"TIDAL_FORCE",label:"Tidal Force"},
 {sku:"POSTER_BLOOD_MOON",style:"BLOOD_MOON",label:"Blood Moon"},
 {sku:"POSTER_CIRCUIT_BREAKER",style:"CIRCUIT_BREAKER",label:"Circuit Breaker"},
 {sku:"POSTER_AFTERSHOCK",style:"AFTERSHOCK",label:"Aftershock"},
] as const;
export type EventPosterSku=typeof EVENT_POSTER_SKINS[number]["sku"];
export type EventPosterStyle=typeof EVENT_POSTER_SKINS[number]["style"];
export const eventPosterBySku=(s:string)=>EVENT_POSTER_SKINS.find(p=>p.sku===s)??null;
export const eventPosterByStyle=(s:string|null|undefined)=>EVENT_POSTER_SKINS.find(p=>p.style===s)??null;
export const EVENT_POSTER_KP_PRICE=1250;
