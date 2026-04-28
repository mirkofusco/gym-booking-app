import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { APP_CONFIG } from "./config.js";

const sessions = new Map();

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
  const token = randomBytes(24).toString("hex");
  const now = Date.now();
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
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }
  return { token, ...session };
}

export function deleteSession(token) {
  sessions.delete(token);
}
