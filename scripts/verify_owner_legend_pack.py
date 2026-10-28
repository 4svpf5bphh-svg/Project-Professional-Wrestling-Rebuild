#!/usr/bin/env python3
"""Validate the owner-rendered 81-card + 93-portrait WebP draft pack.

Source photos, copyright permission and user-approved visual likeness are
separate gates. --install only copies files locally into a development
checkout; it never activates the 81 new Legends or deploys to Production.
"""
from __future__ import annotations
import argparse
import io
import json
import shutil
import zipfile
from pathlib import Path
from PIL import Image

MANIFEST = Path("data/owner-legend-photo-intake.json")
DESIGN = Path("data/legend-card-layout-contract.json")
RENDER_MANIFEST = "data/owner-legend-render-manifest.json"
ROOT = "apps/web/public/assets/legends/"
def main() -> None:
    cli = argparse.ArgumentParser()
    cli.add_argument("pack", type=Path, help="Private DRAFT WebP pack")
    cli.add_argument("--install", action="store_true",
                     help="After validating all assets, copy to local dev public dir")
    args = cli.parse_args()
    mapping = json.loads(MANIFEST.read_text("utf8"))
    assert mapping["status"] == "INTAKE_COMPLETE_MAPPING_PROVISIONAL_NOT_LIKENESS_VERIFIED"
    design = json.loads(DESIGN.read_text("utf8"))
    assert design["version"] == "LEGACY_48_FRAME_SEPARATE_RARITY_BADGE_V1"
    photo, badge, nameplate = (design[k] for k in ("photo", "badge", "nameplate"))
    assert photo[3] < badge[1] < badge[3] < nameplate[1], "Rarity badge would overlap wrestler photo or nameplate"
    assert design["referenceExistingCardCount"] == 48
    expected = {}
    for row in mapping["positions"]:
        if row["cardAsset"]:
            expected[ROOT + row["cardAsset"].split("/")[-1]] = (960, 1440)
        if row["portraitAsset"]:
            expected[ROOT + row["portraitAsset"].split("/")[-1]] = (480, 624)
    assert len(expected) == 174, f"expected 81 cards + 93 portraits, got {len(expected)}"
    with zipfile.ZipFile(args.pack) as pack:
        items = set(pack.namelist())
        assert RENDER_MANIFEST in items, "No renderer design metadata in artwork pack"
        draft = json.loads(pack.read(RENDER_MANIFEST))
        assert draft["card_design_version"] == design["version"], "Wrong card visual template; rebuild the draft"
        assert draft["card_count"] == 81 and draft["portrait_count"] == 93
        for key in ("photo", "header", "footer", "badge", "nameplate"):
            assert draft["card_layout"][key] == design[key], f"Artwork layout drift: {key}"
        missing = sorted(set(expected) - items)
        assert not missing, f"missing artwork: {missing[:12]}"
        # Exact expected asset names only, preventing hidden ID substitutions.
        assets = {name for name in items if name.startswith(ROOT) and name.endswith(".webp")}
        extras = sorted(assets - set(expected))
        assert not extras, f"unapproved artwork: {extras[:12]}"
        for name, size in expected.items():
            payload = pack.read(name)
            assert len(payload) >= 4096, f"empty/placeholder art: {name}"
            image = Image.open(io.BytesIO(payload))
            assert image.format == "WEBP" and image.size == size, (name, image.size)
            image.verify()
        if args.install:
            for name in sorted(expected):
                destination = Path(name)
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_bytes(pack.read(name))
    print("VERIFIED: 104 photos, 81 cards, 93 portraits, legacy 48-card frame, badge below photo; no live activation.")
    print("WARNING: visual identity, crop review and image/likeness rights remain pending.")
    if args.install:
        print("Installed draft assets locally; run tests before committing/releasing.")

if __name__ == "__main__":
    main()
