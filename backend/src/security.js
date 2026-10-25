import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

const sameBytes = (a, b) => a.length === b.length && timingSafeEqual(a, b)

export function hashPassword(password) {
  const salt = randomBytes(16)
  return `${salt.toString('hex')}:${scryptSync(password, salt, 64).toString('hex')}`
}

export function checkPassword(password, stored) {
  const [salt, hash] = stored.split(':')
  return sameBytes(scryptSync(password, Buffer.from(salt, 'hex'), 64), Buffer.from(hash, 'hex'))
}

const sign = (data, secret) => createHmac('sha256', secret).update(data).digest('base64url')

export function signToken(userId, secret, ttlSeconds = 7 * 24 * 3600) {
  const now = Math.floor(Date.now() / 1000)
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const payload = { sub: userId, jti: randomBytes(12).toString('hex'), iat: now, exp: now + ttlSeconds }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${header}.${body}.${sign(`${header}.${body}`, secret)}`
}

export function verifyToken(token, secret) {
  const parts = String(token).split('.')
  if (parts.length !== 3) return null
  const expected = Buffer.from(sign(`${parts[0]}.${parts[1]}`, secret))
  if (!sameBytes(expected, Buffer.from(parts[2]))) return null
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString())
    return payload.exp > Math.floor(Date.now() / 1000) ? payload : null
  } catch {
    return null
  }
}
