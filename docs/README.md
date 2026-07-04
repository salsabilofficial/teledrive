# Dokumentasi Arsitektur Telegram Drive (Multi-User SaaS)

Folder ini berisi dokumentasi teknis mengenai alur kerja (workflow) dan struktur database yang diimplementasikan pada Telegram Drive versi Multi-User.

## Daftar Dokumen Teknis

1. **[Struktur Database (DATABASE.md)](file:///c:/Users/ibrah/Downloads/teledrive/docs/DATABASE.md)**
   Menjelaskan struktur tabel, keamanan enkripsi sesi, kebijakan RLS (Row Level Security), dan variabel lingkungan (.env) yang digunakan.
   
2. **[Alur Kerja Sistem (WORKFLOW.md)](file:///c:/Users/ibrah/Downloads/teledrive/docs/WORKFLOW.md)**
   Menjelaskan alur autentikasi ganda (Supabase Portal + Telegram OTP), manajemen memori client aktif (Multi-Client Manager), dan alur streaming file.

## Peta Arsitektur Sistem

```mermaid
graph TD
    Browser[Browser Client] <-->|API Request + JWT Token| Express[Express.js Server]
    Express <-->|Crypto module / AES-256-GCM| Crypt[Crypto Handler]
    Express <-->|Admin Query| Supabase[(Supabase Database)]
    Express <-->|Stateless / Connection Map| Manager[Client Manager]
    Manager <-->|Direct Chunks / WSS| Telegram[Telegram API Server]
```
