import { close, constants, createReadStream, existsSync, fstat, open, realpathSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, isAbsolute, relative, resolve, sep } from 'node:path'

const host = '127.0.0.1'
const port = 4186
const prefix = '/html/loopsmith/'
const root = resolve(process.env.ITCH_BUILD_DIR ?? 'dist')
const MAX_REQUEST_URL_LENGTH = 8_192

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
}

function sendText(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' })
  response.end(body)
}

function isWithinRoot(filePath, rootPath) {
  const pathFromRoot = relative(rootPath, filePath)
  return pathFromRoot === '' || (pathFromRoot !== '..' && !pathFromRoot.startsWith(`..${sep}`) && !isAbsolute(pathFromRoot))
}

const server = createServer((request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.setHeader('Allow', 'GET, HEAD')
    sendText(response, 405, 'method not allowed\n')
    return
  }
  if (!request.url || request.url.length > MAX_REQUEST_URL_LENGTH) {
    sendText(response, 414, 'uri too long\n')
    return
  }

  let pathname
  try {
    pathname = decodeURIComponent(new URL(request.url, `http://${host}:${port}`).pathname)
  } catch {
    sendText(response, 400, 'bad request\n')
    return
  }
  if (pathname === '/healthz') {
    sendText(response, existsSync(resolve(root, 'index.html')) ? 200 : 503, 'ok\n')
    return
  }

  if (!pathname.startsWith(prefix)) {
    sendText(response, 404, 'not found\n')
    return
  }

  const resolvedRoot = existsSync(root) ? realpathSync(root) : root
  const filePath = resolve(resolvedRoot, pathname.slice(prefix.length) || 'index.html')
  if (!isWithinRoot(filePath, resolvedRoot) || !existsSync(filePath)) {
    sendText(response, 404, 'not found\n')
    return
  }
  const resolvedFile = realpathSync(filePath)
  if (!isWithinRoot(resolvedFile, resolvedRoot)) {
    sendText(response, 404, 'not found\n')
    return
  }

  open(resolvedFile, constants.O_RDONLY | constants.O_NOFOLLOW, (openError, fileDescriptor) => {
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
      response.writeHead(200, {
        'Content-Type': mimeTypes[extname(resolvedFile)] ?? 'application/octet-stream',
        'Content-Length': stats.size,
        'Cache-Control': 'no-store',
      })
      if (request.method === 'HEAD') {
        close(fileDescriptor, () => {})
        response.end()
      } else createReadStream(resolvedFile, { fd: fileDescriptor, autoClose: true }).pipe(response)
    })
  })
})

server.listen(port, host, () => {
  console.log(`itch fixture available at http://${host}:${port}${prefix}`)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)))
}
