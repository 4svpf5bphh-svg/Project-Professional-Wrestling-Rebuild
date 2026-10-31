/** Nine approved account-owned Staff Office cosmetics; no gameplay effects. */
export const STAFF_OFFICE_THEMES=[
 {sku:"STAFF_OFFICE_GORILLA_CONTROL",style:"GORILLA_CONTROL",label:"Gorilla Control",description:"Production desk, orange live cues and backstage monitors"},
 {sku:"STAFF_OFFICE_TERRITORY_ROOM",style:"TERRITORY_ROOM",label:"Territory Booking Room",description:"Vintage ledger paper, archival stamps and old-school wrestling"},
 {sku:"STAFF_OFFICE_EXECUTIVE_SUITE",style:"EXECUTIVE_SUITE",label:"Executive Suite",description:"Luxury boardroom, bronze and champagne gold"},
 {sku:"STAFF_OFFICE_EWR_OFFICE_2002",style:"EWR_OFFICE_2002",label:"EWR Office 2002",description:"Old-school blue/red management PC and CRT scanlines"},
 {sku:"STAFF_OFFICE_UNDERGROUND_OFFICE",style:"UNDERGROUND_OFFICE",label:"Underground Office",description:"Photocopy zine, acid green and rough-edged typography"},
 {sku:"STAFF_OFFICE_CREATIVE_STUDIO",style:"CREATIVE_STUDIO",label:"Modern Creative Studio",description:"Bright, approachable creative workshop"},
 {sku:"STAFF_OFFICE_BROADCAST_NEWSROOM",style:"BROADCAST_NEWSROOM",label:"Broadcast Newsroom",description:"Live sports network panels and crimson editorial accents"},
 {sku:"STAFF_OFFICE_NEON_CONTROL",style:"NEON_CONTROL",label:"Neon Control Room",description:"Purple/cyan illuminated production grid"},
 {sku:"STAFF_OFFICE_STEELWORKS_OFFICE",style:"STEELWORKS_OFFICE",label:"Steelworks Office",description:"Brushed steel, amber warnings and industrial control"},
] as const;
export type StaffOfficeThemeSku=typeof STAFF_OFFICE_THEMES[number]["sku"];
export type StaffOfficeThemeStyle=typeof STAFF_OFFICE_THEMES[number]["style"];
export const STAFF_OFFICE_THEME_KP_PRICE=1250;
export const staffOfficeThemeBySku=(sku:string)=>STAFF_OFFICE_THEMES.find(t=>t.sku===sku)??null;
export const staffOfficeThemeByStyle=(style:string|null|undefined)=>
 STAFF_OFFICE_THEMES.find(t=>t.style===style)??null;
export const staffOfficeThemeClass=(style:string|null|undefined)=>
 staffOfficeThemeByStyle(style)?.style.toLowerCase().replaceAll("_","-")??"standard";
