import { close, constants, createReadStream, existsSync, fstat, open, readFileSync, readdirSync, realpathSync, rmSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path'

const host = process.env.HOST ?? '127.0.0.1'
const port = Number.parseInt(process.env.PORT ?? '4173', 10)
const root = resolve(process.env.DIST_DIR ?? 'dist')
const MAX_REQUEST_URL_LENGTH = 8_192
const REQUEST_TIMEOUT_MS = 15_000

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
}

function applySecurityHeaders(response) {
  response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' blob:; worker-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'")
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('X-Frame-Options', 'DENY')
  response.setHeader('Permissions-Policy', 'camera=(), geolocation=(), microphone=()')
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
  response.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
}

function sendText(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store' })
  response.end(body)
}

function isWithinRoot(filePath, rootPath) {
  const pathFromRoot = relative(rootPath, filePath)
  return pathFromRoot === '' || (pathFromRoot !== '..' && !pathFromRoot.startsWith(`..${sep}`) && !isAbsolute(pathFromRoot))
}

function resolveExistingFile(filePath, rootPath) {
  if (!existsSync(filePath)) return null
  let resolvedPath = realpathSync(filePath)
  if (!isWithinRoot(resolvedPath, rootPath)) return null
  if (statSync(resolvedPath).isDirectory()) {
    const directoryIndex = join(resolvedPath, 'index.html')
    if (!existsSync(directoryIndex)) return null
    resolvedPath = realpathSync(directoryIndex)
    if (!isWithinRoot(resolvedPath, rootPath)) return null
  }
  return statSync(resolvedPath).isFile() ? resolvedPath : null
}

function transferIsExpired(normalizedPath, rootPath) {
  const segments = normalizedPath.split('/')
  if (segments[0] !== 'release-transfer' || !segments[1]) return false
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(segments[1])) return true
  const transferPath = resolve(rootPath, 'release-transfer', segments[1])
  const expiryPath = join(transferPath, 'expires-at.txt')
  if (!isWithinRoot(transferPath, rootPath) || !existsSync(expiryPath)) return true
  const expiry = Date.parse(readFileSync(expiryPath, 'utf8').trim())
  const expired = !Number.isFinite(expiry) || expiry <= Date.now()
  if (expired) rmSync(transferPath, { recursive: true, force: true })
  return expired
}

function removeExpiredTransfers(rootPath) {
  const transferRoot = join(rootPath, 'release-transfer')
  if (!existsSync(transferRoot)) return
  for (const entry of readdirSync(transferRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^[A-Za-z0-9_-]{32,128}$/.test(entry.name)) continue
    transferIsExpired(`release-transfer/${entry.name}`, rootPath)
  }
}

const server = createServer((request, response) => {
  applySecurityHeaders(response)
  try {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.setHeader('Allow', 'GET, HEAD')
      sendText(response, 405, 'method not allowed\n')
      return
    }

    if (!request.url || request.url.length > MAX_REQUEST_URL_LENGTH) {
      sendText(response, 414, 'uri too long\n')
      return
    }

    let requestPath
    try {
      requestPath = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
    } catch {
      sendText(response, 400, 'bad request\n')
      return
    }

    const indexPath = join(root, 'index.html')
    if (requestPath === '/healthz') {
      sendText(response, existsSync(indexPath) ? 200 : 503, existsSync(indexPath) ? 'ok\n' : 'build unavailable\n')
      return
    }

    const normalizedPath = normalize(requestPath).replace(/^([/\\])+/, '')
    const resolvedRoot = existsSync(root) ? realpathSync(root) : root
    const requestedPath = resolve(resolvedRoot, normalizedPath || 'index.html')
    if (!isWithinRoot(requestedPath, resolvedRoot)) {
      sendText(response, 403, 'forbidden\n')
      return
    }
    if (transferIsExpired(normalizedPath, resolvedRoot)) {
      sendText(response, 410, 'release transfer expired\n')
      return
    }

    let filePath = resolveExistingFile(requestedPath, resolvedRoot)
    if (!filePath && !normalizedPath.startsWith('release-transfer/')) filePath = resolveExistingFile(join(resolvedRoot, 'index.html'), resolvedRoot)
    if (!filePath) {
      sendText(response, existsSync(indexPath) ? 404 : 503, existsSync(indexPath) ? 'not found\n' : 'build unavailable\n')
      return
    }

    open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW, (openError, fileDescriptor) => {
      if (openError) {
        sendText(response, 404, 'not found\n')
        return
      }
      fstat(fileDescriptor, (statError, stats) => {
        if (statError || !stats.isFile()) {
          close(fileDescriptor, () => {})
          sendText(response, 404, 'not found\n')
          return
        }
        const extension = extname(filePath).toLowerCase()
        const relativePath = relative(resolvedRoot, filePath)
        const immutable = relativePath.split(sep)[0] === 'assets'
        const isTransfer = relativePath.split(sep)[0] === 'release-transfer'
        const stream = createReadStream(filePath, { fd: fileDescriptor, autoClose: true })
        stream.on('error', () => {
          if (!response.headersSent) sendText(response, 500, 'server error\n')
          else response.destroy()
        })
        response.writeHead(200, {
          'Content-Type': mimeTypes[extension] ?? 'application/octet-stream',
          'Content-Length': stats.size,
          'Cache-Control': isTransfer ? 'private, no-store, max-age=0' : immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
          ...(isTransfer ? { Pragma: 'no-cache', 'X-Robots-Tag': 'noindex, nofollow, noarchive' } : {}),
        })
        if (request.method === 'HEAD') {
          stream.destroy()
          response.end()
        } else stream.pipe(response)
      })
    })
  } catch {
    if (!response.headersSent) sendText(response, 400, 'bad request\n')
    else response.destroy()
  }
})

server.headersTimeout = REQUEST_TIMEOUT_MS
server.requestTimeout = REQUEST_TIMEOUT_MS
server.keepAliveTimeout = 5_000
server.maxRequestsPerSocket = 1_000

if (existsSync(root)) removeExpiredTransfers(realpathSync(root))
setInterval(() => {
  if (existsSync(root)) removeExpiredTransfers(realpathSync(root))
}, 60 * 60 * 1000).unref()

server.listen(port, host, () => {
  console.log(`LoopSmith serving ${root} on http://${host}:${port}`)
})

function shutdown() {
  server.close((error) => process.exit(error ? 1 : 0))
  setTimeout(() => process.exit(1), 5000).unref()
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
