# LoopSmith training corpus

LoopSmith does not ship or replay source songs. The offline corpus tool reads licensed MIDI, reduces it to aggregate distributions, and discards source note sequences. Runtime generation samples those broad distributions with the project seed, then applies LoopSmith's own harmony, motif development, voice-leading, range, polyphony, and loop rules.

## Current corpus

The initial training slice contains the 25 MIDI source files from AVGVSTA's **Generic 8-bit JRPG Soundtrack** on OpenGameArt. The page offers CC-BY 4.0, CC-BY 3.0, and OGA-BY 3.0; LoopSmith selects CC-BY 4.0 and records the attribution in `sources.json` and `ATTRIBUTION.md`.

## Rebuilding the aggregate model

Download and extract an approved source archive outside the repository, then run:

```sh
node tools/analyze-midi-corpus.mjs \
  --input /path/to/extracted/midi \
  --source oga-generic-8bit-jrpg \
  --stdout
```

Review the summary, source count, license ledger, and originality checks before updating `src/music/corpus-priors.json`. Never commit source MIDI or a model containing complete note/rhythm sequences. New sources must be added to `sources.json` with author, page, archive, offered licenses, selected license, and exact attribution.

OpenGameArt requests a 10-second crawl delay. Any future catalog crawler must honor `robots.txt`, cache pages, and avoid concurrent requests.
