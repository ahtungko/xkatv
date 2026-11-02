// @vitest-environment node
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'

async function listen(server: Server) {
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return (server.address() as AddressInfo).port
}
const close = (server: Server) =>
  new Promise<void>((done, reject) => {
    server.close(error => (error ? reject(error) : done()))
  })

it('升级后的 Docker 代理仍处理参数错误并保留上游正文、状态码和跨域头', async () => {
  const upstream = createServer((request, response) => {
    if (request.url === '/missing') {
      response.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found')
    } else {
      response
        .writeHead(200, { 'Content-Type': 'application/json' })
        .end(JSON.stringify({ title: '测试视频' }))
    }
  })
  const upstreamPort = await listen(upstream)
  const reservation = createServer()
  const proxyPort = await listen(reservation)
  await close(reservation)
  const proxyProcess = spawn(globalThis.process.execPath, [resolve('proxy-server.js')], {
    env: { ...globalThis.process.env, PROXY_PORT: String(proxyPort) },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  try {
    await new Promise<void>((ready, reject) => {
      const timeout = setTimeout(() => reject(new Error('Proxy startup timed out')), 10000)
      proxyProcess.once('error', error => {
        clearTimeout(timeout)
        reject(error)
      })
      proxyProcess.once('exit', code => {
        clearTimeout(timeout)
        reject(new Error(`Proxy exited: ${code}`))
      })
      proxyProcess.stdout.on('data', chunk => {
        if (String(chunk).includes('Proxy server on')) {
          clearTimeout(timeout)
          ready()
        }
      })
    })
    const base = `http://127.0.0.1:${proxyPort}/proxy`
    const invalid = await fetch(base)
    expect(invalid.status).toBe(400)
    expect(await invalid.json()).toMatchObject({ error: 'URL parameter is required' })
    const response = await fetch(
      `${base}?url=${encodeURIComponent(`http://127.0.0.1:${upstreamPort}/data`)}`,
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('access-control-allow-origin')).toBe('*')
    expect(await response.json()).toEqual({ title: '测试视频' })
    const missing = await fetch(
      `${base}?url=${encodeURIComponent(`http://127.0.0.1:${upstreamPort}/missing`)}`,
    )
    expect(missing.status).toBe(404)
    expect(await missing.text()).toBe('not found')
  } finally {
    if (proxyProcess.exitCode === null) {
      const exit = once(proxyProcess, 'exit')
      proxyProcess.kill()
      await exit
    }
    await close(upstream)
  }
}, 10000)
