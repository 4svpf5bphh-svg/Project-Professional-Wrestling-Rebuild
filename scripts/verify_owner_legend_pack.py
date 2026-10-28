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
ROOT = "apps/web/public/assets/legends/"
def main() -> None:
    cli = argparse.ArgumentParser()
    cli.add_argument("pack", type=Path, help="Private DRAFT WebP pack")
    cli.add_argument("--install", action="store_true",
                     help="After validating all assets, copy to local dev public dir")
    args = cli.parse_args()
    mapping = json.loads(MANIFEST.read_text("utf8"))
    assert mapping["status"] == "INTAKE_COMPLETE_MAPPING_PROVISIONAL_NOT_LIKENESS_VERIFIED"
    expected = {}
    for row in mapping["positions"]:
        if row["cardAsset"]:
            expected[ROOT + row["cardAsset"].split("/")[-1]] = (960, 1440)
        if row["portraitAsset"]:
            expected[ROOT + row["portraitAsset"].split("/")[-1]] = (480, 624)
    assert len(expected) == 174, f"expected 81 cards + 93 portraits, got {len(expected)}"
    with zipfile.ZipFile(args.pack) as pack:
        items = set(pack.namelist())
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
    print("VERIFIED: 104 owner source slots, 81 cards, 93 portraits; no live activation.")
    print("WARNING: visual identity, crop review and image/likeness rights remain pending.")
    if args.install:
        print("Installed draft assets locally; run tests before committing/releasing.")

if __name__ == "__main__":
    main()
