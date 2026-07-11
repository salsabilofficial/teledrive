import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const CACHE_DIR = path.join(process.cwd(), 'cache');
const THUMB_DIR = path.join(CACHE_DIR, 'thumbs');
const PREVIEW_DIR = path.join(CACHE_DIR, 'previews');

// Ensure cache directories exist on import
for (const dir of [CACHE_DIR, THUMB_DIR, PREVIEW_DIR]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Generate a stable cache key for a media file.
 * folder_id can be null (root/me), so we normalize it.
 */
function cacheKey(folderId, messageId) {
  const folder = folderId ?? 'root';
  return `${folder}_${messageId}`;
}

/**
 * Get the file path for a cached thumbnail.
 */
export function thumbPath(folderId, messageId) {
  return path.join(THUMB_DIR, `${cacheKey(folderId, messageId)}.jpg`);
}

/**
 * Get the file path for a cached preview.
 */
export function previewPath(folderId, messageId) {
  return path.join(PREVIEW_DIR, `${cacheKey(folderId, messageId)}.bin`);
}

/**
 * Check if a cached thumbnail exists.
 */
export function hasThumb(folderId, messageId) {
  return fs.existsSync(thumbPath(folderId, messageId));
}

/**
 * Check if a cached preview exists.
 */
export function hasPreview(folderId, messageId) {
  return fs.existsSync(previewPath(folderId, messageId));
}

/**
 * Save a buffer as a cached thumbnail.
 */
export function saveThumb(folderId, messageId, buffer) {
  try {
    fs.writeFileSync(thumbPath(folderId, messageId), buffer);
    return true;
  } catch (e) {
    console.error('[cache] failed to save thumbnail:', e.message);
    return false;
  }
}

/**
 * Save a buffer as a cached preview, along with metadata.
 */
export function savePreview(folderId, messageId, buffer, meta = {}) {
  try {
    const filePath = previewPath(folderId, messageId);
    fs.writeFileSync(filePath, buffer);
    // Save metadata alongside
    const metaPath = filePath + '.meta.json';
    fs.writeFileSync(metaPath, JSON.stringify({
      mimeType: meta.mimeType || 'application/octet-stream',
      fileName: meta.fileName || '',
      size: buffer.length,
      cachedAt: new Date().toISOString()
    }));
    return true;
  } catch (e) {
    console.error('[cache] failed to save preview:', e.message);
    return false;
  }
}

/**
 * Read a cached thumbnail buffer. Returns null if not cached.
 */
export function readThumb(folderId, messageId) {
  const fp = thumbPath(folderId, messageId);
  if (!fs.existsSync(fp)) return null;
  try {
    return fs.readFileSync(fp);
  } catch {
    return null;
  }
}

/**
 * Read a cached preview buffer + metadata. Returns null if not cached.
 */
export function readPreview(folderId, messageId) {
  const fp = previewPath(folderId, messageId);
  if (!fs.existsSync(fp)) return null;
  try {
    const buffer = fs.readFileSync(fp);
    const metaPath = fp + '.meta.json';
    let meta = {};
    if (fs.existsSync(metaPath)) {
      meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    }
    return { buffer, meta };
  } catch {
    return null;
  }
}

/**
 * Generate an ETag from a buffer for conditional responses.
 */
export function etag(buffer) {
  return `"${crypto.createHash('md5').update(buffer).digest('hex')}"`;
}

/**
 * Invalidate (delete) cached thumbnail and preview for a file.
 */
export function invalidate(folderId, messageId) {
  const paths = [
    thumbPath(folderId, messageId),
    previewPath(folderId, messageId),
    previewPath(folderId, messageId) + '.meta.json'
  ];
  for (const fp of paths) {
    try {
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    } catch (e) {
      console.error('[cache] invalidation failed for', fp, e.message);
    }
  }
}

/**
 * Invalidate all cached files for a folder (e.g. when folder is deleted).
 */
export function invalidateFolder(folderId) {
  const prefix = `${folderId ?? 'root'}_`;
  for (const dir of [THUMB_DIR, PREVIEW_DIR]) {
    try {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        if (file.startsWith(prefix)) {
          fs.unlinkSync(path.join(dir, file));
        }
      }
    } catch (e) {
      console.error('[cache] folder invalidation failed:', e.message);
    }
  }
}

/**
 * Get cache stats (file count and total size).
 */
export function stats() {
  let thumbCount = 0, thumbSize = 0;
  let previewCount = 0, previewSize = 0;
  
  try {
    const thumbFiles = fs.readdirSync(THUMB_DIR);
    for (const f of thumbFiles) {
      const s = fs.statSync(path.join(THUMB_DIR, f));
      thumbCount++;
      thumbSize += s.size;
    }
  } catch {}

  try {
    const previewFiles = fs.readdirSync(PREVIEW_DIR).filter(f => !f.endsWith('.meta.json'));
    for (const f of previewFiles) {
      const s = fs.statSync(path.join(PREVIEW_DIR, f));
      previewCount++;
      previewSize += s.size;
    }
  } catch {}

  return { thumbCount, thumbSize, previewCount, previewSize };
}

/**
 * Cleanup stale cache entries. Removes files older than maxAgeMs.
 * Default: 30 days.
 */
export function cleanupStale(maxAgeMs = 30 * 24 * 60 * 60 * 1000) {
  const now = Date.now();
  let removed = 0;
  
  for (const dir of [THUMB_DIR, PREVIEW_DIR]) {
    try {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const fp = path.join(dir, file);
        const stat = fs.statSync(fp);
        if (now - stat.mtimeMs > maxAgeMs) {
          fs.unlinkSync(fp);
          removed++;
        }
      }
    } catch {}
  }
  
  if (removed > 0) {
    console.log(`[cache] cleaned up ${removed} stale cache file(s)`);
  }
  return removed;
}
