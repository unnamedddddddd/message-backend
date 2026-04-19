import crypto from "crypto";
import encryptionAlogithm from "../configs/encryptionAlogithm.config";
import EncryptedMessage from "../types/EncryptedMessage";

export const encrypt = (message: string, secret: string) => {
  const key = crypto.createHash('sha256').update(secret).digest();
  const iv = crypto.randomBytes(12);

  const cipher = crypto.createCipheriv(encryptionAlogithm, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(message, 'utf-8'),
    cipher.final(),
  ])

  const authTag = cipher.getAuthTag();
  
  return {
    iv: iv.toString('hex'),
    content: encrypted.toString('hex'),
    tag: authTag.toString('hex'),
  }
}

export const decrypt = (encryptedMessage: EncryptedMessage, secret: string) => {
  const key = crypto.createHash('sha256').update(secret).digest();

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key, 
    Buffer.from(encryptedMessage.iv, 'hex'),
  );

  decipher.setAuthTag(Buffer.from(encryptedMessage.tag, "hex"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedMessage.content, 'hex')),
    decipher.final(),
  ]);

  return decrypted.toString('utf-8');
}