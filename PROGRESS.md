# Telegram Drive — Laporan Progress

> Proyek: Mengubah Telegram Drive dari aplikasi Desktop (Tauri) menjadi Web App / PWA
> Tanggal: 30 Juni 2026

---

## Ringkasan

Telegram Drive adalah aplikasi cloud storage open-source yang menggunakan Telegram sebagai backend penyimpanan. Source code original (`app/`) adalah aplikasi desktop Tauri + Rust + React. Kita sedang mengubahnya menjadi web app/PWA tanpa mengubah sistem yang sudah ada.

---

## ✅ Yang Sudah Diselesaikan

### 1. Analisis Project
- [x] Clone repository ke lokal
- [x] Analisis struktur, bahasa, dependency, framework, build system
- [x] Memahami cara kerja auth, upload, download, metadata, sharing, cache
- [x] Backup source code di `/tmp/opencode/Telegram-Drive.backup/`

### 2. Backend Server (Node.js)
- [x] Membuat `server/` — REST API server dengan Express.js
- [x] Endpoint tersedia:
  - `GET /api/health` — health check
  - `POST /api/auth/connect` — inisialisasi Telegram
  - `POST /api/auth/code` — request kode OTP
  - `POST /api/auth/sign-in` — login dengan kode
  - `POST /api/auth/password` — 2FA password
  - `POST /api/auth/logout` — logout
  - `GET /api/auth/status` — cek status auth
  - `GET/POST/DELETE/PATCH /api/folders` — CRUD folder
  - `GET/POST/DELETE/PATCH /api/files` — CRUD file
  - `GET /api/files/search` — search file
  - `POST /api/files/upload` — upload file (multipart)

### 3. Frontend Web
- [x] Membuat `web/` — copy dari `app/`, semua dependensi Tauri dihapus
- [x] `src/api/client.ts` — API client (fetch ke backend)
- [x] `src/api/storage.ts` — localStorage wrapper (ganti Tauri plugin-store)
- [x] `src/api/platform.ts` — deteksi platform web
- [x] Semua `invoke()` dari `@tauri-apps/api/core` → panggil `api.*()`
- [x] Semua `@tauri-apps/plugin-store` → `WebStore` (localStorage)
- [x] Semua `@tauri-apps/plugin-dialog` → HTML `<input type="file">`
- [x] Semua `@tauri-apps/plugin-os` → `navigator.userAgent`
- [x] TypeScript lolos compile (0 error tipe)
- [x] npm install berhasil (393 packages)
- [x] PWA: manifest.json + vite-plugin-pwa terkonfigurasi

### 4. Backend Rust (Rencana)
- [x] Membuat `backend/` — struktur project Rust + Actix-web
- [x] Kode siap: `state.rs`, `telegram.rs`, `files.rs`, `upload.rs`, `db.rs`, `models.rs`
- [x] Belum bisa dicompile (Rust tidak terinstall di perangkat)

---

## ❌ Yang Belum Diselesaikan

### 1. Integrasi Telegram Asli (via gramjs)
**Masalah:** Backend `server/` saat ini masih pakai data dummy (file contoh, folder contoh). Belum benar-benar terkoneksi ke Telegram API.

**Solusi:**
```bash
cd /media/devmon/HDD1/teledrive/Telegram-Drive/server
npm install telegram  # gramjs
```
Lalu ubah `src/index.js`:
- Ganti auth flow login palsu → panggil Telegram API via gramjs
- Ganti list files/data → fetch dari Telegram messages
- Ganti upload → upload ke Telegram channel via gramjs

### 2. Konfigurasi API Key Pengguna
**Masalah:** Setiap pengguna butuh `api_id` dan `api_hash` dari my.telegram.org. Saat ini belum ada form input untuk ini di frontend.

**Solusi:** Tambahkan halaman "Setup" di AuthWizard yang minta api_id dan api_hash pengguna, simpan di localStorage.

### 3. Build Production Tidak Bisa
**Masalah:** `npm run build` (vite build) gagal karena RAM tidak cukup (~300MB available). Proses esbuild terhenti dengan error `write EPIPE`.

**Solusi:**
- Jalankan build di perangkat dengan RAM lebih besar (≥4GB)
- Atau tambahkan swap lebih besar
- Atau gunakan `vite build --no-optimize-deps --minify false`

### 4. Backend Rust Tidak Bisa Compile
**Masalah:** Rust tidak terinstall. Kalaupun diinstall, compile grammers-client butuh RAM besar.

**Solusi:**
- Saat ini pakai Node.js backend (gramjs) — lebih ringan
- Jika suatu saat perlu performa tinggi, baru install Rust + compile backend Rust

### 5. Fitur Desktop-asli Belum Diadaptasi
Fitur berikut masih pakai Tauri API asli yang belum ada padanan web-nya:
- Auto-update
- File system access (save dialog, open dialog)
- System tray
- Drag & drop dari file manager

**Solusi:** Sudah di-handle dengan HTML5 API (file input, anchor download, drag-drop API)

### 6. Testing Belum Dilakukan
**Masalah:** Frontend + backend belum pernah dites bareng karena RAM tidak cukup.

**Solusi:**
```
# Terminal 1:
cd /media/devmon/HDD1/teledrive/Telegram-Drive/server
PORT=3001 node src/index.js

# Terminal 2:
cd /media/devmon/HDD1/teledrive/Telegram-Drive/web
npx vite --host 0.0.0.0

# Browser:
http://[IP]:5173
```

---

## Langkah Penyelesaian

### Prioritas Tinggi

| # | Langkah | Detail |
|---|---|---|
| 1 | **Install gramjs** | `cd server && npm install telegram` lalu integrasikan ke `src/index.js` |
| 2 | **Test frontend + backend** | Jalankan kedua server, test login, upload, download |
| 3 | **Tambahkan form api_id** | Di AuthWizard, minta user input api_id & api_hash dari my.telegram.org |
| 4 | **Deploy** | Build frontend (di perangkat cukup RAM) + deploy ke server |

### Prioritas Menengah

| # | Langkah | Detail |
|---|---|---|
| 5 | **Streaming media** | Tambah endpoint download/stream file dari Telegram |
| 6 | **Thumbnail** | Tampilkan thumbnail gambar di file list |
| 7 | **Preview** | PDF viewer, image viewer, video player |
| 8 | **Search real** | Search dari Telegram messages (bukan dari data dummy) |
| 9 | **Sharing** | Share link dengan password & expiry |

### Prioritas Rendah

| # | Langkah | Detail |
|---|---|---|
| 10 | **Compile backend Rust** | Install Rust, compile `backend/` untuk production |
| 11 | **Multi-user** | Bikin user system + workspace |
| 12 | **Offline mode** | Service Worker cache + IndexedDB |
| 13 | **Enkripsi** | AES client-side sebelum upload ke Telegram |

---

## Arsitektur Final

```
Browser (PWA)
    ↕ HTTP API
Express Server (Node.js)
    ↕ MTProto
Telegram API
```

Atau opsi production:

```
Browser (PWA)
    ↕ HTTP API
Rust Server (Actix + grammers-client)
    ↕ MTProto
Telegram API
```

---

## Catatan Penting

- **Original app (`app/`) tidak disentuh** — aman untuk referensi
- **Backup tersimpan** di `/tmp/opencode/Telegram-Drive.backup/`
- **Kendala utama** saat ini adalah RAM perangkat (~1.8GB total, ~300MB available setelah opencode berjalan)
- **Server Node.js** adalah solusi ringan untuk development di ARM dengan RAM terbatas
