import { createHash } from "node:crypto";
import { initialAngleScene } from "./angle-scene.js";
import type { AiPromotionStrategy } from "./ai-promotion-strategy.js";
import type { AiRosterCandidate } from "./ai-world-card.js";
import type { CertifiedContenderResult } from "./earned-contenders.js";
import type { ProgrammeCreativeIntent } from "./programme-creative-intent.js";
import type { ProgrammePayoff } from "./programme-finales.js";
import { programmeIdentity, type ProgrammeFormat, type ProgrammeRef } from "./programme-lifecycle.js";
import { buildBookedSegmentPayload, type BookedSegmentPayload, type SegmentBookingInput } from "./segment-booking.js";
import { initialCreativeBeat } from "./segment-creative-beats.js";
import { storyBlueprint } from "./story-blueprints.js";

export interface AiProgramme {
 programmeId: string;
 format: ProgrammeFormat;
 sideA: string[];
 sideB: string[];
 championshipId: string | null;
 intent: ProgrammeCreativeIntent;
 started: number;
 angleCount: number;
 matchCount: number;
 lastWeek: number | null;
 lastCrowd: number | null;
 lastFinish: string | null;
 lastWinnerSide: string | null;
}
export interface AiProgrammeTitle {
 championshipId: string;
 holderId: string | null;
 bookingDivision: "MEN" | "WOMEN" | null;
}
export type AiProgrammeBeat =
 | { kind: "ANGLE"; programme: AiProgramme; angle: SegmentBookingInput; payoff?: ProgrammePayoff }
 | { kind: "MATCH"; programme: AiProgramme; leadId: string; winnerId: string;
  opponentId?: string; tagPartnerId?: string; opposingTag?: readonly [string, string];
  protected?: boolean; payoff?: ProgrammePayoff;
  support?: boolean };
export interface AiProgrammeAngle {
 payload: BookedSegmentPayload;
 programmeId: string;
 payoff?: ProgrammePayoff;
}
type History = { blueprintId: string; people: string[]; programmeKey: string | null };
const attackPersona = (p: AiRosterCandidate) => p.presentation * .55 + p.popularity * .45;
const wrestling = (p: AiRosterCandidate) => p.matchCraft * .65 + p.momentum * .35;
const seedOrder = (seed: string, key: string) =>
 createHash("sha256").update(JSON.stringify([seed, key])).digest().readUInt32BE(0) / 0xffffffff;
const personRef = (refId: string): ProgrammeRef => ({ kind: "PERSON", refId });
export function aiProgrammeKey(programme: Pick<AiProgramme, "format" | "sideA" | "sideB">) {
 return programmeIdentity({ sideA: programme.sideA.map(personRef), sideB: programme.sideB.map(personRef) },
  programme.format);
}

export function startAiProgramme(input: {
 seed: string; promotionId: string; week: number; roster: readonly AiRosterCandidate[];
 strategy: AiPromotionStrategy; titles: readonly AiProgrammeTitle[];
 contenders: readonly CertifiedContenderResult[];
 teams: readonly { aId: string; bId: string }[]; factions: readonly string[][];
 history: readonly History[]; premiumSoon: boolean;
}): AiProgramme | null {
 const eligible = [...new Map(input.roster.filter(p => (p.contractExpires ?? Infinity) >= input.week + 2 &&
  (p.remainingDates ?? Infinity) >= 2).map(p => [p.personId, p])).values()];
 if (eligible.length < 4) return null;
 const byId = new Map(eligible.map(p => [p.personId, p]));
 const usedRecently = new Set(input.history.flatMap(h => h.people));
 const order = (score: (p: AiRosterCandidate) => number) => [...eligible].sort((a, b) =>
  (score(b) - Number(usedRecently.has(b.personId)) * 20) -
  (score(a) - Number(usedRecently.has(a.personId)) * 20) || a.personId.localeCompare(b.personId));
 const headliners = order(input.strategy.identity === "WORKRATE" ? wrestling : attackPersona);
 const prospect = order(p => p.matchCraft * .42 + p.momentum * .35 - p.popularity * .23 +
  (p.careerStage === "PROSPECT" ? 16 : 0));
 const options: Array<{ blueprint: string; format: ProgrammeFormat; a: string[]; b: string[];
  title: string | null; weight: number }> = [];
 function offer(blueprint: string, format: ProgrammeFormat, a: string[], b: string[] = [],
  weight = 0, title: string | null = null) {
  const programmeKey = aiProgrammeKey({ format, sideA: a, sideB: b });
  if (!input.history.some(h => h.programmeKey === programmeKey))
   options.push({ blueprint, format, a, b, title, weight });
 }
 const hasForm = (id: string) => input.contenders.some(r => r.id === id && r.won);
 for (const title of input.titles) {
  const champion = title.holderId && byId.get(title.holderId);
  if (!champion) continue;
  const challenger = headliners.find(p => p.personId !== champion.personId &&
   p.bookingDivision === champion.bookingDivision && hasForm(p.personId));
  if (challenger) {
   offer("TITLE_CHASE", "RIVALRY", [challenger.personId], [champion.personId],
    input.premiumSoon ? 24 : 7, title.championshipId);
   break;
  }
 }
 const lead = prospect[0]!;
 const foil = headliners.find(p => p.personId !== lead.personId && p.bookingDivision === lead.bookingDivision);
 const veteran = prospect.find(p => p.careerStage === "PROSPECT" &&
  headliners.some(v => v.careerStage === "VETERAN" && v.bookingDivision === p.bookingDivision));
 const established = veteran && headliners.find(p => p.careerStage === "VETERAN" &&
  p.bookingDivision === veteran.bookingDivision);
 if (veteran && established) {
  offer("GENERATIONS", "RIVALRY", [veteran.personId], [established.personId],
   input.strategy.focus === "BUILD_STARS" ? 20 : 8);
  offer("MENTOR", "RELATIONSHIP", [veteran.personId, established.personId], [], 12);
 }
 if (foil) offer(foil.popularity - lead.popularity >= 14 ? "UNDERDOG" : "RESPECT",
  "RIVALRY", [lead.personId], [foil.personId], input.strategy.identity === "WORKRATE" ? 22 : 10);
 const first = headliners[0]!;
 const rival = headliners.find(p => p.personId !== first.personId && p.bookingDivision === first.bookingDivision);
 if (rival) offer("JEALOUSY", "RIVALRY", [rival.personId], [first.personId],
  input.strategy.identity === "SPECTACLE" || input.strategy.identity === "STORYTELLING" ? 22 : 5);
 const solo = prospect.find(p => !usedRecently.has(p.personId)) ?? lead;
 offer("UNDERDOG", "SOLO", [solo.personId], [], input.strategy.focus === "BUILD_STARS" ? 19 : 9);
 const partnerships = input.teams.filter(t => byId.has(t.aId) && byId.has(t.bId) &&
  byId.get(t.aId)!.bookingDivision === byId.get(t.bId)!.bookingDivision);
 const team = partnerships.find(t => !usedRecently.has(t.aId) && !usedRecently.has(t.bId)) ?? partnerships[0];
 if (team) offer("BETRAYAL", "RELATIONSHIP", [team.aId, team.bId], [],
  input.strategy.identity === "STORYTELLING" || input.strategy.identity === "SPECTACLE" ? 25 : 13);
 if (team) {
  const challengers = partnerships.find(t => ![team.aId, team.bId].includes(t.aId) &&
   ![team.aId, team.bId].includes(t.bId) && byId.get(t.aId)!.bookingDivision === byId.get(team.aId)!.bookingDivision);
  if (challengers) offer("RESPECT", "RIVALRY", [challengers.aId, challengers.bId], [team.aId, team.bId],
   input.strategy.identity === "WORKRATE" ? 26 : 16);
 }
 const faction = input.factions.map(f => f.filter(id => byId.has(id)).slice(0, 4)).find(f => f.length >= 3);
 if (faction) offer("FACTION_CIVIL_WAR", "FACTION", faction, [],
  input.strategy.identity === "STORYTELLING" ? 28 : 14);
 const ranked = options.map(option => ({
  option, score: option.weight - input.history.filter(h => h.blueprintId === option.blueprint).length * 17 -
   [...option.a, ...option.b].filter(id => usedRecently.has(id)).length * 5 +
   seedOrder(input.seed, input.promotionId + ":" + input.week + ":" + option.blueprint + ":" + option.format) * 21,
 })).sort((a, b) => b.score - a.score);
 const choice = ranked[0]?.option;
 if (!choice) return null;
 const blueprint = storyBlueprint(choice.blueprint)!;
 return {
  programmeId: "ai-story-" + createHash("sha256").update(JSON.stringify([input.promotionId, input.week]))
   .digest("hex").slice(0, 24),
  format: choice.format, sideA: choice.a, sideB: choice.b, championshipId: choice.title,
  intent: { blueprintId: blueprint.id, motivation: blueprint.motivation, audienceGoal: blueprint.desiredFeeling,
   destination: choice.title ? "Earn a championship showdown" :
    choice.format === "RIVALRY" ? "Settle the dispute in the ring" : "Show the outcome of the on-air arc" },
  started: input.week, angleCount: 0, matchCount: 0, lastWeek: null, lastCrowd: null,
  lastFinish: null, lastWinnerSide: null,
 };
}

export function planAiProgrammeBeat(input: {
 programme: AiProgramme; roster: readonly AiRosterCandidate[]; week: number;
 premium: boolean; nextPremium: number | null; title: AiProgrammeTitle | undefined;
 results: readonly CertifiedContenderResult[]; strategy: AiPromotionStrategy;
}): AiProgrammeBeat | null {
 const { programme: p, week, premium } = input;
 const cast = [...p.sideA, ...p.sideB];
 const roster = new Map(input.roster.map(person => [person.personId, person]));
 if (cast.some(id => !roster.has(id))) return null;
 const leadId = cast[0]!;
 const foil = p.sideB[0] ?? p.sideA[1];
 const blueprint = p.intent.blueprintId;
 const weakReaction = p.lastCrowd !== null && p.lastCrowd < 42;
 const expiring = cast.some(id => (roster.get(id)!.contractExpires ?? Infinity) <= week + 1 ||
  (roster.get(id)!.remainingDates ?? Infinity) <= 1);
 const waitingForPremium = !premium && input.nextPremium !== null && input.nextPremium - week <= 4 &&
  !expiring && !weakReaction;
 const angle = (kind: SegmentBookingInput["kind"], purpose: NonNullable<SegmentBookingInput["scene"]>["purpose"],
  actorIds: string[], targetIds: string[] = [], payoff?: ProgrammePayoff): AiProgrammeBeat => ({
  kind: "ANGLE", programme: p, payoff,
  angle: { slotId: "ai-programme-angle", position: 1, kind, actorIds, targetIds,
   outcome: "HAPPENS", durationMinutes: kind === "VIDEO_PACKAGE" ? 2 : 3,
   ...(kind === "VIDEO_PACKAGE" ? { videoPurpose: "FEUD_RECAP" as const } : {}),
   ...(kind === "INTERRUPTION" ? { creativeBeat: initialCreativeBeat(kind)! } : {}),
   scene: { ...initialAngleScene(kind), purpose } },
 });
 if (p.lastWeek === week) return null;
 if (p.angleCount === 0) {
  if (p.championshipId) return angle("INTERVIEW", "TARGET_CHAMPIONSHIP", [leadId]);
  if (blueprint === "BETRAYAL") return angle("INTERVIEW", "TEASE_BETRAYAL", [leadId], [foil!]);
  if (blueprint === "FACTION_CIVIL_WAR") return angle("PROMO", "BUILD_FACTION", cast);
  const opening = storyBlueprint(blueprint)?.beats[0];
  return angle(opening?.kind ?? "INTERVIEW", opening?.purpose ?? "BUILD_CHARACTER", [leadId]);
 }
 if (p.championshipId && !input.title?.holderId) return null;
 const currentTitleHolder = input.title?.holderId;
 if (p.championshipId && currentTitleHolder !== foil) {
  return angle("INTERVIEW", "REVEAL_MOTIVATION", [leadId], [], "FINAL_CHAPTER");
 }
 const match = (winnerId: string, options: Partial<Omit<Extract<AiProgrammeBeat, { kind: "MATCH" }>,
  "kind" | "programme" | "leadId" | "winnerId">>): AiProgrammeBeat =>
  ({ kind: "MATCH", programme: p, leadId, winnerId, ...options });
 const earnedWin = input.results.some(r => r.id === leadId && r.won && !r.titleMatch && r.weekIndex > p.started);
 if (p.championshipId && !earnedWin) {
  if (expiring || weakReaction && week - p.started >= 6)
   return angle("INTERVIEW", "REVEAL_MOTIVATION", [leadId], [], "FINAL_CHAPTER");
  return premium ? null : match(leadId, { support: true });
 }
 if (p.format === "SOLO") {
  if (!p.matchCount) return match(leadId, {});
  if (p.angleCount >= 2 || expiring || weakReaction)
   return angle(p.lastWinnerSide === "A" ? "CELEBRATION" : "INTERVIEW",
    p.lastWinnerSide === "A" ? "CELEBRATE_SUCCESS" : "REVEAL_MOTIVATION", [leadId], [], "FINAL_CHAPTER");
  return angle("PROMO", "RALLY_SUPPORT", [leadId]);
 }
 if (p.format === "RELATIONSHIP" || p.format === "FACTION") {
  if (blueprint === "BETRAYAL") {
   if (!p.matchCount && !expiring && !premium) return match(leadId, { tagPartnerId: foil });
   if (p.angleCount === 1 && !expiring && !weakReaction)
    return angle("CONFRONTATION", "SEND_WARNING", [leadId], [foil!]);
   if (waitingForPremium) return null;
   return (p.lastWinnerSide === "B" || (p.lastCrowd ?? 0) >= 67) && !weakReaction ?
    angle("ATTACK", "HUMILIATE_TARGET", [leadId], [foil!], "BETRAYAL") :
    angle("INTERVIEW", "BUILD_CHARACTER", [leadId, foil!], [], "FINAL_CHAPTER");
  }
  if (p.angleCount === 1 && !expiring)
   return p.format === "FACTION" ? angle("INTERRUPTION", "ASSERT_DOMINANCE", [leadId], cast.slice(1)) :
    angle("CHALLENGE", "PROVE_POINT", [leadId], [foil!]);
  if (waitingForPremium) return null;
  if (p.format === "RELATIONSHIP")
   return match(leadId, { payoff: "DECISIVE_MATCH" });
  return angle("CONFRONTATION", "BUILD_RIVALRY", [leadId], cast.slice(1), "FINAL_CONFRONTATION");
 }
 if (!foil) return null;
 if (p.angleCount === 1 && !expiring) {
  return angle(p.championshipId ? "CHALLENGE" : "CONFRONTATION",
   p.championshipId ? "TARGET_CHAMPIONSHIP" : blueprint === "JEALOUSY" ? "SEEK_REVENGE" : "SET_UP_MATCH",
   [leadId], [foil]);
 }
 if (waitingForPremium) {
  if (!p.matchCount && !p.championshipId && !weakReaction && !earnedWin &&
   input.nextPremium! - week >= 2) return match(leadId, { support: true });
  if (p.angleCount === 2 && input.nextPremium! === week + 1)
   return angle("VIDEO_PACKAGE", "BUILD_ANTICIPATION", [leadId], [foil]);
  return null;
 }
 if (p.sideA.length === 2 && p.sideB.length === 2)
  return match(leadId, { tagPartnerId: p.sideA[1], opposingTag: [p.sideB[0]!, p.sideB[1]!], payoff: "DECISIVE_MATCH" });
 // A protected result earns a rematch only once. A stoppage also gives the
 // opponents a reason to return when both are medically available again.
 if (blueprint === "JEALOUSY" && !p.matchCount && !premium && !expiring && !weakReaction &&
  input.strategy.identity !== "WORKRATE" && !input.strategy.cautious)
  return match(foil, { opponentId: foil, protected: true });
 const inconclusive = p.lastFinish === "PROTECTED_FINISH" || p.lastFinish === "INJURY_STOPPAGE" ||
  p.lastFinish === "DISQUALIFICATION";
 if (p.lastWeek !== null && inconclusive && week - p.lastWeek < 2 && p.angleCount < 3 && !premium && !expiring)
  return angle("CONFRONTATION", "SEEK_REVENGE", [leadId], [foil]);
 const challengerOver = !p.championshipId || (premium && roster.get(leadId)!.momentum >= roster.get(foil)!.momentum + 4);
 return match(challengerOver ? leadId : foil, { opponentId: foil,
  payoff: p.championshipId ? "TITLE_SHOWDOWN" : "DECISIVE_MATCH" });
}

export function bookAiProgrammeAngle(beat: Extract<AiProgrammeBeat, { kind: "ANGLE" }>,
 available: ReadonlyMap<string, AiRosterCandidate>, position: number): AiProgrammeAngle | null {
 const cast = [...beat.angle.actorIds, ...beat.angle.targetIds].map(id => available.get(id));
 if (cast.some(p => !p)) return null;
 const payload = buildBookedSegmentPayload({ ...beat.angle, position },
  cast.map(p => ({ personId: p!.personId, contractId: p!.contractId })));
 return { payload, programmeId: beat.programme.programmeId, payoff: beat.payoff };
}
