import test from "node:test";
import assert from "node:assert/strict";
import { planAiProgrammeBeat, type AiProgramme } from "../src/domain/ai-programmes.js";
import { chooseAiWorldCard, type AiRosterCandidate } from "../src/domain/ai-world-card.js";

const roster: AiRosterCandidate[] = Array.from({ length: 10 }, (_, i) => ({
 personId: "w" + i, contractId: "c" + i, bookingDivision: "MEN", weeklyCapacity: 2,
 momentum: 65 + i, popularity: 55 + i, recognition: 62, presentation: 69, matchCraft: 77,
 contractExpires: 50, remainingDates: 10,
}));
const strategy = { identity: "WORKRATE", focus: "PAY_OFF_RIVALRIES" } as const;
const title = { championshipId: "belt", holderId: "w1", bookingDivision: "MEN" as const };
const rivalry: AiProgramme = {
 programmeId: "story", format: "RIVALRY", sideA: ["w0"], sideB: ["w1"], championshipId: "belt",
 intent: { blueprintId: "TITLE_CHASE", motivation: "Earn a title shot", audienceGoal: "Anticipation", destination: "Premium show" },
 started: 1, angleCount: 1, matchCount: 0, lastWeek: 1, lastCrowd: 76, lastFinish: null, lastWinnerSide: null,
};
const result = { id: "w0", format: "SINGLES" as const, weekIndex: 2, won: true,
 opponentStrength: 62, ratingStars: 3.8, titleMatch: false, majorEvent: false };
const card = {
 worldId: "w", worldSeed: "8", year: 1, week: 5, promotionId: "p", showId: "e",
 roster, bookedShows: [], activeVenues: ["v"], eventType: "MAJOR" as const,
 riskTolerance: 35, matchQualityPreference: 90, starPreference: 65, strategy,
};

test("a losing contender must build form and cannot get a premature PPV title shot", () => {
 const first = { programme: rivalry, roster, week: 4, title, strategy, nextPremium: 6,
  results: [{ ...result, won: false }] };
 const beat = planAiProgrammeBeat({ ...first, premium: false });
 assert.ok(beat?.kind === "MATCH" && beat.support && !beat.payoff);
 assert.equal(planAiProgrammeBeat({ ...first, premium: true }), null);
 const qualified = { ...first, programme: { ...rivalry, angleCount: 2 }, results: [result] };
 const teaser = planAiProgrammeBeat({ ...qualified, premium: false, week: 5 });
 assert.ok(teaser?.kind === "ANGLE" && teaser.angle.kind === "VIDEO_PACKAGE");
 const booked = chooseAiWorldCard({
  ...card, creative: planAiProgrammeBeat({ ...qualified, week: 6, premium: true }),
 });
 assert.equal(booked.status, "READY");
 if (booked.status !== "READY") return;
 const main = booked.matches.at(-1)!;
 assert.equal(main.championshipId, "belt");
 assert.equal(main.creativePayoff, "TITLE_SHOWDOWN");
 assert.equal(main.plannedFinish, "SUBMISSION");
});

test("a medical absence suspends the chapter, and a new champion can close the old chase", () => {
 const context = { programme: rivalry, roster, week: 4, title, strategy, nextPremium: 6,
  results: [result], premium: false };
 assert.equal(planAiProgrammeBeat({ ...context, roster: roster.slice(1) }), null);
 const changed = planAiProgrammeBeat({ ...context, title: { ...title, holderId: "w8" } });
 assert.ok(changed?.kind === "ANGLE" && changed.payoff === "FINAL_CHAPTER");
});

test("an established tag rivalry settles through the original two-sided match", () => {
 const programme = { ...rivalry, championshipId: null, sideA: ["w0", "w2"], sideB: ["w1", "w3"],
  angleCount: 2, intent: { ...rivalry.intent, blueprintId: "RESPECT" } };
 const beat = planAiProgrammeBeat({ programme, roster, week: 5, title: undefined, strategy,
  nextPremium: 5, results: [], premium: true });
 const booked = chooseAiWorldCard({ ...card, creative: beat });
 assert.equal(booked.status, "READY");
 if (booked.status !== "READY") return;
 const main = booked.matches.at(-1)!;
 assert.equal(main.matchType, "TAG");
 assert.equal(main.creativePayoff, "DECISIVE_MATCH");
 assert.equal(main.programmeId, "story");
 assert.deepEqual(main.sides?.map(side => side.participants.map(p => p.personId)),
  [["w0", "w2"], ["w1", "w3"]]);
});
