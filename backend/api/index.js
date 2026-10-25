// Entry serverless untuk Vercel. Semua request diarahkan ke sini lewat vercel.json,
// req.url tetap berisi path asli (mis. /api/v1/auth/login) sehingga router di app.js tetap cocok.
import { openDb, ensureStaff } from '../src/db.js'
import { seedBooks } from '../src/books.js'
import { createApp } from '../src/app.js'

const env = process.env
if (!env.JWT_SECRET) console.warn('PERINGATAN: JWT_SECRET belum diatur di Environment Variables Vercel.')

// Di Vercel hanya /tmp yang bisa ditulis, dan isinya hilang setiap instance baru dibuat (cold start).
const db = openDb('/tmp/dellib-staff.db')
if (env.STAFF_EMAIL && env.STAFF_PASSWORD) {
  ensureStaff(db, { name: env.STAFF_NAME || 'Staf Perpustakaan', email: env.STAFF_EMAIL, password: env.STAFF_PASSWORD })
} else {
  console.warn('STAFF_EMAIL / STAFF_PASSWORD belum diatur di Environment Variables Vercel, belum ada akun staf yang bisa login.')
}
seedBooks(db)

export default createApp({
  db,
  jwtSecret: env.JWT_SECRET || 'dev-secret-jangan-dipakai-di-produksi',
  corsOrigin: env.CORS_ORIGIN || '*',
})
