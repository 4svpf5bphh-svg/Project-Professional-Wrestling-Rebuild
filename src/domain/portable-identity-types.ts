/** Portable wrestler identity: shared across the World, not per-promotion. */
export type MoveCategory="STRIKE"|"GRAPPLE"|"SUBMISSION"|"AERIAL"|"POWER"|"OTHER";
export interface PortableIdentityMove {name:string;category:MoveCategory;source?:"VERIFIED"|"PPW_AUTHORED"}
export type PersonaSource="CURATED"|"NEGOTIATED"|"LEGACY_MIGRATED"|
 "UNCURATED_BASELINE"|"GAME_AUTHORED"|"ROSTER_APPROXIMATION";
export interface PortablePersona{
 personaName:string;gimmickId:string;primaryStyle:string|null;
 secondaryStyle:string|null;signatureMoves:PortableIdentityMove[];
 finishingMoves:PortableIdentityMove[];source:PersonaSource;
}
