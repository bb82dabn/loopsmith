# LoopSmith

LoopSmith is a browser-based procedural composer for original, seamless video-game background music. It builds deterministic, 30-to-120-second arrangements from MIDI-style note data, renders them with a compact synthesized console-inspired palette, and exports editable projects, standard MIDI, reference WAV, synchronized WAV stem bundles, and game-ready MP3.

No melodies, arrangements, samples, or sound assets from existing games are included. Every composition is generated from the selected settings and seed.

[Live application](https://loopsmith.thebrianbouchard.com) · [GitHub releases](https://github.com/bb82dabn/loopsmith/releases) · [Support](SUPPORT.md) · [Contributing](CONTRIBUTING.md)

## Download and run

The GitHub release includes a ready-to-serve browser ZIP, corresponding application source, the LGPL MP3 encoder source, and `SHA256SUMS`. Download all three archives to retain the corresponding sources and verify them with `sha256sum -c SHA256SUMS` (or an equivalent SHA-256 tool).

Extract `loopsmith-1.0.0-html.zip` into an empty directory and serve it over HTTP. For example, with Python 3 installed:

```sh
python3 -m http.server 8080 --bind 127.0.0.1 --directory /path/to/extracted/html
```

Open `http://127.0.0.1:8080`. Do not open `index.html` directly with a `file://` URL: browser modules and workers require HTTP serving. The bundle also supports hosting under a subdirectory. Audio stays in your browser; the static server does not receive compositions or exports.

## Completed features

- Ten scene presets: peaceful village, forest exploration, dungeon tension, battle, boss fight, mystery, victory, melancholy, retro platformer, and science-fiction menu.
- Corpus-informed melodic, rhythmic, harmonic-motion, density, and arrangement priors derived from 25 attributed open-source MIDI works without retaining source sequences.
- Controls for style, mood, tempo, target duration, key, scale, intensity, instrumentation, complexity, seed, and numbered variation.
- Deterministic seeded generation: identical settings, seed, variation, and target duration produce identical note data.
- Selectable 30-to-120-second targets rounded to complete four-measure phrases, with a 12-measure minimum and a four-part Theme / Development / Contrast / Return structure.
- Complete arrangements with drums, bass, harmony, melody, countermelody, and complexity-dependent arpeggios.
- Motif repetition and development, section-level transformations, harmonic progressions, fills, velocity variation, note-range enforcement, and practical polyphony limits.
- Dedicated MIDI channels, General MIDI program changes, tempo, 4/4 time signature, key signature, volume and pan controllers, note duration/velocity, and an exact loop-end All Notes Off event.
- Original synthesized noise percussion, triangle and pulse basses, square and pulse leads, bells, mallets, sampled-style strings and brass, and a warm pad.
- Background workers for composition, offline audio rendering, WAV stem bundle creation, and MP3 encoding.
- Exact `AudioBufferSourceNode` loop points with clipped note tails, circular short ambience, and a transparent 6 ms squared-sine seam treatment.
- Play, pause, stop, seek, loop, master volume, mixer mute/solo, track volume/pan, instrument, octave, lock, duplicate, duplicate removal, and per-layer regeneration controls.
- Piano-roll timeline with pointer selection, one-shot note audition, keyboard note navigation, per-note timing, duration, base MIDI pitch, and velocity editing, arrangement sections, progress feedback, and responsive layouts.
- Add/delete note controls, editable `.loopsmith.json` project files, browser autosave, undo/redo for every discrete note edit, and same-seed variations.
- Standard MIDI, 16-bit stereo WAV, synchronized WAV stem ZIP bundles, and 96/128/192 kbps MP3 exports.
- MP3 guard samples, encoder delay/padding metadata (`iTunSMPB`, `LOOPSTART`, and `LOOPLENGTH`), and mandatory browser decode/seam verification before download.

## Requirements

- Node.js 22.12 or newer; Node.js 24 LTS is recommended for development and releases
- npm 10 or newer
- A current Chrome, Edge, Firefox, or Safari release with Web Audio, Web Workers, Blob downloads, and MP3 decoding

Audio generation and exports are local to the browser. LoopSmith has no application server, database, account, analytics, or secret configuration.

The deterministic composer and PCM renderer are also exposed as the local, private `@loopsmith/core` package in `packages/core`. This package is not published to npm. Consumers can use it at build time; no LoopSmith HTTP service is required during gameplay.

## Setup

```sh
git clone https://github.com/bb82dabn/loopsmith.git
cd loopsmith
npm ci
npm run dev
```

Open the URL printed by Vite. To validate and run the production build locally:

```sh
npm run build
PORT=4173 HOST=127.0.0.1 npm run serve
curl -fsS http://127.0.0.1:4173/healthz
```

The dependency lockfile is committed; use `npm ci` in CI or repeatable deployments.

## Controls

1. Choose a scene preset, then adjust the musical controls if needed. Preset selection and randomization restore the default 60-second target.
2. Select a **Target duration** from 30 to 120 seconds, enter a seed, and choose **Generate composition**. The preview shows the exact measure count and duration after rounding to complete four-measure phrases.
3. Click a piano-roll note to select, seek to its start, and audition a bounded one-shot preview using the layer's current voice, volume, pan, octave, pitch, and velocity. **Previous note** and **Next note** also select, seek, and audition; **Audition selected note** replays the selection without moving the playhead. Click empty timeline space to clear the selection and seek without auditioning.
4. Use **Add note** at the grid-snapped playhead or **Delete note** for the selected event. Each completed edit is undoable, autosaved, rerendered, and included in project, MIDI, WAV, and MP3 output.
5. Use **M** and **S** for mute and solo. Adjust each layer’s volume, pan, voice, and playback/export octave. Inspector pitches remain stored in base MIDI coordinates, while the displayed sounding name includes the octave setting.
6. Lock layers that must survive regeneration. Full or per-layer regeneration replaces manual edits on unlocked layers under the existing regeneration rules; locking preserves edited notes. Duplicate creates an independently mixed copy. Generated base layers are protected, while duplicated layers can be removed without confirmation because removal participates in undo/redo, autosave, audio rerendering, and every export.
7. **Variation N** increments the variation while preserving the seed and musical identity.
8. Export MP3 for normal game use, WAV for exact loop diagnosis, **WAV stems** for adaptive playback, MIDI for another sequencer, or a LoopSmith project to continue editing later. MP3 and WAV stem jobs are mutually exclusive to limit peak memory use, and either job can be cancelled from the delivery panel without allowing a delayed worker response to download a stale file.

All controls are keyboard reachable. Reduced-motion preferences are respected. Low-level browser or encoder failures are reported in the delivery panel rather than silently producing a file.

## Architecture

| Area | Files | Responsibility |
| --- | --- | --- |
| Music model and theory | `src/music/types.ts`, `theory.ts`, `noteEditing.ts`, `instruments.ts` | Project schema, scales, immutable constrained note editing, pitch conversion, note ranges, instrument metadata |
| Corpus learning | `tools/analyze-midi-corpus.mjs`, `corpus/*`, `src/music/corpus-priors.ts` | Licensed source ledger, offline aggregate feature extraction, sequence-free runtime priors |
| Deterministic composition | `src/music/prng.ts`, `generator.ts`, `presets.ts` | Seeded random source, rhythm, harmony, bass, motifs, counterpoint, arrangement, duration |
| MIDI | `src/music/midi.ts` | Standard MIDI File serialization through `@tonejs/midi` |
| Validation and persistence | `src/music/validation.ts`, `persistence.ts` | Strict settings/save-data validation, project files, local autosave |
| Synthesis and loops | `src/audio/synthesis.ts`, `loop.ts`, `engine.ts` | Offline PCM synthesis, circular ambience, seam treatment/measurement, Web Audio transport |
| Audio formats | `src/audio/wav.ts`, `stems.ts`, `mp3.ts`, `verify.ts` | WAV output, deterministic ZIP stem bundles and manifests, LAME MP3 encoding, delay compensation, gapless tags, decoded seam verification |
| Background work | `src/workers/*.worker.ts` | Composition, PCM rendering, stem packaging, and encoding away from the UI thread |
| Interface | `src/App.tsx`, `src/ui/*`, `src/styles.css` | Generator, timeline, transport, mixer, delivery state, undo/redo |
| Production serving | `server.mjs`, `deploy/*` | Dependency-free static server, security/cache headers, health endpoint, user systemd/NPM configuration |
| Reusable core | `src/core.ts`, `packages/core/*` | Buildable package facade for deterministic composition, theory constants, settings types, and PCM rendering |

The composition is the source of truth. Manual note edits and duplicate-layer removal commit through composition history, trigger a fresh PCM render and autosave, and retain the project schema version. Routine preview, WAV, and MP3 rendering streams one synthesized track at a time into a single mix buffer, so retained intermediate PCM does not grow with the layer count. Explicit WAV stem export uses the same synthesis, ordered summing, normalization, and loop-processing rules, but necessarily retains per-layer PCM while creating the synchronized bundle. MIDI and project exports serialize the same edited note data, settings, track channels, and mixer state.

## Export formats and loop behavior

### MIDI

Type-1 Standard MIDI with one track/channel per musical layer where practical. Channel 10 is reserved for percussion. Program changes use close General MIDI analogues; a DAW or game engine may substitute its own instruments.

### WAV

Stereo 44.1 kHz, signed 16-bit PCM with the exact rendered sample count. WAV is the authoritative file for inspecting sample-accurate loop boundaries.

### WAV stem bundle

A single `-stems.zip` download contains `full-mix.wav`, one stereo 16-bit WAV for every track audible under the current mute/solo state, and `manifest.json`. Every file has the same sample rate, frame count, and loop boundaries. Stems preserve each included layer's volume, pan, octave, and voice, use one normalization factor derived from their combined signal, and are sample-aligned for adaptive playback. Summing decoded stems reconstructs the decoded reference mix within the manifest's documented 16-bit quantization tolerance (`0.0006`). The manifest records included and excluded track IDs plus every track's mixer settings.

### MP3

Stereo 44.1 kHz at 96, 128, or 192 kbps. LoopSmith wraps source samples around the LAME encoder delay, pads to whole MP3 frames, writes gapless/loop metadata, decodes the completed file with the browser, and rejects the export if measured discontinuity exceeds the configured threshold.

MP3 is frame-based and not universally gapless. Some game engines ignore LAME/iTunes delay metadata or ID3 loop points, and HTTP players may insert their own buffering transition. For best results:

1. Use an engine that honors gapless metadata or explicit `LOOPSTART=0` / `LOOPLENGTH` sample metadata.
2. Do not add silence or normalize the file in another encoder after export.
3. Verify the target engine on every platform.
4. Use WAV when sample-exact looping is mandatory, or transcode WAV to an engine-native lossless/streaming format with explicit loop points.

The in-app loop is sample exact and does not depend on MP3 framing.

## Testing

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
npm run build:itch
npm run test:itch
npm run test:package
npm run package:itch
npm run verify:release
```

The Vitest suite covers seeded determinism, distinct/repeatable variations, 30-to-120-second targets rounded to complete four-measure phrases, immutable note add/update/delete constraints, guarded duplicate-layer removal, collision-free duplicate IDs, edited-project round-trips, note ranges, note-end bounds, polyphony, locked layers, parseable MIDI metadata, malformed saves, corpus-model sequence exclusion, phrase/bar variety, MP3 delay/frame compensation, PCM seam continuity, deterministic stem archives, safe unique filenames, mute/solo filtering, sample alignment, manifest metadata, quantized stem reconstruction, exact preview/stem reference-mix parity, maximum-duration 16-layer mix-only orchestration, and deterministic bounded stereo note previews for melodic and percussion voices. The automated audio tests render a real arrangement and fail when end-to-start discontinuity exceeds the threshold, while the maximum-duration case verifies finite deterministic PCM and complete render progress without invoking stem rendering.

Playwright runs production code in Chrome. It verifies pointer and keyboard-reachable note audition without transport or history changes, keyboard note creation, navigation, field commits, deletion, duplicate-layer removal, rerendering, undo/redo, mobile overflow, duration selection, phrase-aligned renders, playback, mixer changes, and standard MIDI download and unattended WAV stem bundle creation with archive inspection. It also verifies that MP3 and WAV stem jobs cannot run concurrently, cancellation restores both controls, and delayed worker responses after cancellation produce no stale download or success status. It generates peaceful-village, dungeon-tension, and retro-platformer tracks with distinct seeds. Each browser audit renders, encodes, decodes, seam-verifies, and downloads a 96 kbps MP3; the unit suite separately parses and inspects the MIDI data.

The itch.io browser test serves the production bundle from a nested CDN-style path and verifies relative assets, all four workers, corpus attribution, MIDI/WAV/MP3/project downloads, and the 1000 × 720 release viewport.

## itch.io release

```sh
npm run media:itch
npm run package:itch
```

Release metadata and upload settings are in [`release/itch/README.md`](release/itch/README.md), with page copy in [`release/itch/listing.md`](release/itch/listing.md). Packaging creates the browser ZIP, LoopSmith source ZIP, exact LGPL encoder source archive, and checksums under `release/itch/`. The HTML build uses relative URLs so it can run from itch.io's nested CDN path.

## Production deployment

The example deployment uses a persistent user service and the dependency-free Node static server. Adapt the checkout and Node paths in `deploy/loopsmith.service` to your installation:

```sh
npm ci
npm run build
mkdir -p ~/.config/systemd/user
ln -sfn "$PWD/deploy/loopsmith.service" ~/.config/systemd/user/loopsmith.service
systemctl --user daemon-reload
systemctl --user enable --now loopsmith.service
systemctl --user status loopsmith.service --no-pager
curl -fsS http://127.0.0.1:4173/healthz
```

User lingering must be enabled so the service survives logout. The current Nginx Proxy Manager values and HTTPS verification commands are in [`deploy/nginx-proxy-manager.md`](deploy/nginx-proxy-manager.md). Do not report deployment complete until both the origin and `https://loopsmith.thebrianbouchard.com/healthz` return `200 ok`.

## Licensing

LoopSmith application source is available under the [MIT License](LICENSE).

### Sound assets and generated music

There are **no bundled audio samples or third-party sound assets**. All voices are generated at runtime from mathematical oscillators and deterministic noise implemented in `src/audio/synthesis.ts`. The preset names describe generic game situations, not existing properties. Generated compositions are original procedural output; users are responsible for reviewing output before commercial release.

### Training corpus

The initial sequence-free aggregate model was derived from the 25 MIDI files in **Generic 8-bit JRPG Soundtrack** by **AVGVSTA**, sourced from [OpenGameArt](https://opengameart.org/content/generic-8-bit-jrpg-soundtrack) under the selected [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/) option. Full methodology and attribution are in [`corpus/`](corpus/), and the deployed application publishes `CORPUS_ATTRIBUTION.txt`.

Source MIDI is not committed or shipped. The offline analyzer keeps weighted histograms and corpus-level probabilities only; it expressly omits source note sequences, chord sequences, and rhythm templates. Runtime generation combines those priors with a seed, original section forms, reharmonization, voice-leading, chord-tone targeting, motif development, call-and-response, and loop constraints.

### Direct runtime dependencies

| Dependency | License | Use |
| --- | --- | --- |
| React / React DOM | MIT | User interface |
| Lucide React | ISC | Interface icons |
| `@tonejs/midi` | MIT | Standard MIDI parsing/serialization |
| `@breezystack/lamejs` | LGPL-3.0 | Browser MP3 encoding; unmodified library bundled into the encoder worker |
| `fflate` | MIT | Deterministic browser ZIP creation for WAV stem bundles |

### Direct development dependencies

| Dependency | License |
| --- | --- |
| TypeScript | Apache-2.0 |
| Vite and `@vitejs/plugin-react` | MIT |
| Vitest | MIT |
| Playwright Test | Apache-2.0 |
| ESLint, `@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, and `globals` | MIT |
| `@types/react` and `@types/react-dom` | MIT |

Exact resolved versions are recorded in `package-lock.json`; runtime notices are included in `public/THIRD_PARTY_NOTICES.txt`. The browser release includes GPL/LGPL license texts, and the application source archive includes exact corresponding encoder source. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for source provenance, redistribution requirements, and instructions for rebuilding with a modified encoder.
