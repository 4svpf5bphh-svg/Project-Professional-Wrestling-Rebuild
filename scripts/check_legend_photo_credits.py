#!/usr/bin/env python3
"""Offline verification: pending photo replacements retain old attribution."""
from pathlib import Path
from tempfile import TemporaryDirectory
from build_curated_legend_cards import sync_card_credits
with TemporaryDirectory() as folder:
 destination=Path(folder)/"credits.ts"
 destination.write_text('export const PHOTO = {\n  "taz": {\n'
 '    "author": "Original",\n    "license": "CC BY 2.0",\n'
 '    "sourcePage": "https://commons.wikimedia.org/wiki/File:Old.jpg",\n'
 '    "tier": "CULT"\n  },\n};\n')
 source=[{"id":"taz","author":"New author","license":"CC BY-SA 2.0",
  "sourcePage":"https://commons.wikimedia.org/wiki/File:New.jpg",
  "artRevision":1,"previousSource":{
    "author":"Original","license":"CC BY 2.0",
    "sourcePage":"https://commons.wikimedia.org/wiki/File:Old.jpg"}}]
 sync_card_credits(source,{},destination)
 assert '"author": "Original"' in destination.read_text()
 assert "New author" not in destination.read_text()
 sync_card_credits(source,{"taz":1},destination)
 assert '"author": "New author"' in destination.read_text()
 assert 'File:New.jpg' in destination.read_text()
 assert '"tier": "CULT"' in destination.read_text()
print("Pending and completed source revision attribution remains truthful.")
