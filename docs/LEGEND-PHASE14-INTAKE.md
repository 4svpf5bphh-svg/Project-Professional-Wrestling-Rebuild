# Phase 14 — source-backed Legends artwork intake (DRAFT)

This phase builds on **Phase 13 draft PR #23**, not on Production. No newly
approved Legend is active merely because an image is present. The existing
48 active Legends and their cards are unchanged.

## Intake reconciliation

The owner supplied 104 sources across archived batches (81) plus 23 subsequent
images. [The exact photo sequence and SHA-256 hashes](../data/owner-legend-photo-intake.json)
preserve its provenance, image dimensions and preliminary checklist mapping.
The original 106-row checklist intentionally retains its excluded Tiger Mask I
and Big Daddy entries; both remain excluded. Terry Funk was uploaded last,
and the Fabulous Freebirds group plus three member photos were appended after
the other teams. This explains the earlier Stan Lane positional discrepancy.

Each mapping is marked **POSITION_MAPPED_OWNER_LIKENESS_REVIEW_PENDING**:
a checklist order is not independent proof of a photographed person's identity.
There are 21 files below 500 pixels on at least one axis; review the crops
before use. The owner-provided photo originals are not hosted on GitHub yet.

## Render output and validation

The offline source-preserving render pass produced **81 new 960 × 1440 WebP
cards** (70 singles / 11 team photographs) and **93 new 480 × 624 portraits**
(70 singles / 23 individual team members), reusing each card image for both
Vault and unlock reveals. The draft pack is staged separately from GitHub
and must not be treated as shipped assets.

From a checkout, validate its files using:

`python3 scripts/verify_owner_legend_pack.py /path/to/PPW_Legends_81_Cards_93_Portraits_DRAFT.zip`

Run again with `--install` only on a private development checkout to place
verified draft files under `apps/web/public/assets/legends/`. This action
does **not** activate the Legends catalogue.

Before final integration: inspect all 21 low-resolution images, confirm photo
subject assignments with the owner, check rights/attributions and in-browser
cropping, populate unique prime-era wrestler biographies/moves and staged
challenge clues, enforce the existing 1-per-3-certified-weeks release rule,
test the album and market/free-agent path, then obtain explicit release approval.

**No new cron, second World deadline, AI-generated lookalike, automatic contract
grant, live World mutation or unsanctioned deployment.**

## Visual consistency checkpoint — 28 October 2026

**The original 48 delivered PPW Legends images are the design reference, not a new
style direction.** The 81 source-photo card drafts have now been rebuilt with the
original 960×1440 frame coordinates (dark triple border, separate header, photo
window, rarity colours, serif wrestler nameplate) from the historic
`scripts/build_curated_legend_cards.py` renderer.

**Mandatory badge correction (owner-approved):** rarity labels MUST appear in
a separate footer band immediately **below the photo and above the nameplate**,
never at the top-right of the photograph and never over wrestlers' faces.
The exact geometry and palette are recorded in
`data/legend-card-layout-contract.json`, with a pure contract regression test.
The private ZIP's `data/owner-legend-render-manifest.json` must declare
`LEGACY_48_FRAME_SEPARATE_RARITY_BADGE_V1` and matching coordinates.
`scripts/verify_owner_legend_pack.py` refuses older overlays or any pack with
a badge overlapping the photograph. Team photos share the same protected image
window, with individual team-member portraits still separate.

The prior 81-card draft with badges inside the photo window is **superseded**;
do not promote it or silently reuse it. The corrected artwork ZIP remains a
private review artifact, NOT a GitHub binary upload nor a live asset deployment.
Existing 48 in-game image files are unchanged; any exceptional art treatment
such as The Undertaker pilot is preserved until a separately approved review.

A mandatory final human review of source-to-name identity, small photo crops,
portrait visibility, image ownership/licences, team composition, in-game
mobile rendering, and all 129 unlock/reveal/album records still applies.
