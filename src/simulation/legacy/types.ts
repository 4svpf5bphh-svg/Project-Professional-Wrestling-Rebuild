/** Minimal type seam for verbatim legacy wrestling calculations.
 * Only the imports, not the original mathematical algorithms, were changed.
 * Full old WorldState is intentionally NOT imported into the new DB runtime.
 */
export type MatchIntent=
 |"COMPETITIVE"|"SHOWCASE"|"DOMINANT"|"TECHNICAL"
 |"HIGH_RISK"|"STORY"|"PROTECTIVE"|"EPIC";
export interface MatchStyleProfile {
 competitiveness:number;technical:number;story:number;
 intensity:number;risk:number;epic:number;
}
export interface Match {
 intent:MatchIntent;
 plannedFinish?:import("./match-finishes.js").MatchFinish;
 actualFinish?:import("./match-finishes.js").MatchFinish|null;
}
