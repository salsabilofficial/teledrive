# Panduan Deploy Backend ke Render (Gratis)

## Persiapan Sebelum Deploy

### Langkah 0 — Upload Kode ke GitHub

Render membaca kode langsung dari GitHub. Pastikan kamu sudah:
1. Buat repository di GitHub (boleh Private)
2. Push seluruh folder `teledrive` ke repository tersebut

```bash
# Di folder teledrive (root project)
git add .
git commit -m "feat: multi-user saas backend"
git push origin main
```

> **Penting:** File `.env` sudah ada di `.gitignore` jadi kredensial kamu **tidak** akan ikut ter-push ke GitHub. Aman!

---

## Langkah 1 — Daftar & Login ke Render

1. Buka **[render.com](https://render.com)**
2. Klik **"Get Started for Free"**
3. Daftar menggunakan akun **GitHub** (lebih mudah, langsung terhubung)

---

## Langkah 2 — Buat Web Service Baru

1. Di dashboard Render, klik tombol **"+ New"** → pilih **"Web Service"**
2. Pilih **"Connect a repository"** → pilih repo `teledrive` kamu
3. Klik **"Connect"**

---

## Langkah 3 — Konfigurasi Service

Isi form konfigurasi seperti ini:

| Field | Nilai |
|---|---|
| **Name** | `teledrive-backend` (bebas) |
| **Region** | Singapore (paling dekat untuk Indonesia) |
| **Branch** | `main` |
| **Root Directory** | `server` ← **Penting!** |
| **Runtime** | `Node` |
| **Build Command** | `npm install` |
| **Start Command** | `node src/index.js` |
| **Instance Type** | `Free` |

---

## Langkah 4 — Set Environment Variables

Klik tab **"Environment"** → tambahkan variabel berikut satu per satu:

| Key | Value |
|---|---|
| `SUPABASE_URL` | `https://oqtoridtcvkdikrvxuhj.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGciOiJIUzI1N...` (Service Role Key kamu) |
| `ENCRYPTION_KEY` | `a7d2c38fde649e39401f8d42426bfb7d18ee08adcd167b5e40e6c518b2b64d1f` |
| `ALLOWED_ORIGINS` | `https://your-frontend.vercel.app` (isi setelah frontend di-deploy ke Vercel) |
| `NODE_ENV` | `production` |

> **Catatan:** Untuk `ALLOWED_ORIGINS`, sementara isi dulu `*` agar bisa ditest. Ganti ke domain Vercel setelah frontend selesai deploy.

---

## Langkah 5 — Deploy!

1. Klik tombol **"Create Web Service"**
2. Render akan otomatis mulai proses build dan deploy
3. Tunggu 2-3 menit hingga status berubah menjadi **"Live"** (hijau)

Kamu akan mendapatkan URL seperti:
```
https://teledrive-backend.onrender.com
```

---

## Langkah 6 — Verifikasi Deploy Berhasil

Buka URL berikut di browser:
```
https://teledrive-backend.onrender.com/api/health
```

Jika berhasil, kamu akan melihat response seperti ini:
```json
{
  "status": "ok",
  "version": "1.0.0",
  "uptime": 12,
  "activeConnections": 0,
  "timestamp": "2026-07-04T..."
}
```

---

## Langkah 7 — Setup UptimeRobot (Agar Server Tidak Tidur)

1. Daftar gratis di **[uptimerobot.com](https://uptimerobot.com)**
2. Klik **"+ Add New Monitor"**
3. Isi konfigurasi:
   ```
   Monitor Type     : HTTP(s)
   Friendly Name    : Telegram Drive Backend
   URL              : https://teledrive-backend.onrender.com/api/health
   Interval         : Every 5 minutes
   ```
4. Klik **"Create Monitor"**

Selesai! Server kamu sekarang tidak akan pernah tidur dan kamu mendapat notifikasi email jika server down.

---

## Langkah 8 — Update Frontend (Vercel)

Setelah backend live di Render, update environment variable di Vercel:
- Tambahkan `VITE_API_URL` = `https://teledrive-backend.onrender.com`

Dan update `ALLOWED_ORIGINS` di Render dengan URL Vercel frontend kamu.
