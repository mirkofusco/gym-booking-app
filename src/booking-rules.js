import { APP_CONFIG } from "./config.js";

export function courseDateTime(course) {
  return new Date(`${course.date}T${course.startTime}:00`);
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
