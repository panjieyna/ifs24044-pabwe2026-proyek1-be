import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { openDb, ensureStaff } from './db.js'
import { createApp } from './app.js'

try { process.loadEnvFile('.env') } catch { /* .env opsional */ }

const env = process.env
const jwtSecret = env.JWT_SECRET || 'dev-secret-jangan-dipakai-di-produksi'
if (!env.JWT_SECRET) console.warn('PERINGATAN: JWT_SECRET belum diatur di .env, memakai secret bawaan (hanya untuk pengembangan).')

const db = openDb(resolve(env.DB_FILE || './data/dellib-staff.db'))
if (env.STAFF_EMAIL && env.STAFF_PASSWORD) {
  const hasil = ensureStaff(db, { name: env.STAFF_NAME || 'Staf Perpustakaan', email: env.STAFF_EMAIL, password: env.STAFF_PASSWORD })
  console.log(`Akun staf ${env.STAFF_EMAIL} ${hasil}.`)
} else {
  console.warn('STAFF_EMAIL / STAFF_PASSWORD belum diatur di .env, belum ada akun staf yang bisa login.')
}

const handler = createApp({ db, jwtSecret, corsOrigin: env.CORS_ORIGIN || '*' })

const port = Number(env.PORT || 5000)
createServer(handler).listen(port, () => console.log(`DelLib Staff API berjalan di http://localhost:${port}/api/v1`))
