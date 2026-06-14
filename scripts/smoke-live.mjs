const BASE_URL = String(process.env.SMOKE_BASE_URL || "").trim().replace(/\/+$/, "");
const ADMIN_USERNAME = String(process.env.SMOKE_ADMIN_USERNAME || "").trim();
const ADMIN_PASSWORD = String(process.env.SMOKE_ADMIN_PASSWORD || "").trim();
const USER_USERNAME = String(process.env.SMOKE_USER_USERNAME || "").trim();
const USER_PASSWORD = String(process.env.SMOKE_USER_PASSWORD || "").trim();
const FORBIDDEN_SMOKE_USERS = new Set([
  "mirko",
  "mirko.fusco",
  "mirkofusco",
  "admin"
]);

if (!BASE_URL || !ADMIN_USERNAME || !ADMIN_PASSWORD || !USER_USERNAME || !USER_PASSWORD) {
  console.error("Missing required env vars:");
  console.error("SMOKE_BASE_URL, SMOKE_ADMIN_USERNAME, SMOKE_ADMIN_PASSWORD, SMOKE_USER_USERNAME, SMOKE_USER_PASSWORD");
  process.exit(2);
}

if (FORBIDDEN_SMOKE_USERS.has(USER_USERNAME.toLowerCase())) {
  console.error(`Refusing to run smoke booking with real/protected user: ${USER_USERNAME}`);
  console.error("Use a dedicated test user, for example smoke.test, so live checks never touch real member bookings.");
  process.exit(2);
}

async function jsonFetch(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, options);
  let data = {};
  try {
    data = await res.json();
  } catch {
    // ignore non-json responses
  }
  return { ok: res.ok, status: res.status, data, url };
}

function assert(condition, label, detail = "") {
  if (!condition) throw new Error(`${label}${detail ? ` | ${detail}` : ""}`);
}

function isFutureMoreThan(course, ms) {
  const t = Date.parse(`${course.date}T${course.startTime}:00`);
  return Number.isFinite(t) && t - Date.now() > ms;
}

async function login(username, password) {
  const r = await jsonFetch("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  assert(r.ok && r.data?.token, "login_failed", `${username} status=${r.status} err=${r.data?.error || "-"}`);
  return { token: r.data.token, user: r.data.user };
}

async function ensureUserPasswordUnlocked(token, currentPassword) {
  const probe = await jsonFetch("/api/courses", {
    headers: { authorization: `Bearer ${token}` }
  });
  if (probe.ok) return;

  const code = String(probe.data?.code || "");
  if (code !== "PASSWORD_CHANGE_REQUIRED") {
    throw new Error(`user_courses_probe_failed | status=${probe.status} err=${probe.data?.error || "-"}`);
  }

  const unlock = await jsonFetch("/api/auth/change-password", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      currentPassword,
      newPassword: currentPassword,
      confirmPassword: currentPassword
    })
  });
  assert(unlock.ok, "user_force_password_change_failed", `status=${unlock.status} err=${unlock.data?.error || "-"}`);
}

async function run() {
  const report = [];
  const push = (name, ok, info = "") => report.push({ name, ok, info });

  // Admin login + dashboard/courses
  const admin = await login(ADMIN_USERNAME, ADMIN_PASSWORD);
  push("admin_login", true);

  const adminDash = await jsonFetch(`/api/admin/dashboard?date=${new Date().toISOString().slice(0, 10)}`, {
    headers: { authorization: `Bearer ${admin.token}` }
  });
  assert(adminDash.ok, "admin_dashboard_failed", `status=${adminDash.status}`);
  push("admin_dashboard", true);

  const adminCourses = await jsonFetch("/api/admin/courses?status=all", {
    headers: { authorization: `Bearer ${admin.token}` }
  });
  assert(adminCourses.ok, "admin_courses_failed", `status=${adminCourses.status}`);
  push("admin_courses", true, `count=${(adminCourses.data?.courses || []).length}`);

  // User login + courses
  const user = await login(USER_USERNAME, USER_PASSWORD);
  push("user_login", true);
  await ensureUserPasswordUnlocked(user.token, USER_PASSWORD);
  push("user_password_unlocked", true);

  const userCoursesRes = await jsonFetch("/api/courses", {
    headers: { authorization: `Bearer ${user.token}` }
  });
  assert(userCoursesRes.ok, "user_courses_failed", `status=${userCoursesRes.status}`);
  const userCourses = userCoursesRes.data?.courses || [];
  assert(userCourses.length > 0, "user_courses_empty");
  push("user_courses", true, `count=${userCourses.length}`);

  // Book one future lesson with the dedicated smoke user and clean up only that booking.
  let candidate = userCourses.find((c) => isFutureMoreThan(c, 3 * 60 * 60 * 1000));
  if (!candidate) candidate = userCourses.find((c) => isFutureMoreThan(c, 20 * 60 * 1000));
  assert(candidate, "no_future_course_available");

  const booking = await jsonFetch("/api/bookings", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${user.token}`
    },
    body: JSON.stringify({ courseId: candidate.id })
  });

  let bookedId = null;
  if (booking.ok && booking.data?.booking?.id) {
    bookedId = booking.data.booking.id;
    push("user_booking_create", true, `course=${candidate.id}`);
  } else if (String(booking.data?.error || "").toLowerCase().includes("gia prenot")) {
    push("user_booking_create", true, "already_booked_existing_smoke_user_booking");
  } else {
    throw new Error(`user_booking_failed | status=${booking.status} err=${booking.data?.error || "-"}`);
  }

  const mineAfterBook = await jsonFetch("/api/bookings/mine", {
    headers: { authorization: `Bearer ${user.token}` }
  });
  assert(mineAfterBook.ok, "user_mine_failed_after_book", `status=${mineAfterBook.status}`);
  const active = (mineAfterBook.data?.bookings || []).filter((b) => b.status === "active");
  const activeForCourse = active.find((b) => b.courseId === candidate.id);
  assert(activeForCourse, "booking_not_visible_in_mine");
  push("user_mine_after_book", true, `active=${active.length}`);

  if (bookedId) {
    const cancel = await jsonFetch(`/api/bookings/${encodeURIComponent(bookedId)}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${user.token}` }
    });
    assert(cancel.ok, "cancel_failed", `status=${cancel.status} err=${cancel.data?.error || "-"}`);
    push("user_cancel_created_booking", true, `booking=${bookedId}`);
  } else {
    push("user_cancel_created_booking", true, "skipped_existing_booking_not_touched");
  }

  const mineAfterCancel = await jsonFetch("/api/bookings/mine", {
    headers: { authorization: `Bearer ${user.token}` }
  });
  assert(mineAfterCancel.ok, "user_mine_failed_after_cancel", `status=${mineAfterCancel.status}`);
  push("user_mine_after_cancel", true);

  // Print summary
  for (const r of report) {
    console.log(`${r.ok ? "PASS" : "FAIL"} | ${r.name}${r.info ? ` | ${r.info}` : ""}`);
  }
}

run().catch((err) => {
  console.error(`FAIL | smoke_live | ${err.message}`);
  process.exit(1);
});
