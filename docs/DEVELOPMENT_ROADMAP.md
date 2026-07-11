# Teledrive Web Development Roadmap

> Dokumen gabungan untuk roadmap pengembangan web, rencana sprint, dan ringkasan progres implementasi.
> Updated: 2026-07-11

---

## Ringkasan Status

Teledrive web saat ini sudah melewati fondasi inti untuk:
- media flow yang terpisah dan lebih cepat
- upload progress + cancel
- file list yang lebih responsif
- metadata index lokal berbasis JSON/in-memory
- disk cache thumbnail/preview
- search/filter berbasis metadata index
- hardening lifecycle Telegram client
- background worker/queue internal

Status implementasi terbaru: **Sprint 1–8 selesai / usable**, dengan fokus berikutnya pada observability, admin controls queue, dan hardening lanjutan.

---

## Tujuan Utama

1. Membuat versi web terasa cepat untuk browse, preview, upload, dan download.
2. Menstabilkan lifecycle Telegram client dan request media agar tidak gampang timeout / reconnect aneh.
3. Menambahkan metadata index, thumbnail cache, dan worker pipeline agar tidak terus bergantung pada fetch mentah dari Telegram.
4. Menjadikan versi web nyaman untuk file banyak, file besar, dan akses lintas device.
5. Memanfaatkan keunggulan web (sharing, background jobs, observability), bukan sekadar meniru desktop.

---

## Prinsip Pengembangan

- Jangan ubah desktop workflow yang sudah bagus bila tidak perlu.
- Adaptasi keunggulan desktop hanya pada area yang berdampak nyata untuk web UX.
- Pisahkan pekerjaan berdasarkan impact: UX dulu, lalu data/indexing, lalu stability, lalu advanced features.
- Hindari refactor besar tanpa indikator keberhasilan yang bisa diukur.
- Prioritaskan request path yang cepat; tugas berat dipindahkan ke cache/index/worker.

---

## Fase Roadmap

### Fase 1 — Core UX & Performance
1. Media preview & streaming stabilization
2. Upload manager v1
3. Download & preview performance tuning
4. File list responsiveness

### Fase 2 — Metadata, Cache, dan Search
5. Metadata indexing layer
6. Thumbnail & preview cache pipeline
7. Search & filter engine

### Fase 3 — Stability & Background Processing
8. Telegram client lifecycle hardening
9. Background worker / job queue
10. Error handling & observability

### Fase 4 — Advanced UX
11. Bulk file operations
12. Share / public link workflow
13. Better PWA experience
14. Activity log & history

### Fase 5 — Scale & Hardening
15. Split service architecture
16. Database refinement
17. Security hardening

---

## Sprint Summary

### Sprint 1 — Media Flow Foundation ✅
**Goal:** memisahkan alur media (`thumbnail`, `preview`, `stream`, `download`) dan mempercepat UX media.

**Implemented:**
- backend route media dipisah menjadi endpoint spesifik
- frontend consumer media disesuaikan ke endpoint baru
- header/cache/preview/streaming dirapikan

**Key files:**
- `server/src/index.js`
- `server/src/telegram.js`
- `web/src/api/client.ts`
- `web/src/components/desktop/dashboard/FileCard.tsx`
- `web/src/components/desktop/dashboard/PreviewModal.tsx`
- `web/src/components/desktop/dashboard/MediaPlayer.tsx`

### Sprint 2 — Upload UX & Cancel Support ✅
**Goal:** upload terasa kuat dan informatif.

**Implemented:**
- in-memory `UploadTracker`
- SSE progress endpoint
- cancel endpoint
- frontend XHR progress + abort/cancel wiring

**Key files:**
- `server/src/uploadTracker.js`
- `server/src/index.js`
- `web/src/api/client.ts`
- `web/src/context/TransferQueueContext.tsx`

### Sprint 3 — File List Responsiveness ✅
**Goal:** browse folder besar tetap nyaman.

**Implemented:**
- debounce search 500ms
- infinite scroll
- virtualization
- optimistic delete/move/rename

### Sprint 4 — Metadata Index Layer ✅
**Goal:** list/search cepat tanpa scan Telegram penuh terus-menerus.

**Implemented:**
- local metadata DB (`server/data.json` + `src/db.js`)
- async background sync saat list request
- mutation sync untuk upload/delete/rename/move
- startup warmup sync

### Sprint 5 — Thumbnail & Preview Cache Pipeline ✅
**Goal:** preview tidak perlu diambil ulang terus-menerus.

**Implemented:**
- disk cache thumbnail/preview
- ETag + `If-None-Match`
- invalidation saat delete/move/folder delete
- cleanup stale cache saat startup

**Key files:**
- `server/src/mediaCache.js`
- `server/src/telegram.js`
- `server/src/index.js`

### Sprint 6 — Search & Filter Engine ✅
**Goal:** file discovery cepat dan berguna.

**Implemented:**
- query metadata by folder/text/mime/date/size/sort/order
- frontend `FilterBar`
- session persistence untuk filter
- debounced querying

**Key files:**
- `server/src/db.js`
- `server/src/index.js`
- `web/src/components/desktop/dashboard/FilterBar.tsx`
- `web/src/components/desktop/DesktopDashboard.tsx`

### Sprint 7 — Telegram Client Lifecycle Hardening ✅
**Goal:** backend tidak gampang disconnect, timeout, atau leak.

**Implemented:**
- state machine client (`connected`, `connecting`, `failed`, `disconnected`)
- reconnect backoff
- disconnect listener
- healthcheck `getMe()`
- cleanup fatal session invalid/revoked

**Key files:**
- `server/src/clientManager.js`

### Sprint 8 — Background Worker / Queue ✅
**Goal:** tugas berat tidak menumpuk di request HTTP.

**Implemented:**
- in-memory internal queue dengan concurrency, retry, priority
- active job tracking + dedup
- folder sync offload ke queue
- thumbnail pre-cache background
- temp upload cleanup worker
- debug endpoint `/api/debug/queue`
- queue dirapikan agar tidak membanjiri worker

**Key files:**
- `server/src/queue.js`
- `server/src/index.js`
- `server/src/telegram.js`

---

## Sprint 1 Detailed Planning Notes (Historical)

Sprint 1 awalnya difokuskan pada:
- pemecahan route media di backend
- helper media modular di `telegram.js`
- alignment frontend ke route baru
- baseline pengukuran latency thumbnail dan first-frame video

Perencanaan detail ini kini dianggap sudah terserap ke implementasi dan tidak lagi dipelihara sebagai dokumen terpisah.

---

## Sprint 9+ Prioritas Lanjutan

### Sprint 9 — Observability & Diagnostics
**Goal:** mudah tahu bottleneck saat user bilang “lambat”.

Target berikut:
- structured logging endpoint penting
- metrics sederhana:
  - active Telegram clients
  - upload count
  - cache hit/miss
  - queue depth/job type
  - stream latency
- admin/debug controls queue:
  - pause
  - resume
  - clear pending thumbnail jobs
- pemisahan metrics per job type

### Sprint 10+ (Opsional)
- persistent queue jika memang butuh survive restart
- metadata backfill worker yang lebih eksplisit
- split service architecture jika traffic tumbuh
- security hardening lanjutan

---

## Validasi Operasional Saat Ini

Checklist status terbaru:
- `teledrive.service` aktif dan enabled
- backend health `status: ok`
- active Telegram session utama connected
- queue worker aktif dan tidak paused
- failed background jobs = 0 saat pengecekan terakhir
- cache directory `server/cache/thumbs` dan `server/cache/previews` aktif

Known issue non-blocking:
- masih ada 1 stale Telegram session lama yang gagal decrypt/auth, tapi tidak mengganggu sesi aktif utama

---

## Referensi Terkait

- `PROGRESS.md` — ringkasan progres proyek
- `docs/README.md` — indeks dokumentasi
- `docs/WORKFLOW.md` — alur kerja sistem
- `docs/DATABASE.md` — struktur data dan persistence
- `REST_API_Documentation.md` — dokumentasi API
