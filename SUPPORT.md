# Support

Start with [README.md](README.md), especially browser requirements, export formats, and MP3 loop limitations.

For bugs, open a [GitHub issue](https://github.com/bb82dabn/loopsmith/issues). Include:

- LoopSmith version or commit, browser/version, and operating system.
- Exact steps, expected behavior, and actual behavior.
- Preset, settings, seed, variation, and selected duration when relevant.
- A minimal sanitized project or console error if useful. Project files can contain titles and manually edited notes; review before sharing.
- Whether the problem also occurs in a clean browser profile without extensions.

If the browser ZIP does not start, serve it over HTTP rather than `file://`, check that `index.html` is at the served root, and retain the `assets` directory. If MP3 loops poorly in another player, test WAV and check whether the target honors encoder-delay and loop metadata.

For feature requests, describe the game-development workflow and desired outcome. Support is community/maintainer best effort, not a paid service or guaranteed response time. Real iOS and Android behavior has not been certified.

Report vulnerabilities privately using [SECURITY.md](SECURITY.md), not public issues.
