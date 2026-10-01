import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isBrowserReleasePath, isPublicSourcePath, isSafeArchivePath, sourceEntries, requiredNotices } from '../tools/release-policy.mjs'

test('archive paths reject traversal, absolute paths, Windows paths, and ambiguous segments', () => {
  for (const path of ['', '../secret', 'src/../../secret', '/etc/passwd', 'C:/secret', 'src\\secret', 'src/./file', 'src//file', 'src/\0file']) {
    assert.equal(isSafeArchivePath(path), false, path)
  }
  assert.equal(isSafeArchivePath('src/music/generator.ts'), true)
})

test('public source excludes internal state, credentials, private transfers, raw MIDI, and build output', () => {
  for (const path of ['.git/config', '.sable/MEMORY.md', '.slice/task.json', 'node_modules/react/index.js', 'packages/core/dist/core.js', 'corpus/raw', 'corpus/raw/source.json', 'corpus/tune.MIDI', 'src/.env', 'src/.env.production', 'src/private.key', 'src/local.pem', 'src/settings.local', 'src/debug.log', 'test-results/trace.zip', 'release/itch/build/file', 'tools/publish-temp-release.mjs', 'public/release-transfer/token/index.html']) {
    assert.equal(isPublicSourcePath(path), false, path)
  }
  for (const path of ['.github/workflows/ci.yml', '.gitignore', 'src/music/generator.ts', 'tests/stems.test.ts', 'public/licenses/LGPL-3.0.txt', 'corpus/sources.json']) {
    assert.equal(isPublicSourcePath(path), true, path)
  }
})

test('browser archive is restricted to relative static assets, notices, and release metadata', () => {
  for (const path of ['index.html', 'assets/encoder.worker-Ab12.js', 'assets/index-Ab12.css', 'loopsmith-logo.webp', 'RELEASE.json', ...requiredNotices]) {
    assert.equal(isBrowserReleasePath(path), true, path)
  }
  for (const path of ['release-transfer/token/index.html', 'assets/index.js.map', 'assets/../secret', '.env', 'src/App.tsx', 'healthz']) {
    assert.equal(isBrowserReleasePath(path), false, path)
  }
})

test('source allowlist includes community docs and workflows without internal project history', () => {
  for (const path of ['.github', 'CHANGELOG.md', 'SECURITY.md', 'SUPPORT.md', 'CONTRIBUTING.md', 'CODE_OF_CONDUCT.md', 'THIRD_PARTY_NOTICES.md', 'release/README.md']) {
    assert.ok(sourceEntries.includes(path), path)
  }
  assert.ok(!sourceEntries.includes('.sable'))
  assert.ok(!sourceEntries.includes('.git'))
})
