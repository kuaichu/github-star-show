import crypto from "node:crypto";

const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

export function decodeTokenEncryptionKey(encoded = process.env.GITHUB_TOKEN_ENCRYPTION_KEY || "") {
  if (!encoded) return null;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 !== 0) {
    throw new Error("GITHUB_TOKEN_ENCRYPTION_KEY must be canonical base64.");
  }
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32 || key.toString("base64") !== encoded) {
    throw new Error("GITHUB_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes.");
  }
  return key;
}

export function assertTokenEncryptionConfigured() {
  const key = decodeTokenEncryptionKey();
  if (!key && process.env.NODE_ENV === "production") {
    throw new Error("GITHUB_TOKEN_ENCRYPTION_KEY is required in production.");
  }
  return key;
}

export function isEncryptedGithubToken(value) {
  return typeof value === "string" && value.startsWith(`${VERSION}.`);
}

export function encryptGithubToken(plaintext, key = decodeTokenEncryptionKey()) {
  if (typeof plaintext !== "string" || !plaintext) {
    throw new Error("A non-empty GitHub access token is required.");
  }
  if (!key) {
    throw new Error("GITHUB_TOKEN_ENCRYPTION_KEY is required before storing GitHub tokens.");
  }

  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(Buffer.from(VERSION));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptGithubToken(storedValue, key = decodeTokenEncryptionKey()) {
  if (typeof storedValue !== "string" || !storedValue) return "";
  if (!isEncryptedGithubToken(storedValue)) {
    if (!key) throw new Error("GITHUB_TOKEN_ENCRYPTION_KEY is required to migrate legacy GitHub tokens.");
    return storedValue;
  }
  if (!key) throw new Error("GITHUB_TOKEN_ENCRYPTION_KEY is required to read GitHub tokens.");

  const parts = storedValue.split(".");
  if (parts.length !== 4) throw new Error("Encrypted GitHub token has an invalid format.");
  try {
    const iv = Buffer.from(parts[1], "base64url");
    const tag = Buffer.from(parts[2], "base64url");
    const ciphertext = Buffer.from(parts[3], "base64url");
    if (iv.length !== IV_BYTES || tag.length !== 16 || ciphertext.length === 0) throw new Error("invalid envelope");
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAAD(Buffer.from(VERSION));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("Unable to decrypt the stored GitHub token.");
  }
}
