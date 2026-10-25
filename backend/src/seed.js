// Mengisi database dengan contoh koleksi buku: `npm run seed` (aman dijalankan berulang, ISBN yang sudah ada dilewati).
import { resolve } from 'node:path'
import { openDb } from './db.js'
import { seedBooks } from './books.js'

try { process.loadEnvFile('.env') } catch { /* .env opsional */ }

const db = openDb(resolve(process.env.DB_FILE || './data/dellib-staff.db'))
const { added, total } = seedBooks(db)
console.log(`${added} buku contoh ditambahkan (${total - added} sudah ada).`)
