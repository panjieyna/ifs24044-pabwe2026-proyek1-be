process.env.DB_FILE ||= '/tmp/dellib-staff.db'

const { resolve } = await import('node:path')
const { openDb, ensureStaff } = await import('../src/db.js')
const { createApp } = await import('../src/app.js')
await import('../src/seed.js')

const env = process.env
const db = openDb(resolve(env.DB_FILE))
if (env.STAFF_EMAIL && env.STAFF_PASSWORD) {
  ensureStaff(db, { name: env.STAFF_NAME || 'Staf Perpustakaan', email: env.STAFF_EMAIL, password: env.STAFF_PASSWORD })
}

export default createApp({
  db,
  jwtSecret: env.JWT_SECRET || 'dev-secret-jangan-dipakai-di-produksi',
  corsOrigin: env.CORS_ORIGIN || '*',
})  