# Dokumentasi Database & Enkripsi Sesi

Aplikasi Telegram Drive Multi-User SaaS mengandalkan **Supabase** (PostgreSQL) sebagai database utama dan memisahkan database internal pengguna dengan database relasional sesi Telegram.

---

## 1. Skema Tabel Database

### A. Tabel `auth.users` (Dikelola Otomatis oleh Supabase)
Tabel ini menyimpan data akun portal pengguna (email, password_hash, dll.). Supabase menangani autentikasi dan pendaftaran secara mandiri di skema `auth`.

### B. Tabel `public.telegram_sessions`
Tabel kustom di skema `public` yang memetakan akun pengguna portal ke akun Telegram mereka masing-masing.

| Nama Kolom | Tipe Data | Keterangan |
| :--- | :--- | :--- |
| `id` | `uuid` (PK) | UUID unik entri (default `gen_random_uuid()`). |
| `user_id` | `uuid` (FK) | Merujuk ke `auth.users(id)` dengan relasi `on delete cascade`. |
| `telegram_user_id` | `bigint` | ID Akun Telegram unik milik pengguna. |
| `api_id` | `integer` | API ID Telegram milik pengguna. |
| `api_hash_encrypted` | `text` | API Hash Telegram pengguna yang dienkripsi **AES-256-GCM**. |
| `session_string_encrypted` | `text` | String sesi GramJS terenkripsi **AES-256-GCM**. |
| `updated_at` | `timestamp` | Waktu pembaruan terakhir. |

### C. Tabel `public.invitations`
Tabel kustom di skema `public` untuk melacak token pendaftaran yang sah (hanya bisa diisi oleh admin/service-role).

| Nama Kolom | Tipe Data | Keterangan |
| :--- | :--- | :--- |
| `id` | `uuid` (PK) | UUID unik entri (default `gen_random_uuid()`). |
| `token` | `text` (Unique)| Token string unik yang wajib dimasukkan saat pendaftaran. |
| `used_at` | `timestamp` | Waktu token digunakan (null jika belum terpakai). |
| `created_at` | `timestamp` | Waktu pembuatan token (default `now()`). |

---

## 2. Keamanan & Kebijakan RLS (Row Level Security)

Untuk menjamin bahwa pengguna tidak dapat membaca sesi Telegram pengguna lain, kita mengaktifkan kebijakan RLS tingkat baris di Supabase.

### SQL Query untuk Inisialisasi:
```sql
-- Aktifkan RLS
alter table public.telegram_sessions enable row level security;

-- Buat aturan agar user hanya bisa membaca/menulis data milik mereka sendiri
create policy "Users can view their own telegram session."
  on public.telegram_sessions for select
  using (auth.uid() = user_id);

create policy "Users can insert their own telegram session."
  on public.telegram_sessions for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own telegram session."
  on public.telegram_sessions for update
  using (auth.uid() = user_id);

create policy "Users can delete their own telegram session."
  on public.telegram_sessions for delete
  using (auth.uid() = user_id);

-- Inisialisasi tabel invitations
create table public.invitations (
  id uuid default gen_random_uuid() primary key,
  token text unique not null,
  used_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS untuk tabel invitations (hanya admin/service_role yang bisa mengubah)
alter table public.invitations enable row level security;

-- Opsional: Mengizinkan siapa saja memeriksa apakah token valid saat register
create policy "Anyone can read token validation details"
  on public.invitations for select
  using (true);
```

---

## 3. Enkripsi Sesi (AES-256-GCM)

Sebelum disimpan ke tabel `telegram_sessions`, data sesi GramJS (`session_string`) dan `api_hash` wajib dienkripsi di server menggunakan berkas **[crypto.js](file:///c:/Users/ibrah/Downloads/teledrive/server/src/crypto.js)**.

* **Algoritma:** AES-256-GCM.
* **Master Key:** Dimuat dari variabel lingkungan `ENCRYPTION_KEY` (harus berupa 32-byte hex string, contoh: 64 karakter hex).
* **Format Penyimpanan:** `iv:authTag:encryptedHex`
  * `iv` (12-byte hex): Vektor inisiasi acak unik untuk setiap enkripsi.
  * `authTag` (16-byte hex): Tag integritas untuk memastikan data tidak dimanipulasi.
  * `encryptedHex`: Teks terenkripsi.

---

## 4. Variabel Lingkungan (.env) yang Diperlukan

### Backend Server (`server/.env`):
```env
PORT=3000
SUPABASE_URL=https://xxxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=service_role_key_anda_disini
ENCRYPTION_KEY=hex_key_32_bytes_acak_disini
```

### Web Client (`web/.env`):
```env
VITE_SUPABASE_URL=https://xxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=anon_public_key_anda_disini
```

### Desktop Client (`app/.env`):
```env
VITE_SUPABASE_URL=https://xxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=anon_public_key_anda_disini
```
