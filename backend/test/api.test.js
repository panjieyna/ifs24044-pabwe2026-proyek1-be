import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { openDb, ensureStaff } from '../src/db.js'
import { createApp, normalizeIsbn } from '../src/app.js'

let server, base, db, token
const buku = (o = {}) => ({
  isbn: '978-0-13-235088-4', title: 'Clean Code', author: 'Robert C. Martin', publisher: 'Prentice Hall', year: 2008,
  category: 'Informatika', shelf: 'A-03', stock: 4, cover_url: 'https://example.com/c.jpg', synopsis: 'Panduan kode bersih.', ...o,
})

before(async () => {
  db = openDb(':memory:')
  ensureStaff(db, { name: 'Staf Satu', email: 'Staf@Dellib.local', password: 'rahasia1' })
  server = createServer(createApp({ db, jwtSecret: 'test-secret' }))
  await new Promise((r) => server.listen(0, r))
  base = `http://127.0.0.1:${server.address().port}`
  token = (await call('POST', '/auth/login', { body: { email: 'staf@dellib.local', password: 'rahasia1' } })).data.token
})
after(() => server.close())

async function call(method, path, { token: t, body, raw } = {}) {
  const res = await fetch(`${base}/api/v1${path}`, {
    method,
    headers: { ...(t && { Authorization: `Bearer ${t}` }), ...((body || raw) && { 'Content-Type': 'application/json' }) },
    body: raw ?? (body && JSON.stringify(body)),
  })
  return { code: res.status, ...(await res.json()) }
}

test('auth: login salah, token wajib, logout mencabut token', async () => {
  assert.equal((await call('POST', '/auth/login', { body: { email: 'staf@dellib.local', password: 'salah-salah' } })).message, 'Email atau kata sandi salah')
  assert.equal((await call('POST', '/auth/login', { body: { email: 'tidak@ada.id', password: 'rahasia1' } })).code, 400)
  assert.equal((await call('POST', '/auth/login', { body: {} })).code, 400)
  const { data } = await call('POST', '/auth/login', { body: { email: ' STAF@dellib.local ', password: 'rahasia1' } })
  assert.equal((await call('GET', '/users/me')).code, 401)
  assert.equal((await call('GET', '/users/me', { token: 'x.y.z' })).code, 401)
  const me = await call('GET', '/users/me', { token: data.token })
  assert.deepEqual([me.data.user.name, me.data.user.email], ['Staf Satu', 'staf@dellib.local'])
  assert.equal((await call('POST', '/auth/logout', { token: data.token })).status, 'success')
  assert.equal((await call('GET', '/users/me', { token: data.token })).code, 401)
})

test('tidak ada endpoint pendaftaran publik', async () => {
  assert.equal((await call('POST', '/auth/register', { body: { name: 'X', email: 'x@y.id', password: 'rahasia1' } })).code, 404)
})

test('profil: ubah data dan kata sandi', async () => {
  ensureStaff(db, { name: 'Staf Dua', email: 'dua@dellib.local', password: 'rahasia1' })
  const t = (await call('POST', '/auth/login', { body: { email: 'dua@dellib.local', password: 'rahasia1' } })).data.token
  assert.equal((await call('PUT', '/users/me', { token: t, body: { name: '', email: 'dua@dellib.local' } })).code, 400)
  assert.equal((await call('PUT', '/users/me', { token: t, body: { name: 'Dua', email: 'bukan-email' } })).message, 'Format email tidak valid')
  assert.equal((await call('PUT', '/users/me', { token: t, body: { name: 'Dua', email: 'staf@dellib.local' } })).message, 'Email sudah dipakai staf lain')
  assert.equal((await call('PUT', '/users/me', { token: t, body: { name: 'Dua S', email: 'dua@dellib.local' } })).status, 'success')
  assert.equal((await call('GET', '/users/me', { token: t })).data.user.name, 'Dua S')
  const pw = { password: 'rahasia1', new_password: 'baru-baru', new_password_confirmation: 'beda-beda' }
  assert.equal((await call('PUT', '/users/password', { token: t, body: pw })).message, 'Konfirmasi kata sandi baru tidak cocok')
  assert.equal((await call('PUT', '/users/password', { token: t, body: { ...pw, password: 'salah-salah' } })).message, 'Kata sandi saat ini salah')
  assert.equal((await call('PUT', '/users/password', { token: t, body: { ...pw, new_password: '123', new_password_confirmation: '123' } })).code, 400)
  assert.equal((await call('PUT', '/users/password', { token: t, body: { ...pw, new_password_confirmation: 'baru-baru' } })).status, 'success')
  assert.equal((await call('POST', '/auth/login', { body: { email: 'dua@dellib.local', password: 'baru-baru' } })).status, 'success')
})

test('buku: CRUD penuh oleh staf, ISBN unik dan dinormalisasi', async () => {
  assert.equal((await call('POST', '/books', { body: buku() })).code, 401)
  const created = await call('POST', '/books', { token, body: buku() })
  assert.equal(created.code, 201)
  const id = created.data.book_id
  assert.equal((await call('POST', '/books', { token, body: buku({ isbn: '9780132350884', title: 'Lain' }) })).message, 'ISBN sudah terdaftar')

  const detail = await call('GET', `/books/${id}`) // detail terbuka untuk publik
  assert.equal(detail.data.book.isbn, '9780132350884')
  assert.equal(detail.data.book.stock, 4)
  assert.equal((await call('GET', '/books/99999')).code, 404)

  const other = (await call('POST', '/books', { token, body: buku({ isbn: '9780134685991', title: 'Effective Java', stock: 0 }) })).data.book_id
  assert.equal((await call('PUT', `/books/${id}`, { token, body: buku({ isbn: '9780134685991' }) })).message, 'ISBN sudah dipakai buku lain')
  assert.equal((await call('PUT', `/books/${id}`, { body: buku() })).code, 401)
  assert.equal((await call('PUT', '/books/99999', { token, body: buku() })).code, 404)
  assert.equal((await call('PUT', `/books/${id}`, { token, body: buku({ stock: '9', shelf: 'B-07', synopsis: 'Sinopsis baru' }) })).status, 'success')
  const updated = (await call('GET', `/books/${id}`)).data.book
  assert.deepEqual([updated.stock, updated.shelf, updated.synopsis], [9, 'B-07', 'Sinopsis baru'])

  assert.equal((await call('DELETE', `/books/${id}`)).code, 401)
  assert.equal((await call('DELETE', `/books/${id}`, { token })).status, 'success')
  assert.equal((await call('DELETE', `/books/${id}`, { token })).code, 404)
  await call('DELETE', `/books/${other}`, { token })
})

test('buku: validasi input', async () => {
  const bad = async (o, message) => {
    const r = await call('POST', '/books', { token, body: buku(o) })
    assert.equal(r.code, 400)
    assert.equal(r.message, message)
  }
  await bad({ title: '' }, 'Judul wajib diisi')
  await bad({ title: 'x'.repeat(201) }, 'Judul maksimal 200 karakter')
  await bad({ isbn: '' }, 'ISBN wajib diisi')
  await bad({ isbn: '12345' }, 'ISBN harus berupa 10 atau 13 digit')
  await bad({ author: ' ' }, 'Penulis wajib diisi')
  await bad({ publisher: undefined }, 'Penerbit wajib diisi')
  await bad({ year: 1800 }, 'Tahun terbit harus berupa bilangan bulat antara 1900 dan ' + (new Date().getFullYear() + 1))
  await bad({ year: 'abc' }, 'Tahun terbit harus berupa bilangan bulat antara 1900 dan ' + (new Date().getFullYear() + 1))
  await bad({ category: 'Fisika' }, 'Kategori tidak valid')
  await bad({ shelf: '' }, 'Nomor rak wajib diisi')
  await bad({ stock: -1 }, 'Jumlah stok harus berupa bilangan bulat antara 0 dan 100000')
  await bad({ stock: 1.5 }, 'Jumlah stok harus berupa bilangan bulat antara 0 dan 100000')
  await bad({ cover_url: 'ftp://x/y.jpg' }, 'URL sampul harus diawali http:// atau https://')
  await bad({ cover_url: `https://x.id/${'a'.repeat(500)}` }, 'URL sampul maksimal 500 karakter')
  await bad({ synopsis: '' }, 'Sinopsis wajib diisi')
  assert.equal((await call('POST', '/books', { token, raw: '{bukan json' })).message, 'Body bukan JSON yang valid')
  assert.equal((await call('POST', '/books', { token, raw: '[1]' })).message, 'Body harus berupa objek JSON')
  assert.equal((await call('POST', '/books', { token, raw: 'null' })).code, 400)
  // sampul dan ISBN-10 berakhiran X boleh; sampul boleh kosong
  const r = await call('POST', '/books', { token, body: buku({ isbn: '0-8044-2957-x', cover_url: '', title: 'ISBN X' }) })
  assert.equal(r.code, 201)
  assert.equal((await call('GET', `/books/${r.data.book_id}`)).data.book.isbn, '080442957X')
  await call('DELETE', `/books/${r.data.book_id}`, { token })
})

test('buku: pencarian publik (judul, penulis, ISBN) dan filter kategori', async () => {
  const add = async (o) => (await call('POST', '/books', { token, body: buku(o) })).data.book_id
  const ids = [
    await add({ isbn: '9780262033848', title: 'Introduction to Algorithms', author: 'Thomas Cormen', category: 'Informatika', stock: 5 }),
    await add({ isbn: '9780133923605', title: 'Electric Circuits', author: 'James Nilsson', category: 'Elektro', stock: 6 }),
    await add({ isbn: '9786020318875', title: '100% Bumi_Manusia', author: 'Pramoedya', category: 'Umum', stock: 0 }),
  ]
  const titles = async (qs) => (await call('GET', `/books${qs}`)).data.books.map((b) => b.title)
  assert.deepEqual(await titles(''), ['100% Bumi_Manusia', 'Electric Circuits', 'Introduction to Algorithms'])
  assert.deepEqual(await titles('?q=algorithms'), ['Introduction to Algorithms'])
  assert.deepEqual(await titles('?q=nilsson'), ['Electric Circuits'])
  assert.deepEqual(await titles('?q=978-0-262-03384-8'), ['Introduction to Algorithms'])
  assert.deepEqual(await titles('?q=9786020'), ['100% Bumi_Manusia'])
  assert.deepEqual(await titles('?q=100%25'), ['100% Bumi_Manusia'])
  assert.deepEqual(await titles('?q=tidak-ada'), [])
  assert.deepEqual(await titles('?category=Elektro'), ['Electric Circuits'])
  assert.deepEqual(await titles('?category=Umum&q=bumi'), ['100% Bumi_Manusia'])
  assert.deepEqual(await titles('?category=Elektro&q=algorithms'), [])
  assert.equal((await call('GET', '/books?category=Fisika')).code, 400)
  assert.equal(normalizeIsbn(' 978-0 13 '), '978013')

  const stats = (await call('GET', '/stats', { token })).data.stats
  assert.equal((await call('GET', '/stats')).code, 401)
  assert.equal(stats.total_titles, 3)
  assert.equal(stats.total_copies, 11)
  assert.equal(stats.out_of_stock, 1)
  assert.deepEqual(stats.by_category.map((c) => c.name), ['Informatika', 'Elektro', 'Manajemen Rekayasa', 'Bioproses', 'Umum'])
  assert.deepEqual(stats.by_category.find((c) => c.name === 'Elektro'), { name: 'Elektro', titles: 1, copies: 6 })
  assert.deepEqual(stats.by_category.find((c) => c.name === 'Bioproses'), { name: 'Bioproses', titles: 0, copies: 0 })
  for (const id of ids) await call('DELETE', `/books/${id}`, { token })
})

test('routing: 404, 405, OPTIONS, trailing slash, ensureStaff memperbarui akun', async () => {
  assert.equal((await call('GET', '/tidak-ada')).code, 404)
  assert.equal((await call('POST', '/stats', { token })).code, 405)
  assert.equal((await call('GET', '/books/')).status, 'success')
  const res = await fetch(`${base}/api/v1/books`, { method: 'OPTIONS' })
  assert.equal(res.status, 204)
  assert.match(res.headers.get('access-control-allow-methods'), /DELETE/)
  assert.equal(ensureStaff(db, { email: 'staf@dellib.local', password: 'rahasia1', name: 'Staf Satu' }), 'diperbarui')
  assert.equal(ensureStaff(db, { email: 'baru@dellib.local', password: 'rahasia1' }), 'dibuat')
})

test('ukuran body dibatasi', async () => {
  const res = await fetch(`${base}/api/v1/books`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ synopsis: 'x'.repeat(1024 * 1024 + 10) }),
  }).catch(() => null)
  if (res) assert.equal(res.status, 413)
})
