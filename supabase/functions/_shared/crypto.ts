const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function deriveKey(secret: string): Promise<CryptoKey> {
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", hash, "AES-GCM", false, ["encrypt", "decrypt"]);
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function encryptText(value: string, secret: string): Promise<string> {
  const key = await deriveKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(value));
  const encryptedBytes = new Uint8Array(encrypted);
  const packed = new Uint8Array(iv.length + encryptedBytes.length);
  packed.set(iv, 0);
  packed.set(encryptedBytes, iv.length);
  return `enc:${toBase64(packed)}`;
}

export async function decryptText(value: string, secret: string): Promise<string> {
  if (!value.startsWith("enc:")) return value;
  const payload = fromBase64(value.slice(4));
  if (payload.byteLength < 13) throw new Error("Invalid encrypted payload");
  const iv = payload.slice(0, 12);
  const data = payload.slice(12);
  const key = await deriveKey(secret);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  return decoder.decode(decrypted);
}

export async function signState(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return toBase64(new Uint8Array(signature));
}

export async function verifyState(payload: string, signatureBase64: string, secret: string): Promise<boolean> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  return crypto.subtle.verify("HMAC", key, fromBase64(signatureBase64), encoder.encode(payload));
}
