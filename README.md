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

## Quick Start Guide

1. **Step 1 (Old Data):** Upload your old Crossref XML file, or select **Enter old DOIs** to paste one DOI per line and click **Fetch Full Crossref Metadata**.
2. **Step 2 (New XML):** Upload your new Crossref XML file containing the updated metadata.
3. **Configure URL Output:** Choose to **Use URL from new XML** or **Enter new URLs** manually (one URL per line in the order of the new XML).
4. **DOI Mapping:** The tool automatically maps new articles to old DOIs based on title similarity. If the counts differ or you want to correct any pairs, adjust the mapping dropdowns manually.
5. **Generate Output:** The final XML is generated automatically if mapping is clear. Click **Regenerate** to update if you manually change any dropdown values.
6. **Export XML:** Review the summary of applied DOIs and URLs, then click **Copy** or **Download** to obtain your repaired Crossref XML file.

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
