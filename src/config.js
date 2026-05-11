import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

loadEnvFiles(["CONFIGURA_CHIAVE.txt", ".env"]);

function loadEnvFiles(files) {
  for (const file of files) {
    const path = join(process.cwd(), file);
    if (!existsSync(path)) continue;
    const raw = readFileSync(path, "utf8");

    for (const lineRaw of raw.split(/\r?\n/)) {
      const line = lineRaw.trim();
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const [key, ...rest] = line.split("=");
      const name = key.trim();
      if (!name || process.env[name] !== undefined) continue;
      process.env[name] = rest.join("=").trim();
    }
  }
}

export const APP_CONFIG = {
  host: process.env.HOST || "0.0.0.0",
  port: Number(process.env.PORT || 3000),
  sessionTtlMs: Number(process.env.SESSION_TTL_MS || 12 * 60 * 60 * 1000),
  sessionSecret: process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD || "for-fitness-session-secret",
  cancellationWindowHours: Number(process.env.CANCELLATION_WINDOW_HOURS || 2),
  maxJsonBytes: Number(process.env.MAX_JSON_BYTES || 512 * 1024),
  timezone: process.env.APP_TIMEZONE || "Europe/Rome"
};

export const PUSH_CONFIG = {
  publicKey: process.env.PUSH_VAPID_PUBLIC_KEY || ""
};

export const COURSE_TYPES = {
  sala: { id: "sala", label: "Corso Sala", defaultCapacity: 25 },
  hyrox: { id: "hyrox", label: "Hyrox", defaultCapacity: 20 },
  funzionale: { id: "funzionale", label: "Funzionale", defaultCapacity: 20 }
};

export const DEFAULT_ADMIN = {
  username: process.env.ADMIN_USERNAME || "admin",
  name: "Amministratore",
  password: process.env.ADMIN_PASSWORD || "Asia2020$"
};

export const DEMO_USER = {
  username: "martina",
  name: "Martina",
  password: "Fit12345"
};

export const STORE_PATH = join(process.cwd(), "data", "bookings.json");
export const PUBLIC_DIR = join(process.cwd(), "public");
