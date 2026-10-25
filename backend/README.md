# DelLib Staff API

Backend DelLib Staff: Node.js murni tanpa dependensi (SQLite bawaan Node), jadi tidak perlu `npm install`.

## Menjalankan
Butuh **Node.js 22.5 atau lebih baru** (cek: `node -v`).

```bash
cd backend
copy .env.example .env      # Windows (Mac/Linux: cp .env.example .env)
# edit .env: isi JWT_SECRET dengan string acak yang panjang, lalu STAFF_EMAIL dan STAFF_PASSWORD
npm run seed                # opsional: mengisi 10 buku contoh
npm run dev                 # http://localhost:5000/api/v1
npm test                    # menjalankan tes otomatis
```
Akun staf dibuat (atau kata sandinya diperbarui) otomatis dari `STAFF_*` di `.env` setiap server dijalankan. Tidak ada pendaftaran publik.
Data tersimpan di `backend/data/dellib-staff.db`. Hapus file itu untuk mulai dari nol.

## Endpoint (`/api/v1`, respons `{status, message, data}`)
| Metode | Path | Akses | Keterangan |
|---|---|---|---|
| POST | /auth/login | publik | masuk dengan email + kata sandi staf, mengembalikan `data.token` (JWT) |
| POST | /auth/logout | staf | keluar, token dicabut |
| GET / PUT | /users/me | staf | profil sendiri / ubah nama dan email |
| PUT | /users/password | staf | ubah kata sandi |
| GET | /books?q=&category= | publik | daftar buku; `q` mencari judul, penulis, atau ISBN |
| GET | /books/:id | publik | detail buku |
| POST | /books | staf | tambah buku |
| PUT | /books/:id | staf | ubah buku |
| DELETE | /books/:id | staf | hapus buku |
| GET | /stats | staf | total judul, total eksemplar, judul stok habis, rincian per kategori |

Badan buku: `{isbn, title, author, publisher, year, category, shelf, stock, cover_url, synopsis}`.
Aturan: ISBN 10 atau 13 digit dan unik (tanda hubung diabaikan), tahun terbit 1900 hingga tahun depan, stok bilangan bulat 0 sampai 100000, `cover_url` opsional (http/https), `category` salah satu dari Informatika, Elektro, Manajemen Rekayasa, Bioproses, Umum.

## Deploy
Backend ini memakai file SQLite, jadi butuh hosting dengan disk permanen (VPS, Railway, Render dengan disk). Vercel tidak cocok untuk backend ini. Arahkan rewrite `/api` di `frontend/vercel.json` ke domain backend, dan atur `CORS_ORIGIN` bila frontend diakses dari domain lain.
