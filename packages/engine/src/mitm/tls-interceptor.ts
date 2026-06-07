import { createServer, type Server, type Socket } from 'net'
import { TLSSocket, connect as createTLSConnection, createSecureContext, type SecureContextOptions } from 'tls'

import { rootLogger } from '../lib'
import { CAManager } from './ca-manager'

const logger = rootLogger.child({ module: 'mitm-tls' })

const MITM_DEFAULT_PORT = 8443
const UPSTREAM_TIMEOUT_MS = 30_000

interface InterceptedConnection {
  clientSocket: TLSSocket
  upstreamSocket: TLSSocket | null
  hostname: string
  port: number
  startTime: number
}

export class TLSInterceptor {
  private caManager: CAManager
  private server: Server | null = null
  private running = false
  private port = MITM_DEFAULT_PORT
  private connections = new Map<string, InterceptedConnection>()
  private connectionIdCounter = 0

  constructor(caManager: CAManager) {
    this.caManager = caManager
  }

  async start(port = MITM_DEFAULT_PORT): Promise<void> {
    if (this.running) {
      logger.warn('MITM proxy already running')
      return
    }

    this.port = port

    return new Promise((resolve, reject) => {
      this.server = createServer((socket) => {
        this.handleClient(socket)
      })

      this.server.on('error', (err) => {
        logger.error({ err }, 'MITM server error')
        if (!this.running) {
          reject(err)
        }
      })

      this.server.listen(port, () => {
        this.running = true
        logger.info({ port }, 'MITM proxy started')
        resolve()
      })
    })
  }

  async stop(): Promise<void> {
    if (!this.running || !this.server) {
      return
    }

    // Close all active connections
    for (const [, conn] of this.connections) {
      try {
        conn.clientSocket.destroy()
        conn.upstreamSocket?.destroy()
      } catch {
        // Ignore errors during cleanup
      }
    }
    this.connections.clear()

    return new Promise((resolve) => {
      this.server!.close(() => {
        this.running = false
        this.server = null
        logger.info('MITM proxy stopped')
        resolve()
      })
    })
  }

  isRunning(): boolean {
    return this.running
  }

  getPort(): number {
    return this.port
  }

  getActiveConnections(): number {
    return this.connections.size
  }

  getInterceptedDomains(): string[] {
    const domains = new Set<string>()
    for (const [, conn] of this.connections) {
      domains.add(conn.hostname)
    }
    return Array.from(domains)
  }

  private handleClient(socket: Socket): void {
    let buffer = Buffer.alloc(0)
    let handled = false

    const onData = (data: Buffer) => {
      if (handled) return
      buffer = Buffer.concat([buffer, data])

      // Look for HTTP CONNECT method
      const headerEnd = buffer.indexOf('\r\n\r\n')
      if (headerEnd === -1) {
        // Not enough data yet, but check for overflow
        if (buffer.length > 8192) {
          socket.destroy()
        }
        return
      }

      handled = true
      socket.removeListener('data', onData)

      const header = buffer.toString('utf-8', 0, headerEnd)
      const lines = header.split('\r\n')
      const requestLine = lines[0]

      if (!requestLine.startsWith('CONNECT ')) {
        // Not a CONNECT request, respond with error
        socket.write('HTTP/1.1 405 Method Not Allowed\r\n\r\n')
        socket.end()
        return
      }

      // Parse CONNECT target: "CONNECT hostname:port HTTP/1.1"
      const match = requestLine.match(/^CONNECT\s+([^\s:]+)(?::(\d+))?\s+HTTP\/\d\.\d$/)
      if (!match) {
        socket.write('HTTP/1.1 400 Bad Request\r\n\r\n')
        socket.end()
        return
      }

      const hostname = match[1]
      const port = parseInt(match[2] || '443', 10)

      // Send 200 Connection Established
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n', () => {
        this.startTLSServerForClient(socket, hostname, port)
      })
    }

    socket.on('data', onData)

    socket.on('error', (err) => {
      logger.debug({ err, remoteAddress: socket.remoteAddress }, 'Client socket error')
    })

    socket.setTimeout(UPSTREAM_TIMEOUT_MS)
    socket.on('timeout', () => {
      socket.destroy()
    })
  }

  private async startTLSServerForClient(clientSocket: Socket, hostname: string, port: number): Promise<void> {
    const connId = `conn-${++this.connectionIdCounter}`

    try {
      // Generate server certificate for this domain
      const { cert: serverCert, key: serverKey } = await this.caManager.generateServerCert(hostname)

      const secureContextOptions: SecureContextOptions = {
        cert: serverCert,
        key: serverKey,
      }

      // Create a TLSSocket in server mode from the plain socket
      const tlsSocket = new TLSSocket(clientSocket, {
        secureContext: createSecureContext(secureContextOptions),
        isServer: true,
        requestCert: false,
        rejectUnauthorized: false,
      })

      let handshakeComplete = false

      tlsSocket.once('secure', () => {
        handshakeComplete = true
        logger.debug({ hostname, connId, cipher: tlsSocket.getCipher()?.name }, 'Client TLS handshake completed')

        // Now connect to upstream and bridge
        this.connectUpstream(tlsSocket, hostname, port, connId)
      })

      tlsSocket.on('error', (err) => {
        if (!handshakeComplete) {
          logger.debug({ err, hostname, connId }, 'Client TLS handshake failed')
        } else {
          logger.debug({ err, hostname, connId }, 'Client TLS socket error')
        }
        this.cleanupConnection(connId)
      })

      tlsSocket.on('close', () => {
        this.cleanupConnection(connId)
      })

      // Track connection (will be updated with upstream socket after handshake)
      this.connections.set(connId, {
        clientSocket: tlsSocket,
        upstreamSocket: null,
        hostname,
        port,
        startTime: Date.now(),
      })
    } catch (err) {
      logger.error({ err, hostname, connId }, 'Failed to start TLS for client')
      clientSocket.destroy()
    }
  }

  private connectUpstream(clientTlsSocket: TLSSocket, hostname: string, port: number, connId: string): void {
    const upstream = createTLSConnection({
      host: hostname,
      port,
      servername: hostname,
      // In production you might want true, but for a transparent proxy
      // that may connect to various dev/test endpoints we keep it false
      rejectUnauthorized: false,
      timeout: UPSTREAM_TIMEOUT_MS,
    })

    upstream.once('secureConnect', () => {
      logger.debug({ hostname, port, connId }, 'Upstream TLS connected')

      const conn = this.connections.get(connId)
      if (conn) {
        conn.upstreamSocket = upstream
      }
    })

    upstream.on('timeout', () => {
      logger.warn({ hostname, port, connId }, 'Upstream connection timeout')
      upstream.destroy()
      clientTlsSocket.destroy()
      this.cleanupConnection(connId)
    })

    upstream.on('error', (err) => {
      logger.debug({ err, hostname, port, connId }, 'Upstream socket error')
      clientTlsSocket.destroy()
      this.cleanupConnection(connId)
    })

    upstream.on('close', () => {
      clientTlsSocket.end()
      this.cleanupConnection(connId)
    })

    clientTlsSocket.on('close', () => {
      upstream.destroy()
      this.cleanupConnection(connId)
    })

    // Pipe decrypted data between client and upstream
    clientTlsSocket.pipe(upstream)
    upstream.pipe(clientTlsSocket)
  }

  private cleanupConnection(connId: string): void {
    const conn = this.connections.get(connId)
    if (!conn) return

    try {
      conn.clientSocket.destroy()
      conn.upstreamSocket?.destroy()
    } catch {
      // Ignore errors during cleanup
    }

    this.connections.delete(connId)
  }
}
