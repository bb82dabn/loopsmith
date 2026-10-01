# Changelog

## 1.0.0

First public LoopSmith release under the MIT License.

- Deterministic procedural game-music composition with ten scene presets, seed/variation controls, and phrase-aligned 30–120-second duration targets.
- Original synthesized voices, loop-aware stereo PCM rendering, transport controls, and a per-layer mixer.
- Piano-roll note audition and editing, layer locking/regeneration/duplication/removal, undo/redo, autosave, and editable project files.
- Standard MIDI, stereo WAV, sample-aligned WAV stem ZIP, and browser-verified MP3 exports.
- Background workers with progress and cancellation for expensive composition/export operations.
- Sequence-free corpus priors with preserved CC BY attribution; no source MIDI or sampled game audio is distributed.
- Local reusable `@loopsmith/core` composer/renderer package, static deployment support, and nested-path browser packaging.
- Public CI, CodeQL, community documentation, corresponding encoder source, license texts, and archive verification.
- Validated generator dispatch rejects unsupported/prototype-named roles during duplicated-track regeneration, with deterministic coverage for all six supported roles.

MP3 playback is not universally gapless. Use WAV when sample-exact looping is required and test exports in the target game engine. Real iOS/Android support has not been certified.
