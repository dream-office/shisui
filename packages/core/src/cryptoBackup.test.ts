import { describe, expect, it } from 'vitest'
import {
  BackupCryptoError,
  ENCRYPTED_FORMAT,
  IV_BYTES,
  PBKDF2_ITERATIONS,
  SALT_BYTES,
  decryptBackup,
  encryptBackup,
  isEncryptedBackup,
  validateEncryptedEnvelope,
} from './cryptoBackup.js'
import { validateBackup, buildBackup } from './backup.js'

const PASSWORD = 'shisui-密码-123'
const plaintext = JSON.stringify({ format: 'shisui-backup', schemaVersion: 3, tasks: [] })

describe('加密备份（PBKDF2 310k + AES-GCM 256）', () => {
  it('加密 → 解密往返', async () => {
    const envelope = await encryptBackup(plaintext, PASSWORD)
    expect(envelope.format).toBe(ENCRYPTED_FORMAT)
    expect(envelope.encryptedVersion).toBe(1)
    expect(envelope.kdf.iterations).toBe(PBKDF2_ITERATIONS)
    expect(envelope.cipher).toBe('AES-GCM')
    expect(atob(envelope.kdf.salt).length).toBe(SALT_BYTES)
    expect(atob(envelope.iv).length).toBe(IV_BYTES)
    expect(await decryptBackup(envelope, PASSWORD)).toBe(plaintext)
  })

  it('密码错 → WRONG_PASSWORD，不泄露细节', async () => {
    const envelope = await encryptBackup(plaintext, PASSWORD)
    await expect(decryptBackup(envelope, 'wrong-password')).rejects.toThrow(BackupCryptoError)
    await expect(decryptBackup(envelope, 'wrong-password')).rejects.toMatchObject({ code: 'WRONG_PASSWORD' })
  })

  it('密文被篡改 → WRONG_PASSWORD', async () => {
    const envelope = await encryptBackup(plaintext, PASSWORD)
    const tampered = { ...envelope, data: envelope.data.slice(0, -4) + 'AAAA' }
    await expect(decryptBackup(tampered, PASSWORD)).rejects.toMatchObject({ code: 'WRONG_PASSWORD' })
  })

  it('密码 < 8 位拒绝', async () => {
    await expect(encryptBackup(plaintext, 'short')).rejects.toMatchObject({ code: 'PASSWORD_TOO_SHORT' })
  })

  it('结构校验：非加密格式 / 迭代次数不对 / salt 长度不对', async () => {
    const envelope = await encryptBackup(plaintext, PASSWORD)
    expect(isEncryptedBackup(envelope)).toBe(true)
    expect(isEncryptedBackup(JSON.stringify(envelope))).toBe(true)
    expect(isEncryptedBackup('{"format":"shisui-backup"}')).toBe(false)

    const badIterations = { ...envelope, kdf: { ...envelope.kdf, iterations: 1000 } }
    expect(validateEncryptedEnvelope(badIterations).ok).toBe(false)
    expect(validateEncryptedEnvelope(badIterations).errors[0]).toContain('迭代次数')

    const badSalt = { ...envelope, kdf: { ...envelope.kdf, salt: btoa('short') } }
    expect(validateEncryptedEnvelope(badSalt).ok).toBe(false)
  })

  it('解密后的明文仍走普通备份校验', async () => {
    const backup = buildBackup({
      tasks: [
        {
          id: 't1',
          title: '交报告',
          dueAt: new Date(2026, 10, 20, 18).getTime(),
          startAt: null,
          kind: 'task' as const,
          createdAt: 1,
          done: false,
          editedFields: [],
          confidence: 'high' as const,
          reasons: [],
          engine: 'rule' as const,
          rawText: '',
          channel: null,
          location: null,
        },
      ],
      series: [],
      batches: [],
    })
    const envelope = await encryptBackup(JSON.stringify(backup), PASSWORD)
    const decrypted = await decryptBackup(envelope, PASSWORD)
    const result = validateBackup(decrypted)
    expect(result.ok).toBe(true)
    expect(result.backup?.tasks).toHaveLength(1)
  })
})
