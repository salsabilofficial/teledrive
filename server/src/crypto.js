import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits IV is standard for GCM
const KEY_LENGTH = 32;

/**
 * Encrypt a string using AES-256-GCM
 * @param {string} text 
 * @returns {string} Encrypted string in format "iv:authTag:encryptedHex"
 */
export function encrypt(text) {
  const encryptionKeyHex = process.env.ENCRYPTION_KEY;
  if (!encryptionKeyHex) {
    throw new Error('ENCRYPTION_KEY environment variable is not defined!');
  }
  const key = Buffer.from(encryptionKeyHex, 'hex');
  if (key.length !== KEY_LENGTH) {
    throw new Error('ENCRYPTION_KEY must be exactly 32 bytes (64 hex characters) for AES-256!');
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag().toString('hex');
  
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypt a string using AES-256-GCM
 * @param {string} encryptedText in format "iv:authTag:encryptedHex"
 * @returns {string} Decrypted original string
 */
export function decrypt(encryptedText) {
  const encryptionKeyHex = process.env.ENCRYPTION_KEY;
  if (!encryptionKeyHex) {
    throw new Error('ENCRYPTION_KEY environment variable is not defined!');
  }
  const key = Buffer.from(encryptionKeyHex, 'hex');
  if (key.length !== KEY_LENGTH) {
    throw new Error('ENCRYPTION_KEY must be exactly 32 bytes (64 hex characters) for AES-256!');
  }

  const parts = encryptedText.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted format');
  }

  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}
