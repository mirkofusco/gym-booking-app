import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { COURSE_TYPES, DEFAULT_ADMIN, DEMO_USER, STORE_PATH } from "./config.js";
import { makeUser } from "./auth.js";

let mutationQueue = Promise.resolve();
const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();
const USE_DATABASE = Boolean(DATABASE_URL);
let poolPromise = null;

export async function ensureStore() {
  if (USE_DATABASE) {
    const pool = await getPool();
    await pool.query(`
      create table if not exists app_store (
        id smallint primary key,
        data jsonb not null,
        updated_at timestamptz not null default now()
      )
    `);

    const existing = await readDbStore();
    if (!existing) {
      let seed = buildSeedStore();
      if (existsSync(STORE_PATH)) {
        try {
          const raw = await readFile(STORE_PATH, "utf8");
          const parsed = JSON.parse(raw);
          const migrated = migrateStore(parsed);
          seed = migrated.store;
        } catch {
          // fallback to seed store
        }
      }
      await writeDbStore(seed);
      return;
    }

    const migrated = migrateStore(existing);
    if (migrated.changed) {
      await writeDbStore(migrated.store);
    }
    return;
  }

  await mkdir(dirname(STORE_PATH), { recursive: true });

  if (!existsSync(STORE_PATH)) {
    const seed = buildSeedStore();
    await writeFile(STORE_PATH, JSON.stringify(seed, null, 2), "utf8");
    return;
  }

  const store = await readStore();
  const migrated = migrateStore(store);
  if (migrated.changed) {
    await writeFile(STORE_PATH, JSON.stringify(migrated.store, null, 2), "utf8");
  }
}

export async function readStore() {
  if (USE_DATABASE) {
    const store = await readDbStore();
    if (!store) return buildSeedStore();
    return store;
  }
  const raw = await readFile(STORE_PATH, "utf8");
  return JSON.parse(raw);
}

export async function writeStore(store) {
  if (USE_DATABASE) {
    await writeDbStore(store);
    return;
  }
  await writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

export async function mutateStore(mutator) {
  let output;

  mutationQueue = mutationQueue.then(async () => {
    const store = await readStore();
    output = await mutator(store);
    if (!output || output.commit !== false) {
      await writeStore(store);
    }
  });

  await mutationQueue;
  return output;
}

async function getPool() {
  if (!USE_DATABASE) return null;
  if (!poolPromise) {
    poolPromise = import("pg").then(({ Pool }) => new Pool({
      connectionString: DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    }));
  }
  return poolPromise;
}

async function readDbStore() {
  const pool = await getPool();
  const result = await pool.query("select data from app_store where id = 1");
  if (!result.rows.length) return null;
  return result.rows[0].data;
}

async function writeDbStore(store) {
  const pool = await getPool();
  await pool.query(
    `insert into app_store (id, data, updated_at)
     values (1, $1::jsonb, now())
     on conflict (id)
     do update set data = excluded.data, updated_at = now()`,
    [JSON.stringify(store)]
  );
}

export function courseTypeFallback(title) {
  const normalized = String(title || "").toLowerCase();
  if (normalized.includes("hyrox")) return "hyrox";
  if (normalized.includes("functional") || normalized.includes("funzional")) return "funzionale";
  return "sala";
}

function buildSeedStore() {
  const now = new Date();
  const courses = [];
  const courseTemplates = defaultCourseTemplates();
  const templates = [
    {
      title: "Circuito Sala",
      description: "Circuito guidato per forza e resistenza.",
      type: "sala",
      trainer: "Luca",
      startTime: "08:00",
      endTime: "08:50",
      notes: "Allenamento total body.",
      internalNotes: "",
      daysOfWeek: ["lun", "mer", "ven"]
    },
    {
      title: "Hyrox Performance",
      description: "Sessione tecnica e work capacity stile Hyrox.",
      type: "hyrox",
      trainer: "Sara",
      startTime: "13:00",
      endTime: "13:50",
      notes: "Tecnica + resistenza.",
      internalNotes: "",
      daysOfWeek: ["mar", "gio"]
    },
    {
      title: "Funzionale Boost",
      description: "Lezione funzionale ad alta intensita.",
      type: "funzionale",
      trainer: "Marco",
      startTime: "19:00",
      endTime: "19:55",
      notes: "Porta asciugamano e acqua.",
      internalNotes: "",
      daysOfWeek: ["lun", "mer", "ven"]
    }
  ];

  for (let day = 0; day < 7; day += 1) {
    const dateObj = new Date(now);
    dateObj.setDate(now.getDate() + day);
    const date = localDateKey(dateObj);

    for (const template of templates) {
      courses.push({
        id: randomUUID(),
        title: template.title,
        type: template.type,
        trainer: template.trainer,
        date,
        startTime: template.startTime,
        endTime: template.endTime,
        durationMinutes: computeDurationMinutes(template.startTime, template.endTime),
        capacity: COURSE_TYPES[template.type].defaultCapacity,
        isActive: true,
        description: template.description,
        daysOfWeek: template.daysOfWeek,
        notes: template.notes,
        internalNotes: template.internalNotes,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }
  }

  return {
    version: 2,
    users: [
      makeUser({
        username: DEFAULT_ADMIN.username,
        name: DEFAULT_ADMIN.name,
        firstName: DEFAULT_ADMIN.name,
        lastName: "",
        email: "",
        role: "admin",
        password: DEFAULT_ADMIN.password
      }),
      makeUser({
        username: DEMO_USER.username,
        name: DEMO_USER.name,
        firstName: DEMO_USER.name,
        lastName: "",
        email: "",
        role: "user",
        password: DEMO_USER.password
      })
    ],
    courseTemplates,
    courses,
    bookings: [],
    waitlists: [],
    notificationSubscriptions: [],
    notifications: [],
    notificationJobs: []
  };
}

function migrateStore(store) {
  const normalized = {
    version: 2,
    users: Array.isArray(store.users) ? [...store.users] : [],
    courseTemplates: Array.isArray(store.courseTemplates) ? [...store.courseTemplates] : [],
    courses: Array.isArray(store.courses)
      ? [...store.courses]
      : Array.isArray(store.classes)
        ? [...store.classes]
        : [],
    bookings: Array.isArray(store.bookings) ? [...store.bookings] : [],
    waitlists: Array.isArray(store.waitlists) ? [...store.waitlists] : [],
    notificationSubscriptions: Array.isArray(store.notificationSubscriptions) ? [...store.notificationSubscriptions] : [],
    notifications: Array.isArray(store.notifications) ? [...store.notifications] : [],
    notificationJobs: Array.isArray(store.notificationJobs) ? [...store.notificationJobs] : []
  };

  let changed = false;

  normalized.users = normalized.users
    .map((user, idx) => {
      if (user.passwordHash && user.passwordSalt && user.username && user.role) {
        const normalizedFirstName = String(user.firstName || "").trim();
        const normalizedLastName = String(user.lastName || "").trim();
        const normalizedName = String(
          user.name || `${normalizedFirstName} ${normalizedLastName}`.trim() || user.username
        ).trim();
        return {
          ...user,
          name: normalizedName,
          firstName: normalizedFirstName || normalizedName.split(" ")[0] || normalizedName,
          lastName: normalizedLastName || normalizedName.split(" ").slice(1).join(" "),
          email: String(user.email || "").trim().toLowerCase(),
          notes: String(user.notes || "").trim(),
          notificationsEnabled: user.notificationsEnabled !== false,
          mustChangePassword: typeof user.mustChangePassword === "boolean"
            ? user.mustChangePassword
            : user.role !== "admin",
          active: user.active !== false,
          updatedAt: user.updatedAt || user.createdAt || new Date().toISOString(),
          lastActivityAt: user.lastActivityAt || null
        };
      }

      changed = true;
      const username = String(user.username || user.email || `utente${idx + 1}`).split("@")[0].toLowerCase();
      const name = String(user.name || username).trim();
      return makeUser({
        username,
        name,
        firstName: name.split(" ")[0] || name,
        lastName: name.split(" ").slice(1).join(" "),
        email: String(user.email || "").trim().toLowerCase(),
        role: "user",
        password: DEMO_USER.password
      });
    });

  if (!normalized.users.some((u) => u.role === "admin")) {
    changed = true;
    normalized.users.unshift(
      makeUser({
        username: DEFAULT_ADMIN.username,
        name: DEFAULT_ADMIN.name,
        firstName: DEFAULT_ADMIN.name,
        lastName: "",
        email: "",
        role: "admin",
        password: DEFAULT_ADMIN.password
      })
    );
  }

  normalized.courses = normalized.courses.map((course) => {
    const type = COURSE_TYPES[course.type] ? course.type : courseTypeFallback(course.title);
    const capacity = Number(course.capacity) || COURSE_TYPES[type].defaultCapacity;

    if (course.type !== type || !course.updatedAt || typeof course.isActive !== "boolean") {
      changed = true;
    }

    const startTime = String(course.startTime || "18:00");
    const endTime = String(course.endTime || "18:50");
    const durationMinutes = Number.isInteger(Number(course.durationMinutes))
      ? Number(course.durationMinutes)
      : computeDurationMinutes(startTime, endTime);

    return {
      id: course.id || randomUUID(),
      title: String(course.title || "Corso").trim(),
      courseTemplateId: String(course.courseTemplateId || "").trim() || null,
      description: String(course.description || "").trim(),
      type,
      trainer: String(course.trainer || "Trainer").trim(),
      date: String(course.date || localDateKey(new Date())),
      startTime,
      endTime,
      durationMinutes: durationMinutes > 0 ? durationMinutes : 50,
      capacity,
      isActive: course.isActive !== false,
      daysOfWeek: normalizeDaysOfWeek(course.daysOfWeek),
      notes: String(course.notes || "").trim(),
      internalNotes: String(course.internalNotes || "").trim(),
      createdAt: course.createdAt || new Date().toISOString(),
      updatedAt: course.updatedAt || new Date().toISOString()
    };
  });

  normalized.courseTemplates = normalizeCourseTemplatesList(
    normalized.courseTemplates.length ? normalized.courseTemplates : defaultCourseTemplates()
  );
  const usageByTemplate = new Map();
  for (const course of normalized.courses) {
    const templateId = String(course.courseTemplateId || "").trim();
    if (!templateId) continue;
    usageByTemplate.set(templateId, (usageByTemplate.get(templateId) || 0) + 1);
  }
  for (const template of normalized.courseTemplates) {
    const name = template.name.toUpperCase();
    const used = (usageByTemplate.get(template.id) || 0) > 0;
    if (name === "CALISTHENICS" && Number(template.defaultCapacity) === 20 && !used) {
      template.defaultCapacity = 25;
      changed = true;
    }
    if (["PILATES", "YOGA", "BOXE"].includes(name) && template.active && !used) {
      template.active = false;
      changed = true;
    }
  }
  if (!Array.isArray(store.courseTemplates) || !store.courseTemplates.length) {
    changed = true;
  }

  normalized.bookings = normalized.bookings.map((booking) => {
    if (!booking.status || !("attendanceStatus" in booking)) changed = true;
    return {
      id: booking.id || randomUUID(),
      userId: booking.userId,
      courseId: booking.courseId || booking.classId,
      status: booking.status || "active",
      createdAt: booking.createdAt || new Date().toISOString(),
      cancelledAt: booking.cancelledAt || null,
      cancelReason: booking.cancelReason || null,
      attendanceStatus: booking.attendanceStatus || "unknown"
    };
  });

  normalized.waitlists = normalized.waitlists.map((item) => ({
    id: item.id || randomUUID(),
    userId: item.userId,
    courseId: item.courseId,
    status: item.status || "active",
    createdAt: item.createdAt || new Date().toISOString(),
    notifiedAt: item.notifiedAt || null
  }));

  normalized.notificationSubscriptions = normalized.notificationSubscriptions.map((item) => ({
    id: item.id || randomUUID(),
    userId: item.userId,
    endpoint: String(item.endpoint || ""),
    keys: item.keys && typeof item.keys === "object" ? item.keys : {},
    active: item.active !== false,
    createdAt: item.createdAt || new Date().toISOString(),
    updatedAt: item.updatedAt || item.createdAt || new Date().toISOString()
  })).filter((item) => item.userId && item.endpoint);

  normalized.notifications = normalized.notifications.map((item) => ({
    id: item.id || randomUUID(),
    userId: item.userId,
    title: String(item.title || "Notifica"),
    message: String(item.message || ""),
    type: String(item.type || "generic"),
    read: item.read === true,
    sentAt: item.sentAt || item.createdAt || new Date().toISOString(),
    createdAt: item.createdAt || item.sentAt || new Date().toISOString(),
    pushDelivered: item.pushDelivered === true
  })).filter((item) => item.userId && item.message);

  normalized.notificationJobs = normalized.notificationJobs.map((item) => ({
    id: item.id || randomUUID(),
    bookingId: item.bookingId || null,
    userId: item.userId || null,
    courseId: item.courseId || null,
    type: String(item.type || "generic"),
    scheduledAt: item.scheduledAt || new Date().toISOString(),
    sentAt: item.sentAt || null
  }));

  const demoUsernameTaken = normalized.users.some((u) => u.username === DEMO_USER.username);
  if (!demoUsernameTaken) {
    changed = true;
    normalized.users.push(
      makeUser({
        username: DEMO_USER.username,
        name: DEMO_USER.name,
        firstName: DEMO_USER.name,
        lastName: "",
        email: "",
        role: "user",
        password: DEMO_USER.password
      })
    );
  }

  return { changed, store: normalized };
}

function defaultCourseTemplates() {
  const now = new Date().toISOString();
  const defaults = [
    { name: "HYROX", defaultCapacity: 20, color: "#e23e47" },
    { name: "FUNZIONALE", defaultCapacity: 20, color: "#2b6de5" },
    { name: "CALISTHENICS", defaultCapacity: 25, color: "#25a244" }
  ];
  return defaults.map((entry, idx) => ({
    id: randomUUID(),
    name: entry.name,
    defaultCapacity: entry.defaultCapacity,
    color: entry.color,
    active: true,
    sortOrder: idx,
    createdAt: now,
    updatedAt: now
  }));
}

function normalizeCourseTemplatesList(list) {
  const now = new Date().toISOString();
  const seen = new Set();
  const rows = [];
  for (const [idx, entry] of list.entries()) {
    const name = String(entry?.name || "").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const capRaw = Number(entry?.defaultCapacity);
    rows.push({
      id: String(entry?.id || randomUUID()),
      name,
      defaultCapacity: Number.isInteger(capRaw) && capRaw >= 1 && capRaw <= 50 ? capRaw : 20,
      color: normalizeColor(entry?.color, colorByName(name)),
      active: entry?.active !== false,
      sortOrder: Number.isFinite(Number(entry?.sortOrder)) ? Number(entry.sortOrder) : idx,
      createdAt: String(entry?.createdAt || now),
      updatedAt: String(entry?.updatedAt || now)
    });
  }
  const sorted = rows.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  const names = new Set(sorted.map((entry) => entry.name.toUpperCase()));
  const legacySet = ["HYROX", "FUNZIONALE", "CALISTHENICS", "PILATES", "YOGA", "BOXE"];
  const isLegacyPack = sorted.length === legacySet.length && legacySet.every((name) => names.has(name));
  if (isLegacyPack) {
    for (const entry of sorted) {
      if (["PILATES", "YOGA", "BOXE"].includes(entry.name.toUpperCase())) {
        entry.active = false;
      }
    }
  }
  return sorted;
}

function normalizeColor(value, fallback = "#2b6de5") {
  const v = String(value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v;
  return fallback;
}

function colorByName(name) {
  const key = String(name || "").toUpperCase();
  if (key === "HYROX") return "#e23e47";
  if (key === "FUNZIONALE") return "#2b6de5";
  if (key === "CALISTHENICS") return "#25a244";
  return "#2b6de5";
}

function computeDurationMinutes(startTime, endTime) {
  const [startH, startM] = String(startTime).split(":").map(Number);
  const [endH, endM] = String(endTime).split(":").map(Number);
  if ([startH, startM, endH, endM].some(Number.isNaN)) return 50;
  const start = startH * 60 + startM;
  const end = endH * 60 + endM;
  return end > start ? end - start : 50;
}

function normalizeDaysOfWeek(value) {
  const allowed = new Set(["lun", "mar", "mer", "gio", "ven", "sab", "dom"]);
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => String(entry || "").toLowerCase().trim().slice(0, 3))
    .filter((entry) => allowed.has(entry));
}

function localDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
