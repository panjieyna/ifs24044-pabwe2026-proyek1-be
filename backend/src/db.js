import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { hashPassword } from './security.js'

const SCHEMA = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS books (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  isbn TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  publisher TEXT NOT NULL,
  year INTEGER NOT NULL,
  category TEXT NOT NULL,
  shelf TEXT NOT NULL,
  stock INTEGER NOT NULL DEFAULT 0,
  cover_url TEXT NOT NULL DEFAULT '',
  synopsis TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_books_category ON books(category);
CREATE TABLE IF NOT EXISTS revoked_tokens (jti TEXT PRIMARY KEY);
`

export function openDb(file = ':memory:') {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true })
  const db = new DatabaseSync(file)
  db.exec(SCHEMA)
  return db
}

// Membuat akun staf perpustakaan (atau memperbarui kata sandi akun yang sudah ada).
export function ensureStaff(db, { name = 'Staf Perpustakaan', email, password }) {
  const mail = email.trim().toLowerCase()
  const found = db.prepare('SELECT id FROM users WHERE email = ?').get(mail)
  if (found) {
    db.prepare('UPDATE users SET name = ?, password_hash = ? WHERE id = ?').run(name, hashPassword(password), found.id)
    return 'diperbarui'
  }
  db.prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)').run(name, mail, hashPassword(password))
  return 'dibuat'
}
