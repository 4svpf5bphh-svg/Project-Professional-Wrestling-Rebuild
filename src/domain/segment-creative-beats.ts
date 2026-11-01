/** Authored on-screen delivery borrowed from the original-main creative editor.
 * The detail describes exactly what was booked, never a random outcome.
 */
export const CREATIVE_BEAT_FIELDS={
 PROMO:{purpose:["STATEMENT_OF_INTENT","BOAST","RALLY_FANS","AIR_GRIEVANCE","ISSUE_WARNING","PROMISE_VICTORY","TAUNT_RIVALS","EXPLAIN_ACTIONS"]},
 INTERVIEW:{format:["BACKSTAGE","SIT_DOWN","IN_RING"],
  topic:["CAREER_STORY","RIVALRY_PRESSURE","RECENT_FORM","NEXT_STEPS","TITLE_AMBITIONS","FACTION_FUTURE"],
  response:["CANDID","EVASIVE","DEFIANT","WALKOUT","EMOTIONAL","SARCASTIC"]},
 CELEBRATION:{occasion:["FAN_APPRECIATION","SELF_CORONATION","RIVALRY_TAUNT","FACTION_UNITY","PERSONAL_MILESTONE"],
  ending:["SALUTE_CROWD","POSE","TAUNT_RIVALS","WALK_OFF"]},
 CONFRONTATION:{ending:["STAREDOWN","INITIATOR_BACKS_DOWN","TARGET_BACKS_DOWN","RELUCTANT_HANDSHAKE","VERBAL_WARNING","SHOVING_MATCH"]},
 CHALLENGE:{response:["ACCEPTED","REFUSED","LEFT_OPEN"]},
 ATTACK:{presentation:["BLINDSIDE","PREMEDITATED_AMBUSH","FACE_TO_FACE_ASSAULT","BEATDOWN","PULL_APART_BRAWL","SURPRISE_RUN_IN","TARGETED_BEATDOWN"],
  objective:["GENERATE_HEAT","BUILD_SYMPATHY","ESCALATE_RIVALRY"]},
 INTERRUPTION:{ending:["VERBAL_EXCHANGE","INTERRUPTER_PREVAILS","SPEAKER_PREVAILS","BRAWL"]},
 RESCUE:{ending:["RESCUER_STANDS_TALL","ATTACKER_ESCAPES","RESCUE_OVERWHELMED"]},
 POST_MATCH_ASSAULT:{ending:["ATTACKER_STANDS_TALL","VICTIM_FIGHTS_BACK","OFFICIALS_SEPARATE"]},
 INTERFERENCE:{presentation:["DISTRACTION","RINGSIDE_RUN_IN","REFEREE_DIVERSION"]},
 CONTRACT_SIGNING:{ending:["SIGNED","REJECTED","WALKOUT","BRAWL"]},
 DEBUT:{presentation:["INTRODUCTION","SURPRISE_REVEAL"],
  objective:["ESTABLISH_STAR","BUILD_EXCITEMENT","CREATE_MYSTERY",
   "UNSETTLE_RIVAL","REIGNITE_PROGRAMME"]},
 TURN:{presentation:["PUBLIC_DECLARATION","REJECT_OLD_SELF","TAUNT_CROWD","NEW_ATTITUDE"]},
 VIDEO_PACKAGE:{presentation:["CAREER_HIGHLIGHTS","BACKSTAGE_FOOTAGE","DARK_TEASER","SPOKEN_MESSAGE","FEUD_HIGHLIGHTS"]},
 STABLE_INVITATION:{approach:["PUBLIC_INVITATION","BACKSTAGE_PITCH","HARD_ULTIMATUM"]},
 STABLE_EXIT:{departure:["WALKOUT","EXPULSION_SCENE","PUBLIC_DENUNCIATION"]},
 STABLE_RECONCILIATION:{approach:["PEACE_OFFER","PUBLIC_APOLOGY","PRIVATE_MEETING"]}
} as const;
type Fields=typeof CREATIVE_BEAT_FIELDS;
export type CreativeBeatKind=keyof Fields;
export type SegmentCreativeBeat={
 [K in CreativeBeatKind]:{kind:K}&{
  [F in keyof Fields[K]]:Fields[K][F] extends readonly (infer Value)[]?Value:never
 }
}[CreativeBeatKind];
export function supportsCreativeBeat(kind:string):kind is CreativeBeatKind{
 return Object.prototype.hasOwnProperty.call(CREATIVE_BEAT_FIELDS,kind);
}
export function isSegmentCreativeBeat(value:unknown,kind:string):value is SegmentCreativeBeat{
 if(!supportsCreativeBeat(kind)||!value||typeof value!=="object"||Array.isArray(value))
  return false;
 const beat=value as Record<string,unknown>,fields=CREATIVE_BEAT_FIELDS[kind] as Record<string,readonly string[]>;
 const names=Object.keys(fields);
 return beat.kind===kind&&Object.keys(beat).length===names.length+1&&
  names.every(field=>typeof beat[field]==="string"&&
   fields[field]!.includes(beat[field] as string));
}
export function initialCreativeBeat(kind:string):SegmentCreativeBeat|null{
 if(!supportsCreativeBeat(kind))return null;
 const fields=CREATIVE_BEAT_FIELDS[kind] as Record<string,readonly string[]>;
 return Object.fromEntries([["kind",kind],...Object.entries(fields)
  .map(([name,values])=>[name,values[0]!])]) as SegmentCreativeBeat;
}
