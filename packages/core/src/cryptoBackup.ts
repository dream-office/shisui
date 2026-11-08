/**
 * 加密备份（零后端，纯 Web Crypto）：
 * - PBKDF2-SHA256，310,000 次迭代，salt 16 字节
 * - AES-GCM 256，IV 12 字节
 * - 信封：format/encryptedVersion/kdf/cipher/iv/data（密文 base64）
 *
 * 密码只存在于本次调用的内存里，不落盘、不进日志。
 * 解密失败（密码错/密文被改）统一抛 WRONG_PASSWORD，不泄露具体哪一步失败。
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

function cryptoApi(): Crypto {
  const api = globalThis.crypto
  if (!api || !api.subtle) {
    throw new BackupCryptoError('CRYPTO_UNAVAILABLE', '当前环境不支持 Web Crypto，无法加密备份')
  }
  return api
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function base64ToBytes(text: string): Uint8Array {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
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
  const salt = typeof kdf.salt === 'string' ? base64ToBytes(kdf.salt) : null
  const iv = typeof data.iv === 'string' ? base64ToBytes(data.iv) : null
  if (!salt || salt.length !== SALT_BYTES) return { ok: false, errors: ['salt 长度不对'], envelope: null }
  if (!iv || iv.length !== IV_BYTES) return { ok: false, errors: ['iv 长度不对'], envelope: null }
  if (data.cipher !== 'AES-GCM') return { ok: false, errors: ['不支持的加密算法'], envelope: null }
  if (typeof data.data !== 'string' || data.data.length === 0) return { ok: false, errors: ['缺少密文'], envelope: null }

  return {
    ok: true,
    errors: [],
    envelope: {
      format: ENCRYPTED_FORMAT,
      encryptedVersion: ENCRYPTED_VERSION,
      kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: PBKDF2_ITERATIONS, salt: kdf.salt as string },
      cipher: 'AES-GCM',
      iv: data.iv as string,
      data: data.data as string,
    },
  }
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const api = cryptoApi()
  const encoder = new TextEncoder()
  const baseKey = await api.subtle.importKey('raw', asArrayBuffer(encoder.encode(password)), 'PBKDF2', false, ['deriveKey'])
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
    asArrayBuffer(new TextEncoder().encode(plaintext)),
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
    return new TextDecoder().decode(plaintext)
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
