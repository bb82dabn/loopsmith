import { posix } from 'node:path'

export const sourceEntries = [
  '.github', '.gitignore', 'LICENSE', 'README.md', 'CHANGELOG.md',
  'CONTRIBUTING.md', 'SECURITY.md', 'SUPPORT.md', 'CODE_OF_CONDUCT.md',
  'THIRD_PARTY_NOTICES.md', 'corpus', 'deploy', 'e2e', 'eslint.config.js',
  'index.html', 'package-lock.json', 'package.json', 'packages',
  'playwright.config.ts', 'playwright.itch.config.ts', 'public', 'server.mjs',
  'src', 'tests', 'tools', 'tsconfig.app.json', 'tsconfig.json',
  'tsconfig.node.json', 'vite.config.ts', 'release/README.md',
  'release/itch/README.md', 'release/itch/listing.md',
]

export const lameArchiveName = 'lamejs-1.2.7-source-1fb0ef5f.zip'
export const lameSourceSha256 = 'ef92276e7cc1f8af11b2b332039d95551919df230e6af94a100da8a873c6cdca'
export const requiredNotices = [
  'LICENSE.txt', 'THIRD_PARTY_NOTICES.txt', 'CORPUS_ATTRIBUTION.txt',
  'licenses/GPL-3.0.txt', 'licenses/LGPL-3.0.txt',
]

export function isSafeArchivePath(path) {
  return typeof path === 'string' && path.length > 0 &&
    !path.includes('\\') && !path.includes('\0') && !path.startsWith('/') &&
    !/^[A-Za-z]:/.test(path) &&
    !path.split('/').some((part) => part === '..' || part === '.' || part === '')
}

export function isPublicSourcePath(path) {
  if (!isSafeArchivePath(path)) return false
  const parts = path.split('/')
  if (parts.some((part) => [
    '.git', '.sable', '.slice', '.cache', 'node_modules', 'dist', 'coverage',
    'test-results', 'playwright-report', 'release-transfer',
  ].includes(part))) return false
  if (path === 'corpus/raw' || path.startsWith('corpus/raw/')) return false
  if (path === 'release/itch/build' || path.startsWith('release/itch/build/')) return false
  const name = posix.basename(path)
  return !(/^\.env(?:\.|$)/i.test(name) || /\.(?:mid|midi|local|log|pem|key)$/i.test(name) ||
    name === '.DS_Store' || name === 'publish-temp-release.mjs')
}

export function isBrowserReleasePath(path) {
  if (!isSafeArchivePath(path)) return false
  return requiredNotices.includes(path) ||
    ['index.html', 'favicon.svg', 'loopsmith-logo.webp', 'RELEASE.json'].includes(path) ||
    /^assets\/[A-Za-z0-9._-]+\.(?:js|css|svg|webp|png|woff2?)$/.test(path)
}
