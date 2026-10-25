import { hashPassword, checkPassword, signToken, verifyToken } from './security.js'

const MAX_JSON = 1024 * 1024
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const URL_HTTP = /^https?:\/\/[^\s]+$/i
export const CATEGORIES = ['Informatika', 'Elektro', 'Manajemen Rekayasa', 'Bioproses', 'Umum']

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status }
}
const fail = (status, message) => { throw new HttpError(status, message) }

// ISBN disimpan tanpa tanda hubung/spasi, huruf X kapital (ISBN-10 boleh berakhiran X).
export const normalizeIsbn = (v) => String(v ?? '').replace(/[\s-]/g, '').toUpperCase()

export function createApp({ db, jwtSecret, corsOrigin = '*', now = () => new Date() }) {
  // ---------- util ----------
  const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email })
  const bookRow = (b) => ({
    id: b.id, isbn: b.isbn, title: b.title, author: b.author, publisher: b.publisher, year: b.year,
    category: b.category, shelf: b.shelf, stock: b.stock, cover_url: b.cover_url, synopsis: b.synopsis,
    created_at: b.created_at, updated_at: b.updated_at,
  })

  // ---------- body ----------
  const readBody = (req, limit) => new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (c) => {
      size += c.length
      if (size > limit) { reject(new HttpError(413, 'Ukuran data terlalu besar')); req.destroy(); return }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
  async function jsonBody(req) {
    const raw = await readBody(req, MAX_JSON)
    if (raw.length === 0) return {}
    try {
      const data = JSON.parse(raw.toString('utf8'))
      return data && typeof data === 'object' && !Array.isArray(data) ? data : fail(400, 'Body harus berupa objek JSON')
    } catch (e) {
      return e instanceof HttpError ? fail(e.status, e.message) : fail(400, 'Body bukan JSON yang valid')
    }
  }

  // ---------- validasi ----------
  const text = (v, label, max) => {
    const s = typeof v === 'string' ? v.trim() : ''
    if (!s) fail(400, `${label} wajib diisi`)
    if (s.length > max) fail(400, `${label} maksimal ${max} karakter`)
    return s
  }
  const email = (v) => {
    const s = text(v, 'Email', 150).toLowerCase()
    if (!EMAIL.test(s)) fail(400, 'Format email tidak valid')
    return s
  }
  const password = (v, label = 'Kata sandi') => {
    if (typeof v !== 'string' || v.length < 6) fail(400, `${label} minimal 6 karakter`)
    if (v.length > 100) fail(400, `${label} maksimal 100 karakter`)
    return v
  }
  const integer = (v, label, min, max) => {
    const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v
    if (!Number.isInteger(n) || n < min || n > max) fail(400, `${label} harus berupa bilangan bulat antara ${min} dan ${max}`)
    return n
  }
  const isbn = (v) => {
    const s = normalizeIsbn(v)
    if (!s) fail(400, 'ISBN wajib diisi')
    if (!/^(\d{9}[\dX]|\d{13})$/.test(s)) fail(400, 'ISBN harus berupa 10 atau 13 digit')
    return s
  }
  const coverUrl = (v) => {
    const s = typeof v === 'string' ? v.trim() : ''
    if (!s) return ''
    if (s.length > 500) fail(400, 'URL sampul maksimal 500 karakter')
    if (!URL_HTTP.test(s)) fail(400, 'URL sampul harus diawali http:// atau https://')
    return s
  }
  const bookInput = (b) => {
    if (!CATEGORIES.includes(b.category)) fail(400, 'Kategori tidak valid')
    return {
      isbn: isbn(b.isbn),
      title: text(b.title, 'Judul', 200),
      author: text(b.author, 'Penulis', 150),
      publisher: text(b.publisher, 'Penerbit', 150),
      year: integer(b.year, 'Tahun terbit', 1900, now().getFullYear() + 1),
      category: b.category,
      shelf: text(b.shelf, 'Nomor rak', 30),
      stock: integer(b.stock, 'Jumlah stok', 0, 100000),
      cover_url: coverUrl(b.cover_url),
      synopsis: text(b.synopsis, 'Sinopsis', 5000),
    }
  }

  // ---------- akses data ----------
  const findBook = (id) => db.prepare('SELECT * FROM books WHERE id = ?').get(Number(id)) ?? fail(404, 'Buku tidak ditemukan')
  const count = (sql, ...args) => db.prepare(sql).get(...args).n
  const escapeLike = (s) => s.replace(/[\\%_]/g, (c) => `\\${c}`)
  const isbnTaken = (value, exceptId = 0) => db.prepare('SELECT 1 FROM books WHERE isbn = ? AND id <> ?').get(value, exceptId)

  // ---------- handlers ----------
  const ok = (message, data) => ({ status: 200, body: { status: 'success', message, ...(data && { data }) } })
  const routes = []
  const route = (method, pattern, auth, handler) =>
    routes.push({ method, regex: new RegExp(`^/api/v1${pattern}$`), auth, handler })

  route('POST', '/auth/login', false, async ({ req }) => {
    const b = await jsonBody(req)
    const u = db.prepare('SELECT * FROM users WHERE email = ?').get(String(b.email ?? '').trim().toLowerCase())
    if (!u || typeof b.password !== 'string' || !checkPassword(b.password, u.password_hash)) fail(400, 'Email atau kata sandi salah')
    return ok('Login berhasil', { token: signToken(u.id, jwtSecret) })
  })

  route('POST', '/auth/logout', true, ({ auth }) => {
    db.prepare('INSERT OR IGNORE INTO revoked_tokens (jti) VALUES (?)').run(auth.jti)
    return ok('Logout berhasil')
  })

  route('GET', '/users/me', true, ({ user }) => ok('Profil staf', { user: publicUser(user) }))

  route('PUT', '/users/me', true, async ({ req, user }) => {
    const b = await jsonBody(req)
    const name = text(b.name, 'Nama', 100), mail = email(b.email)
    if (db.prepare('SELECT id FROM users WHERE email = ? AND id <> ?').get(mail, user.id)) fail(400, 'Email sudah dipakai staf lain')
    db.prepare('UPDATE users SET name = ?, email = ? WHERE id = ?').run(name, mail, user.id)
    return ok('Profil berhasil diperbarui')
  })

  route('PUT', '/users/password', true, async ({ req, user }) => {
    const b = await jsonBody(req)
    if (typeof b.password !== 'string' || !checkPassword(b.password, user.password_hash)) fail(400, 'Kata sandi saat ini salah')
    const next = password(b.new_password, 'Kata sandi baru')
    if (next !== b.new_password_confirmation) fail(400, 'Konfirmasi kata sandi baru tidak cocok')
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(next), user.id)
    return ok('Kata sandi berhasil diubah')
  })

  // Katalog bisa dibaca publik (tanpa login); pencarian: judul, penulis, atau ISBN.
  route('GET', '/books', false, ({ query }) => {
    const where = [], args = []
    const q = (query.get('q') ?? '').trim()
    if (q) {
      const like = `%${escapeLike(q)}%`
      const likeIsbn = `%${escapeLike(normalizeIsbn(q))}%`
      where.push("(b.title LIKE ? ESCAPE '\\' OR b.author LIKE ? ESCAPE '\\' OR b.isbn LIKE ? ESCAPE '\\')")
      args.push(like, like, likeIsbn)
    }
    const category = query.get('category')
    if (category) {
      if (!CATEGORIES.includes(category)) fail(400, 'Kategori tidak valid')
      where.push('b.category = ?'); args.push(category)
    }
    const sql = `SELECT * FROM books b ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY b.title COLLATE NOCASE, b.id`
    return ok('Daftar buku', { books: db.prepare(sql).all(...args).map(bookRow) })
  })

  route('GET', '/books/(\\d+)', false, ({ params }) => ok('Detail buku', { book: bookRow(findBook(params[0])) }))

  route('POST', '/books', true, async ({ req }) => {
    const b = bookInput(await jsonBody(req))
    if (isbnTaken(b.isbn)) fail(400, 'ISBN sudah terdaftar')
    const { lastInsertRowid } = db.prepare(`INSERT INTO books (isbn, title, author, publisher, year, category, shelf, stock, cover_url, synopsis)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(b.isbn, b.title, b.author, b.publisher, b.year, b.category, b.shelf, b.stock, b.cover_url, b.synopsis)
    return { status: 201, body: { status: 'success', message: 'Buku berhasil ditambahkan', data: { book_id: Number(lastInsertRowid) } } }
  })

  route('PUT', '/books/(\\d+)', true, async ({ req, params }) => {
    const current = findBook(params[0])
    const b = bookInput(await jsonBody(req))
    if (isbnTaken(b.isbn, current.id)) fail(400, 'ISBN sudah dipakai buku lain')
    db.prepare(`UPDATE books SET isbn = ?, title = ?, author = ?, publisher = ?, year = ?, category = ?, shelf = ?, stock = ?,
      cover_url = ?, synopsis = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`)
      .run(b.isbn, b.title, b.author, b.publisher, b.year, b.category, b.shelf, b.stock, b.cover_url, b.synopsis, current.id)
    return ok('Buku berhasil diperbarui')
  })

  route('DELETE', '/books/(\\d+)', true, ({ params }) => {
    const current = findBook(params[0])
    db.prepare('DELETE FROM books WHERE id = ?').run(current.id)
    return ok('Buku berhasil dihapus')
  })

  route('GET', '/stats', true, () => ok('Statistik inventaris', {
    stats: {
      total_titles: count('SELECT COUNT(*) AS n FROM books'),
      total_copies: count('SELECT COALESCE(SUM(stock), 0) AS n FROM books'),
      out_of_stock: count('SELECT COUNT(*) AS n FROM books WHERE stock = 0'),
      by_category: CATEGORIES.map((name) => ({
        name,
        titles: count('SELECT COUNT(*) AS n FROM books WHERE category = ?', name),
        copies: count('SELECT COALESCE(SUM(stock), 0) AS n FROM books WHERE category = ?', name),
      })),
    },
  }))

  // ---------- server ----------
  const send = (res, status, body) => {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': corsOrigin,
      'X-Content-Type-Options': 'nosniff',
    })
    res.end(JSON.stringify(body))
  }

  function authenticate(req) {
    const token = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1]
    const payload = token && verifyToken(token, jwtSecret)
    if (!payload || db.prepare('SELECT 1 FROM revoked_tokens WHERE jti = ?').get(payload.jti)) return null
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.sub)
    return user ? { user, payload } : null
  }

  return async function handler(req, res) {
    try {
      const url = new URL(req.url, 'http://localhost')
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': corsOrigin,
          'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
          'Access-Control-Allow-Headers': 'Authorization,Content-Type,Accept',
        })
        return res.end()
      }
      const pathname = url.pathname.replace(/\/+$/, '') || '/'
      let pathMatched = false
      for (const r of routes) {
        const m = r.regex.exec(pathname)
        if (!m) continue
        pathMatched = true
        if (r.method !== req.method) continue
        const session = r.auth ? authenticate(req) : null
        if (r.auth && !session) fail(401, 'Token tidak valid atau sudah kedaluwarsa')
        const out = await r.handler({ req, params: m.slice(1), query: url.searchParams, user: session?.user, auth: session?.payload })
        return send(res, out.status, out.body)
      }
      return fail(pathMatched ? 405 : 404, pathMatched ? 'Metode tidak diizinkan' : 'Endpoint tidak ditemukan')
    } catch (err) {
      if (err instanceof HttpError) return send(res, err.status, { status: 'fail', message: err.message })
      console.error(err)
      return send(res, 500, { status: 'error', message: 'Terjadi kesalahan pada server' })
    }
  }
}
