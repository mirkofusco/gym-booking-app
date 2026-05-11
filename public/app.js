const loginView = document.getElementById("loginView");
const appView = document.getElementById("appView");
const loginForm = document.getElementById("loginForm");
const loginMsg = document.getElementById("loginMsg");

const headerTitle = document.getElementById("headerTitle");
const headerProfileBtn = document.getElementById("headerProfileBtn");
const logoutBtn = document.getElementById("logoutBtn");
const enableNotificationsBtn = document.getElementById("enableNotificationsBtn");
const testNotificationBtn = document.getElementById("testNotificationBtn");
const notificationState = document.getElementById("notificationState");

const welcomeTitle = document.getElementById("welcomeTitle");
const currentDateLabel = document.getElementById("currentDateLabel");
const selectedDayHeading = document.getElementById("selectedDayHeading");
const profileName = document.getElementById("profileName");
const dayStrip = document.getElementById("dayStrip");
const coursesList = document.getElementById("coursesList");
const coursesMsg = document.getElementById("coursesMsg");
const upcomingBookingsList = document.getElementById("upcomingBookingsList") || document.getElementById("bookingsList");
const bookingsHistoryList = document.getElementById("bookingsHistoryList");
const toggleHistoryBtn = document.getElementById("toggleHistoryBtn");
const bookingsMsg = document.getElementById("bookingsMsg");
const lessonsList = document.getElementById("lessonsList");
const notificationsList = document.getElementById("notificationsList");

const bookingConfirmModal = document.getElementById("bookingConfirmModal");
const confirmCourseName = document.getElementById("confirmCourseName");
const confirmCourseDate = document.getElementById("confirmCourseDate");
const confirmBookingBtn = document.getElementById("confirmBookingBtn");
const closeBookingConfirmBtn = document.getElementById("closeBookingConfirmBtn");
const bookingMsg = document.getElementById("bookingMsg");
const toastStack = document.getElementById("toastStack");

const bottomNavButtons = [...document.querySelectorAll(".user-bottom-nav button")];
const screens = ["screenHome", "screenLessons", "screenBookings", "screenProfile"];
const storageKey = "easyfit_session";

let session = readSession();
let allCourses = [];
let myBookings = [];
let myNotifications = [];
let selectedDate = todayIso();
let selectedCourse = null;
let activeScreen = "screenHome";
let historyExpanded = false;
let pollTimer = null;
const seenNotificationIds = new Set();

if (session?.token) void bootApp();

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setEasyMsg(loginMsg, "Accesso in corso...", "");
  const username = document.getElementById("username").value.trim().toLowerCase();
  const password = document.getElementById("password").value.trim();
  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return setEasyMsg(loginMsg, data.error || "Login non riuscito.", "error");
    if (data.user?.role !== "user") return setEasyMsg(loginMsg, "Account non utente.", "error");
    session = { token: data.token, user: data.user };
    saveSession(session);
    await bootApp();
  } catch {
    setEasyMsg(loginMsg, "Server non raggiungibile.", "error");
  }
});

headerProfileBtn.addEventListener("click", () => goTo("screenProfile"));
logoutBtn.addEventListener("click", logout);
enableNotificationsBtn.addEventListener("click", enableNotificationsFlow);
testNotificationBtn.addEventListener("click", sendTestNotification);
if (toggleHistoryBtn) {
  toggleHistoryBtn.addEventListener("click", () => {
    historyExpanded = !historyExpanded;
    renderBookings();
  });
}

bottomNavButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    const target = button.dataset.go;
    if (!target) return;
    if (target === "screenBookings") await loadBookings();
    if (target === "screenLessons") renderLessons();
    if (target === "screenProfile") await loadNotifications();
    goTo(target);
  });
});

confirmBookingBtn.addEventListener("click", async () => {
  if (!selectedCourse) return;
  bookingMsg.textContent = "Conferma in corso...";
  const tryBook = async (courseId) => apiFetch("/api/bookings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ courseId })
  });
  try {
    // Always refresh courses before booking to avoid stale IDs after admin changes.
    await loadCourses();
    selectedCourse = resolveCurrentCourse(selectedCourse);
    if (!selectedCourse?.id) {
      throw new Error("Corso non trovato. Aggiorna la pagina e riprova.");
    }

    let data;
    try {
      data = await tryBook(selectedCourse.id);
    } catch (firstError) {
      const msg = String(firstError?.message || "").toLowerCase();
      if (!msg.includes("corso non trovato")) throw firstError;
      await loadCourses();
      const refreshed = resolveCurrentCourse(selectedCourse);
      if (!refreshed) throw firstError;
      selectedCourse = refreshed;
      data = await tryBook(refreshed.id);
    }
    const booking = data.booking || {};
    const optimistic = {
      id: booking.id || `tmp-${selectedCourse.id}`,
      status: "active",
      createdAt: booking.createdAt || new Date().toISOString(),
      cancelledAt: null,
      cancelReason: null,
      canCancel: true,
      cancelDeadline: selectedCourse.cancelDeadline || null,
      course: selectedCourse
    };
    myBookings = [
      optimistic,
      ...myBookings.filter((item) => !(item.status === "active" && item.course?.id === selectedCourse.id))
    ];
    syncBookingsIntoCourses();
    renderCourses();
    renderBookings();
    renderLessons();
    showToast("Prenotazione completata", "success");
    bookingMsg.textContent = data.message || "Prenotazione completata";
    closeModal(bookingConfirmModal);
    await Promise.all([loadBookings(), loadCourses(), loadNotifications()]);
    goTo("screenBookings");
  } catch (error) {
    bookingMsg.textContent = error.message || "Prenotazione non riuscita";
    const m = String(error.message || "").toLowerCase();
    if (m.includes("gia prenotato") || m.includes("già prenotato")) {
      await Promise.all([loadBookings(), loadCourses()]);
    }
  }
});
closeBookingConfirmBtn.addEventListener("click", () => closeModal(bookingConfirmModal));

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeModal(bookingConfirmModal);
});

async function bootApp() {
  loginView.classList.add("hidden");
  appView.classList.remove("hidden");
  try {
    const me = await apiFetch("/api/me");
    session.user = me.user;
    saveSession(session);
    welcomeTitle.textContent = `Ciao ${session.user.firstName || session.user.name} 👋`;
    profileName.textContent = `${session.user.name} • @${session.user.username}`;
    updateHomeDateLabels();

    await registerServiceWorker();
    await Promise.all([loadCourses(), loadBookings(), loadNotifications()]);
    goTo("screenHome");
    startNotificationPolling();
    await refreshNotificationState();
  } catch {
    await logout();
  }
}

async function logout() {
  if (pollTimer) clearInterval(pollTimer);
  await apiFetch("/api/auth/logout", { method: "POST" }, false);
  clearSession();
  location.reload();
}

async function loadCourses() {
  setEasyMsg(coursesMsg, "Caricamento corsi...", "");
  coursesList.innerHTML = skeletonCards(3);
  try {
    const data = await apiFetch("/api/courses");
    allCourses = (data.courses || []).sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`));
    syncBookingsIntoCourses();
    renderDayStrip();
    renderCourses();
    renderLessons();
    updateHomeDateLabels();
    setEasyMsg(coursesMsg, "", "");
  } catch (error) {
    setEasyMsg(coursesMsg, error.message || "Errore caricamento corsi.", "error");
  }
}

async function loadBookings() {
  if (upcomingBookingsList) upcomingBookingsList.innerHTML = skeletonCards(2);
  if (bookingsHistoryList) bookingsHistoryList.innerHTML = "";
  setEasyMsg(bookingsMsg, "Caricamento prenotazioni...", "");
  try {
    const data = await apiFetch("/api/bookings/mine");
    myBookings = data.bookings || [];
    syncBookingsIntoCourses();
    renderCourses();
    renderLessons();
    renderBookings();
    setEasyMsg(bookingsMsg, "", "");
  } catch (error) {
    setEasyMsg(bookingsMsg, error.message || "Errore caricamento prenotazioni.", "error");
  }
}

async function loadNotifications() {
  const data = await apiFetch("/api/notifications");
  myNotifications = data.notifications || [];
  renderNotifications();
}

function renderDayStrip() {
  const dates = buildForwardDays(selectedDate, 8);
  if (!dates.length) {
    dayStrip.innerHTML = "<p class='panel-sub'>Nessuna data disponibile.</p>";
    return;
  }
  dayStrip.innerHTML = dates.map((date) => {
    const count = allCourses.filter((c) => c.date === date && c.isActive).length;
    const d = new Date(`${date}T00:00:00`);
    const dayName = new Intl.DateTimeFormat("it-IT", { weekday: "short" }).format(d).toUpperCase();
    const dayNum = new Intl.DateTimeFormat("it-IT", { day: "2-digit" }).format(d);
    return `
      <button type="button" class="day-pill ${date === selectedDate ? "active" : ""}" data-date="${date}">
        <span>${dayName}</span>
        <strong>${dayNum}</strong>
        <small>${count} corsi</small>
      </button>
    `;
  }).join("");
  dayStrip.querySelectorAll("[data-date]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedDate = button.dataset.date;
      renderDayStrip();
      renderCourses();
      updateHomeDateLabels();
    });
  });
}

function renderCourses() {
  const rows = allCourses
    .filter((course) => course.date === selectedDate);

  if (!rows.length) {
    const isToday = selectedDate === todayIso();
    coursesList.innerHTML = `
      <article class="user-v2-card">
        <h3>${isToday ? "Oggi non ci sono lezioni disponibili." : "Nessun corso disponibile in questa giornata."}</h3>
        <p class="panel-sub">${isToday ? "Scegli domani o un altro giorno per prenotare." : "Prova un altro giorno."}</p>
        <button id="goTomorrowBtn" class="easyfit-btn ghost" type="button">Vedi domani</button>
      </article>
    `;
    document.getElementById("goTomorrowBtn")?.addEventListener("click", () => {
      selectedDate = moveDate(selectedDate, 1);
      renderDayStrip();
      renderCourses();
      updateHomeDateLabels();
    });
    return;
  }

  coursesList.innerHTML = rows.map((course) => {
    const action = actionForCourse(course);
    const statusLine = `${Math.max(0, course.spotsLeft)}/${course.capacity} posti`;
    const stateLabel = course.isBooked
      ? "Prenotato"
      : course.spotsLeft <= 0
        ? "Pieno"
        : course.statusLabel || "Disponibile";
    return `
      <article class="course-card-v2 compact-card">
        <h3>${escapeHtml(course.title)}</h3>
        <p>${course.startTime} - ${course.endTime}</p>
        <p>${statusLine} • ${stateLabel}</p>
        <div class="course-actions">${action}</div>
      </article>
    `;
  }).join("");

  coursesList.querySelectorAll("[data-book]").forEach((button) => {
    button.addEventListener("click", () => {
      const course = allCourses.find((item) => item.id === button.dataset.book);
      if (!course) return;
      selectedCourse = course;
      confirmCourseName.textContent = course.title;
      confirmCourseDate.textContent = `${formatLongDate(course.date)} • ${course.startTime}-${course.endTime}`;
      bookingMsg.textContent = "";
      openModal(bookingConfirmModal);
    });
  });

  coursesList.querySelectorAll("[data-cancel]").forEach((button) => {
    button.addEventListener("click", async () => {
      await cancelBooking(button.dataset.cancel);
    });
  });

  coursesList.querySelectorAll("[data-waitlist]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await apiFetch("/api/waitlist", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ courseId: button.dataset.waitlist })
        });
        showToast("Inserito in lista attesa", "success");
        await loadCourses();
      } catch (error) {
        showToast(error.message || "Lista attesa non disponibile", "error");
      }
    });
  });
}

function actionForCourse(course) {
  if (course.isBooked) {
    const booking = myBookings.find((item) => item.status === "active" && item.course?.id === course.id);
    const canCancel = booking ? canCancelByCourse(booking.course) : false;
    if (booking && canCancel) {
      return `<button class="easyfit-btn ghost" data-cancel="${booking.id}" type="button">Annulla prenotazione</button>`;
    }
    const deadline = booking?.cancelDeadline ? formatDateTime(booking.cancelDeadline) : "";
    return `
      <div class="course-action-stack">
        <button class="easyfit-btn booked" disabled type="button">Prenotato ✓</button>
        <small>Limite annullamento superato${deadline ? ` (entro ${deadline})` : ""}</small>
      </div>
    `;
  }
  if (course.spotsLeft <= 0) {
    if (course.isInWaitlist) return `<button class="easyfit-btn dark" disabled type="button">In lista attesa</button>`;
    return `<button class="easyfit-btn dark" disabled type="button">Posti esauriti</button>`;
  }
  return `<button class="easyfit-btn gold" data-book="${course.id}" type="button">Prenota</button>`;
}

function renderBookings() {
  if (!upcomingBookingsList) return;
  const activeBookings = myBookings.filter((item) => item.status === "active" && item.course);
  const upcoming = activeBookings
    .filter((item) => isUpcomingCourse(item.course))
    .sort((a, b) => courseStart(a.course) - courseStart(b.course));
  const activePast = activeBookings
    .filter((item) => !isUpcomingCourse(item.course))
    .sort((a, b) => courseStart(b.course) - courseStart(a.course));
  const history = myBookings
    .filter((item) => item.course && item.status !== "active")
    .sort((a, b) => courseStart(b.course) - courseStart(a.course));

  if (!upcoming.length && !activePast.length) {
    upcomingBookingsList.innerHTML = "<p class='panel-sub'>Nessuna prenotazione futura.</p>";
  } else {
    upcomingBookingsList.innerHTML = [...upcoming, ...activePast].map((booking) => `
      <article class="course-card-v2 compact-card">
        <h3>${escapeHtml(booking.course.title)}</h3>
        <p>${formatLongDate(booking.course.date)} • ${booking.course.startTime}-${booking.course.endTime}</p>
        <p>Stato: ${canCancelByCourse(booking.course) ? "Cancellabile" : "Non cancellabile (<2h)"}</p>
        ${
          canCancelByCourse(booking.course)
            ? `<button class="easyfit-btn ghost" data-cancel-booking="${booking.id}" type="button">Annulla</button>`
            : `<button class="easyfit-btn booked" disabled type="button">Prenotato ✓</button>`
        }
      </article>
    `).join("");
  }
  upcomingBookingsList.querySelectorAll("[data-cancel-booking]").forEach((button) => {
    button.addEventListener("click", async () => {
      await cancelBooking(button.dataset.cancelBooking);
      await loadBookings();
    });
  });

  if (!toggleHistoryBtn || !bookingsHistoryList) return;
  toggleHistoryBtn.textContent = historyExpanded ? "Nascondi storico" : "Mostra storico";
  bookingsHistoryList.classList.toggle("hidden", !historyExpanded);
  if (!historyExpanded) return;
  if (!history.length) {
    bookingsHistoryList.innerHTML = "<p class='panel-sub'>Storico vuoto.</p>";
    return;
  }
  bookingsHistoryList.innerHTML = history.map((booking) => {
    const dateShort = formatHistoryDate(booking.course.date);
    const status = booking.status === "cancelled" ? "annullato" : "concluso";
    return `<article class="history-row"><strong>${escapeHtml(booking.course.title)}</strong> · ${dateShort} · ${booking.course.startTime} <span>${status}</span></article>`;
  }).join("");
}

async function cancelBooking(bookingId) {
  try {
    const data = await apiFetch(`/api/bookings/${encodeURIComponent(bookingId)}`, { method: "DELETE" });
    showToast(data.message || "Prenotazione annullata", "success");
    await Promise.all([loadCourses(), loadBookings()]);
  } catch (error) {
    showToast(error.message || "Annullamento non riuscito", "error");
  }
}

function renderNotifications() {
  if (!myNotifications.length) {
    notificationsList.innerHTML = "<p class='panel-sub'>Nessuna notifica al momento.</p>";
    return;
  }
  notificationsList.innerHTML = myNotifications.map((item) => `
    <article class="course-card-v2 compact ${item.read ? "" : "unread"}">
      <h4>${escapeHtml(item.title)}</h4>
      <p>${escapeHtml(item.message)}</p>
      <p>${formatDateTime(item.createdAt)}</p>
    </article>
  `).join("");
}

function goTo(screenId) {
  activeScreen = screenId;
  screens.forEach((id) => {
    const node = document.getElementById(id);
    if (!node) return;
    node.classList.toggle("active", id === screenId);
  });
  bottomNavButtons.forEach((button) => button.classList.toggle("active", button.dataset.go === screenId));
  if (headerTitle) {
    const titles = {
      screenHome: "Home",
      screenLessons: "Lezioni",
      screenBookings: "Prenotazioni",
      screenProfile: "Profilo"
    };
    headerTitle.textContent = titles[screenId] || "For Fitness Club";
  }
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("/sw.js");
  } catch {
    // ignore
  }
}

async function refreshNotificationState() {
  const supported = "Notification" in window && "serviceWorker" in navigator;
  if (!supported) {
    notificationState.textContent = "Notifiche non supportate su questo browser.";
    return;
  }
  const subData = await apiFetch("/api/notifications/subscription");
  const perm = Notification.permission;
  if (perm === "denied") {
    notificationState.textContent = "Permesso negato. Abilita notifiche dalle impostazioni browser.";
    return;
  }
  if (subData.subscription && subData.notificationsEnabled) {
    notificationState.textContent = "Notifiche attive.";
  } else if (perm === "granted") {
    notificationState.textContent = "Permesso concesso, completa attivazione.";
  } else {
    notificationState.textContent = "Notifiche disattivate.";
  }
}

async function enableNotificationsFlow() {
  if (!("Notification" in window)) {
    notificationState.textContent = "Notifiche non supportate.";
    return;
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    notificationState.textContent = permission === "denied"
      ? "Permesso notifiche negato."
      : "Permesso non concesso.";
    await apiFetch("/api/me/notifications", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: false })
    }, false);
    return;
  }

  let subscriptionPayload = null;
  try {
    const reg = await navigator.serviceWorker.ready;
    const keyData = await apiFetch("/api/notifications/public-key", {}, false);
    if (keyData?.publicKey && reg.pushManager) {
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64ToUint8Array(keyData.publicKey)
      });
      subscriptionPayload = sub.toJSON();
    }
  } catch {
    // fallback to local notifications
  }

  if (subscriptionPayload) {
    await apiFetch("/api/notifications/subscription", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(subscriptionPayload)
    });
  } else {
    await apiFetch("/api/me/notifications", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: true })
    });
  }

  notificationState.textContent = "Notifiche attivate.";
  showToast("Notifiche attivate", "success");
  await refreshNotificationState();
}

async function sendTestNotification() {
  try {
    await apiFetch("/api/notifications/test", { method: "POST" });
    await loadNotifications();
    showToast("Notifica test inviata", "success");
  } catch (error) {
    showToast(error.message || "Invio test non riuscito", "error");
  }
}

function startNotificationPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    try {
      const data = await apiFetch("/api/notifications", {}, false);
      const incoming = data.notifications || [];
      for (const item of incoming) {
        if (seenNotificationIds.has(item.id)) continue;
        seenNotificationIds.add(item.id);
        if (!item.read) {
          await showBrowserNotification(item.title, item.message);
          await apiFetch(`/api/notifications/${encodeURIComponent(item.id)}/read`, { method: "PATCH" }, false);
        }
      }
      myNotifications = incoming;
      if (activeScreen === "screenProfile") renderNotifications();
    } catch {
      // ignore polling errors
    }
  }, 30000);
}

async function showBrowserNotification(title, body) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification(title, {
      body,
      icon: "/icons/icon.svg",
      badge: "/icons/icon.svg",
      tag: `easyfit-${Date.now()}`
    });
  } catch {
    // ignore
  }
}

async function apiFetch(url, options = {}, throwOnError = true) {
  const headers = { ...(options.headers || {}), authorization: `Bearer ${session?.token || ""}` };
  const response = await fetch(url, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok && throwOnError) {
    const detail = data?.cancelDeadline ? ` Puoi annullare entro ${formatDateTime(data.cancelDeadline)}.` : "";
    throw new Error((data.error || "Richiesta fallita.") + detail);
  }
  return data;
}

function openModal(node) {
  node.classList.remove("hidden");
  node.setAttribute("aria-hidden", "false");
}

function closeModal(node) {
  node.classList.add("hidden");
  node.setAttribute("aria-hidden", "true");
}

function showToast(text, kind = "success") {
  const toast = document.createElement("div");
  toast.className = `toast ${kind}`;
  toast.textContent = text;
  toastStack.append(toast);
  if (kind === "success") showCenterConfirm(text);
  setTimeout(() => {
    toast.classList.add("out");
    setTimeout(() => toast.remove(), 200);
  }, 1800);
}

function showCenterConfirm(text) {
  const node = document.createElement("div");
  node.className = "center-confirm";
  node.textContent = text || "Confermato";
  document.body.append(node);
  setTimeout(() => node.remove(), 520);
}

function skeletonCards(n) {
  return Array.from({ length: n }, () => "<article class='course-card-v2 skeleton'></article>").join("");
}

function moveDate(date, days) {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return dateKeyLocal(d);
}

function formatLongDate(dateKey) {
  return new Intl.DateTimeFormat("it-IT", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })
    .format(new Date(`${dateKey}T00:00:00`));
}

function formatDateTime(iso) {
  return new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    .format(new Date(iso));
}

function canCancelByCourse(course) {
  if (!course?.date || !course?.startTime) return false;
  const startMs = new Date(`${course.date}T${course.startTime}:00`).getTime();
  return Date.now() < (startMs - 2 * 60 * 60 * 1000);
}

function todayIso() {
  return dateKeyLocal(new Date());
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function readSession() {
  try {
    return JSON.parse(localStorage.getItem(storageKey) || "null");
  } catch {
    return null;
  }
}

function saveSession(data) {
  localStorage.setItem(storageKey, JSON.stringify(data));
}

function clearSession() {
  localStorage.removeItem(storageKey);
}

function setEasyMsg(element, text, kind) {
  element.textContent = text;
  element.className = `easyfit-msg ${kind || ""}`.trim();
}

function base64ToUint8Array(base64) {
  const padding = "=".repeat((4 - base64.length % 4) % 4);
  const base64Safe = (base64 + padding).replaceAll("-", "+").replaceAll("_", "/");
  const raw = atob(base64Safe);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

function updateHomeDateLabels() {
  const selected = new Date(`${selectedDate}T00:00:00`);
  const pretty = new Intl.DateTimeFormat("it-IT", {
    weekday: "long",
    day: "2-digit",
    month: "long"
  }).format(selected);
  if (currentDateLabel) currentDateLabel.textContent = `Oggi è ${pretty}`;
  if (selectedDayHeading) {
    selectedDayHeading.textContent = selectedDate === todayIso()
      ? "Lezioni di oggi"
      : `Lezioni di ${pretty}`;
  }
}

function dateKeyLocal(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function resolveCurrentCourse(course) {
  if (!course) return null;
  // 1) exact id if still present
  const byId = allCourses.find((c) => c.id === course.id);
  if (byId) return byId;
  // 2) exact lesson match
  const exact = allCourses.find((c) =>
    c.title === course.title
    && c.date === course.date
    && c.startTime === course.startTime
    && c.endTime === course.endTime
  );
  if (exact) return exact;
  // 3) relaxed match (end time may change on schedule edits)
  return allCourses.find((c) =>
    c.title === course.title
    && c.date === course.date
    && c.startTime === course.startTime
  ) || null;
}

function buildForwardDays(startDate, total = 8) {
  const out = [];
  for (let i = 0; i < total; i += 1) out.push(moveDate(startDate, i));
  return out;
}

function syncBookingsIntoCourses() {
  const activeByCourse = new Map();
  for (const booking of myBookings) {
    if (booking.status !== "active" || !booking.course?.id) continue;
    activeByCourse.set(booking.course.id, booking);
  }
  allCourses = allCourses.map((course) => {
    const booking = activeByCourse.get(course.id);
    return {
      ...course,
      isBooked: Boolean(booking)
    };
  });
}

function courseStart(course) {
  return new Date(`${course.date}T${course.startTime}:00`);
}

function isUpcomingCourse(course) {
  const today = todayIso();
  const nowTime = currentTimeHHmm();
  if (!course?.date || !course?.startTime) return true;
  if (course.date > today) return true;
  if (course.date < today) return false;
  return String(course.startTime).slice(0, 5) >= nowTime;
}

function currentTimeHHmm() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function formatHistoryDate(dateKey) {
  return new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "short" })
    .format(new Date(`${dateKey}T00:00:00`));
}

function renderLessons() {
  if (!lessonsList) return;
  const upcoming = allCourses
    .filter((course) => course.isActive !== false && courseStart(course) >= new Date())
    .slice(0, 12);
  if (!upcoming.length) {
    lessonsList.innerHTML = "<p class='panel-sub'>Nessuna lezione in arrivo.</p>";
    return;
  }
  lessonsList.innerHTML = upcoming.map((course) => `
    <article class="course-card-v2 compact-card">
      <h3>${escapeHtml(course.title)}</h3>
      <p>${formatLongDate(course.date)} • ${course.startTime}-${course.endTime}</p>
      <p>${Math.max(0, course.spotsLeft)}/${course.capacity} posti</p>
    </article>
  `).join("");
}
