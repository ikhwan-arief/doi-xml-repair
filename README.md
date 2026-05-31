# DOI XML Repair

Aplikasi statis untuk GitHub Pages yang memperbaiki XML Crossref dengan
mengunci DOI artikel lama secara penuh. Metadata diambil dari XML baru, tetapi
nilai `journal_article/doi_data/doi` pada output disalin dari XML lama.
Timestamp output otomatis dinaikkan agar sesuai dengan kebutuhan update
metadata Crossref.

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

Crossref meminta update bibliographic metadata dikirim sebagai metadata record
lengkap, bukan hanya field yang berubah. Karena itu XML baru harus sudah berisi
metadata lengkap yang ingin dipertahankan. Crossmark dan relationship metadata
memiliki aturan update khusus di dokumentasi Crossref; cek manual jika record
mengandung elemen tersebut.

## Alur Penggunaan

1. Upload XML lama.
2. Upload XML baru.
3. Aplikasi otomatis membuat XML akhir jika jumlah artikel lama dan baru sama.
4. Jika perlu, koreksi pemetaan artikel di tabel lalu klik `Generate Ulang`.
5. Copy XML dari layar atau download sebagai file `.xml`.

## Batasan V1

- Fokus pada DOI artikel Crossref di `journal_article/doi_data/doi`.
- DOI journal-level, issue-level, dan component/supplementary tidak diubah.
- Validasi yang disediakan adalah validasi struktur dasar, bukan validasi XSD
  penuh Crossref.
- Tidak ada submit otomatis ke Crossref.
