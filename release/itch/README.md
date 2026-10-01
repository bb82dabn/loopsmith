# LoopSmith itch.io release

## Project settings

| Field | Value |
| --- | --- |
| Account/project | `bb82dabn/loopsmith` |
| Title | `LoopSmith` |
| Project URL | `loopsmith` |
| Classification | Tools |
| Kind | HTML |
| Release status | Released |
| Pricing | $0 or donate |
| Suggested donation | $2.00 |
| AI disclosure | Yes |
| Community | Comments |

## Embed settings

- Embed in page at **1000 × 720**.
- Keep automatic start disabled.
- Enable the fullscreen button and scrollbars.
- Keep SharedArrayBuffer disabled.
- Keep Mobile friendly disabled until the release passes real iOS and Android testing.

## Tags

`Music`, `Procedural Generation`, `Game Development`, `Audio`, `Music Production`, `Generator`

## Uploads

Run `npm run package:itch`, then upload:

1. `loopsmith-1.0.0-html.zip` as the browser-playable HTML build.
2. `loopsmith-1.0.0-source.zip` as LoopSmith's corresponding source.
3. `lamejs-1.2.7-source-1fb0ef5f.zip` as the corresponding source for the LGPL MP3 encoder.

Compare all files against `SHA256SUMS` before uploading. Keep the project in Draft until the embedded build and every download have been tested from the itch.io page.

For later Butler updates, push the exact staged browser build:

```sh
butler push release/itch/build/html bb82dabn/loopsmith:html5 --userversion 1.0.0
```
