import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { unzipSync } from 'fflate'
import { isBrowserReleasePath, isPublicSourcePath, isSafeArchivePath, lameArchiveName, lameSourceSha256, requiredNotices, sourceEntries } from './release-policy.mjs'

const root = resolve(import.meta.dirname, '..')
const release = join(root, 'release/itch')
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
const htmlName = `loopsmith-${version}-html.zip`
const sourceName = `loopsmith-${version}-source.zip`
const expectedArtifacts = [htmlName, sourceName, lameArchiveName]
const sums = readFileSync(join(release, 'SHA256SUMS'), 'utf8').trim().split('\n')
assert.equal(sums.length, expectedArtifacts.length, 'Unexpected checksums manifest entries')
const verifiedNames = new Set()
for (const line of sums) {
  const match = /^([a-f0-9]{64})  ([A-Za-z0-9._-]+)$/.exec(line)
  assert.ok(match, 'Malformed checksum entry')
  const [, expected, name] = match
  assert.ok(expectedArtifacts.includes(name) && !verifiedNames.has(name), `Unexpected or duplicate checksum: ${name}`)
  assert.equal(hash(readFileSync(join(release, name))), expected, `Checksum mismatch: ${name}`)
  verifiedNames.add(name)
}
assert.equal(hash(readFileSync(join(release, lameArchiveName))), lameSourceSha256, 'Encoder source checksum mismatch')

function archive(name) {
  const entries = unzipSync(readFileSync(join(release, name)))
  for (const path of Object.keys(entries)) {
    assert.ok(isSafeArchivePath(path.endsWith('/') ? path.slice(0, -1) : path), `Unsafe archive entry: ${path}`)
  }
  return Object.fromEntries(Object.entries(entries).filter(([path]) => !path.endsWith('/')))
}

const html = archive(htmlName)
assert.ok(html['index.html'], 'Missing browser entry point')
for (const path of Object.keys(html)) assert.ok(isBrowserReleasePath(path), `Unexpected browser entry: ${path}`)
for (const path of requiredNotices) assert.ok(html[path], `Missing browser notice: ${path}`)
assert.ok(!/(?:src|href)=["']\//.test(Buffer.from(html['index.html']).toString()), 'Root-absolute browser asset')
for (const worker of ['composition', 'render', 'encoder', 'stems']) {
  assert.ok(Object.keys(html).some((path) => path.startsWith(`assets/${worker}.worker-`) && path.endsWith('.js')), `Missing ${worker} worker`)
}

const source = archive(sourceName)
const prefix = `loopsmith-${version}-source/`
assert.ok(Object.keys(source).every((path) => path.startsWith(prefix)), 'Source archive must have one versioned root')
const metadata = JSON.parse(Buffer.from(source[`${prefix}RELEASE.json`]).toString())
assert.deepEqual(JSON.parse(Buffer.from(html['RELEASE.json']).toString()), metadata, 'Source/browser provenance mismatch')
assert.equal(metadata.version, version)
if (process.argv.includes('--publish')) {
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' })
  assert.equal(head.status, 0, 'Publication requires committed source')
  assert.equal(metadata.commit, head.stdout.trim(), 'Archives do not identify the current source commit')
  const status = spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' })
  assert.equal(status.status, 0, 'Unable to check release source status')
  assert.equal(status.stdout.trim(), '', 'Publication requires a clean source checkout')
}
assert.equal(JSON.parse(Buffer.from(source[`${prefix}packages/core/package.json`]).toString()).version, version)
for (const path of Object.keys(source)) assert.ok(isPublicSourcePath(path.slice(prefix.length)), `Private source entry: ${path}`)

function compare(entry) {
  const absolute = join(root, entry)
  const stat = lstatSync(absolute)
  if (!isPublicSourcePath(entry)) return
  assert.ok(!stat.isSymbolicLink(), `Source symlink: ${entry}`)
  if (stat.isDirectory()) {
    for (const child of readdirSync(absolute)) compare(`${entry}/${child}`)
  } else {
    assert.ok(source[`${prefix}${entry}`], `Missing source file: ${entry}`)
    assert.equal(hash(source[`${prefix}${entry}`]), hash(readFileSync(absolute)), `Stale source file: ${entry}`)
  }
}
for (const entry of sourceEntries) compare(entry)
const manifestPath = `${prefix}SOURCE_MANIFEST.sha256`
const manifestLines = Buffer.from(source[manifestPath]).toString().trim().split('\n')
const manifestNames = new Set()
for (const line of manifestLines) {
  const match = /^([a-f0-9]{64})  (.+)$/.exec(line)
  assert.ok(match && isSafeArchivePath(match[2]), 'Invalid source manifest entry')
  const [, expected, path] = match
  assert.ok(!manifestNames.has(path), `Duplicate source manifest entry: ${path}`)
  assert.ok(source[`${prefix}${path}`], `Missing manifest file: ${path}`)
  assert.equal(hash(source[`${prefix}${path}`]), expected, `Source manifest mismatch: ${path}`)
  manifestNames.add(path)
}
assert.equal(manifestNames.size, Object.keys(source).length - 1, 'Source manifest does not cover every source file')
assert.equal(hash(source[`${prefix}third-party-source/${lameArchiveName}`]), lameSourceSha256)
console.log(`Verified LoopSmith ${version}: ${Object.keys(html).length} browser files, ${manifestNames.size} source files, exact encoder source, and all archive checksums (${relative(root, release)}).`)
console.log(`Release commit: ${metadata.commit ?? 'uncommitted source; do not publish until built from a verified commit'}`)
