# GitHub release checklist

Public repository: `bb82dabn/loopsmith`. Application and core version: `1.0.0`.

1. Prepare a reviewed clean public snapshot without `.sable`, `.slice`, private history, raw corpus MIDI, dependencies, build output, or temporary transfer helpers. Preserve the original development checkout.
2. Run the package policy tests, dependency audit, typecheck, lint, unit suite, production browser suite, and a Gitleaks scan of both public source and release contents. Review CodeQL findings; do not publish with unresolved release blockers.
3. Commit the complete reviewed source. From that exact clean commit run `npm run package:itch` and `npm run verify:release -- --publish`. `RELEASE.json` in both archives records the source commit (or null for uncommitted development builds). The publication check requires archives matching HEAD and a clean checkout.
4. Extract both ZIPs into fresh directories. Prove the source installs/builds and run the nested-path browser suite against the extracted HTML directory:

   ```sh
   ITCH_BUILD_DIR=/absolute/path/to/extracted/html npm run test:itch
   ```

5. Push source to GitHub and wait for CI and CodeQL. Enable private vulnerability reporting. Create `v1.0.0` at the tested commit and a draft release titled `LoopSmith v1.0.0`.
6. Attach `loopsmith-1.0.0-html.zip`, `loopsmith-1.0.0-source.zip`, `lamejs-1.2.7-source-1fb0ef5f.zip`, and `SHA256SUMS` from `release/itch`. Download from GitHub and verify checksums before publishing the draft.
7. Release notes must record actual verification results, requirements, licensing/source links, and MP3/mobile limitations. Do not silently replace published stable assets or retarget the tag; use a corrective patch release.

The packaging command still uses the historical `package:itch` name but produces portable nested-path browser assets suitable for GitHub downloads. This release does not upload to itch.io, publish npm packages, enable GitHub Pages, or restart the production service.

See [third-party requirements and encoder replacement](../THIRD_PARTY_NOTICES.md) and [itch.io-specific settings](itch/README.md).
