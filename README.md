# DOI XML Repair

Hak cipta (c) 2026 Ikhwan Arief (ikhwan[at]unand.ac.id). Aplikasi ini dibuat
oleh Ikhwan Arief dan dapat digunakan oleh publik berdasarkan lisensi Creative
Commons Attribution-NonCommercial (CC BY-NC). Penggunaan, adaptasi, dan
distribusi diperkenankan untuk tujuan nonkomersial dengan atribusi yang jelas
kepada pembuat. Penggunaan komersial memerlukan izin tertulis dari pemegang hak
cipta.

Aplikasi statis untuk GitHub Pages yang memperbaiki XML Crossref dengan
mengunci DOI artikel lama secara penuh. Metadata diambil dari XML baru, tetapi
nilai `journal_article/doi_data/doi` pada output disalin dari XML lama.
URL artikel output dapat memakai nilai dari XML baru atau, sebagai opsi
terpisah, ditulis manual untuk mengganti `journal_article/doi_data/resource`.
Timestamp output otomatis dinaikkan agar sesuai dengan kebutuhan update
metadata Crossref.

Data lama dapat diberikan dengan dua cara:

- Upload XML lama Crossref.
- Tulis DOI lama yang sudah terdaftar di Crossref, lalu aplikasi mengambil
  metadata lengkap melalui Crossref REST API untuk membantu pencocokan artikel,
  termasuk URL artikel asli dari `resource.primary.URL` jika tersedia.

## Jalankan Lokal

```bash
python3 -m http.server 8080
```

Buka:

```text
http://localhost:8080/
```

Server lokal dibutuhkan karena browser harus memuat `doi_xml_repair.py` lewat
`fetch()`. Membuka `index.html` langsung dari file system dapat diblokir oleh
browser.

## Deploy ke GitHub Pages

1. Push isi folder ini ke repository GitHub publik.
2. Buka repository `Settings` -> `Pages`.
3. Pilih sumber deploy dari branch utama dan folder root.
4. Buka URL GitHub Pages yang diberikan GitHub.

Semua pemrosesan berjalan di browser user lewat Pyodide CDN. File XML yang
diupload tidak dikirim ke server dan tidak disimpan aplikasi.

## Kompatibilitas Browser

Aplikasi ditujukan untuk browser modern yang mendukung WebAssembly dan
`fetch()`, termasuk Microsoft Edge, Chrome, Firefox, Safari, dan browser mobile
terbaru. UI dibuat responsif untuk layar ponsel, dengan fallback pembacaan file
dan download agar tetap berjalan pada variasi browser yang lebih luas.

Crossref meminta update bibliographic metadata dikirim sebagai metadata record
lengkap, bukan hanya field yang berubah. Karena itu XML baru harus sudah berisi
metadata lengkap yang ingin dipertahankan. Crossmark dan relationship metadata
memiliki aturan update khusus di dokumentasi Crossref; cek manual jika record
mengandung elemen tersebut.

## Alur Penggunaan

1. Upload XML lama.
2. Atau pilih `Tulis DOI lama`, masukkan satu DOI per baris, lalu klik
   `Ambil Metadata Lengkap Crossref`.
3. Upload XML baru.
4. Pilih sumber URL artikel output: pakai URL dari XML baru, atau pilih
   `Tulis URL baru` lalu isi satu URL per baris sesuai urutan artikel pada XML
   baru.
5. Aplikasi otomatis membuat XML akhir jika jumlah artikel lama dan baru sama
   serta pemetaan cukup jelas.
6. Jika perlu, koreksi pemetaan artikel di tabel lalu klik `Generate Ulang`.
7. Cek ringkasan DOI dan URL artikel yang dipakai, lalu copy XML dari layar
   atau download sebagai file `.xml`.

## Batasan V1

- Fokus pada DOI artikel Crossref di `journal_article/doi_data/doi`.
- URL artikel baru hanya mengubah `journal_article/doi_data/resource` pada
  artikel yang dipetakan.
- DOI journal-level, issue-level, dan component/supplementary tidak diubah.
- Validasi yang disediakan adalah validasi struktur dasar, bukan validasi XSD
  penuh Crossref.
- Tidak ada submit otomatis ke Crossref.
- Mode DOI lama membutuhkan koneksi browser user ke Crossref REST API dan
  mengikuti rate limit publik Crossref.
- Metadata Crossref REST API ditampilkan lengkap untuk audit dan pencocokan
  saja. XML akhir tetap dibangun dari XML baru agar deposit berisi metadata
  lengkap.

## Hak Cipta dan Lisensi

Hak cipta (c) 2026 Ikhwan Arief (ikhwan[at]unand.ac.id). Aplikasi ini dibuat
oleh Ikhwan Arief dan dapat digunakan oleh publik berdasarkan lisensi Creative
Commons Attribution-NonCommercial (CC BY-NC). Penggunaan, adaptasi, dan
distribusi diperkenankan untuk tujuan nonkomersial dengan atribusi yang jelas
kepada pembuat. Penggunaan komersial memerlukan izin tertulis dari pemegang hak
cipta.
