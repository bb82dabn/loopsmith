# Third-party notices and encoder replacement

LoopSmith application code is MIT licensed. Bundled dependencies retain their licenses; the MIT license does not replace the encoder's LGPL obligations or corpus attribution.

- [Runtime dependency notices](public/THIRD_PARTY_NOTICES.txt)
- [Corpus attribution](corpus/ATTRIBUTION.md) and [published attribution](public/CORPUS_ATTRIBUTION.txt)
- [GNU GPL v3](public/licenses/GPL-3.0.txt)
- [GNU LGPL v3](public/licenses/LGPL-3.0.txt)

## MP3 encoder

MP3 encoding uses `@breezystack/lamejs` 1.2.7, declared LGPL-3.0 by its package metadata. It is bundled into the encoder worker; it is not a separately loaded shared library. The LAME project is acknowledged at <https://lame.sourceforge.io/>. The upstream source archive preserves its original notices, including older license texts present in upstream files.

The exact corresponding source is distributed as `lamejs-1.2.7-source-1fb0ef5f.zip` alongside every browser release and inside the application source archive. Source commit:

`https://github.com/shijinyu/lamejs/tree/1fb0ef5fa177413107e2e107d054a9b994e3f79c`

Archive SHA-256: `ef92276e7cc1f8af11b2b332039d95551919df230e6af94a100da8a873c6cdca`.

LoopSmith permits modification of the encoder portions and reverse engineering for debugging those modifications. Complete application source, build configuration, lockfile, and the encoder source are provided so users can rebuild the combined work with a modified encoder. No signing key or account is needed to run a modified build locally.

### Rebuild with a modified encoder

1. Download and verify the application and encoder source archives from the same release. Extract the application source and run `npm ci` using Node 24.
2. Extract the encoder archive outside the application directory. Keep its `LICENSE`, `COPYING`, and other notices. Modify its source, install its development dependencies with `npm install`, and run `npm run build` there. Inspect the upstream build instructions; upstream dependencies are separate from LoopSmith's lockfile.
3. Replace the installed encoder package's `dist` directory with the rebuilt upstream `dist` directory. Keep the exported `Mp3Encoder` API compatible. For example, from the application root:

   ```sh
   cp -R /path/to/modified-lamejs/dist/. node_modules/@breezystack/lamejs/dist/
   npm run build:itch
   npm run test:itch
   ```

4. Serve the resulting `dist` directory over HTTP. Do not rerun `npm ci` after replacement; it reinstalls the original package. A modified distribution must update its corresponding source, checksums, and notices rather than claim to be the unmodified official release.

Keep the browser bundle, corresponding sources, and license texts available together when redistributing. This document records the distribution mechanism; it is not legal advice or a legal certification.
