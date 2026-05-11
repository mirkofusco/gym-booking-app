import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { APP_CONFIG } from "./config.js";

const sessions = new Map();
const revokedTokens = new Map();

export function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  const hash = scryptSync(password, salt, 64).toString("hex");
  return { hash, salt };
}

export function verifyPassword(password, passwordHash, passwordSalt) {
  const candidate = scryptSync(password, passwordSalt, 64);
  const expected = Buffer.from(passwordHash, "hex");
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}

export function makeUser({
  username,
  name,
  firstName,
  lastName,
  email = "",
  role,
  password,
  notes = ""
}) {
  const normalizedUsername = String(username || "").trim().toLowerCase();
  const normalizedFirstName = String(firstName || "").trim();
  const normalizedLastName = String(lastName || "").trim();
  const normalizedName = String(
    name || `${normalizedFirstName} ${normalizedLastName}`.trim() || normalizedUsername
  ).trim();
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedRole = role === "admin" ? "admin" : "user";
  const { hash, salt } = hashPassword(password);
  const now = new Date().toISOString();

  return {
    id: randomUUID(),
    username: normalizedUsername,
    name: normalizedName,
    firstName: normalizedFirstName || normalizedName.split(" ")[0] || normalizedName,
    lastName: normalizedLastName || normalizedName.split(" ").slice(1).join(" "),
    email: normalizedEmail,
    notes: String(notes || "").trim(),
    notificationsEnabled: true,
    role: normalizedRole,
    passwordHash: hash,
    passwordSalt: salt,
    active: true,
    createdAt: now,
    updatedAt: now,
    lastActivityAt: null
  };
}

export function sanitizeUser(user) {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    firstName: user.firstName || "",
    lastName: user.lastName || "",
    email: user.email || "",
    notes: user.notes || "",
    notificationsEnabled: user.notificationsEnabled !== false,
    role: user.role,
    active: user.active,
    createdAt: user.createdAt || null,
    updatedAt: user.updatedAt || null,
    lastActivityAt: user.lastActivityAt || null
  };
}

export function createSession(userId) {
  const now = Date.now();
  const token = signSessionToken({
    u: String(userId),
    exp: now + APP_CONFIG.sessionTtlMs
  });
  sessions.set(token, {
    userId,
    createdAt: now,
    expiresAt: now + APP_CONFIG.sessionTtlMs
  });
  return token;
}

export function readAuthToken(req) {
  const header = String(req.headers.authorization || "");
  if (!header.startsWith("Bearer ")) return "";
  return header.slice(7).trim();
}

export function getSessionFromRequest(req) {
  const token = readAuthToken(req);
  return getSessionFromToken(token);
}

export function getSessionFromToken(token) {
  if (!token) return null;
  clearExpiredRevocations();
  if (revokedTokens.has(token)) return null;

  const stateless = verifySessionToken(token);
  if (stateless) {
    return {
      token,
      userId: stateless.userId,
      createdAt: stateless.issuedAt,
      expiresAt: stateless.expiresAt
    };
  }

  const session = sessions.get(token);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }
  return { token, ...session };
}

export function deleteSession(token) {
  const parsed = verifySessionToken(token);
  if (parsed) {
    revokedTokens.set(token, parsed.expiresAt);
  }
  sessions.delete(token);
}

function signSessionToken(payload) {
  const body = base64UrlEncode(JSON.stringify(payload));
  const sig = hmac(body);
  return `${body}.${sig}`;
}

function verifySessionToken(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = hmac(body);
  if (!safeEqual(sig, expected)) return null;
  try {
    const parsed = JSON.parse(base64UrlDecode(body));
    const userId = String(parsed?.u || "").trim();
    const exp = Number(parsed?.exp || 0);
    if (!userId || !Number.isFinite(exp) || exp <= Date.now()) return null;
    return { userId, expiresAt: exp, issuedAt: Math.max(0, exp - APP_CONFIG.sessionTtlMs) };
  } catch {
    return null;
  }
}

function hmac(text) {
  return createHmac("sha256", APP_CONFIG.sessionSecret).update(String(text)).digest("base64url");
}

function base64UrlEncode(text) {
  return Buffer.from(String(text), "utf8").toString("base64url");
}

function base64UrlDecode(text) {
  return Buffer.from(String(text), "base64url").toString("utf8");
}

function safeEqual(a, b) {
  const aBuf = Buffer.from(String(a));
  const bBuf = Buffer.from(String(b));
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

function clearExpiredRevocations() {
  const now = Date.now();
  for (const [token, exp] of revokedTokens.entries()) {
    if (exp <= now) revokedTokens.delete(token);
  }
}
