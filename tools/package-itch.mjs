import { createHash } from 'node:crypto'
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, join, relative, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { isBrowserReleasePath, isPublicSourcePath, lameArchiveName, lameSourceSha256, requiredNotices, sourceEntries } from './release-policy.mjs'

const projectRoot = resolve(import.meta.dirname, '..')
const packageJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'))
const version = packageJson.version
const distDir = join(projectRoot, 'dist')
const releaseDir = join(projectRoot, 'release', 'itch')
const buildDir = join(releaseDir, 'build')
const htmlStage = join(buildDir, 'html')
const sourceBuildRoot = join(buildDir, 'source')
const sourceFolderName = `loopsmith-${version}-source`
const sourceStage = join(sourceBuildRoot, sourceFolderName)
const htmlArchive = join(releaseDir, `loopsmith-${version}-html.zip`)
const sourceArchive = join(releaseDir, `${sourceFolderName}.zip`)
const lameArchive = join(releaseDir, lameArchiveName)
const lameSourceUrl = 'https://github.com/shijinyu/lamejs/archive/1fb0ef5fa177413107e2e107d054a9b994e3f79c.zip'

function sha256(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex')
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options })
  if (result.status !== 0) throw new Error(`${command} exited with status ${result.status}`)
}

function walkFiles(root) {
  const files = []
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const filePath = join(directory, entry.name)
      if (entry.isDirectory()) visit(filePath)
      else files.push(filePath)
    }
  }
  visit(root)
  return files
}

function copySourceEntry(entry) {
  const source = join(projectRoot, entry)
  if (!existsSync(source)) throw new Error(`Required source entry is missing: ${entry}`)
  const destination = join(sourceStage, entry)
  mkdirSync(resolve(destination, '..'), { recursive: true })
  cpSync(source, destination, {
    recursive: true,
    filter: (filePath) => {
      const pathFromRoot = relative(projectRoot, filePath).replaceAll('\\', '/')
      if (!isPublicSourcePath(pathFromRoot)) return false
      if (lstatSync(filePath).isSymbolicLink()) throw new Error(`Source symlink is not permitted: ${pathFromRoot}`)
      return true
    },
  })
}

async function ensureLameSource() {
  if (existsSync(lameArchive) && sha256(lameArchive) === lameSourceSha256) return
  console.log(`Downloading corresponding lamejs source from ${lameSourceUrl}`)
  const response = await fetch(lameSourceUrl)
  if (!response.ok) throw new Error(`Unable to download lamejs source: HTTP ${response.status}`)
  writeFileSync(lameArchive, Buffer.from(await response.arrayBuffer()))
  const actualHash = sha256(lameArchive)
  if (actualHash !== lameSourceSha256) {
    rmSync(lameArchive, { force: true })
    throw new Error(`lamejs source checksum mismatch: expected ${lameSourceSha256}, got ${actualHash}`)
  }
}

function validateHtmlBuild() {
  const files = walkFiles(htmlStage)
  const totalBytes = files.reduce((total, filePath) => total + statSync(filePath).size, 0)
  const largestBytes = Math.max(...files.map((filePath) => statSync(filePath).size))
  const longestPath = Math.max(...files.map((filePath) => relative(htmlStage, filePath).length))
  if (!existsSync(join(htmlStage, 'index.html'))) throw new Error('HTML archive must contain index.html at its root')
  if (files.length > 1000) throw new Error(`HTML archive has ${files.length} files; itch.io permits 1000`)
  if (totalBytes > 500 * 1024 * 1024) throw new Error('HTML archive exceeds itch.io 500 MB extracted limit')
  if (largestBytes > 200 * 1024 * 1024) throw new Error('HTML archive has a file exceeding itch.io 200 MB limit')
  if (longestPath > 240) throw new Error('HTML archive has a path exceeding itch.io 240 character limit')
  if (files.some((filePath) => filePath.endsWith('.map'))) throw new Error('Itch build unexpectedly contains source maps')
  for (const filePath of files) {
    const path = relative(htmlStage, filePath).replaceAll('\\', '/')
    if (!isBrowserReleasePath(path)) throw new Error(`Unexpected browser release file: ${path}`)
  }

  const indexHtml = readFileSync(join(htmlStage, 'index.html'), 'utf8')
  if (/(?:src|href)=["']\//.test(indexHtml)) throw new Error('index.html contains root-absolute asset references')
  for (const required of requiredNotices) {
    if (!existsSync(join(htmlStage, required))) throw new Error(`HTML archive is missing ${required}`)
  }
  return { fileCount: files.length, totalBytes, largestBytes, longestPath }
}

if (!existsSync(join(distDir, 'index.html'))) throw new Error('dist/index.html is missing; run npm run build:itch first')
const corePackage = JSON.parse(readFileSync(join(projectRoot, 'packages/core/package.json'), 'utf8'))
if (corePackage.version !== version) throw new Error('Application and core package versions differ')
const revision = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: projectRoot, encoding: 'utf8' })
const metadata = { name: packageJson.name, version, commit: revision.status === 0 ? revision.stdout.trim() : null }
mkdirSync(releaseDir, { recursive: true })
rmSync(buildDir, { recursive: true, force: true })
rmSync(htmlArchive, { force: true })
rmSync(sourceArchive, { force: true })
mkdirSync(htmlStage, { recursive: true })
mkdirSync(sourceStage, { recursive: true })

cpSync(distDir, htmlStage, { recursive: true })
rmSync(join(htmlStage, 'healthz'), { force: true })
writeFileSync(join(htmlStage, 'RELEASE.json'), `${JSON.stringify(metadata, null, 2)}\n`)
const htmlStats = validateHtmlBuild()

await ensureLameSource()

for (const entry of sourceEntries) copySourceEntry(entry)
writeFileSync(join(sourceStage, 'RELEASE.json'), `${JSON.stringify(metadata, null, 2)}\n`)
mkdirSync(join(sourceStage, 'third-party-source'), { recursive: true })
cpSync(lameArchive, join(sourceStage, 'third-party-source', lameArchiveName))

const manifestFiles = walkFiles(sourceStage).sort()
const manifest = manifestFiles
  .map((filePath) => `${sha256(filePath)}  ${relative(sourceStage, filePath).replaceAll('\\', '/')}`)
  .join('\n')
writeFileSync(join(sourceStage, 'SOURCE_MANIFEST.sha256'), `${manifest}\n`)

run('zip', ['-q', '-r', htmlArchive, '.'], { cwd: htmlStage })
run('zip', ['-q', '-r', sourceArchive, sourceFolderName], { cwd: sourceBuildRoot })

const artifacts = [htmlArchive, sourceArchive, lameArchive]
const sums = artifacts.map((filePath) => `${sha256(filePath)}  ${basename(filePath)}`).join('\n')
writeFileSync(join(releaseDir, 'SHA256SUMS'), `${sums}\n`)

console.log(`Prepared LoopSmith ${version} itch.io release:`)
console.log(`- HTML: ${relative(projectRoot, htmlArchive)} (${htmlStats.fileCount} files, ${htmlStats.totalBytes} bytes extracted)`)
console.log(`- Source: ${relative(projectRoot, sourceArchive)}`)
console.log(`- LGPL source: ${relative(projectRoot, lameArchive)}`)
console.log(`- Checksums: ${relative(projectRoot, join(releaseDir, 'SHA256SUMS'))}`)
