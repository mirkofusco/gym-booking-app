import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { randomUUID } from "node:crypto";
import { APP_CONFIG, COURSE_TYPES, DEFAULT_ADMIN, PUBLIC_DIR, PUSH_CONFIG } from "./config.js";
import {
  createSession,
  deleteSession,
  getSessionFromRequest,
  hashPassword,
  makeUser,
  sanitizeUser,
  verifyPassword
} from "./auth.js";
import { canCancelBooking, cancellationDeadline, displayStatus } from "./booking-rules.js";
import { courseTypeFallback, ensureStore, mutateStore, readStore } from "./store.js";

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml"
};

await ensureStore();
startNotificationScheduler();

const server = createServer(async (req, res) => {
  try {
    applySecurityHeaders(res);

    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) {
      await routeApi(req, res, url);
      return;
    }

    if (req.method === "GET") {
      await serveStatic(url.pathname, res);
      return;
    }

    sendJson(res, 405, { error: "Metodo non supportato." });
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: "Errore interno server." });
  }
});

server.listen(APP_CONFIG.port, APP_CONFIG.host, () => {
  console.log(`For Fitness Club pronto su http://${APP_CONFIG.host}:${APP_CONFIG.port}`);
});

async function routeApi(req, res, url) {
  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    await handleLogin(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/logout") {
    const session = getSessionFromRequest(req);
    if (session) deleteSession(session.token);
    sendJson(res, 200, { ok: true });
    return;
  }

  const auth = await requireAuth(req, res);
  if (!auth) return;

  if (req.method === "GET" && url.pathname === "/api/me") {
    sendJson(res, 200, { user: sanitizeUser(auth.user) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/courses") {
    await handleCoursesList(req, res, auth.user, url);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/bookings/mine") {
    await handleMyBookings(req, res, auth.user);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/notifications") {
    await handleMyNotifications(req, res, auth.user);
    return;
  }

  if (req.method === "PATCH" && url.pathname.startsWith("/api/notifications/") && url.pathname.endsWith("/read")) {
    const notificationId = url.pathname.split("/")[3];
    await handleReadNotification(req, res, auth.user, notificationId);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/notifications/subscription") {
    await handleGetNotificationSubscription(req, res, auth.user);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/notifications/public-key") {
    sendJson(res, 200, { publicKey: PUSH_CONFIG.publicKey || "" });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/notifications/subscription") {
    await handleSaveNotificationSubscription(req, res, auth.user);
    return;
  }

  if (req.method === "DELETE" && url.pathname === "/api/notifications/subscription") {
    await handleDeleteNotificationSubscription(req, res, auth.user);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/notifications/test") {
    await handleSendTestNotification(req, res, auth.user);
    return;
  }

  if (req.method === "PATCH" && url.pathname === "/api/me/notifications") {
    await handleUserNotificationSettings(req, res, auth.user);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/bookings") {
    await handleCreateBooking(req, res, auth.user);
    return;
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/api/bookings/")) {
    const bookingId = url.pathname.split("/")[3];
    await handleCancelBooking(req, res, auth.user, bookingId);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/waitlist") {
    await handleJoinWaitlist(req, res, auth.user);
    return;
  }

  if (url.pathname.startsWith("/api/admin/")) {
    if (auth.user.role !== "admin") {
      sendJson(res, 403, { error: "Accesso consentito solo all'amministratore." });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/config") {
      sendJson(res, 200, {
        cancellationWindowHours: APP_CONFIG.cancellationWindowHours,
        courseTypes: Object.values(COURSE_TYPES)
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/dashboard") {
      await handleAdminDashboard(req, res, url);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/courses") {
      await handleAdminCourses(req, res, url);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/course-templates") {
      await handleAdminCourseTemplates(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/admin/course-templates") {
      await handleAdminCreateCourseTemplate(req, res);
      return;
    }

    if (req.method === "PATCH" && url.pathname === "/api/admin/course-templates/reorder") {
      await handleAdminReorderCourseTemplates(req, res);
      return;
    }

    if (req.method === "PUT" && url.pathname.startsWith("/api/admin/course-templates/")) {
      const templateId = url.pathname.split("/")[4];
      await handleAdminUpdateCourseTemplate(req, res, templateId);
      return;
    }

    if (req.method === "PATCH" && url.pathname.startsWith("/api/admin/course-templates/") && url.pathname.endsWith("/status")) {
      const templateId = url.pathname.split("/")[4];
      await handleAdminCourseTemplateStatus(req, res, templateId);
      return;
    }

    if (req.method === "DELETE" && url.pathname.startsWith("/api/admin/course-templates/")) {
      const templateId = url.pathname.split("/")[4];
      await handleAdminDeleteCourseTemplate(req, res, templateId);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/admin/courses") {
      await handleCreateCourse(req, res);
      return;
    }

    if (req.method === "PUT" && url.pathname.startsWith("/api/admin/courses/")) {
      const courseId = url.pathname.split("/")[4];
      await handleUpdateCourse(req, res, courseId);
      return;
    }

    if (req.method === "PATCH" && url.pathname.startsWith("/api/admin/courses/") && url.pathname.endsWith("/status")) {
      const courseId = url.pathname.split("/")[4];
      await handleCourseStatusToggle(req, res, courseId);
      return;
    }

    if (req.method === "POST" && url.pathname.startsWith("/api/admin/courses/") && url.pathname.endsWith("/duplicate")) {
      const courseId = url.pathname.split("/")[4];
      await handleDuplicateCourse(req, res, courseId);
      return;
    }

    if (req.method === "GET" && url.pathname.startsWith("/api/admin/courses/") && url.pathname.endsWith("/bookings-export.csv")) {
      const courseId = url.pathname.split("/")[4];
      await handleExportCourseBookings(req, res, courseId);
      return;
    }

    if (req.method === "DELETE" && url.pathname.startsWith("/api/admin/courses/")) {
      const courseId = url.pathname.split("/")[4];
      await handleDeleteCourse(req, res, courseId);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/users") {
      await handleAdminUsersList(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/admin/users") {
      await handleAdminCreateUser(req, res);
      return;
    }

    if (req.method === "GET" && url.pathname.startsWith("/api/admin/users/") && url.pathname.endsWith("/bookings")) {
      const userId = url.pathname.split("/")[4];
      await handleAdminUserBookings(req, res, userId);
      return;
    }

    if (req.method === "DELETE" && url.pathname.startsWith("/api/admin/users/") && url.pathname.includes("/bookings/")) {
      const [, , , , userId, , bookingId] = url.pathname.split("/");
      await handleAdminRemoveUserBooking(req, res, userId, bookingId);
      return;
    }

    if (req.method === "PUT" && url.pathname.startsWith("/api/admin/users/")) {
      const userId = url.pathname.split("/")[4];
      await handleAdminUpdateUser(req, res, userId);
      return;
    }

    if (req.method === "PATCH" && url.pathname.startsWith("/api/admin/users/") && url.pathname.endsWith("/status")) {
      const userId = url.pathname.split("/")[4];
      await handleAdminUserStatus(req, res, userId);
      return;
    }

    if (req.method === "DELETE" && url.pathname.startsWith("/api/admin/users/")) {
      const userId = url.pathname.split("/")[4];
      await handleAdminDeleteUser(req, res, userId, auth.user);
      return;
    }

    if (req.method === "DELETE" && url.pathname.startsWith("/api/admin/bookings/")) {
      const bookingId = url.pathname.split("/")[4];
      await handleAdminRemoveBooking(req, res, bookingId);
      return;
    }

    if (req.method === "PATCH" && url.pathname.startsWith("/api/admin/bookings/") && url.pathname.endsWith("/attendance")) {
      const bookingId = url.pathname.split("/")[4];
      await handleAdminAttendance(req, res, bookingId);
      return;
    }
  }

  sendJson(res, 404, { error: "Endpoint non trovato." });
}

async function handleLogin(req, res) {
  const body = await readJsonBody(req, res);
  if (!body) return;

  const username = String(body.username || "").trim().toLowerCase();
  const password = String(body.password || "").trim();

  if (!username || !password) {
    sendJson(res, 400, { error: "Inserisci username e password." });
    return;
  }

  const store = await readStore();
  const userByUsername = store.users.find((entry) => entry.username === username);

  if (!userByUsername) {
    if (isDemoAdminLogin(username, password)) {
      const adminUser = await ensureAdminUserForDemoLogin(password);
      const token = createSession(adminUser.id);
      console.info("[AUTH] login admin fallback riuscito", { username });
      sendJson(res, 200, { token, user: sanitizeUser(adminUser) });
      return;
    }
    console.info("[AUTH] utente non trovato", { username });
    sendJson(res, 401, { error: "Utente non trovato." });
    return;
  }

  if (userByUsername.active === false) {
    console.info("[AUTH] utente disattivato", { username });
    sendJson(res, 403, { error: "Utente disattivato." });
    return;
  }

  let user = userByUsername;
  if (!verifyPassword(password, user.passwordHash, user.passwordSalt)) {
    if (isDemoAdminLogin(username, password)) {
      user = await ensureAdminUserForDemoLogin(password);
      console.info("[AUTH] password admin riallineata da fallback", { username });
    } else {
      console.info("[AUTH] password errata", { username });
      sendJson(res, 401, { error: "Password errata." });
      return;
    }
  }

  await mutateStore((freshStore) => {
    const freshUser = freshStore.users.find((entry) => entry.id === user.id);
    if (freshUser) {
      freshUser.lastActivityAt = new Date().toISOString();
      freshUser.updatedAt = new Date().toISOString();
      freshUser.active = true;
    }
    return { commit: true };
  });

  const token = createSession(user.id);
  console.info("[AUTH] login ok", { username, role: user.role });
  sendJson(res, 200, {
    token,
    user: sanitizeUser(user)
  });
}

function isDemoAdminLogin(username, password) {
  if (username !== String(DEFAULT_ADMIN.username || "admin").toLowerCase()) return false;
  const configuredPassword = String(DEFAULT_ADMIN.password || "");
  return password === configuredPassword || password === "admin123";
}

async function ensureAdminUserForDemoLogin(password) {
  let adminUser = null;
  await mutateStore((store) => {
    const adminUsername = String(DEFAULT_ADMIN.username || "admin").toLowerCase();
    const found = store.users.find((entry) => entry.username === adminUsername);
    if (!found) {
      adminUser = makeUser({
        username: adminUsername,
        name: "Amministratore",
        firstName: "Amministratore",
        lastName: "",
        email: "",
        role: "admin",
        password
      });
      store.users.unshift(adminUser);
      return { commit: true };
    }

    const next = hashPassword(password);
    found.passwordHash = next.hash;
    found.passwordSalt = next.salt;
    found.role = "admin";
    found.active = true;
    found.updatedAt = new Date().toISOString();
    adminUser = found;
    return { commit: true };
  });
  return adminUser;
}

async function requireAuth(req, res) {
  const session = getSessionFromRequest(req);
  if (!session) {
    sendJson(res, 401, { error: "Sessione scaduta. Effettua di nuovo il login." });
    return null;
  }

  const store = await readStore();
  const user = store.users.find((entry) => entry.id === session.userId && entry.active !== false);
  if (!user) {
    sendJson(res, 401, { error: "Utente non valido." });
    return null;
  }

  return { user, session };
}

async function handleCoursesList(_req, res, user, url) {
  const store = await readStore();
  const filterDate = String(url.searchParams.get("date") || "").trim();
  const now = new Date();
  const courses = enrichCourses(store, user.id)
    .filter((course) => course.isActive)
    .filter((course) => !isCoursePast(course, now))
    .filter((course) => !filterDate || course.date === filterDate)
    .sort(sortCourses);

  sendJson(res, 200, {
    courses,
    cancellationWindowHours: APP_CONFIG.cancellationWindowHours
  });
}

async function handleMyBookings(_req, res, user) {
  const store = await readStore();
  const coursesById = new Map(store.courses.map((course) => [course.id, course]));

  const mine = store.bookings
    .filter((booking) => booking.userId === user.id)
    .map((booking) => {
      const course = coursesById.get(booking.courseId);
      return {
        ...booking,
        canCancel: course ? canCancelBooking(course) : false,
        cancelDeadline: course ? cancellationDeadline(course).toISOString() : null,
        course: course || null
      };
    })
    .filter((entry) => entry.course)
    .sort((a, b) => sortCourses(a.course, b.course));

  sendJson(res, 200, { bookings: mine });
}

async function handleCreateBooking(req, res, user) {
  const body = await readJsonBody(req, res);
  if (!body) return;

  const courseId = String(body.courseId || "").trim();
  if (!courseId) {
    sendJson(res, 400, { error: "Corso non valido." });
    return;
  }

  const result = await mutateStore((store) => {
    const course = store.courses.find((entry) => entry.id === courseId);
    if (!course) return { status: 404, error: "Corso non trovato." };
    if (!course.isActive) return { status: 409, error: "Corso non attivo. Contatta la palestra." };
    if (isCoursePast(course)) return { status: 409, error: "La lezione e gia iniziata o terminata." };

    const alreadyBooked = store.bookings.some(
      (entry) => entry.courseId === courseId && entry.userId === user.id && entry.status === "active"
    );
    if (alreadyBooked) {
      return { status: 409, error: "Sei gia prenotato a questo corso." };
    }

    const activeCount = store.bookings.filter(
      (entry) => entry.courseId === courseId && entry.status === "active"
    ).length;

    if (activeCount >= course.capacity) {
      return { status: 409, error: "Corso completo. Nessun posto disponibile." };
    }

    const now = new Date().toISOString();
    const booking = {
      id: randomUUID(),
      userId: user.id,
      courseId,
      status: "active",
      createdAt: now,
      cancelledAt: null,
      cancelReason: null
    };

    store.bookings.push(booking);
    if (Array.isArray(store.waitlists)) {
      store.waitlists = store.waitlists.filter((item) => !(item.userId === user.id && item.courseId === courseId));
    }
    createNotification(store, {
      userId: user.id,
      type: "booking_confirmed",
      title: "Prenotazione confermata",
      message: `Prenotazione confermata per ${course.title} alle ${course.startTime}.`
    });
    ensureReminderJobs(store, booking, course);
    const storeUser = store.users.find((entry) => entry.id === user.id);
    if (storeUser) {
      storeUser.lastActivityAt = now;
      storeUser.updatedAt = now;
    }
    return {
      status: 201,
      booking,
      message: `Prenotazione confermata per ${course.title} (${course.startTime}).`
    };
  });

  sendJson(res, result.status, result.booking ? result : { error: result.error });
}

async function handleCancelBooking(_req, res, user, bookingId) {
  const result = await mutateStore((store) => {
    const booking = store.bookings.find((entry) => entry.id === bookingId && entry.userId === user.id);
    if (!booking) return { status: 404, error: "Prenotazione non trovata." };
    if (booking.status !== "active") return { status: 409, error: "Questa prenotazione risulta gia annullata." };

    const course = store.courses.find((entry) => entry.id === booking.courseId);
    if (!course) return { status: 404, error: "Corso associato non trovato." };

    if (!canCancelBooking(course)) {
      return {
        status: 409,
        error: `Non puoi annullare nelle ${APP_CONFIG.cancellationWindowHours} ore prima dell'inizio.`,
        cancelDeadline: cancellationDeadline(course).toISOString()
      };
    }

    const now = new Date().toISOString();
    booking.status = "cancelled";
    booking.cancelledAt = now;
    booking.cancelReason = "user_cancelled";
    cancelReminderJobs(store, booking.id);
    notifyFirstWaitlistUser(store, course.id);
    const storeUser = store.users.find((entry) => entry.id === user.id);
    if (storeUser) {
      storeUser.lastActivityAt = now;
      storeUser.updatedAt = now;
    }

    return { status: 200, ok: true, message: "Prenotazione annullata con successo." };
  });

  sendJson(res, result.status, result.ok ? result : { error: result.error, cancelDeadline: result.cancelDeadline || null });
}

async function handleJoinWaitlist(req, res, user) {
  const body = await readJsonBody(req, res);
  if (!body) return;
  const courseId = String(body.courseId || "").trim();
  if (!courseId) return sendJson(res, 400, { error: "Corso non valido." });

  const result = await mutateStore((store) => {
    const course = store.courses.find((entry) => entry.id === courseId);
    if (!course) return { status: 404, error: "Corso non trovato." };
    const alreadyBooked = store.bookings.some((entry) => entry.courseId === courseId && entry.userId === user.id && entry.status === "active");
    if (alreadyBooked) return { status: 409, error: "Sei gia prenotato a questa lezione." };

    const activeCount = store.bookings.filter((entry) => entry.courseId === courseId && entry.status === "active").length;
    if (activeCount < course.capacity) return { status: 409, error: "C'e ancora posto: prenota direttamente la lezione." };

    const exists = (store.waitlists || []).some((item) => item.courseId === courseId && item.userId === user.id && item.status === "active");
    if (exists) return { status: 409, error: "Sei gia in lista attesa per questa lezione." };

    const row = {
      id: randomUUID(),
      userId: user.id,
      courseId,
      status: "active",
      createdAt: new Date().toISOString(),
      notifiedAt: null
    };
    if (!Array.isArray(store.waitlists)) store.waitlists = [];
    store.waitlists.push(row);
    return { status: 201, waitlist: row };
  });

  sendJson(res, result.status, result.waitlist ? { waitlist: result.waitlist } : { error: result.error });
}

async function handleMyNotifications(_req, res, user) {
  const store = await readStore();
  const notifications = (store.notifications || [])
    .filter((item) => item.userId === user.id)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, 80);
  sendJson(res, 200, { notifications });
}

async function handleReadNotification(_req, res, user, notificationId) {
  const result = await mutateStore((store) => {
    const n = (store.notifications || []).find((item) => item.id === notificationId && item.userId === user.id);
    if (!n) return { status: 404, error: "Notifica non trovata." };
    n.read = true;
    return { status: 200, notification: n };
  });
  sendJson(res, result.status, result.notification ? { notification: result.notification } : { error: result.error });
}

async function handleGetNotificationSubscription(_req, res, user) {
  const store = await readStore();
  const subscription = (store.notificationSubscriptions || []).find((item) => item.userId === user.id && item.active !== false) || null;
  sendJson(res, 200, { subscription, notificationsEnabled: user.notificationsEnabled !== false });
}

async function handleSaveNotificationSubscription(req, res, user) {
  const body = await readJsonBody(req, res);
  if (!body) return;
  const endpoint = String(body.endpoint || "").trim();
  const keys = body.keys && typeof body.keys === "object" ? body.keys : {};
  if (!endpoint) return sendJson(res, 400, { error: "Subscription non valida." });

  const result = await mutateStore((store) => {
    if (!Array.isArray(store.notificationSubscriptions)) store.notificationSubscriptions = [];
    const now = new Date().toISOString();
    let row = store.notificationSubscriptions.find((item) => item.userId === user.id && item.endpoint === endpoint);
    if (!row) {
      row = { id: randomUUID(), userId: user.id, endpoint, keys, active: true, createdAt: now, updatedAt: now };
      store.notificationSubscriptions.push(row);
    } else {
      row.keys = keys;
      row.active = true;
      row.updatedAt = now;
    }
    const storeUser = store.users.find((entry) => entry.id === user.id);
    if (storeUser) storeUser.notificationsEnabled = true;
    return { status: 200, subscription: row };
  });
  sendJson(res, result.status, { subscription: result.subscription });
}

async function handleDeleteNotificationSubscription(_req, res, user) {
  const result = await mutateStore((store) => {
    if (!Array.isArray(store.notificationSubscriptions)) store.notificationSubscriptions = [];
    for (const item of store.notificationSubscriptions) {
      if (item.userId === user.id) item.active = false;
    }
    const storeUser = store.users.find((entry) => entry.id === user.id);
    if (storeUser) storeUser.notificationsEnabled = false;
    return { status: 200, ok: true };
  });
  sendJson(res, result.status, { ok: true });
}

async function handleUserNotificationSettings(req, res, user) {
  const body = await readJsonBody(req, res);
  if (!body) return;
  const enabled = body.enabled !== false;
  const result = await mutateStore((store) => {
    const storeUser = store.users.find((entry) => entry.id === user.id);
    if (!storeUser) return { status: 404, error: "Utente non trovato." };
    storeUser.notificationsEnabled = enabled;
    storeUser.updatedAt = new Date().toISOString();
    return { status: 200, enabled };
  });
  sendJson(res, result.status, result.enabled !== undefined ? { enabled: result.enabled } : { error: result.error });
}

async function handleSendTestNotification(_req, res, user) {
  const result = await mutateStore((store) => {
    const notification = createNotification(store, {
      userId: user.id,
      type: "test",
      title: "Notifica di test",
      message: "Promemoria For Fitness Club attivo correttamente."
    });
    return { status: 200, notification };
  });
  sendJson(res, result.status, { notification: result.notification });
}

async function handleAdminCourses(_req, res, url) {
  const store = await readStore();
  const filterDate = String(url.searchParams.get("date") || "").trim();
  const filterStatus = String(url.searchParams.get("status") || "all").trim();
  const filterType = String(url.searchParams.get("type") || "all").trim();
  const filterTrainer = String(url.searchParams.get("trainer") || "all").trim().toLowerCase();
  const filterOccupancy = String(url.searchParams.get("occupancy") || "all").trim();
  const filterBookings = String(url.searchParams.get("bookings") || "all").trim();
  const search = String(url.searchParams.get("q") || "").trim().toLowerCase();
  const usersById = new Map(store.users.map((user) => [user.id, user]));

  const enriched = enrichCourses(store);
  const trainers = [...new Set(enriched.map((c) => c.trainer).filter(Boolean))].sort((a, b) => a.localeCompare(b));

  const courses = enriched
    .filter((course) => !filterDate || course.date === filterDate)
    .filter((course) => filterStatus === "all" || (filterStatus === "active" ? course.isActive : !course.isActive))
    .filter((course) => filterType === "all" || course.type === filterType)
    .filter((course) => filterTrainer === "all" || course.trainer.toLowerCase() === filterTrainer)
    .filter((course) => {
      if (filterOccupancy === "all") return true;
      if (filterOccupancy === "full") return course.spotsLeft === 0;
      if (filterOccupancy === "almost") return course.isAlmostFull;
      if (filterOccupancy === "free") return course.spotsLeft > 0 && !course.isAlmostFull;
      return true;
    })
    .filter((course) => {
      if (filterBookings === "all") return true;
      if (filterBookings === "with") return course.bookedCount > 0;
      if (filterBookings === "without") return course.bookedCount === 0;
      return true;
    })
    .filter((course) => {
      if (!search) return true;
      const text = `${course.title} ${course.trainer} ${course.typeLabel} ${course.description || ""}`.toLowerCase();
      return text.includes(search);
    })
    .map((course) => {
      const activeBookings = store.bookings.filter(
        (booking) => booking.courseId === course.id && booking.status === "active"
      );
      const cancelledBookings = store.bookings.filter(
        (booking) => booking.courseId === course.id && booking.status === "cancelled"
      );

      return {
        ...course,
        bookedUsers: activeBookings.map((booking) => {
          const user = usersById.get(booking.userId);
          return {
            bookingId: booking.id,
            name: user?.name || "Utente",
            username: user?.username || "-",
            bookedAt: booking.createdAt,
            attendanceStatus: booking.attendanceStatus || "unknown"
          };
        }),
        cancelledUsers: cancelledBookings.map((booking) => {
          const user = usersById.get(booking.userId);
          return {
            bookingId: booking.id,
            name: user?.name || "Utente",
            username: user?.username || "-",
            cancelledAt: booking.cancelledAt
          };
        })
      };
    })
    .sort(sortCourses);

  sendJson(res, 200, { courses, trainers });
}

async function handleAdminDashboard(_req, res, url) {
  const store = await readStore();
  const requestedDate = String(url.searchParams.get("date") || "").trim();
  const today = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
    ? requestedDate
    : localDateKey();

  const todayCourses = store.courses.filter((course) => course.date === today && course.isActive);
  const activeBookingByCourse = new Map();
  for (const booking of store.bookings) {
    if (booking.status !== "active") continue;
    activeBookingByCourse.set(booking.courseId, (activeBookingByCourse.get(booking.courseId) || 0) + 1);
  }

  let totalBookedToday = 0;
  let totalSpotsToday = 0;
  let fullCoursesToday = 0;
  let freeSpotsToday = 0;

  for (const course of todayCourses) {
    const booked = activeBookingByCourse.get(course.id) || 0;
    totalBookedToday += booked;
    totalSpotsToday += course.capacity;
    freeSpotsToday += Math.max(0, course.capacity - booked);
    if (booked >= course.capacity) fullCoursesToday += 1;
  }

  const nextCourses = enrichCourses(store)
    .filter((course) => course.isActive && `${course.date} ${course.startTime}` >= `${today} 00:00`)
    .sort(sortCourses)
    .slice(0, 6);

  sendJson(res, 200, {
    stats: {
      activeCoursesToday: todayCourses.length,
      bookingsToday: totalBookedToday,
      fullCoursesToday,
      freeSpotsToday,
      usersCount: store.users.filter((u) => u.role === "user" && u.active !== false).length,
      totalSpotsToday
    },
    nextCourses
  });
}

async function handleCreateCourse(req, res) {
  const body = await readJsonBody(req, res);
  if (!body) return;

  const parsed = parseCoursePayload(body);
  if (parsed.error) {
    sendJson(res, 400, { error: parsed.error });
    return;
  }

  const result = await mutateStore((store) => {
    const template = resolveCourseTemplate(store, parsed.value.courseTemplateId, parsed.value.title);
    if (!template) {
      return { status: 400, error: "Tipologia corso non valida." };
    }
    if (!template.active) {
      return { status: 409, error: "Tipologia corso disattivata: riattivala per creare nuove lezioni." };
    }

    const title = template.name;
    const capacity = Number.isInteger(parsed.value.capacity) ? parsed.value.capacity : template.defaultCapacity;
    const now = new Date().toISOString();

    if (!parsed.value.isRecurring) {
      const existing = store.courses.find((entry) =>
        entry.courseTemplateId === template.id
        && entry.date === parsed.value.date
        && entry.startTime === parsed.value.startTime
        && entry.endTime === parsed.value.endTime
      );
      if (existing) {
        return { status: 409, error: "Programmazione gia presente: nessun duplicato creato." };
      }
      const created = {
        id: randomUUID(),
        ...parsed.value,
        title,
        capacity,
        validFrom: parsed.value.date,
        validTo: parsed.value.date,
        isRecurring: false,
        seriesId: null,
        createdAt: now,
        updatedAt: now
      };
      store.courses.push(created);
      notifyAllActiveUsers(store, {
        type: "new_course",
        title: "Nuovo corso disponibile",
        message: `Nuovo corso disponibile: ${created.title}.`
      });
      return { status: 201, course: created, createdCount: 1 };
    }

    const seriesId = randomUUID();
    const dates = buildRecurringDates(parsed.value.validFrom, parsed.value.validTo, parsed.value.daysOfWeek);
    if (!dates.length) {
      return { status: 400, error: "Nessuna lezione generata: controlla giorni e periodo." };
    }

    const createdItems = [];
    for (const date of dates) {
      const duplicate = store.courses.find((entry) =>
        entry.courseTemplateId === template.id
        && entry.date === date
        && entry.startTime === parsed.value.startTime
        && entry.endTime === parsed.value.endTime
      );
      if (duplicate) continue;

      const item = {
        id: randomUUID(),
        ...parsed.value,
        title,
        capacity,
        date,
        seriesId,
        createdAt: now,
        updatedAt: now
      };
      store.courses.push(item);
      createdItems.push(item);
    }

    if (!createdItems.length) {
      return { status: 409, error: "Programmazione gia presente: nessun duplicato creato." };
    }

    notifyAllActiveUsers(store, {
      type: "new_course",
      title: "Nuovo corso disponibile",
      message: `Nuovo corso disponibile: ${title}.`
    });

    return {
      status: 201,
      course: createdItems[0],
      createdCount: createdItems.length,
      seriesId
    };
  });

  sendJson(res, result.status, result.course ? result : { error: result.error });
}

async function handleUpdateCourse(req, res, courseId) {
  const body = await readJsonBody(req, res);
  if (!body) return;

  const parsed = parseCoursePayload(body);
  if (parsed.error) {
    sendJson(res, 400, { error: parsed.error });
    return;
  }

  const result = await mutateStore((store) => {
    const course = store.courses.find((entry) => entry.id === courseId);
    if (!course) return { status: 404, error: "Corso non trovato." };
    const template = resolveCourseTemplate(store, parsed.value.courseTemplateId, parsed.value.title);
    if (!template) return { status: 400, error: "Tipologia corso non valida." };

    const now = new Date();
    const nowIso = now.toISOString();
    const isSeries = Boolean(course.seriesId);
    const title = template.name;
    const capacity = Number.isInteger(parsed.value.capacity) ? parsed.value.capacity : template.defaultCapacity;

    if (!isSeries || !parsed.value.isRecurring) {
      const activeBooked = store.bookings.filter(
        (entry) => entry.courseId === courseId && entry.status === "active"
      ).length;
      if (capacity < activeBooked) {
        return { status: 409, error: `Capienza troppo bassa: ci sono gia ${activeBooked} prenotati.` };
      }
      Object.assign(course, parsed.value, {
        title,
        capacity,
        validFrom: parsed.value.validFrom || parsed.value.date,
        validTo: parsed.value.validTo || parsed.value.date,
        updatedAt: nowIso
      });
      return { status: 200, course };
    }

    const seriesCourses = store.courses.filter((entry) => entry.seriesId === course.seriesId);
    const futureCourses = seriesCourses.filter((entry) => !isCoursePast(entry, now));
    const activeBookingsByCourse = new Map();
    for (const booking of store.bookings) {
      if (booking.status !== "active") continue;
      activeBookingsByCourse.set(booking.courseId, (activeBookingsByCourse.get(booking.courseId) || 0) + 1);
    }
    const maxBookedFuture = Math.max(
      0,
      ...futureCourses.map(
        (entry) => activeBookingsByCourse.get(entry.id) || 0
      )
    );

    if (capacity < maxBookedFuture) {
      return { status: 409, error: `Capienza troppo bassa: ci sono lezioni future con ${maxBookedFuture} prenotati.` };
    }

    const datesSet = new Set(buildRecurringDates(parsed.value.validFrom, parsed.value.validTo, parsed.value.daysOfWeek));
    if (!datesSet.size) {
      return { status: 400, error: "Nessuna lezione futura valida con i giorni selezionati." };
    }

    const futureByDate = new Map();
    const removeCourseIds = new Set();

    for (const entry of futureCourses) {
      if (!datesSet.has(entry.date)) {
        const activeBooked = activeBookingsByCourse.get(entry.id) || 0;
        if (activeBooked > 0) {
          entry.isActive = false;
          entry.updatedAt = nowIso;
        } else {
          removeCourseIds.add(entry.id);
        }
        continue;
      }

      Object.assign(entry, {
        title,
        courseTemplateId: template.id,
        description: parsed.value.description,
        type: parsed.value.type,
        trainer: parsed.value.trainer,
        startTime: parsed.value.startTime,
        endTime: parsed.value.endTime,
        durationMinutes: parsed.value.durationMinutes,
        notes: parsed.value.notes,
        internalNotes: parsed.value.internalNotes,
        isActive: parsed.value.isActive,
        daysOfWeek: parsed.value.daysOfWeek,
        capacity,
        validFrom: parsed.value.validFrom,
        validTo: parsed.value.validTo,
        updatedAt: nowIso
      });
      futureByDate.set(entry.date, entry);
    }

    if (removeCourseIds.size) {
      store.courses = store.courses.filter((entry) => !removeCourseIds.has(entry.id));
    }

    for (const date of datesSet) {
      if (futureByDate.has(date)) continue;
      store.courses.push({
        id: randomUUID(),
        title,
        courseTemplateId: template.id,
        description: parsed.value.description,
        type: parsed.value.type,
        trainer: parsed.value.trainer,
        date,
        startTime: parsed.value.startTime,
        endTime: parsed.value.endTime,
        durationMinutes: parsed.value.durationMinutes,
        capacity,
        isActive: parsed.value.isActive,
        daysOfWeek: parsed.value.daysOfWeek,
        notes: parsed.value.notes,
        internalNotes: parsed.value.internalNotes,
        validFrom: parsed.value.validFrom,
        validTo: parsed.value.validTo,
        isRecurring: true,
        seriesId: course.seriesId,
        createdAt: nowIso,
        updatedAt: nowIso
      });
    }

    const seriesUpdated = store.courses
      .filter((entry) => entry.seriesId === course.seriesId)
      .sort(sortCourses);
    const refreshed = seriesUpdated.find((entry) => !isCoursePast(entry, now) && entry.isActive)
      || seriesUpdated.find((entry) => entry.id === courseId)
      || seriesUpdated[0]
      || course;
    return { status: 200, course: refreshed };
  });

  sendJson(res, result.status, result.course ? { course: result.course } : { error: result.error });
}

async function handleAdminCourseTemplates(_req, res) {
  const store = await readStore();
  const templates = listCourseTemplates(store);
  sendJson(res, 200, { templates });
}

async function handleAdminCreateCourseTemplate(req, res) {
  const body = await readJsonBody(req, res);
  if (!body) return;
  const parsed = parseCourseTemplatePayload(body);
  if (parsed.error) return sendJson(res, 400, { error: parsed.error });

  const result = await mutateStore((store) => {
    const templates = listCourseTemplates(store);
    const duplicate = templates.find((entry) => entry.name.toLowerCase() === parsed.value.name.toLowerCase());
    if (duplicate) return { status: 409, error: "Esiste gia una tipologia con questo nome." };

    const now = new Date().toISOString();
    const created = {
      id: randomUUID(),
      name: parsed.value.name,
      defaultCapacity: parsed.value.defaultCapacity,
      color: parsed.value.color,
      active: parsed.value.active,
      sortOrder: templates.length,
      createdAt: now,
      updatedAt: now
    };
    if (!Array.isArray(store.courseTemplates)) store.courseTemplates = [];
    store.courseTemplates.push(created);
    return { status: 201, template: created };
  });

  sendJson(res, result.status, result.template ? { template: result.template } : { error: result.error });
}

async function handleAdminUpdateCourseTemplate(req, res, templateId) {
  const body = await readJsonBody(req, res);
  if (!body) return;
  const parsed = parseCourseTemplatePayload(body);
  if (parsed.error) return sendJson(res, 400, { error: parsed.error });

  const result = await mutateStore((store) => {
    const templates = listCourseTemplates(store);
    const template = templates.find((entry) => entry.id === templateId);
    if (!template) return { status: 404, error: "Tipologia corso non trovata." };

    const duplicate = templates.find(
      (entry) => entry.id !== templateId && entry.name.toLowerCase() === parsed.value.name.toLowerCase()
    );
    if (duplicate) return { status: 409, error: "Esiste gia una tipologia con questo nome." };

    template.name = parsed.value.name;
    template.defaultCapacity = parsed.value.defaultCapacity;
    template.color = parsed.value.color;
    template.active = parsed.value.active;
    template.updatedAt = new Date().toISOString();
    store.courseTemplates = templates;
    return { status: 200, template };
  });

  sendJson(res, result.status, result.template ? { template: result.template } : { error: result.error });
}

async function handleAdminCourseTemplateStatus(req, res, templateId) {
  const body = await readJsonBody(req, res);
  if (!body) return;
  const active = body.active !== false;

  const result = await mutateStore((store) => {
    const templates = listCourseTemplates(store);
    const template = templates.find((entry) => entry.id === templateId);
    if (!template) return { status: 404, error: "Tipologia corso non trovata." };
    template.active = active;
    template.updatedAt = new Date().toISOString();
    store.courseTemplates = templates;
    return { status: 200, template };
  });

  sendJson(res, result.status, result.template ? { template: result.template } : { error: result.error });
}

async function handleAdminDeleteCourseTemplate(_req, res, templateId) {
  const result = await mutateStore((store) => {
    const templates = listCourseTemplates(store);
    const template = templates.find((entry) => entry.id === templateId);
    if (!template) return { status: 404, error: "Tipologia corso non trovata." };

    const linked = store.courses.filter((course) => course.courseTemplateId === templateId).length;
    if (linked > 0) {
      return { status: 409, error: "Tipologia usata in lezioni esistenti: disattivala invece di eliminarla." };
    }

    store.courseTemplates = templates.filter((entry) => entry.id !== templateId);
    return { status: 200, ok: true };
  });

  sendJson(res, result.status, result.ok ? { ok: true } : { error: result.error });
}

async function handleAdminReorderCourseTemplates(req, res) {
  const body = await readJsonBody(req, res);
  if (!body) return;
  const orderedIds = Array.isArray(body.orderedIds) ? body.orderedIds.map((x) => String(x || "")) : [];
  if (!orderedIds.length) return sendJson(res, 400, { error: "Ordine non valido." });

  const result = await mutateStore((store) => {
    const templates = listCourseTemplates(store);
    const byId = new Map(templates.map((entry) => [entry.id, entry]));
    if (orderedIds.some((id) => !byId.has(id))) {
      return { status: 400, error: "Ordine non coerente con le tipologie esistenti." };
    }
    const now = new Date().toISOString();
    orderedIds.forEach((id, idx) => {
      const item = byId.get(id);
      item.sortOrder = idx;
      item.updatedAt = now;
    });
    store.courseTemplates = templates.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    return { status: 200, templates: store.courseTemplates };
  });

  sendJson(res, result.status, result.templates ? { templates: result.templates } : { error: result.error });
}

async function handleDeleteCourse(_req, res, courseId) {
  const result = await mutateStore((store) => {
    const existing = store.courses.find((entry) => entry.id === courseId);
    if (!existing) return { status: 404, error: "Corso non trovato." };

    store.courses = store.courses.filter((entry) => entry.id !== courseId);

    for (const booking of store.bookings) {
      if (booking.courseId === courseId && booking.status === "active") {
        booking.status = "cancelled";
        booking.cancelledAt = new Date().toISOString();
        booking.cancelReason = "course_deleted";
        cancelReminderJobs(store, booking.id);
        createNotification(store, {
          userId: booking.userId,
          type: "course_cancelled",
          title: "Lezione annullata",
          message: `La lezione ${existing.title} delle ${existing.startTime} e stata annullata.`
        });
      }
    }

    return { status: 200, ok: true };
  });

  sendJson(res, result.status, result.ok ? result : { error: result.error });
}

async function handleCourseStatusToggle(req, res, courseId) {
  const body = await readJsonBody(req, res);
  if (!body) return;
  const active = Boolean(body.active);

  const result = await mutateStore((store) => {
    const course = store.courses.find((entry) => entry.id === courseId);
    if (!course) return { status: 404, error: "Corso non trovato." };
    course.isActive = active;
    course.updatedAt = new Date().toISOString();
    if (!active) {
      for (const booking of store.bookings) {
        if (booking.courseId !== courseId || booking.status !== "active") continue;
        booking.status = "cancelled";
        booking.cancelReason = "course_deactivated";
        booking.cancelledAt = new Date().toISOString();
        cancelReminderJobs(store, booking.id);
        createNotification(store, {
          userId: booking.userId,
          type: "course_cancelled",
          title: "Lezione annullata",
          message: `La lezione ${course.title} delle ${course.startTime} e stata annullata.`
        });
      }
    }
    return { status: 200, course };
  });

  sendJson(res, result.status, result.course ? { course: result.course } : { error: result.error });
}

async function handleDuplicateCourse(_req, res, courseId) {
  const duplicated = await mutateStore((store) => {
    const course = store.courses.find((entry) => entry.id === courseId);
    if (!course) return { status: 404, error: "Corso non trovato." };

    const copy = {
      ...course,
      id: randomUUID(),
      title: `${course.title} (Copia)`,
      date: nextDate(course.date),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isActive: true
    };
    store.courses.push(copy);
    return { status: 201, course: copy };
  });

  sendJson(res, duplicated.status, duplicated.course ? { course: duplicated.course } : { error: duplicated.error });
}

async function handleAdminRemoveBooking(_req, res, bookingId) {
  const result = await mutateStore((store) => {
    const booking = store.bookings.find((entry) => entry.id === bookingId);
    if (!booking) return { status: 404, error: "Prenotazione non trovata." };
    if (booking.status !== "active") return { status: 409, error: "Prenotazione gia annullata." };

    booking.status = "cancelled";
    booking.cancelReason = "admin_removed";
    booking.cancelledAt = new Date().toISOString();
    cancelReminderJobs(store, booking.id);
    const course = store.courses.find((entry) => entry.id === booking.courseId);
    if (course) notifyFirstWaitlistUser(store, course.id);
    return { status: 200, ok: true };
  });

  sendJson(res, result.status, result.ok ? { ok: true } : { error: result.error });
}

async function handleAdminAttendance(req, res, bookingId) {
  const body = await readJsonBody(req, res);
  if (!body) return;
  const status = String(body.attendanceStatus || "").trim();
  const allowed = new Set(["unknown", "present", "absent"]);
  if (!allowed.has(status)) {
    sendJson(res, 400, { error: "Valore presenza non valido." });
    return;
  }

  const result = await mutateStore((store) => {
    const booking = store.bookings.find((entry) => entry.id === bookingId);
    if (!booking) return { status: 404, error: "Prenotazione non trovata." };
    booking.attendanceStatus = status;
    return { status: 200, booking };
  });

  sendJson(res, result.status, result.booking ? { booking: result.booking } : { error: result.error });
}

async function handleAdminUsersList(_req, res) {
  const store = await readStore();
  const bookingsByUser = new Map();

  for (const booking of store.bookings) {
    const entry = bookingsByUser.get(booking.userId) || { active: 0, total: 0, lastAt: null };
    entry.total += 1;
    if (booking.status === "active") entry.active += 1;
    const at = booking.cancelledAt || booking.createdAt || null;
    if (at && (!entry.lastAt || at > entry.lastAt)) entry.lastAt = at;
    bookingsByUser.set(booking.userId, entry);
  }

  const users = store.users
    .map((user) => {
      const stats = bookingsByUser.get(user.id) || { active: 0, total: 0, lastAt: null };
      return {
        ...sanitizeUser(user),
        activeBookingsCount: stats.active,
        totalBookingsCount: stats.total,
        lastActivityAt: user.lastActivityAt || stats.lastAt || null
      };
    })
    .sort((a, b) => `${a.role}-${a.name}`.localeCompare(`${b.role}-${b.name}`));

  sendJson(res, 200, { users });
}

async function handleAdminCreateUser(req, res) {
  const body = await readJsonBody(req, res);
  if (!body) return;

  const parsed = parseUserPayload(body, { requirePassword: true });
  if (parsed.error) {
    sendJson(res, 400, { error: parsed.error });
    return;
  }

  const result = await mutateStore((store) => {
    const uniqueCheck = validateUserUniqueness(store.users, parsed.value.username, parsed.value.email, "");
    if (uniqueCheck) return { status: 409, error: uniqueCheck };

    const created = makeUser(parsed.value);
    created.active = parsed.value.active;
    created.notes = parsed.value.notes;
    created.email = parsed.value.email;
    created.firstName = parsed.value.firstName;
    created.lastName = parsed.value.lastName;
    created.name = parsed.value.name;
    created.role = parsed.value.role;
    created.updatedAt = new Date().toISOString();
    store.users.push(created);
    return { status: 201, user: sanitizeUser(created) };
  });

  sendJson(res, result.status, result.user ? { user: result.user } : { error: result.error });
}

async function handleAdminUpdateUser(req, res, userId) {
  const body = await readJsonBody(req, res);
  if (!body) return;

  const parsed = parseUserPayload(body, { requirePassword: false });
  if (parsed.error) {
    sendJson(res, 400, { error: parsed.error });
    return;
  }

  const result = await mutateStore((store) => {
    const user = store.users.find((entry) => entry.id === userId);
    if (!user) return { status: 404, error: "Utente non trovato." };

    const uniqueCheck = validateUserUniqueness(store.users, parsed.value.username, parsed.value.email, userId);
    if (uniqueCheck) return { status: 409, error: uniqueCheck };

    user.firstName = parsed.value.firstName;
    user.lastName = parsed.value.lastName;
    user.name = parsed.value.name;
    user.username = parsed.value.username;
    user.email = parsed.value.email;
    user.role = parsed.value.role;
    user.active = parsed.value.active;
    user.notes = parsed.value.notes;
    user.updatedAt = new Date().toISOString();

    if (parsed.value.password) {
      const { hash, salt } = hashPassword(parsed.value.password);
      user.passwordHash = hash;
      user.passwordSalt = salt;
    }

    return { status: 200, user: sanitizeUser(user) };
  });

  sendJson(res, result.status, result.user ? { user: result.user } : { error: result.error });
}

async function handleAdminUserStatus(req, res, userId) {
  const body = await readJsonBody(req, res);
  if (!body) return;
  const active = body.active !== false;

  const result = await mutateStore((store) => {
    const user = store.users.find((entry) => entry.id === userId);
    if (!user) return { status: 404, error: "Utente non trovato." };
    user.active = active;
    user.updatedAt = new Date().toISOString();
    return { status: 200, user: sanitizeUser(user) };
  });

  sendJson(res, result.status, result.user ? { user: result.user } : { error: result.error });
}

async function handleAdminDeleteUser(_req, res, userId, adminUser) {
  const result = await mutateStore((store) => {
    const user = store.users.find((entry) => entry.id === userId);
    if (!user) return { status: 404, error: "Utente non trovato." };
    if (user.id === adminUser.id) return { status: 409, error: "Non puoi eliminare il tuo account." };

    const activeBookings = store.bookings.filter((booking) => booking.userId === userId && booking.status === "active");
    if (activeBookings.length > 0) {
      return { status: 409, error: `Utente con ${activeBookings.length} prenotazioni attive: rimuovi prima le prenotazioni.` };
    }

    const adminsLeft = store.users.filter((entry) => entry.role === "admin" && entry.id !== userId && entry.active !== false);
    if (user.role === "admin" && adminsLeft.length === 0) {
      return { status: 409, error: "Deve restare almeno un admin attivo." };
    }

    store.users = store.users.filter((entry) => entry.id !== userId);
    store.bookings = store.bookings.filter((entry) => entry.userId !== userId);
    return { status: 200, ok: true };
  });

  sendJson(res, result.status, result.ok ? { ok: true } : { error: result.error });
}

async function handleAdminUserBookings(_req, res, userId) {
  const store = await readStore();
  const user = store.users.find((entry) => entry.id === userId);
  if (!user) {
    sendJson(res, 404, { error: "Utente non trovato." });
    return;
  }

  const coursesById = new Map(store.courses.map((course) => [course.id, course]));
  const bookings = store.bookings
    .filter((booking) => booking.userId === userId)
    .map((booking) => ({
      ...booking,
      course: coursesById.get(booking.courseId) || null
    }))
    .filter((entry) => entry.course)
    .sort((a, b) => `${a.course.date} ${a.course.startTime}`.localeCompare(`${b.course.date} ${b.course.startTime}`));

  sendJson(res, 200, { user: sanitizeUser(user), bookings });
}

async function handleAdminRemoveUserBooking(_req, res, userId, bookingId) {
  const result = await mutateStore((store) => {
    const user = store.users.find((entry) => entry.id === userId);
    if (!user) return { status: 404, error: "Utente non trovato." };

    const booking = store.bookings.find((entry) => entry.id === bookingId && entry.userId === userId);
    if (!booking) return { status: 404, error: "Prenotazione non trovata." };
    if (booking.status !== "active") return { status: 409, error: "Prenotazione gia annullata." };

    const now = new Date().toISOString();
    booking.status = "cancelled";
    booking.cancelledAt = now;
    booking.cancelReason = "admin_removed_from_user";
    user.lastActivityAt = now;
    user.updatedAt = now;

    return { status: 200, ok: true };
  });

  sendJson(res, result.status, result.ok ? { ok: true } : { error: result.error });
}

async function handleExportCourseBookings(_req, res, courseId) {
  const store = await readStore();
  const course = store.courses.find((entry) => entry.id === courseId);
  if (!course) {
    sendJson(res, 404, { error: "Corso non trovato." });
    return;
  }

  const usersById = new Map(store.users.map((u) => [u.id, u]));
  const rows = store.bookings
    .filter((b) => b.courseId === courseId)
    .map((booking) => {
      const user = usersById.get(booking.userId);
      return [
        booking.id,
        user?.name || "Utente",
        user?.username || "-",
        booking.status,
        booking.createdAt || "",
        booking.cancelledAt || "",
        booking.attendanceStatus || "unknown"
      ];
    });

  const header = ["booking_id", "name", "username", "status", "booked_at", "cancelled_at", "attendance"];
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");

  res.writeHead(200, {
    "content-type": "text/csv; charset=utf-8",
    "content-disposition": `attachment; filename=\"iscritti-${course.date}-${safeSlug(course.title)}.csv\"`
  });
  res.end(csv);
}

function parseCoursePayload(payload) {
  const title = String(payload.title || "").trim();
  const courseTemplateId = String(payload.courseTemplateId || "").trim();
  const description = String(payload.description || "").trim() || "Lezione programmata";
  const typeRaw = String(payload.type || "").trim().toLowerCase();
  const type = COURSE_TYPES[typeRaw] ? typeRaw : courseTypeFallback(title);
  const trainer = String(payload.trainer || "").trim() || "Staff";
  const validFromRaw = String(payload.validFrom || payload.date || "").trim();
  const validToRaw = String(payload.validTo || payload.date || "").trim();
  const startTime = String(payload.startTime || "").trim();
  const endTime = String(payload.endTime || "").trim();
  const notes = String(payload.notes || "").trim();
  const internalNotes = String(payload.internalNotes || "").trim();
  const isActive = payload.isActive !== false;
  const daysOfWeek = normalizeDaysOfWeek(payload.daysOfWeek);
  const isRecurring = daysOfWeek.length > 0;

  const hasCapacity = payload.capacity !== undefined && payload.capacity !== null && String(payload.capacity).trim() !== "";
  const capacityRaw = Number(payload.capacity);
  const capacity = hasCapacity && Number.isInteger(capacityRaw) ? capacityRaw : null;
  const durationRaw = Number(payload.durationMinutes);
  const durationMinutes = Number.isInteger(durationRaw)
    ? durationRaw
    : computeDurationMinutes(startTime, endTime);

  if (!title && !courseTemplateId) return { error: "Seleziona una tipologia corso." };
  if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) {
    return { error: "Orario non valido (HH:MM)." };
  }
  if (startTime >= endTime) {
    return { error: "L'orario di fine deve essere successivo all'orario di inizio." };
  }
  if (hasCapacity && (!Number.isInteger(capacity) || capacity < 1 || capacity > 50)) {
    return { error: "Capienza non valida (1-50)." };
  }
  if (!Number.isInteger(durationMinutes) || durationMinutes < 20 || durationMinutes > 180) {
    return { error: "Durata non valida (20-180 minuti)." };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(validFromRaw)) return { error: "Data inizio validita non valida (YYYY-MM-DD)." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(validToRaw)) return { error: "Data fine validita non valida (YYYY-MM-DD)." };
  if (validToRaw < validFromRaw) return { error: "La data fine validita deve essere successiva o uguale alla data inizio." };
  if (daysOfWeek.length === 0) return { error: "Seleziona almeno un giorno della settimana." };

  return {
    value: {
      title,
      courseTemplateId,
      description,
      type,
      trainer,
      date: validFromRaw,
      startTime,
      endTime,
      durationMinutes,
      notes,
      internalNotes,
      isActive,
      daysOfWeek,
      capacity,
      validFrom: validFromRaw,
      validTo: validToRaw,
      isRecurring
    }
  };
}

function parseCourseTemplatePayload(payload) {
  const name = String(payload.name || "").trim();
  const cap = Number(payload.defaultCapacity);
  const active = payload.active !== false;
  const color = String(payload.color || "").trim();
  if (!name) return { error: "Inserisci il nome tipologia." };
  if (!Number.isInteger(cap) || cap < 1 || cap > 50) {
    return { error: "Capienza predefinita non valida (1-50)." };
  }
  if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) return { error: "Colore non valido." };
  return { value: { name, defaultCapacity: cap, active, color: color || "#2b6de5" } };
}

function enrichCourses(store, userId = "") {
  const activeCounts = new Map();
  const userBooked = new Set();
  const userWaitlisted = new Set();

  for (const booking of store.bookings) {
    if (booking.status !== "active") continue;
    activeCounts.set(booking.courseId, (activeCounts.get(booking.courseId) || 0) + 1);
    if (booking.userId === userId) {
      userBooked.add(booking.courseId);
    }
  }
  for (const item of store.waitlists || []) {
    if (item.status !== "active") continue;
    if (item.userId === userId) userWaitlisted.add(item.courseId);
  }

  return store.courses.map((course) => {
    const bookedCount = activeCounts.get(course.id) || 0;
    const spotsLeft = Math.max(0, course.capacity - bookedCount);
    const isBooked = userBooked.has(course.id);
    const status = displayStatus({ isBooked, spotsLeft, capacity: course.capacity });

    return {
      ...course,
      typeLabel: COURSE_TYPES[course.type]?.label || course.type,
      bookedCount,
      spotsLeft,
      isBooked,
      isInWaitlist: userWaitlisted.has(course.id),
      isAlmostFull: spotsLeft > 0 && spotsLeft <= Math.max(2, Math.ceil(course.capacity * 0.2)),
      statusCode: status.code,
      statusLabel: status.label,
      cancelDeadline: cancellationDeadline(course).toISOString()
    };
  });
}

function parseUserPayload(payload, { requirePassword }) {
  const firstName = String(payload.firstName || payload.name || "").trim();
  const lastName = String(payload.lastName || "").trim();
  const name = `${firstName} ${lastName}`.trim() || String(payload.name || "").trim();
  const username = String(payload.username || "").trim().toLowerCase();
  const email = String(payload.email || "").trim().toLowerCase();
  const password = String(payload.password || "").trim();
  const role = payload.role === "admin" ? "admin" : "user";
  const active = payload.active !== false;
  const notes = String(payload.notes || "").trim();

  if (!firstName) return { error: "Nome obbligatorio." };
  if (!username) return { error: "Username obbligatorio." };
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) return { error: "Username non valido (3-40, lettere/numeri/._-)." };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Email non valida." };
  if (requirePassword && password.length < 6) return { error: "Password obbligatoria (minimo 6 caratteri)." };
  if (!["user", "admin"].includes(role)) return { error: "Ruolo non valido." };

  return {
    value: {
      firstName,
      lastName,
      name: name || firstName,
      username,
      email,
      password,
      role,
      active,
      notes
    }
  };
}

function validateUserUniqueness(users, username, email, excludedUserId = "") {
  const duplicateUsername = users.find((entry) => entry.username === username && entry.id !== excludedUserId);
  if (duplicateUsername) {
    return "Username gia in uso.";
  }
  if (email) {
    const duplicateEmail = users.find((entry) => String(entry.email || "").toLowerCase() === email && entry.id !== excludedUserId);
    if (duplicateEmail) {
      return "Email gia in uso.";
    }
  }
  return "";
}

function sortCourses(a, b) {
  return `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`);
}

let schedulerBusy = false;

function startNotificationScheduler() {
  setInterval(() => {
    void runNotificationScheduler();
  }, 60 * 1000);
}

async function runNotificationScheduler() {
  if (schedulerBusy) return;
  schedulerBusy = true;
  try {
    await mutateStore((store) => {
      const now = Date.now();
      for (const job of store.notificationJobs || []) {
        if (job.sentAt) continue;
        const at = Date.parse(job.scheduledAt);
        if (!Number.isFinite(at) || at > now) continue;
        const booking = (store.bookings || []).find((item) => item.id === job.bookingId);
        const course = (store.courses || []).find((item) => item.id === job.courseId);
        if (!booking || booking.status !== "active" || !course || !course.isActive) {
          job.sentAt = new Date().toISOString();
          continue;
        }
        if (!isUserNotificationEnabled(store, booking.userId)) {
          job.sentAt = new Date().toISOString();
          continue;
        }
        const title = job.type === "reminder_24h" ? "Promemoria lezione domani" : "Promemoria lezione";
        const msg = job.type === "reminder_24h"
          ? `Domani hai ${course.title} alle ${course.startTime}.`
          : `Tra 2 ore hai ${course.title}. Ti aspettiamo.`;
        createNotification(store, {
          userId: booking.userId,
          type: job.type,
          title,
          message: msg
        });
        job.sentAt = new Date().toISOString();
      }
      return { commit: true };
    });
  } catch (error) {
    console.error("scheduler_notifications_error", error);
  } finally {
    schedulerBusy = false;
  }
}

function createNotification(store, { userId, type, title, message }) {
  if (!Array.isArray(store.notifications)) store.notifications = [];
  const now = new Date().toISOString();
  const row = {
    id: randomUUID(),
    userId,
    title: String(title || "Notifica"),
    message: String(message || ""),
    type: String(type || "generic"),
    read: false,
    sentAt: now,
    createdAt: now,
    pushDelivered: false
  };
  store.notifications.unshift(row);
  if (store.notifications.length > 1000) store.notifications.length = 1000;
  return row;
}

function ensureReminderJobs(store, booking, course) {
  if (!Array.isArray(store.notificationJobs)) store.notificationJobs = [];
  const start = Date.parse(`${course.date}T${course.startTime}:00`);
  if (!Number.isFinite(start)) return;
  const points = [
    { type: "reminder_24h", at: new Date(start - 24 * 60 * 60 * 1000).toISOString() },
    { type: "reminder_2h", at: new Date(start - 2 * 60 * 60 * 1000).toISOString() }
  ];
  for (const point of points) {
    const exists = store.notificationJobs.some((job) => job.bookingId === booking.id && job.type === point.type);
    if (exists) continue;
    store.notificationJobs.push({
      id: randomUUID(),
      bookingId: booking.id,
      userId: booking.userId,
      courseId: booking.courseId,
      type: point.type,
      scheduledAt: point.at,
      sentAt: null
    });
  }
}

function cancelReminderJobs(store, bookingId) {
  if (!Array.isArray(store.notificationJobs)) return;
  const now = new Date().toISOString();
  for (const job of store.notificationJobs) {
    if (job.bookingId === bookingId && !job.sentAt) job.sentAt = now;
  }
}

function notifyAllActiveUsers(store, { type, title, message }) {
  for (const user of store.users || []) {
    if (user.role !== "user" || user.active === false) continue;
    createNotification(store, { userId: user.id, type, title, message });
  }
}

function notifyFirstWaitlistUser(store, courseId) {
  const course = (store.courses || []).find((entry) => entry.id === courseId);
  if (!course || !course.isActive) return;
  const activeBooked = (store.bookings || []).filter((entry) => entry.courseId === courseId && entry.status === "active").length;
  if (activeBooked >= course.capacity) return;
  const candidate = (store.waitlists || [])
    .filter((item) => item.courseId === courseId && item.status === "active")
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))[0];
  if (!candidate) return;
  candidate.status = "notified";
  candidate.notifiedAt = new Date().toISOString();
  createNotification(store, {
    userId: candidate.userId,
    type: "waitlist_spot_free",
    title: "Posto libero disponibile",
    message: `Si e liberato un posto per ${course.title} alle ${course.startTime}.`
  });
}

function isUserNotificationEnabled(store, userId) {
  const user = (store.users || []).find((entry) => entry.id === userId);
  if (!user || user.active === false) return false;
  if (user.notificationsEnabled === false) return false;
  const hasActiveSub = (store.notificationSubscriptions || []).some((item) => item.userId === userId && item.active !== false);
  return hasActiveSub;
}

function listCourseTemplates(store) {
  const list = Array.isArray(store.courseTemplates) ? [...store.courseTemplates] : [];
  return list
    .map((entry, idx) => ({
      id: String(entry.id || randomUUID()),
      name: String(entry.name || "").trim(),
      defaultCapacity: Number(entry.defaultCapacity) || 20,
      color: /^#[0-9a-fA-F]{6}$/.test(String(entry.color || "")) ? String(entry.color) : "#2b6de5",
      active: entry.active !== false,
      sortOrder: Number.isFinite(Number(entry.sortOrder)) ? Number(entry.sortOrder) : idx,
      createdAt: String(entry.createdAt || new Date().toISOString()),
      updatedAt: String(entry.updatedAt || new Date().toISOString())
    }))
    .filter((entry) => entry.name)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

function resolveCourseTemplate(store, templateId, fallbackTitle = "") {
  const templates = listCourseTemplates(store);
  if (templateId) {
    return templates.find((entry) => entry.id === templateId) || null;
  }
  const byTitle = String(fallbackTitle || "").trim().toLowerCase();
  if (!byTitle) return null;
  return templates.find((entry) => entry.name.toLowerCase() === byTitle) || null;
}

async function serveStatic(pathname, res) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const safePath = normalize(requested).replace(/^\.+/, "");
  const filePath = join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendJson(res, 403, { error: "Accesso negato." });
    return;
  }

  try {
    const file = await readFile(filePath);
    const ext = extname(filePath);
    const contentType = contentTypes[ext] || "application/octet-stream";
    const isCriticalAsset = [".html", ".js", ".css", ".webmanifest"].includes(ext) || filePath.endsWith("/sw.js");
    const cacheControl = isCriticalAsset
      ? "no-store, no-cache, must-revalidate, proxy-revalidate"
      : "public, max-age=3600";
    res.writeHead(200, {
      "content-type": contentType,
      "cache-control": cacheControl,
      pragma: "no-cache",
      expires: "0"
    });
    res.end(file);
  } catch {
    sendJson(res, 404, { error: "Risorsa non trovata." });
  }
}

async function readJsonBody(req, res) {
  let raw = "";

  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > APP_CONFIG.maxJsonBytes) {
      sendJson(res, 413, { error: "Richiesta troppo grande." });
      return null;
    }
  }

  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch {
    sendJson(res, 400, { error: "Payload JSON non valido." });
    return null;
  }
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function applySecurityHeaders(res) {
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("x-frame-options", "DENY");
  res.setHeader("referrer-policy", "strict-origin-when-cross-origin");
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
  return [...new Set(value
    .map((entry) => String(entry || "").toLowerCase().trim().slice(0, 3))
    .filter((entry) => allowed.has(entry)))];
}

function buildRecurringDates(validFrom, validTo, daysOfWeek) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(validFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(validTo)) return [];
  if (validTo < validFrom) return [];
  const daySet = new Set(normalizeDaysOfWeek(daysOfWeek));
  if (!daySet.size) return [];

  const mapDay = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];
  const from = new Date(`${validFrom}T00:00:00`);
  const to = new Date(`${validTo}T00:00:00`);
  const dates = [];

  for (let cursor = new Date(from); cursor <= to; cursor.setDate(cursor.getDate() + 1)) {
    const key = localDateKey(cursor);
    const dow = mapDay[cursor.getDay()];
    if (daySet.has(dow)) dates.push(key);
  }
  return dates;
}

function isCoursePast(course, now = new Date()) {
  const at = new Date(`${course.date}T${course.startTime}:00`);
  return at < now;
}

function csvCell(value) {
  const text = String(value ?? "");
  if (!text.includes(",") && !text.includes("\"") && !text.includes("\n")) return text;
  return `"${text.replaceAll("\"", "\"\"")}"`;
}

function safeSlug(value) {
  return String(value || "corso")
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");
}

function nextDate(dateStr) {
  const date = new Date(`${dateStr}T00:00:00`);
  date.setDate(date.getDate() + 7);
  return localDateKey(date);
}

function localDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
