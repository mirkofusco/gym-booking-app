import { APP_CONFIG } from "./config.js";

export function courseDateTime(course) {
  return courseDateTimeRome(course);
}

export function cancellationDeadline(course) {
  const start = courseDateTime(course);
  return new Date(start.getTime() - APP_CONFIG.cancellationWindowHours * 60 * 60 * 1000);
}

export function canCancelBooking(course, now = new Date()) {
  return now < cancellationDeadline(course);
}

export function occupancyStatus(spotsLeft, capacity) {
  if (spotsLeft <= 0) return "completo";
  if (spotsLeft <= Math.max(2, Math.ceil(capacity * 0.2))) return "quasi_pieno";
  return "disponibile";
}

export function displayStatus({ isBooked, spotsLeft, capacity }) {
  if (isBooked) return { code: "prenotato", label: "Prenotato" };
  if (spotsLeft <= 0) return { code: "completo", label: "Completo" };
  const occupancy = occupancyStatus(spotsLeft, capacity);
  if (occupancy === "quasi_pieno") return { code: occupancy, label: "Quasi pieno" };
  return { code: occupancy, label: "Disponibile" };
}

function courseDateTimeRome(course) {
  const [year, month, day] = String(course.date || "").split("-").map(Number);
  const [hours, minutes] = String(course.startTime || "00:00").split(":").map(Number);
  const utcAssumingSameClock = Date.UTC(year, (month || 1) - 1, day || 1, hours || 0, minutes || 0, 0);
  const offsetMinutes = romeOffsetMinutes(new Date(utcAssumingSameClock));
  return new Date(utcAssumingSameClock - offsetMinutes * 60_000);
}

function romeOffsetMinutes(date) {
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Rome",
    timeZoneName: "shortOffset"
  }).format(date);
  const match = formatted.match(/GMT([+-]\d{1,2})(?::?(\d{2}))?/i);
  if (!match) return 60;
  const hh = Number(match[1] || 0);
  const mm = Number(match[2] || 0);
  const sign = hh >= 0 ? 1 : -1;
  return hh * 60 + sign * mm;
}
