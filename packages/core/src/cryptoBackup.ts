/**
 * 加密备份（零后端，纯 Web Crypto）：
 * - PBKDF2-SHA256，310,000 次迭代，salt 16 字节
 * - AES-GCM 256，IV 12 字节
 * - 信封：format/encryptedVersion/kdf/cipher/iv/data（密文 base64）
 *
 * 密码只存在于本次调用的内存里，不落盘、不进日志。
 * 解密失败（密码错/密文被改）统一抛 WRONG_PASSWORD，不泄露具体哪一步失败。
 *
 * 注意：core 包不依赖 DOM lib（node 里也要能跑），所以这里只声明用到的最小类型，
 * base64 用纯 TS 实现，UTF-8 编解码走全局 TextEncoder/TextDecoder（存在性检查）。
 */

export const ENCRYPTED_FORMAT = 'shisui-backup-encrypted'
export const ENCRYPTED_VERSION = 1
export const PBKDF2_ITERATIONS = 310_000
export const SALT_BYTES = 16
export const IV_BYTES = 12
export const MIN_PASSWORD_LENGTH = 8

export type CryptoErrorCode = 'PASSWORD_TOO_SHORT' | 'BAD_ENVELOPE' | 'WRONG_PASSWORD' | 'CRYPTO_UNAVAILABLE'

export class BackupCryptoError extends Error {
  code: CryptoErrorCode
  constructor(code: CryptoErrorCode, message: string) {
    super(message)
    this.name = 'BackupCryptoError'
    this.code = code
  }
}

export interface EncryptedEnvelope {
  format: typeof ENCRYPTED_FORMAT
  encryptedVersion: number
  kdf: {
    name: 'PBKDF2'
    hash: 'SHA-256'
    iterations: number
    salt: string
  }
  cipher: 'AES-GCM'
  iv: string
  data: string
}

interface CryptoKeyLike {
  readonly type: string
}

interface SubtleLike {
  importKey(
    format: 'raw',
    keyData: ArrayBuffer,
    algorithm: string,
    extractable: boolean,
    usages: string[],
  ): Promise<CryptoKeyLike>
  deriveKey(
    algorithm: { name: string; salt: ArrayBuffer; iterations: number; hash: string },
    baseKey: CryptoKeyLike,
    derivedKeyType: { name: string; length: number },
    extractable: boolean,
    usages: string[],
  ): Promise<CryptoKeyLike>
  encrypt(algorithm: { name: string; iv: ArrayBuffer }, key: CryptoKeyLike, data: ArrayBuffer): Promise<ArrayBuffer>
  decrypt(algorithm: { name: string; iv: ArrayBuffer }, key: CryptoKeyLike, data: ArrayBuffer): Promise<ArrayBuffer>
}

interface CryptoLike {
  subtle: SubtleLike
  getRandomValues<T extends Uint8Array>(array: T): T
}

interface TextEncoderLike {
  encode(input: string): Uint8Array
}

interface TextDecoderLike {
  decode(input: ArrayBuffer | Uint8Array): string
}

const globals = globalThis as unknown as {
  crypto?: CryptoLike
  TextEncoder?: new () => TextEncoderLike
  TextDecoder?: new () => TextDecoderLike
}

function cryptoApi(): CryptoLike {
  const api = globals.crypto
  if (!api || !api.subtle) {
    throw new BackupCryptoError('CRYPTO_UNAVAILABLE', '当前环境不支持 Web Crypto，无法加密备份')
  }
  return api
}

function utf8Encode(text: string): Uint8Array {
  const Encoder = globals.TextEncoder
  if (!Encoder) throw new BackupCryptoError('CRYPTO_UNAVAILABLE', '当前环境缺少 TextEncoder')
  return new Encoder().encode(text)
}

function utf8Decode(bytes: Uint8Array): string {
  const Decoder = globals.TextDecoder
  if (!Decoder) throw new BackupCryptoError('CRYPTO_UNAVAILABLE', '当前环境缺少 TextDecoder')
  return new Decoder().decode(bytes)
}

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function bytesToBase64(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0
    out += BASE64_ALPHABET[b0 >> 2]
    out += BASE64_ALPHABET[((b0 & 3) << 4) | (b1 >> 4)]
    out += i + 1 < bytes.length ? BASE64_ALPHABET[((b1 & 15) << 2) | (b2 >> 6)] : '='
    out += i + 2 < bytes.length ? BASE64_ALPHABET[b2 & 63] : '='
  }
  return out
}

function base64ToBytes(text: string): Uint8Array {
  const clean = text.replace(/=+$/, '')
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4))
  let buffer = 0
  let bits = 0
  let index = 0
  for (const char of clean) {
    const value = BASE64_ALPHABET.indexOf(char)
    if (value < 0) throw new BackupCryptoError('BAD_ENVELOPE', 'base64 内容不合法')
    buffer = (buffer << 6) | value
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out[index] = (buffer >> bits) & 0xff
      index += 1
    }
  }
  return out
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(out).set(bytes)
  return out
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 校验加密信封结构（不含解密） */
export function validateEncryptedEnvelope(raw: unknown): { ok: boolean; errors: string[]; envelope: EncryptedEnvelope | null } {
  let data: unknown = raw
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw)
    } catch {
      return { ok: false, errors: ['加密备份不是合法的 JSON'], envelope: null }
    }
  }
  if (!isRecord(data)) return { ok: false, errors: ['加密备份内容不是对象'], envelope: null }
  if (data.format !== ENCRYPTED_FORMAT) return { ok: false, errors: ['不是拾穗加密备份'], envelope: null }
  if (data.encryptedVersion !== ENCRYPTED_VERSION) {
    return { ok: false, errors: [`加密备份版本不支持（${String(data.encryptedVersion)}）`], envelope: null }
  }
  if (!isRecord(data.kdf)) return { ok: false, errors: ['缺少 kdf 参数'], envelope: null }
  const kdf = data.kdf
  if (kdf.name !== 'PBKDF2' || kdf.hash !== 'SHA-256') return { ok: false, errors: ['不支持的密钥派生参数'], envelope: null }
  if (kdf.iterations !== PBKDF2_ITERATIONS) {
    return { ok: false, errors: [`迭代次数不支持（${String(kdf.iterations)}）`], envelope: null }
  }
  if (typeof kdf.salt !== 'string') return { ok: false, errors: ['缺少 salt'], envelope: null }
  if (typeof data.iv !== 'string') return { ok: false, errors: ['缺少 iv'], envelope: null }
  if (typeof data.data !== 'string' || data.data.length === 0) {
    return { ok: false, errors: ['缺少密文'], envelope: null }
  }

  let salt: Uint8Array
  let iv: Uint8Array
  try {
    salt = base64ToBytes(kdf.salt)
    iv = base64ToBytes(data.iv)
  } catch {
    return { ok: false, errors: ['salt/iv 不是合法 base64'], envelope: null }
  }
  if (salt.length !== SALT_BYTES) return { ok: false, errors: ['salt 长度不对'], envelope: null }
  if (iv.length !== IV_BYTES) return { ok: false, errors: ['iv 长度不对'], envelope: null }
  if (data.cipher !== 'AES-GCM') return { ok: false, errors: ['不支持的加密算法'], envelope: null }

  return {
    ok: true,
    errors: [],
    envelope: {
      format: ENCRYPTED_FORMAT,
      encryptedVersion: ENCRYPTED_VERSION,
      kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: PBKDF2_ITERATIONS, salt: kdf.salt },
      cipher: 'AES-GCM',
      iv: data.iv,
      data: data.data,
    },
  }
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKeyLike> {
  const api = cryptoApi()
  const baseKey = await api.subtle.importKey('raw', asArrayBuffer(utf8Encode(password)), 'PBKDF2', false, [
    'deriveKey',
  ])
  return api.subtle.deriveKey(
    { name: 'PBKDF2', salt: asArrayBuffer(salt), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export function assertPassword(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new BackupCryptoError('PASSWORD_TOO_SHORT', `密码至少 ${MIN_PASSWORD_LENGTH} 位`)
  }
}

/** 明文备份 JSON → 加密信封 */
export async function encryptBackup(plaintext: string, password: string): Promise<EncryptedEnvelope> {
  assertPassword(password)
  const api = cryptoApi()
  const salt = api.getRandomValues(new Uint8Array(SALT_BYTES))
  const iv = api.getRandomValues(new Uint8Array(IV_BYTES))
  const key = await deriveKey(password, salt)
  const ciphertext = await api.subtle.encrypt(
    { name: 'AES-GCM', iv: asArrayBuffer(iv) },
    key,
    asArrayBuffer(utf8Encode(plaintext)),
  )

  return {
    format: ENCRYPTED_FORMAT,
    encryptedVersion: ENCRYPTED_VERSION,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: PBKDF2_ITERATIONS, salt: bytesToBase64(salt) },
    cipher: 'AES-GCM',
    iv: bytesToBase64(iv),
    data: bytesToBase64(new Uint8Array(ciphertext)),
  }
}

/** 加密信封（对象或 JSON 文本）→ 明文备份 JSON；密码错/被篡改抛 WRONG_PASSWORD */
export async function decryptBackup(raw: unknown, password: string): Promise<string> {
  const validation = validateEncryptedEnvelope(raw)
  if (!validation.ok || !validation.envelope) {
    throw new BackupCryptoError('BAD_ENVELOPE', validation.errors[0] ?? '加密备份格式不正确')
  }
  const envelope = validation.envelope
  const salt = base64ToBytes(envelope.kdf.salt)
  const iv = base64ToBytes(envelope.iv)
  const key = await deriveKey(password, salt)

  try {
    const plaintext = await cryptoApi().subtle.decrypt(
      { name: 'AES-GCM', iv: asArrayBuffer(iv) },
      key,
      asArrayBuffer(base64ToBytes(envelope.data)),
    )
    return utf8Decode(new Uint8Array(plaintext))
  } catch {
    throw new BackupCryptoError('WRONG_PASSWORD', '密码错误，或文件已损坏')
  }
}

/** 是否加密信封（用于导入时自动识别） */
export function isEncryptedBackup(raw: unknown): boolean {
  let data: unknown = raw
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw)
    } catch {
      return false
    }
  }
  return isRecord(data) && data.format === ENCRYPTED_FORMAT
}
