import { generateKeyPairSync, createSign, randomBytes, createHash } from 'crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

import { rootLogger } from '../lib'

const logger = rootLogger.child({ module: 'mitm-ca' })

// ─── ASN.1 / DER encoder (minimal) ───────────────────────────────────────────

const ASN1 = {
  INTEGER: 0x02,
  BIT_STRING: 0x03,
  OCTET_STRING: 0x04,
  NULL: 0x05,
  OBJECT_IDENTIFIER: 0x06,
  BOOLEAN: 0x01,
  UTF8_STRING: 0x0c,
  PRINTABLE_STRING: 0x13,
  IA5_STRING: 0x16,
  UTC_TIME: 0x17,
  SEQUENCE: 0x30,
  SET: 0x31,
  CONTEXT_CONSTRUCTED_0: 0xa0,
  CONTEXT_CONSTRUCTED_3: 0xa3,
} as const

function encodeLength(length: number): Uint8Array {
  if (length < 0x80) return new Uint8Array([length])
  const bytes: number[] = []
  let temp = length
  while (temp > 0) {
    bytes.unshift(temp & 0xff)
    temp >>= 8
  }
  bytes.unshift(0x80 | bytes.length)
  return new Uint8Array(bytes)
}

function makeTag(tag: number, data: Uint8Array): Uint8Array {
  const length = encodeLength(data.length)
  const result = new Uint8Array(1 + length.length + data.length)
  result[0] = tag
  result.set(length, 1)
  result.set(data, 1 + length.length)
  return result
}

function makeSequence(items: Uint8Array[]): Uint8Array {
  const totalLength = items.reduce((sum, item) => sum + item.length, 0)
  const data = new Uint8Array(totalLength)
  let offset = 0
  for (const item of items) {
    data.set(item, offset)
    offset += item.length
  }
  return makeTag(ASN1.SEQUENCE, data)
}

function makeSet(items: Uint8Array[]): Uint8Array {
  const totalLength = items.reduce((sum, item) => sum + item.length, 0)
  const data = new Uint8Array(totalLength)
  let offset = 0
  for (const item of items) {
    data.set(item, offset)
    offset += item.length
  }
  return makeTag(ASN1.SET, data)
}

function encodeInteger(value: number | Uint8Array): Uint8Array {
  if (typeof value === 'number') {
    const bytes: number[] = []
    let temp = value
    do {
      bytes.unshift(temp & 0xff)
      temp >>= 8
    } while (temp > 0)
    // Ensure positive by prepending 0x00 if high bit is set
    if (bytes[0] & 0x80) bytes.unshift(0x00)
    return makeTag(ASN1.INTEGER, new Uint8Array(bytes))
  }
  // For big integers (like RSA modulus), ensure leading zero if needed
  const data = value[0] & 0x80 ? new Uint8Array([0x00, ...value]) : value
  return makeTag(ASN1.INTEGER, data)
}

function encodeBigIntFromBuffer(buf: Buffer): Uint8Array {
  const arr = new Uint8Array(buf)
  return encodeInteger(arr)
}

function encodeOID(oid: string): Uint8Array {
  const parts = oid.split('.').map(Number)
  const bytes: number[] = [parts[0] * 40 + parts[1]]
  for (let i = 2; i < parts.length; i++) {
    let value = parts[i]
    const octets: number[] = []
    do {
      octets.unshift((value & 0x7f) | (octets.length > 0 ? 0x80 : 0x00))
      value >>= 7
    } while (value > 0)
    bytes.push(...octets)
  }
  return makeTag(ASN1.OBJECT_IDENTIFIER, new Uint8Array(bytes))
}

function encodeNull(): Uint8Array {
  return new Uint8Array([ASN1.NULL, 0x00])
}

function encodeBitString(data: Uint8Array): Uint8Array {
  // Unused bits = 0
  const wrapped = new Uint8Array(data.length + 1)
  wrapped[0] = 0x00
  wrapped.set(data, 1)
  return makeTag(ASN1.BIT_STRING, wrapped)
}

function encodeOctetString(data: Uint8Array): Uint8Array {
  return makeTag(ASN1.OCTET_STRING, data)
}

function encodeUTF8String(str: string): Uint8Array {
  return makeTag(ASN1.UTF8_STRING, new TextEncoder().encode(str))
}

function encodePrintableString(str: string): Uint8Array {
  return makeTag(ASN1.PRINTABLE_STRING, new TextEncoder().encode(str))
}

function encodeIA5String(str: string): Uint8Array {
  return makeTag(ASN1.IA5_STRING, new TextEncoder().encode(str))
}

function encodeUTCTime(date: Date): Uint8Array {
  const yy = String(date.getUTCFullYear()).slice(-2)
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(date.getUTCDate()).padStart(2, '0')
  const hh = String(date.getUTCHours()).padStart(2, '0')
  const min = String(date.getUTCMinutes()).padStart(2, '0')
  const ss = String(date.getUTCSeconds()).padStart(2, '0')
  const str = `${yy}${mm}${dd}${hh}${min}${ss}Z`
  return makeTag(ASN1.UTC_TIME, new TextEncoder().encode(str))
}

function encodeContextTagged(tag: number, data: Uint8Array): Uint8Array {
  return makeTag(0xa0 | tag, data)
}

// ─── X.509 Certificate Builder ───────────────────────────────────────────────

const OID = {
  rsaEncryption: '1.2.840.113549.1.1.1',
  sha256WithRSAEncryption: '1.2.840.113549.1.1.11',
  subjectKeyIdentifier: '2.5.29.14',
  authorityKeyIdentifier: '2.5.29.35',
  basicConstraints: '2.5.29.19',
  keyUsage: '2.5.29.15',
  subjectAltName: '2.5.29.17',
  commonName: '2.5.4.3',
  countryName: '2.5.4.6',
  organizationName: '2.5.4.10',
  organizationalUnitName: '2.5.4.11',
} as const

function makeAlgorithmIdentifier(oid: string): Uint8Array {
  return makeSequence([encodeOID(oid), encodeNull()])
}

function makeName(commonName: string): Uint8Array {
  const cnAttr = makeSequence([
    encodeOID(OID.commonName),
    encodeUTF8String(commonName),
  ])
  const rdns = makeSet([cnAttr])
  return makeSequence([rdns])
}

function makeSubjectPublicKeyInfo(modulus: Buffer, publicExponent: Buffer): Uint8Array {
  const rsaPublicKey = makeSequence([
    encodeBigIntFromBuffer(modulus),
    encodeBigIntFromBuffer(publicExponent),
  ])
  return makeSequence([
    makeAlgorithmIdentifier(OID.rsaEncryption),
    encodeBitString(rsaPublicKey),
  ])
}

function makeExtension(oid: string, critical: boolean, value: Uint8Array): Uint8Array {
  const items: Uint8Array[] = [encodeOID(oid)]
  if (critical) {
    items.push(makeTag(ASN1.BOOLEAN, new Uint8Array([0xff])))
  }
  items.push(encodeOctetString(value))
  return makeSequence(items)
}

function makeExtensions(extensions: Uint8Array[]): Uint8Array {
  return encodeContextTagged(3, makeSequence(extensions))
}

function makeTBSCertificate(
  serialNumber: Buffer,
  issuerName: string,
  notBefore: Date,
  notAfter: Date,
  subjectName: string,
  modulus: Buffer,
  publicExponent: Buffer,
  isCA: boolean,
  subjectKeyId: Buffer,
  authorityKeyId?: Buffer,
  altNames?: string[]
): Uint8Array {
  const version = encodeContextTagged(0, encodeInteger(2)) // v3
  const serial = encodeBigIntFromBuffer(serialNumber)
  const signature = makeAlgorithmIdentifier(OID.sha256WithRSAEncryption)
  const issuer = makeName(issuerName)
  const validity = makeSequence([encodeUTCTime(notBefore), encodeUTCTime(notAfter)])
  const subject = makeName(subjectName)
  const subjectPublicKeyInfo = makeSubjectPublicKeyInfo(modulus, publicExponent)

  const exts: Uint8Array[] = []

  // Subject Key Identifier
  exts.push(makeExtension(OID.subjectKeyIdentifier, false, encodeOctetString(new Uint8Array(subjectKeyId))))

  // Authority Key Identifier
  if (authorityKeyId) {
    const authKeyIdExt = encodeContextTagged(0, encodeOctetString(new Uint8Array(authorityKeyId)))
    exts.push(makeExtension(OID.authorityKeyIdentifier, false, makeSequence([authKeyIdExt])))
  }

  // Basic Constraints
  const bcValue = isCA
    ? makeSequence([makeTag(ASN1.BOOLEAN, new Uint8Array([0xff])), encodeInteger(0)])
    : makeSequence([makeTag(ASN1.BOOLEAN, new Uint8Array([0xff]))])
  exts.push(makeExtension(OID.basicConstraints, true, bcValue))

  // Key Usage
  const keyUsageBits = isCA
    ? new Uint8Array([0x06]) // keyCertSign, cRLSign (bits 5, 6)
    : new Uint8Array([0x80]) // digitalSignature (bit 0)
  exts.push(makeExtension(OID.keyUsage, true, encodeBitString(keyUsageBits)))

  // Subject Alternative Name
  if (altNames && altNames.length > 0) {
    const names: Uint8Array[] = altNames.map((name) =>
      encodeContextTagged(2, encodeIA5String(name))
    )
    exts.push(makeExtension(OID.subjectAltName, false, makeSequence(names)))
  }

  return makeSequence([
    version,
    serial,
    signature,
    issuer,
    validity,
    subject,
    subjectPublicKeyInfo,
    makeExtensions(exts),
  ])
}

function generateSerialNumber(): Buffer {
  return randomBytes(16)
}

function computeSubjectKeyId(modulus: Buffer, publicExponent: Buffer): Buffer {
  const spki = makeSubjectPublicKeyInfo(modulus, publicExponent)
  return createHash('sha1').update(Buffer.from(spki)).digest()
}

function signTBSCertificate(tbs: Uint8Array, privateKeyPem: string): Buffer {
  const signer = createSign('RSA-SHA256')
  signer.update(Buffer.from(tbs))
  return signer.sign(privateKeyPem)
}

function buildCertificate(
  tbs: Uint8Array,
  signature: Buffer,
): Uint8Array {
  return makeSequence([
    tbs,
    makeAlgorithmIdentifier(OID.sha256WithRSAEncryption),
    encodeBitString(encodeBigIntFromBuffer(signature)),
  ])
}

function bufferToPem(buf: Uint8Array, label: string): string {
  const base64 = Buffer.from(buf).toString('base64')
  const lines = [`-----BEGIN ${label}-----`]
  for (let i = 0; i < base64.length; i += 64) {
    lines.push(base64.slice(i, i + 64))
  }
  lines.push(`-----END ${label}-----`, '')
  return lines.join('\n')
}

// ─── CA Manager ──────────────────────────────────────────────────────────────

interface CachedCert {
  cert: string
  key: string
  expiresAt: number
}

const CERT_CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours
const CA_VALIDITY_YEARS = 10
const SERVER_CERT_VALIDITY_DAYS = 365

export class CAManager {
  private dataDir: string
  private caKeyPath: string
  private caCertPath: string
  private caKeyPem: string | null = null
  private caCertPem: string | null = null
  private caCertDer: Uint8Array | null = null
  private caSubjectKeyId: Buffer | null = null
  private certCache: Map<string, CachedCert> = new Map()

  constructor(dataDir: string) {
    this.dataDir = dataDir
    this.caKeyPath = join(dataDir, 'ca-key.pem')
    this.caCertPath = join(dataDir, 'ca-cert.pem')
  }

  async init(): Promise<void> {
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true })
    }

    if (existsSync(this.caKeyPath) && existsSync(this.caCertPath)) {
      logger.info('Loading existing CA certificate')
      this.caKeyPem = readFileSync(this.caKeyPath, 'utf-8')
      this.caCertPem = readFileSync(this.caCertPath, 'utf-8')
      this.caCertDer = new Uint8Array(Buffer.from(this.caCertPem.split('\n').slice(1, -2).join(''), 'base64'))

      // Extract subject key ID from the CA cert for authorityKeyIdentifier
      // For simplicity, we recompute it from the public key
      const pubKeyMatch = this.caKeyPem.match(/-----BEGIN PUBLIC KEY-----([\s\S]*?)-----END PUBLIC KEY-----/)
      if (!pubKeyMatch) {
        // Try extracting from private key
        const { createPublicKey } = await import('crypto')
        const pubKey = createPublicKey(this.caKeyPem)
        const pubKeyDer = pubKey.export({ type: 'pkcs1', format: 'der' })
        // Parse RSA public key to get modulus and exponent
        const { modulus, publicExponent } = this.parseRSAPublicKey(pubKeyDer)
        this.caSubjectKeyId = computeSubjectKeyId(modulus, publicExponent)
      }
    } else {
      logger.info('Generating new CA certificate')
      await this.generateCA()
    }
  }

  private parseRSAPublicKey(der: Buffer): { modulus: Buffer; publicExponent: Buffer } {
    // Simple parser for PKCS#1 RSA public key
    // SEQUENCE { INTEGER modulus, INTEGER publicExponent }
    let offset = 0
    // Skip SEQUENCE tag and length
    if (der[offset++] !== 0x30) throw new Error('Expected SEQUENCE')
    const seqLen = this.readLength(der, offset)
    offset += this.lengthSize(seqLen)

    // Read modulus INTEGER
    if (der[offset++] !== 0x02) throw new Error('Expected INTEGER')
    const modLen = this.readLength(der, offset)
    offset += this.lengthSize(modLen)
    const modulus = der.slice(offset, offset + modLen)
    offset += modLen

    // Read publicExponent INTEGER
    if (der[offset++] !== 0x02) throw new Error('Expected INTEGER')
    const expLen = this.readLength(der, offset)
    offset += this.lengthSize(expLen)
    const publicExponent = der.slice(offset, offset + expLen)

    return { modulus, publicExponent }
  }

  private readLength(der: Buffer, offset: number): number {
    const byte = der[offset]
    if ((byte & 0x80) === 0) return byte
    const numBytes = byte & 0x7f
    let length = 0
    for (let i = 0; i < numBytes; i++) {
      length = (length << 8) | der[offset + 1 + i]
    }
    return length
  }

  private lengthSize(length: number): number {
    if (length < 0x80) return 1
    if (length < 0x100) return 2
    if (length < 0x10000) return 3
    return 4
  }

  private async generateCA(): Promise<void> {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    })

    this.caKeyPem = privateKey
    const pubKeyDer = Buffer.from(publicKey.split('\n').slice(1, -2).join(''), 'base64')
    const { modulus, publicExponent } = this.parseRSAPublicKey(pubKeyDer)

    const serialNumber = generateSerialNumber()
    const notBefore = new Date()
    const notAfter = new Date()
    notAfter.setFullYear(notAfter.getFullYear() + CA_VALIDITY_YEARS)

    const subjectKeyId = computeSubjectKeyId(modulus, publicExponent)
    this.caSubjectKeyId = subjectKeyId

    const tbs = makeTBSCertificate(
      serialNumber,
      'x-llm-gateway MITM CA',
      notBefore,
      notAfter,
      'x-llm-gateway MITM CA',
      modulus,
      publicExponent,
      true, // isCA
      subjectKeyId,
      undefined, // No authorityKeyId for self-signed
    )

    const signature = signTBSCertificate(tbs, privateKey)
    const certDer = buildCertificate(tbs, signature)

    this.caCertDer = certDer
    this.caCertPem = bufferToPem(certDer, 'CERTIFICATE')

    writeFileSync(this.caKeyPath, privateKey)
    writeFileSync(this.caCertPath, this.caCertPem)

    logger.info('CA certificate generated and saved')
  }

  async generateServerCert(domain: string): Promise<{ cert: string; key: string }> {
    // Check cache
    const cached = this.certCache.get(domain)
    if (cached && Date.now() < cached.expiresAt) {
      return { cert: cached.cert, key: cached.key }
    }

    if (!this.caKeyPem || !this.caCertPem || !this.caSubjectKeyId) {
      throw new Error('CA not initialized')
    }

    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    })

    const pubKeyDer = Buffer.from(publicKey.split('\n').slice(1, -2).join(''), 'base64')
    const { modulus, publicExponent } = this.parseRSAPublicKey(pubKeyDer)

    const serialNumber = generateSerialNumber()
    const notBefore = new Date()
    const notAfter = new Date()
    notAfter.setDate(notAfter.getDate() + SERVER_CERT_VALIDITY_DAYS)

    const subjectKeyId = computeSubjectKeyId(modulus, publicExponent)

    const tbs = makeTBSCertificate(
      serialNumber,
      'x-llm-gateway MITM CA',
      notBefore,
      notAfter,
      domain,
      modulus,
      publicExponent,
      false, // not CA
      subjectKeyId,
      this.caSubjectKeyId,
      [domain, `*.${domain}`],
    )

    const signature = signTBSCertificate(tbs, this.caKeyPem)
    const certDer = buildCertificate(tbs, signature)
    const certPem = bufferToPem(certDer, 'CERTIFICATE')

    const result = { cert: certPem, key: privateKey }

    this.certCache.set(domain, {
      cert: certPem,
      key: privateKey,
      expiresAt: Date.now() + CERT_CACHE_TTL_MS,
    })

    logger.debug({ domain }, 'Generated server certificate')
    return result
  }

  getCACert(): string {
    if (!this.caCertPem) {
      throw new Error('CA not initialized')
    }
    return this.caCertPem
  }

  getCAFingerprint(): string {
    if (!this.caCertDer) {
      throw new Error('CA not initialized')
    }
    const hash = createHash('sha256').update(Buffer.from(this.caCertDer)).digest('hex')
    // Format as SHA256 fingerprint (colon-separated pairs)
    return hash.toUpperCase().replace(/(.{2})/g, '$1:').slice(0, -1)
  }

  clearCache(): void {
    this.certCache.clear()
    logger.info('Certificate cache cleared')
  }
}
