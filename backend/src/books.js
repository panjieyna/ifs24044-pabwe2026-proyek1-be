// Contoh koleksi buku untuk mengisi database (dipakai `npm run seed` dan entry Vercel).
const BOOKS = [
  ['9780262033848', 'Introduction to Algorithms', 'Thomas H. Cormen', 'MIT Press', 2009, 'Informatika', 'A-01', 5, 'Referensi utama algoritma dan struktur data, mencakup pengurutan, graf, dan pemrograman dinamis.'],
  ['9780134685991', 'Effective Java', 'Joshua Bloch', 'Addison-Wesley', 2018, 'Informatika', 'A-02', 3, 'Kumpulan praktik terbaik pemrograman Java modern.'],
  ['9780132350884', 'Clean Code', 'Robert C. Martin', 'Prentice Hall', 2008, 'Informatika', 'A-03', 4, 'Panduan menulis kode yang bersih, mudah dibaca, dan mudah dirawat.'],
  ['9780133356052', 'Computer Networking: A Top-Down Approach', 'James F. Kurose', 'Pearson', 2016, 'Informatika', 'A-04', 0, 'Pengantar jaringan komputer dengan pendekatan dari lapisan aplikasi ke bawah.'],
  ['9780133923605', 'Electric Circuits', 'James W. Nilsson', 'Pearson', 2014, 'Elektro', 'B-01', 6, 'Dasar analisis rangkaian listrik untuk mahasiswa teknik elektro.'],
  ['9780073380681', 'Microelectronic Circuits', 'Adel S. Sedra', 'Oxford University Press', 2014, 'Elektro', 'B-02', 2, 'Perancangan dan analisis rangkaian elektronika analog dan digital.'],
  ['9780470647769', 'Engineering Management', 'Fraidoon Mazda', 'Addison-Wesley', 2013, 'Manajemen Rekayasa', 'C-01', 2, 'Prinsip manajemen proyek dan operasi dalam lingkungan rekayasa.'],
  ['9781119490098', 'Introduction to Bioprocess Engineering', 'Shijie Liu', 'Elsevier', 2017, 'Bioproses', 'D-01', 3, 'Konsep dasar rekayasa bioproses, kinetika enzim, dan bioreaktor.'],
  ['9786020318875', 'Bumi Manusia', 'Pramoedya Ananta Toer', 'Lentera Dipantara', 2005, 'Umum', 'E-01', 7, 'Novel sejarah tentang Minke di masa kolonial Hindia Belanda.'],
  ['9786020633176', 'Atomic Habits', 'James Clear', 'Gramedia Pustaka Utama', 2019, 'Umum', 'E-02', 0, 'Cara membangun kebiasaan baik dan menghilangkan kebiasaan buruk lewat perubahan kecil.'],
]

// Aman dijalankan berulang: ISBN yang sudah ada dilewati. Mengembalikan jumlah buku yang ditambahkan.
export function seedBooks(db) {
  const insert = db.prepare(`INSERT OR IGNORE INTO books (isbn, title, author, publisher, year, category, shelf, stock, synopsis)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
  let added = 0
  for (const b of BOOKS) added += Number(insert.run(...b).changes)
  return { added, total: BOOKS.length }
}
