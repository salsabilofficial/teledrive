# Panduan Deploy Backend ke Hugging Face Spaces (Gratis)

Hugging Face Spaces adalah alternatif gratis terbaik untuk mendeploy backend Docker 24 jam nonstop tanpa memerlukan kartu kredit.

---

## 📋 Langkah-Langkah Deploy

### Langkah 1 — Buat Space Baru di Hugging Face
1. Buat akun gratis di **[huggingface.co](https://huggingface.co/)** (tidak perlu kartu kredit/pembayaran).
2. Di dashboard, klik foto profil di kanan atas → pilih **"New Space"**.
3. Isi konfigurasi:
   * **Space Name:** `teledrive` (atau bebas).
   * **License:** `mit` (bebas).
   * **Space SDK:** Pilih **Docker** 🐳.
   * **Docker template:** Pilih **Blank**.
   * **Space Visibility:** Pilih **Public** (wajib agar Vercel dapat mengakses API).
4. Klik **"Create Space"**.

---

### Langkah 2 — Hubungkan dan Unggah Berkas
Karena Hugging Face menggunakan Git, Anda dapat mengunggah folder `server` langsung ke Space Anda:

1. Buka terminal/CMD di komputer Anda pada folder **`server/`**.
2. Jalankan perintah inisialisasi Git:
   ```bash
   git init
   git add .
   git commit -m "feat: deploy to hugging face"
   ```
3. Hubungkan git lokal ke Hugging Face (salin alamat remote HTTPS dari halaman Space Anda):
   ```bash
   git remote add hf https://huggingface.co/spaces/USERNAME_ANDA/NAMA_SPACE
   ```
4. Push ke cabang utama (`main`):
   ```bash
   git push -f hf master:main
   ```
   * **Username:** Gunakan username Hugging Face Anda.
   * **Password:** Gunakan **Access Token (Write)** Anda yang dibuat di [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens).

> **Catatan Teknis:** Di dalam folder `server`, berkas `README.md` memiliki frontmatter khusus yang memaksa Hugging Face mengenali kontainer sebagai Docker yang berjalan pada port `3000` (`app_port: 3000`).

---

### Langkah 3 — Atur Secrets (Environment Variables)
Di halaman Hugging Face Space Anda:
1. Masuk ke tab **Settings** di kanan atas.
2. Cari bagian **Variables and secrets** → klik **"New secret"** untuk menambahkan variabel berikut:

| Name (Secret Key) | Value |
| :--- | :--- |
| `SUPABASE_URL` | URL Proyek Supabase Anda |
| `SUPABASE_SERVICE_ROLE_KEY` | Service Role Key Supabase Anda |
| `ENCRYPTION_KEY` | Kunci enkripsi AES-256-GCM (32-byte hex) |
| `ALLOWED_ORIGINS` | `*` (atau domain spesifik dipisah koma) |
| `PORT` | `3000` |

---

### Langkah 4 — Hubungkan Vercel ke Hugging Face Backend
Setelah status Space berubah menjadi **"Running"** (hijau):
1. Dapatkan URL backend Anda (contoh: `https://username-space.hf.space`).
2. Masuk ke pengaturan proyek frontend Anda di **Vercel**.
3. Di **Settings > Environment Variables**, tambahkan:
   * **Key:** `VITE_API_URL`
   * **Value:** `https://username-space.hf.space`
4. Lakukan **Redeploy** di Vercel agar perubahan terserap.
