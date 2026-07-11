import { EventEmitter } from 'events';

class UploadTracker extends EventEmitter {
  constructor() {
    super();
    this.uploads = new Map();
  }

  create(uploadId, userId, fileName, totalBytes) {
    const upload = {
      id: uploadId,
      userId,
      fileName,
      totalBytes,
      serverBytes: 0,
      tgBytes: 0,
      status: 'queued', // queued, uploading_to_server, uploading_to_tg, done, cancelled, failed
      error: null,
      abortController: new AbortController(),
      clients: new Set()
    };
    this.uploads.set(uploadId, upload);
    this.emit('create', upload);
    return upload;
  }

  get(uploadId) {
    return this.uploads.get(uploadId);
  }

  update(uploadId, fields) {
    const upload = this.uploads.get(uploadId);
    if (!upload) return;
    Object.assign(upload, fields);
    this.emit('update', upload);
    
    // Broadcast progress to connected SSE clients
    const payload = {
      id: upload.id,
      status: upload.status,
      serverBytes: upload.serverBytes,
      tgBytes: upload.tgBytes,
      totalBytes: upload.totalBytes,
      error: upload.error
    };
    
    for (const client of upload.clients) {
      try {
        client.write(`data: ${JSON.stringify(payload)}\n\n`);
      } catch (err) {
        console.error('[UploadTracker] Error broadcasting to SSE client:', err);
      }
    }
  }

  cancel(uploadId) {
    const upload = this.uploads.get(uploadId);
    if (!upload) return false;
    
    if (upload.status !== 'done' && upload.status !== 'failed' && upload.status !== 'cancelled') {
      this.update(uploadId, { status: 'cancelled' });
      upload.abortController.abort();
      this.emit('cancel', uploadId);
      return true;
    }
    return false;
  }

  remove(uploadId) {
    const upload = this.uploads.get(uploadId);
    if (!upload) return;
    
    // Close SSE streams
    for (const client of upload.clients) {
      try {
        client.end();
      } catch (_) {}
    }
    
    this.uploads.delete(uploadId);
    this.emit('remove', uploadId);
  }

  addSseClient(uploadId, res) {
    const upload = this.uploads.get(uploadId);
    if (!upload) {
      res.write(`data: ${JSON.stringify({ error: 'Upload not found' })}\n\n`);
      res.end();
      return;
    }
    
    upload.clients.add(res);
    
    // Send initial state
    res.write(`data: ${JSON.stringify({
      id: upload.id,
      status: upload.status,
      serverBytes: upload.serverBytes,
      tgBytes: upload.tgBytes,
      totalBytes: upload.totalBytes,
      error: upload.error
    })}\n\n`);
  }

  removeSseClient(uploadId, res) {
    const upload = this.uploads.get(uploadId);
    if (upload) {
      upload.clients.delete(res);
    }
  }
}

export const uploadTracker = new UploadTracker();
