const adminLogin = document.getElementById("adminLogin");
const adminApp = document.getElementById("adminApp");
const adminLoginForm = document.getElementById("adminLoginForm");
const adminLoginMsg = document.getElementById("adminLoginMsg");
const adminUsernameInput = document.getElementById("adminUsername");
const adminMsg = document.getElementById("adminMsg");
const adminLogoutBtn = document.getElementById("adminLogoutBtn");
const quickNewCourseBtn = document.getElementById("quickNewCourseBtn");
const selectedDateLabel = document.getElementById("selectedDateLabel");

const tabButtons = [...document.querySelectorAll(".tab-btn")];
const tabSections = {
  today: document.getElementById("tabToday"),
  week: document.getElementById("tabWeek"),
  users: document.getElementById("tabUsers"),
  courses: document.getElementById("tabCourses")
};

const kpiGrid = document.getElementById("kpiGrid");
const todayCountPill = document.getElementById("todayCountPill");
const todayTimelineList = document.getElementById("todayTimelineList");
const courseDetailsContent = document.getElementById("courseDetailsContent");
const clearSelectionBtn = document.getElementById("clearSelectionBtn");
const todayPrevBtn = document.getElementById("todayPrevBtn");
const todayResetBtn = document.getElementById("todayResetBtn");
const todayNextBtn = document.getElementById("todayNextBtn");

const weekPrevBtn = document.getElementById("weekPrevBtn");
const weekTodayBtn = document.getElementById("weekTodayBtn");
const weekNextBtn = document.getElementById("weekNextBtn");
const monthPrevBtn = document.getElementById("monthPrevBtn");
const monthNextBtn = document.getElementById("monthNextBtn");
const jumpDateInput = document.getElementById("jumpDateInput");
const weekTitle = document.getElementById("weekTitle");
const weekSummaryList = document.getElementById("weekSummaryList");

const usersMsg = document.getElementById("usersMsg");
const usersList = document.getElementById("usersList");
const newUserBtn = document.getElementById("newUserBtn");
const usersSearchInput = document.getElementById("usersSearchInput");
const userEditorPanel = document.getElementById("userEditorPanel");
const userBookingsPanel = document.getElementById("userBookingsPanel");
const closeUserEditorBtn = document.getElementById("closeUserEditorBtn");
const closeUserBookingsBtn = document.getElementById("closeUserBookingsBtn");
const userForm = document.getElementById("userForm");
const userFormTitle = document.getElementById("userFormTitle");
const resetUserBtn = document.getElementById("resetUserBtn");
const userBookingsTitle = document.getElementById("userBookingsTitle");
const userBookingsList = document.getElementById("userBookingsList");

const newCourseBtn = document.getElementById("newCourseBtn");
const coursesSearchInput = document.getElementById("coursesSearchInput");
const calendarMonthFilter = document.getElementById("calendarMonthFilter");
const calendarViewWeekBtn = document.getElementById("calendarViewWeekBtn");
const calendarViewMonthBtn = document.getElementById("calendarViewMonthBtn");
const calendarPrevBtn = document.getElementById("calendarPrevBtn");
const calendarTodayBtn = document.getElementById("calendarTodayBtn");
const calendarNextBtn = document.getElementById("calendarNextBtn");
const calendarPeriodLabel = document.getElementById("calendarPeriodLabel");
const scheduleCalendarBoard = document.getElementById("scheduleCalendarBoard");
const calendarBoardMsg = document.getElementById("calendarBoardMsg");

const courseTemplatesMsg = document.getElementById("courseTemplatesMsg");
const courseTemplateForm = document.getElementById("courseTemplateForm");
const courseTemplateIdInput = document.getElementById("courseTemplateId");
const courseTypeModal = document.getElementById("courseTypeModal");
const courseTypeModalTitle = document.getElementById("courseTypeModalTitle");
const openCourseTypeModalBtn = document.getElementById("openCourseTypeModalBtn");
const closeCourseTypeModalBtn = document.getElementById("closeCourseTypeModalBtn");
const templateNameInput = document.getElementById("templateName");
const templateCapacityInput = document.getElementById("templateCapacity");
const templateColorInput = document.getElementById("templateColor");
const templateActiveInput = document.getElementById("templateActive");
const templateResetBtn = document.getElementById("templateResetBtn");
const courseTypesTableBody = document.getElementById("courseTypesTableBody");
const courseTemplateSelect = document.getElementById("courseTemplateSelect");

const courseEditorModal = document.getElementById("courseEditorModal");
const courseForm = document.getElementById("courseForm");
const courseFormTitle = document.getElementById("courseFormTitle");
const closeCourseModalBtn = document.getElementById("closeCourseModalBtn");
const resetCourseBtn = document.getElementById("resetCourseBtn");
const capacityOverrideInput = document.getElementById("capacityOverride");
const repeatAutoInput = document.getElementById("repeatAuto");

const courseManageTabButtons = [...document.querySelectorAll("[data-course-tab]")];
const courseManagePanels = {
  types: document.getElementById("courseManageTabTypes"),
  calendar: document.getElementById("courseManageTabCalendar")
};

const lessonDrawer = document.getElementById("lessonDrawer");
const drawerCloseBtn = document.getElementById("drawerCloseBtn");
const drawerTitle = document.getElementById("drawerTitle");
const drawerMeta = document.getElementById("drawerMeta");
const drawerCapacity = document.getElementById("drawerCapacity");
const drawerViewMembersBtn = document.getElementById("drawerViewMembersBtn");
const drawerEditBtn = document.getElementById("drawerEditBtn");
const drawerDuplicateBtn = document.getElementById("drawerDuplicateBtn");
const drawerCancelBtn = document.getElementById("drawerCancelBtn");
const drawerMembersList = document.getElementById("drawerMembersList");

const toastStack = document.getElementById("toastStack");
const storageKey = "easyfit_admin_session";

let session = readSession();
let activeTab = "today";
let selectedDate = todayIso();
let selectedCourseId = "";
let dashboardStats = null;
let coursesDay = [];
let weekCourses = [];
let allCourses = [];
let adminUsers = [];
let courseTemplates = [];
let courseManageTab = "types";
let calendarView = "week";
let calendarAnchorDate = todayIso();
let drawerCourseId = "";

if (adminUsernameInput && !adminUsernameInput.value.trim()) adminUsernameInput.value = "admin";

if (session?.token) {
  void bootAdmin();
}

adminLoginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(adminLoginMsg, "Accesso in corso...", "");
  const username = document.getElementById("adminUsername").value.trim().toLowerCase();
  const password = document.getElementById("adminPassword").value.trim();
  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return setMessage(adminLoginMsg, data.error || "Login non riuscito.", "error");
    if (data.user?.role !== "admin") return setMessage(adminLoginMsg, "Account non admin.", "error");
    session = { token: data.token, user: data.user };
    saveSession(session);
    await bootAdmin();
  } catch {
    setMessage(adminLoginMsg, "Server non raggiungibile.", "error");
  }
});

adminLogoutBtn.addEventListener("click", async () => {
  await apiFetch("/api/auth/logout", { method: "POST" }, false);
  clearSession();
  location.reload();
});

tabButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    const tab = button.dataset.tab;
    setActiveTab(tab);
    if (tab === "users") await loadUsers();
    if (tab === "courses") {
      renderCourseTypesTable();
      renderCalendarTab();
    }
  });
});

todayPrevBtn.addEventListener("click", async () => {
  selectedDate = moveDate(selectedDate, -1);
  selectedCourseId = "";
  await refreshAdminData();
});

todayResetBtn.addEventListener("click", async () => {
  selectedDate = todayIso();
  selectedCourseId = "";
  await refreshAdminData();
});

todayNextBtn.addEventListener("click", async () => {
  selectedDate = moveDate(selectedDate, 1);
  selectedCourseId = "";
  await refreshAdminData();
});

weekPrevBtn.addEventListener("click", async () => {
  selectedDate = moveDate(selectedDate, -7);
  selectedCourseId = "";
  await refreshAdminData();
});

weekTodayBtn.addEventListener("click", async () => {
  selectedDate = todayIso();
  selectedCourseId = "";
  await refreshAdminData();
});

weekNextBtn.addEventListener("click", async () => {
  selectedDate = moveDate(selectedDate, 7);
  selectedCourseId = "";
  await refreshAdminData();
});

monthPrevBtn.addEventListener("click", async () => {
  selectedDate = moveMonth(selectedDate, -1);
  selectedCourseId = "";
  await refreshAdminData();
});

monthNextBtn.addEventListener("click", async () => {
  selectedDate = moveMonth(selectedDate, 1);
  selectedCourseId = "";
  await refreshAdminData();
});

jumpDateInput.addEventListener("change", async () => {
  const value = String(jumpDateInput.value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
  selectedDate = value;
  selectedCourseId = "";
  await refreshAdminData();
});

clearSelectionBtn.addEventListener("click", () => {
  selectedCourseId = "";
  renderTodayTimeline();
  renderCourseDetail();
});

newCourseBtn.addEventListener("click", () => {
  resetCourseForm();
  document.getElementById("date").value = calendarAnchorDate;
  document.getElementById("validTo").value = calendarAnchorDate;
  openModal(courseEditorModal);
});

quickNewCourseBtn.addEventListener("click", () => {
  resetCourseForm();
  document.getElementById("date").value = calendarAnchorDate;
  setActiveTab("courses");
  setCourseManageTab("calendar");
  openModal(courseEditorModal);
});

courseManageTabButtons.forEach((button) => {
  button.addEventListener("click", () => setCourseManageTab(button.dataset.courseTab));
});

openCourseTypeModalBtn.addEventListener("click", () => {
  resetCourseTemplateForm();
  courseTypeModalTitle.textContent = "Nuova tipologia";
  openModal(courseTypeModal);
});
closeCourseTypeModalBtn.addEventListener("click", () => closeModal(courseTypeModal));
templateResetBtn.addEventListener("click", () => {
  resetCourseTemplateForm();
  closeModal(courseTypeModal);
});

coursesSearchInput.addEventListener("input", renderCalendarTab);
calendarMonthFilter.addEventListener("change", () => {
  if (calendarMonthFilter.value) calendarAnchorDate = `${calendarMonthFilter.value}-01`;
  renderCalendarTab();
});
calendarViewWeekBtn.addEventListener("click", () => {
  calendarView = "week";
  renderCalendarTab();
});
calendarViewMonthBtn.addEventListener("click", () => {
  calendarView = "month";
  renderCalendarTab();
});
calendarPrevBtn.addEventListener("click", () => {
  calendarAnchorDate = calendarView === "week"
    ? moveDate(calendarAnchorDate, -7)
    : moveMonth(calendarAnchorDate, -1);
  renderCalendarTab();
});
calendarNextBtn.addEventListener("click", () => {
  calendarAnchorDate = calendarView === "week"
    ? moveDate(calendarAnchorDate, 7)
    : moveMonth(calendarAnchorDate, 1);
  renderCalendarTab();
});
calendarTodayBtn.addEventListener("click", () => {
  calendarAnchorDate = todayIso();
  renderCalendarTab();
});

courseTemplateSelect.addEventListener("change", syncCapacityFromTemplate);

closeCourseModalBtn.addEventListener("click", () => closeModal(courseEditorModal));
resetCourseBtn.addEventListener("click", resetCourseForm);
drawerCloseBtn.addEventListener("click", closeLessonDrawer);

courseForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = readCourseFormPayload();
  const courseId = document.getElementById("courseId").value.trim();
  try {
    const url = courseId ? `/api/admin/courses/${encodeURIComponent(courseId)}` : "/api/admin/courses";
    const method = courseId ? "PUT" : "POST";
    await apiFetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    selectedDate = payload.date || selectedDate;
    closeModal(courseEditorModal);
    await refreshAdminData();
    showToast(courseId ? "Corso aggiornato" : "Corso creato", "success");
  } catch (error) {
    setMessage(adminMsg, error.message || "Salvataggio corso non riuscito.", "error");
  }
});

courseTemplateForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const templateId = String(courseTemplateIdInput.value || "").trim();
  const payload = {
    name: templateNameInput.value.trim(),
    defaultCapacity: Number(templateCapacityInput.value),
    active: templateActiveInput.value === "true",
    color: templateColorInput.value
  };

  try {
    if (templateId) {
      await apiFetch(`/api/admin/course-templates/${encodeURIComponent(templateId)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      showToast("Tipologia aggiornata", "success");
    } else {
      await apiFetch("/api/admin/course-templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      showToast("Tipologia creata", "success");
    }
    await loadCourseTemplates();
    renderCourseTypesTable();
    populateCourseTemplateSelect();
    renderCalendarTab();
    resetCourseTemplateForm();
    closeModal(courseTypeModal);
  } catch (error) {
    setMessage(courseTemplatesMsg, error.message || "Salvataggio tipologia non riuscito.", "error");
  }
});

document.getElementById("startTime").addEventListener("change", syncDurationByTime);
document.getElementById("endTime").addEventListener("change", syncDurationByTime);

newUserBtn.addEventListener("click", () => {
  openUserEditor();
  resetUserForm();
});

usersSearchInput.addEventListener("input", () => renderUsersList(adminUsers));
closeUserEditorBtn.addEventListener("click", closeUserEditor);
closeUserBookingsBtn.addEventListener("click", closeUserBookings);
resetUserBtn.addEventListener("click", resetUserForm);

userForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const userId = document.getElementById("userId").value.trim();
  const payload = {
    firstName: document.getElementById("userFirstName").value.trim(),
    lastName: document.getElementById("userLastName").value.trim(),
    username: document.getElementById("userUsername").value.trim().toLowerCase(),
    email: document.getElementById("userEmail").value.trim().toLowerCase(),
    password: document.getElementById("userPassword").value.trim(),
    role: document.getElementById("userRole").value,
    active: document.getElementById("userActive").value === "true",
    notes: document.getElementById("userNotes").value.trim()
  };
  if (!userId && !payload.password) return setMessage(usersMsg, "Password obbligatoria in creazione.", "error");

  try {
    const url = userId ? `/api/admin/users/${encodeURIComponent(userId)}` : "/api/admin/users";
    const method = userId ? "PUT" : "POST";
    await apiFetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    await Promise.all([loadUsers(), loadDashboard()]);
    renderKpis();
    showToast(userId ? "Utente aggiornato" : "Utente creato", "success");
    if (!userId) resetUserForm();
  } catch (error) {
    setMessage(usersMsg, error.message || "Operazione utente non riuscita.", "error");
  }
});

window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  closeModal(courseEditorModal);
  closeModal(courseTypeModal);
  closeLessonDrawer();
});

async function bootAdmin() {
  adminLogin.classList.add("hidden");
  adminApp.classList.remove("hidden");
  try {
    const me = await apiFetch("/api/me");
    if (me.user?.role !== "admin") throw new Error("Ruolo non valido.");
    await refreshAdminData();
    setActiveTab("courses");
    setCourseManageTab("types");
  } catch {
    clearSession();
    location.reload();
  }
}

function setActiveTab(tab) {
  activeTab = tab;
  tabButtons.forEach((button) => button.classList.toggle("active", button.dataset.tab === tab));
  Object.entries(tabSections).forEach(([name, section]) => {
    section.classList.toggle("active", name === tab);
  });
}

async function refreshAdminData() {
  await Promise.all([loadDashboard(), loadWeekCourses(), loadCoursesDay(), loadCourseTemplates()]);
  updateDateLabel();
  renderKpis();
  renderTodayTimeline();
  renderCourseDetail();
  renderWeekSummary();
  renderCourseTypesTable();
  renderCalendarTab();
  populateCourseTemplateSelect();
  buildMonthFilterOptions();
}

async function loadDashboard() {
  const query = new URLSearchParams({ date: selectedDate });
  const data = await apiFetch(`/api/admin/dashboard?${query.toString()}`);
  dashboardStats = data.stats || {};
}

async function loadWeekCourses() {
  const { start, end } = weekBounds(selectedDate);
  const data = await apiFetch("/api/admin/courses?status=all");
  allCourses = data.courses || [];
  weekCourses = allCourses.filter((course) => course.date >= start && course.date <= end);
}

async function loadCoursesDay() {
  const query = new URLSearchParams({ date: selectedDate, status: "all" });
  const data = await apiFetch(`/api/admin/courses?${query.toString()}`);
  coursesDay = (data.courses || []).sort((a, b) => a.startTime.localeCompare(b.startTime));
  if (selectedCourseId && !coursesDay.some((course) => course.id === selectedCourseId)) selectedCourseId = "";
}

async function loadCourseTemplates() {
  const data = await apiFetch("/api/admin/course-templates");
  courseTemplates = data.templates || [];
}

function setCourseManageTab(tab) {
  courseManageTab = tab === "calendar" ? "calendar" : "types";
  courseManageTabButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.courseTab === courseManageTab);
  });
  Object.entries(courseManagePanels).forEach(([name, panel]) => {
    panel.classList.toggle("active", name === courseManageTab);
  });
}

function renderKpis() {
  const entries = [
    { label: "Corsi Oggi", value: dashboardStats?.activeCoursesToday ?? 0 },
    { label: "Pieni", value: dashboardStats?.fullCoursesToday ?? 0 },
    { label: "Posti Liberi", value: dashboardStats?.freeSpotsToday ?? 0 },
    { label: "Prenotazioni Oggi", value: dashboardStats?.bookingsToday ?? 0 }
  ];
  kpiGrid.innerHTML = entries
    .map((item) => `<article class="admin-v5-kpi-card"><span>${item.label}</span><strong>${item.value}</strong></article>`)
    .join("");
}

function renderTodayTimeline() {
  todayCountPill.textContent = `${coursesDay.length} corsi`;
  if (!coursesDay.length) {
    todayTimelineList.innerHTML = `<p class="empty">Nessun corso in questa giornata.</p>`;
    return;
  }
  todayTimelineList.innerHTML = coursesDay
    .map((course) => {
      const badge = statusBadge(course);
      return `
        <article class="timeline-row ${selectedCourseId === course.id ? "selected" : ""}">
          <div class="time-col">${course.startTime}</div>
          <div class="main-col">
            <strong>${escapeHtml(course.title)}</strong>
            <p>${course.startTime} - ${course.endTime} • ${course.bookedCount}/${course.capacity} iscritti</p>
          </div>
          <span class="status-pill ${badge.cls}">${badge.label}</span>
          <button class="btn btn-ghost mini" data-open-course="${course.id}" type="button">Apri</button>
        </article>
      `;
    })
    .join("");

  todayTimelineList.querySelectorAll("[data-open-course]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedCourseId = button.dataset.openCourse;
      renderTodayTimeline();
      renderCourseDetail();
    });
  });
}

function renderCourseDetail() {
  if (!selectedCourseId) {
    courseDetailsContent.innerHTML = `<p class="empty">Seleziona un corso per vedere iscritti e azioni.</p>`;
    return;
  }
  const course = coursesDay.find((item) => item.id === selectedCourseId);
  if (!course) {
    courseDetailsContent.innerHTML = `<p class="empty">Corso non trovato.</p>`;
    return;
  }
  const badge = statusBadge(course);
  const booked = course.bookedUsers || [];
  courseDetailsContent.innerHTML = `
    <article class="detail-card">
      <div class="section-head">
        <h3>${escapeHtml(course.title)}</h3>
        <span class="status-pill ${badge.cls}">${badge.label}</span>
      </div>
      <p>${course.startTime} - ${course.endTime}</p>
      <p>${course.bookedCount}/${course.capacity} iscritti • ${course.spotsLeft} liberi</p>
      <div class="row-buttons">
        <button class="btn btn-ghost mini" data-detail-edit="${course.id}" type="button">Modifica</button>
        <button class="btn btn-ghost mini" data-detail-dup="${course.id}" type="button">Duplica</button>
        <button class="btn btn-ghost mini" data-detail-toggle="${course.id}" data-next-active="${String(!course.isActive)}" type="button">${course.isActive ? "Disattiva" : "Attiva"}</button>
        <button class="btn btn-ghost danger mini" data-detail-del="${course.id}" type="button">Elimina</button>
      </div>
    </article>

    <section class="detail-list">
      <h4>Iscritti (${booked.length})</h4>
      ${
        booked.length
          ? booked
              .map(
                (entry) => `
            <article class="detail-user-row">
              <div>
                <strong>${escapeHtml(entry.name)}</strong>
                <p>${escapeHtml(entry.username)} • ${formatDateTime(entry.bookedAt)}</p>
              </div>
              <div class="user-actions">
                <button class="btn btn-ghost mini" data-att="${entry.bookingId}" data-att-status="${entry.attendanceStatus || "unknown"}">${attendanceLabel(entry.attendanceStatus || "unknown")}</button>
                <button class="btn btn-ghost danger mini" data-remove="${entry.bookingId}">Rimuovi</button>
              </div>
            </article>
          `
              )
              .join("")
          : `<p class="empty">Nessun iscritto al momento.</p>`
      }
    </section>
  `;

  courseDetailsContent.querySelector("[data-detail-edit]")?.addEventListener("click", () => {
    fillCourseForm(course);
    openModal(courseEditorModal);
  });
  courseDetailsContent.querySelector("[data-detail-dup]")?.addEventListener("click", async () => {
    await duplicateCourse(course.id);
  });
  courseDetailsContent.querySelector("[data-detail-toggle]")?.addEventListener("click", async (event) => {
    const node = event.currentTarget;
    await toggleCourseStatus(node.dataset.detailToggle, node.dataset.nextActive === "true");
  });
  courseDetailsContent.querySelector("[data-detail-del]")?.addEventListener("click", async () => {
    const confirmed = window.confirm("Eliminare corso? Le prenotazioni attive verranno annullate.");
    if (!confirmed) return;
    await deleteCourse(course.id);
  });
  courseDetailsContent.querySelectorAll("[data-remove]").forEach((button) => {
    button.addEventListener("click", async () => {
      await removeBooking(button.dataset.remove);
    });
  });
  courseDetailsContent.querySelectorAll("[data-att]").forEach((button) => {
    button.addEventListener("click", async () => {
      const next = nextAttendance(button.dataset.attStatus || "unknown");
      try {
        await apiFetch(`/api/admin/bookings/${encodeURIComponent(button.dataset.att)}/attendance`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ attendanceStatus: next })
        });
        showToast("Check-in aggiornato", "success");
        await refreshAdminData();
      } catch (error) {
        setMessage(adminMsg, error.message || "Check-in non riuscito.", "error");
      }
    });
  });
}

function renderWeekSummary() {
  const days = weekDaysFromDate(selectedDate);
  weekTitle.textContent = `Settimana ${formatDateShort(days[0])} - ${formatDateShort(days[6])}`;
  weekSummaryList.innerHTML = days
    .map((day) => {
      const dayCourses = weekCourses
        .filter((course) => course.date === day)
        .sort((a, b) => a.startTime.localeCompare(b.startTime));
      const state = dayLoadState(dayCourses);
      return `
        <button type="button" class="week-row ${day === selectedDate ? "selected" : ""}" data-week-day="${day}">
          <div>
            <strong>${formatDayNameLong(day)}</strong>
            <p>${formatDateLong(day)}</p>
          </div>
          <div>
            <span class="status-pill ${state.cls}">${state.label}</span>
            <p>${dayCourses.length} corsi</p>
          </div>
        </button>
      `;
    })
    .join("");

  weekSummaryList.querySelectorAll("[data-week-day]").forEach((button) => {
    button.addEventListener("click", async () => {
      selectedDate = button.dataset.weekDay;
      selectedCourseId = "";
      await refreshAdminData();
      setActiveTab("today");
    });
  });
}

async function loadUsers() {
  try {
    const data = await apiFetch("/api/admin/users");
    adminUsers = data.users || [];
    renderUsersList(adminUsers);
  } catch (error) {
    usersList.innerHTML = `<p class="empty">${escapeHtml(error.message || "Errore caricamento utenti.")}</p>`;
  }
}

function renderUsersList(users) {
  const search = String(usersSearchInput.value || "").trim().toLowerCase();
  const items = users.filter((user) => {
    if (!search) return true;
    const text = `${user.name} ${user.username} ${user.email || ""}`.toLowerCase();
    return text.includes(search);
  });
  if (!items.length) {
    usersList.innerHTML = `<p class="empty">Nessun utente trovato.</p>`;
    return;
  }
  usersList.innerHTML = items
    .map(
      (user) => `
      <article class="user-row">
        <div>
          <strong>${escapeHtml(user.name || user.username)}</strong>
          <p>${escapeHtml(user.username)} ${user.email ? `• ${escapeHtml(user.email)}` : ""}</p>
          <p>${user.role === "admin" ? "Admin" : "Utente"} • ${user.activeBookingsCount || 0} prenotazioni attive</p>
        </div>
        <div class="user-actions">
          <span class="status-pill ${user.active ? "badge-available" : "badge-inactive"}">${user.active ? "Attivo" : "Disattivo"}</span>
          <button class="btn btn-ghost mini" data-user-edit="${user.id}">Modifica</button>
          <button class="btn btn-ghost mini" data-user-toggle="${user.id}" data-next-active="${String(!user.active)}">${user.active ? "Disattiva" : "Riattiva"}</button>
          <button class="btn btn-ghost mini" data-user-bookings="${user.id}">Prenotazioni</button>
          <button class="btn btn-ghost danger mini" data-user-delete="${user.id}">Elimina</button>
        </div>
      </article>
    `
    )
    .join("");

  usersList.querySelectorAll("[data-user-edit]").forEach((button) => {
    button.addEventListener("click", () => {
      const user = adminUsers.find((entry) => entry.id === button.dataset.userEdit);
      if (!user) return;
      openUserEditor(user);
      closeUserBookings();
    });
  });
  usersList.querySelectorAll("[data-user-toggle]").forEach((button) => {
    button.addEventListener("click", async () => {
      const active = button.dataset.nextActive === "true";
      try {
        await apiFetch(`/api/admin/users/${encodeURIComponent(button.dataset.userToggle)}/status`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ active })
        });
        await Promise.all([loadUsers(), loadDashboard()]);
        renderKpis();
        showToast(active ? "Utente riattivato" : "Utente disattivato", "success");
      } catch (error) {
        setMessage(usersMsg, error.message || "Cambio stato non riuscito.", "error");
      }
    });
  });
  usersList.querySelectorAll("[data-user-bookings]").forEach((button) => {
    button.addEventListener("click", async () => {
      await openUserBookings(button.dataset.userBookings);
      closeUserEditor();
    });
  });
  usersList.querySelectorAll("[data-user-delete]").forEach((button) => {
    button.addEventListener("click", async () => {
      const confirmed = window.confirm("Eliminare utente? Se ha prenotazioni attive prima vanno rimosse.");
      if (!confirmed) return;
      try {
        await apiFetch(`/api/admin/users/${encodeURIComponent(button.dataset.userDelete)}`, { method: "DELETE" });
        await Promise.all([loadUsers(), loadDashboard()]);
        renderKpis();
        closeUserEditor();
        closeUserBookings();
      } catch (error) {
        setMessage(usersMsg, error.message || "Eliminazione utente non riuscita.", "error");
      }
    });
  });
}

function openUserEditor(user = null) {
  userEditorPanel.classList.remove("hidden");
  if (!user) return;
  document.getElementById("userId").value = user.id || "";
  document.getElementById("userFirstName").value = user.firstName || user.name?.split(" ")[0] || "";
  document.getElementById("userLastName").value = user.lastName || user.name?.split(" ").slice(1).join(" ") || "";
  document.getElementById("userUsername").value = user.username || "";
  document.getElementById("userEmail").value = user.email || "";
  document.getElementById("userPassword").value = "";
  document.getElementById("userRole").value = user.role || "user";
  document.getElementById("userActive").value = String(user.active !== false);
  document.getElementById("userNotes").value = user.notes || "";
  userFormTitle.textContent = `Modifica ${user.name || user.username}`;
}

function closeUserEditor() {
  userEditorPanel.classList.add("hidden");
}

function resetUserForm() {
  userForm.reset();
  document.getElementById("userId").value = "";
  document.getElementById("userRole").value = "user";
  document.getElementById("userActive").value = "true";
  userFormTitle.textContent = "Nuovo utente";
}

async function openUserBookings(userId) {
  try {
    const data = await apiFetch(`/api/admin/users/${encodeURIComponent(userId)}/bookings`);
    const bookings = data.bookings || [];
    const user = data.user || {};
    userBookingsPanel.classList.remove("hidden");
    userBookingsTitle.textContent = `Prenotazioni • ${user.name || user.username}`;
    if (!bookings.length) {
      userBookingsList.innerHTML = `<p class="empty">Nessuna prenotazione associata.</p>`;
      return;
    }
    userBookingsList.innerHTML = bookings
      .map((booking) => `
      <article class="user-row">
        <div>
          <strong>${escapeHtml(booking.course?.title || "Corso")}</strong>
          <p>${escapeHtml(booking.course?.date || "")} • ${escapeHtml(booking.course?.startTime || "")}-${escapeHtml(booking.course?.endTime || "")}</p>
          <p>Stato: ${booking.status === "active" ? "Attiva" : "Annullata"}</p>
        </div>
        ${
          booking.status === "active"
            ? `<button class="btn btn-ghost danger mini" data-user-booking-remove="${booking.id}">Rimuovi</button>`
            : `<span class="status-pill badge-inactive">Annullata</span>`
        }
      </article>
    `)
      .join("");

    userBookingsList.querySelectorAll("[data-user-booking-remove]").forEach((button) => {
      button.addEventListener("click", async () => {
        try {
          await apiFetch(`/api/admin/users/${encodeURIComponent(userId)}/bookings/${encodeURIComponent(button.dataset.userBookingRemove)}`, {
            method: "DELETE"
          });
          await Promise.all([openUserBookings(userId), refreshAdminData(), loadUsers()]);
        } catch (error) {
          setMessage(usersMsg, error.message || "Rimozione prenotazione non riuscita.", "error");
        }
      });
    });
  } catch (error) {
    setMessage(usersMsg, error.message || "Errore caricamento prenotazioni utente.", "error");
  }
}

function closeUserBookings() {
  userBookingsPanel.classList.add("hidden");
  userBookingsList.innerHTML = "";
}

function renderCourseTypesTable() {
  if (!courseTemplates.length) {
    courseTypesTableBody.innerHTML = `<tr><td colspan="5">Nessuna tipologia disponibile</td></tr>`;
    return;
  }

  courseTypesTableBody.innerHTML = courseTemplates.map((template, index) => `
    <tr>
      <td>
        <span class="dot" style="background:${escapeHtml(template.color || "#2b6de5")}"></span>
        ${escapeHtml(template.name)}
      </td>
      <td>${template.defaultCapacity}</td>
      <td><span class="status-pill ${template.active ? "badge-available" : "badge-inactive"}">${template.active ? "Attivo" : "Disattivo"}</span></td>
      <td>${index + 1}</td>
      <td class="type-actions">
        <button class="btn btn-ghost mini" data-template-edit="${template.id}" title="Modifica">✏️</button>
        <button class="btn btn-ghost mini" data-template-toggle="${template.id}" data-next-active="${String(!template.active)}" title="Attiva/disattiva">👁</button>
        <button class="btn btn-ghost mini" data-template-up="${template.id}" ${index === 0 ? "disabled" : ""} title="Sposta su">↑</button>
        <button class="btn btn-ghost mini" data-template-down="${template.id}" ${index === courseTemplates.length - 1 ? "disabled" : ""} title="Sposta giu">↓</button>
        <button class="btn btn-ghost danger mini" data-template-delete="${template.id}" title="Elimina">🗑</button>
      </td>
    </tr>
  `).join("");

  courseTypesTableBody.querySelectorAll("[data-template-edit]").forEach((button) => {
    button.addEventListener("click", () => {
      const template = courseTemplates.find((item) => item.id === button.dataset.templateEdit);
      if (!template) return;
      courseTypeModalTitle.textContent = "Modifica tipologia";
      courseTemplateIdInput.value = template.id;
      templateNameInput.value = template.name;
      templateCapacityInput.value = String(template.defaultCapacity);
      templateActiveInput.value = String(template.active !== false);
      templateColorInput.value = template.color || "#2b6de5";
      openModal(courseTypeModal);
    });
  });

  courseTypesTableBody.querySelectorAll("[data-template-toggle]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await apiFetch(`/api/admin/course-templates/${encodeURIComponent(button.dataset.templateToggle)}/status`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ active: button.dataset.nextActive === "true" })
        });
        await loadCourseTemplates();
        renderCourseTypesTable();
        populateCourseTemplateSelect();
        renderCalendarTab();
      } catch (error) {
        setMessage(courseTemplatesMsg, error.message || "Cambio stato tipologia non riuscito.", "error");
      }
    });
  });

  courseTypesTableBody.querySelectorAll("[data-template-delete]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!window.confirm("Eliminare questa tipologia corso?")) return;
      try {
        await apiFetch(`/api/admin/course-templates/${encodeURIComponent(button.dataset.templateDelete)}`, { method: "DELETE" });
        await loadCourseTemplates();
        renderCourseTypesTable();
        populateCourseTemplateSelect();
        renderCalendarTab();
      } catch (error) {
        setMessage(courseTemplatesMsg, error.message || "Eliminazione tipologia non riuscita.", "error");
      }
    });
  });

  courseTypesTableBody.querySelectorAll("[data-template-up]").forEach((button) => {
    button.addEventListener("click", async () => {
      await moveTemplate(button.dataset.templateUp, -1);
    });
  });
  courseTypesTableBody.querySelectorAll("[data-template-down]").forEach((button) => {
    button.addEventListener("click", async () => {
      await moveTemplate(button.dataset.templateDown, +1);
    });
  });
}

async function moveTemplate(templateId, direction) {
  const index = courseTemplates.findIndex((item) => item.id === templateId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= courseTemplates.length) return;
  const reordered = [...courseTemplates];
  [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
  try {
    await apiFetch("/api/admin/course-templates/reorder", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderedIds: reordered.map((item) => item.id) })
    });
    courseTemplates = reordered;
    renderCourseTypesTable();
    populateCourseTemplateSelect();
    renderCalendarTab();
  } catch (error) {
    setMessage(courseTemplatesMsg, error.message || "Riordino tipologie non riuscito.", "error");
  }
}

function resetCourseTemplateForm() {
  courseTemplateForm.reset();
  courseTemplateIdInput.value = "";
  templateCapacityInput.value = "20";
  templateActiveInput.value = "true";
  templateColorInput.value = "#2b6de5";
}

function renderCalendarTab() {
  buildMonthFilterOptions();
  if (calendarView === "week") {
    calendarViewWeekBtn.classList.add("active");
    calendarViewMonthBtn.classList.remove("active");
    renderWeekCalendar();
  } else {
    calendarViewWeekBtn.classList.remove("active");
    calendarViewMonthBtn.classList.add("active");
    renderMonthCalendar();
  }
}

function buildMonthFilterOptions() {
  const months = [...new Set(allCourses.map((course) => course.date.slice(0, 7)))].sort();
  const todayMonth = todayIso().slice(0, 7);
  if (!months.includes(todayMonth)) months.push(todayMonth);
  months.sort();
  calendarMonthFilter.innerHTML = months.map((month) => {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m - 1, 1);
    const label = new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric" }).format(d);
    return `<option value="${month}">${label}</option>`;
  }).join("");
  const current = calendarAnchorDate.slice(0, 7);
  calendarMonthFilter.value = months.includes(current) ? current : (months[months.length - 1] || current);
}

function filteredCalendarCourses() {
  const search = String(coursesSearchInput.value || "").trim().toLowerCase();
  return allCourses
    .filter((course) => course.isActive !== false)
    .filter((course) => {
      if (!search) return true;
      const text = `${course.title} ${course.date} ${course.startTime}`.toLowerCase();
      return text.includes(search);
    })
    .sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`));
}

function renderWeekCalendar() {
  const weekDays = weekDaysFromDate(calendarAnchorDate);
  const weekStart = weekDays[0];
  const weekEnd = weekDays[6];
  calendarPeriodLabel.textContent = `Settimana ${formatDateShort(weekStart)} - ${formatDateShort(weekEnd)}`;

  const courses = filteredCalendarCourses().filter((course) => course.date >= weekStart && course.date <= weekEnd);
  if (!courses.length) {
    scheduleCalendarBoard.innerHTML = `<p class="empty">Nessuna lezione in questa settimana.</p>`;
    return;
  }

  const hours = [];
  for (let mins = 6 * 60; mins <= 22 * 60; mins += 30) hours.push(mins);
  const byDay = new Map(weekDays.map((d) => [d, []]));
  for (const course of courses) byDay.get(course.date)?.push(course);

  scheduleCalendarBoard.innerHTML = `
    <div class="week-calendar">
      <div class="time-col-head"></div>
      ${weekDays.map((day) => `<div class="day-head">${formatDayNameShort(day)}<br><small>${formatDateShort(day)}</small></div>`).join("")}
      <div class="time-col">
        ${hours.map((mins) => `<div>${toTime(mins)}</div>`).join("")}
      </div>
      ${weekDays.map((day) => `<div class="day-grid" data-day-grid="${day}"></div>`).join("")}
    </div>
  `;

  weekDays.forEach((day) => {
    const container = scheduleCalendarBoard.querySelector(`[data-day-grid="${day}"]`);
    const dayCourses = (byDay.get(day) || []).map((course) => ({
      ...course,
      startMins: minutesFromTime(course.startTime),
      endMins: minutesFromTime(course.endTime)
    }));
    layoutDayEvents(container, dayCourses);
  });
}

function renderMonthCalendar() {
  const month = calendarAnchorDate.slice(0, 7);
  const [year, mon] = month.split("-").map(Number);
  const start = new Date(year, mon - 1, 1);
  const end = new Date(year, mon, 0);
  calendarPeriodLabel.textContent = new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric" }).format(start);
  const courses = filteredCalendarCourses().filter((course) => course.date.slice(0, 7) === month);
  const byDate = new Map();
  for (const c of courses) {
    const arr = byDate.get(c.date) || [];
    arr.push(c);
    byDate.set(c.date, arr);
  }

  const firstDay = new Date(start);
  firstDay.setDate(1 - ((firstDay.getDay() + 6) % 7));
  const cells = [];
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(firstDay);
    d.setDate(firstDay.getDate() + i);
    const key = dateKeyLocal(d);
    cells.push({ key, inMonth: key.startsWith(month), items: (byDate.get(key) || []).sort((a, b) => a.startTime.localeCompare(b.startTime)) });
  }

  scheduleCalendarBoard.innerHTML = `
    <div class="month-calendar">
      ${["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"].map((x) => `<div class="month-head">${x}</div>`).join("")}
      ${cells.map((cell) => `
        <article class="month-cell ${cell.inMonth ? "" : "muted"}">
          <header>${Number(cell.key.slice(8, 10))}</header>
          <div class="month-events">
            ${cell.items.slice(0, 2).map((course) => renderMonthPill(course)).join("")}
            ${cell.items.length > 2 ? `<button type="button" class="more-btn" data-day-open="${cell.key}">+${cell.items.length - 2} altri</button>` : ""}
          </div>
        </article>
      `).join("")}
    </div>
  `;

  scheduleCalendarBoard.querySelectorAll("[data-course-open]").forEach((button) => {
    button.addEventListener("click", () => openLessonDrawer(button.dataset.courseOpen));
  });
  scheduleCalendarBoard.querySelectorAll("[data-day-open]").forEach((button) => {
    button.addEventListener("click", () => {
      calendarAnchorDate = button.dataset.dayOpen;
      calendarView = "week";
      renderCalendarTab();
    });
  });
}

function renderMonthPill(course) {
  const color = templateColor(course.courseTemplateId);
  return `<button type="button" class="month-pill" style="border-left-color:${escapeHtml(color)}" data-course-open="${course.id}">${escapeHtml(course.title)} ${course.startTime}</button>`;
}

function layoutDayEvents(container, dayCourses) {
  container.innerHTML = `<div class="grid-lines"></div>`;
  if (!dayCourses.length) return;
  const clusters = buildOverlapColumns(dayCourses);
  for (const event of clusters) {
    const top = Math.max(0, (event.startMins - 360) * 2);
    const height = Math.max(52, (event.endMins - event.startMins) * 2);
    const width = 100 / event.totalColumns;
    const left = width * event.col;
    const color = templateColor(event.courseTemplateId);
    const node = document.createElement("button");
    node.type = "button";
    node.className = "week-event";
    node.style.top = `${top}px`;
    node.style.height = `${height}px`;
    node.style.width = `calc(${width}% - 4px)`;
    node.style.left = `calc(${left}% + 2px)`;
    node.style.borderLeftColor = color;
    node.dataset.courseOpen = event.id;
    node.innerHTML = `
      <strong>${escapeHtml(event.title)}</strong>
      <span>${event.startTime} - ${event.endTime}</span>
      <span>${event.bookedCount}/${event.capacity}</span>
    `;
    node.addEventListener("click", () => openLessonDrawer(event.id));
    container.appendChild(node);
  }
}

function buildOverlapColumns(events) {
  const sorted = [...events].sort((a, b) => a.startMins - b.startMins || a.endMins - b.endMins);
  const active = [];
  const result = [];
  for (const ev of sorted) {
    for (let i = active.length - 1; i >= 0; i -= 1) {
      if (active[i].endMins <= ev.startMins) active.splice(i, 1);
    }
    const used = new Set(active.map((a) => a.col));
    let col = 0;
    while (used.has(col)) col += 1;
    const current = { ...ev, col, totalColumns: 1 };
    active.push(current);
    const maxCols = Math.max(...active.map((a) => a.col)) + 1;
    active.forEach((a) => { a.totalColumns = Math.max(a.totalColumns, maxCols); });
    result.push(current);
  }
  return result;
}

function openLessonDrawer(courseId) {
  const course = allCourses.find((entry) => entry.id === courseId);
  if (!course) return;
  drawerCourseId = course.id;
  drawerTitle.textContent = course.title;
  drawerMeta.textContent = `${formatDayNameLong(course.date)} ${formatDateShort(course.date)} • ${course.startTime}-${course.endTime}`;
  drawerCapacity.textContent = `Prenotati ${course.bookedCount}/${course.capacity}`;
  const booked = course.bookedUsers || [];
  drawerMembersList.innerHTML = booked.length
    ? booked.map((entry) => `<article class="user-row"><div><strong>${escapeHtml(entry.name)}</strong><p>${escapeHtml(entry.username)} • ${formatDateTime(entry.bookedAt)}</p></div></article>`).join("")
    : `<p class="empty">Nessun iscritto al momento</p>`;

  drawerViewMembersBtn.onclick = () => {
    drawerMembersList.classList.toggle("hidden");
  };
  drawerEditBtn.onclick = () => {
    fillCourseForm(course);
    openModal(courseEditorModal);
  };
  drawerDuplicateBtn.onclick = async () => {
    await duplicateCourse(course.id);
  };
  drawerCancelBtn.onclick = async () => {
    if (!window.confirm("Annullare questa lezione?")) return;
    const deleted = await deleteCourse(course.id);
    if (deleted) closeLessonDrawer();
  };

  lessonDrawer.classList.remove("hidden");
  lessonDrawer.setAttribute("aria-hidden", "false");
}

function closeLessonDrawer() {
  drawerCourseId = "";
  lessonDrawer.classList.add("hidden");
  lessonDrawer.setAttribute("aria-hidden", "true");
}

function templateColor(templateId) {
  return courseTemplates.find((entry) => entry.id === templateId)?.color || "#2b6de5";
}

async function duplicateCourse(courseId) {
  try {
    await apiFetch(`/api/admin/courses/${encodeURIComponent(courseId)}/duplicate`, { method: "POST" });
    await refreshAdminData();
    showToast("Corso duplicato", "success");
  } catch (error) {
    setMessage(adminMsg, error.message || "Duplicazione non riuscita.", "error");
  }
}

async function toggleCourseStatus(courseId, active) {
  try {
    await apiFetch(`/api/admin/courses/${encodeURIComponent(courseId)}/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ active })
    });
    await refreshAdminData();
    showToast(active ? "Corso attivato" : "Corso disattivato", "success");
  } catch (error) {
    setMessage(adminMsg, error.message || "Aggiornamento stato non riuscito.", "error");
  }
}

async function deleteCourse(courseId) {
  try {
    await apiFetch(`/api/admin/courses/${encodeURIComponent(courseId)}`, { method: "DELETE" });
    if (selectedCourseId === courseId) selectedCourseId = "";
    if (drawerCourseId === courseId) drawerCourseId = "";
    allCourses = allCourses.filter((entry) => entry.id !== courseId);
    weekCourses = weekCourses.filter((entry) => entry.id !== courseId);
    coursesDay = coursesDay.filter((entry) => entry.id !== courseId);
    await refreshAdminData();
    showToast("Corso eliminato", "success");
    return true;
  } catch (error) {
    setMessage(adminMsg, error.message || "Eliminazione non riuscita.", "error");
    showToast(error.message || "Eliminazione non riuscita.", "error");
    return false;
  }
}

async function removeBooking(bookingId) {
  try {
    await apiFetch(`/api/admin/bookings/${encodeURIComponent(bookingId)}`, { method: "DELETE" });
    await refreshAdminData();
    showToast("Iscritto rimosso", "success");
  } catch (error) {
    setMessage(adminMsg, error.message || "Rimozione non riuscita.", "error");
  }
}

function readCourseFormPayload() {
  const selectedOption = courseTemplateSelect.options[courseTemplateSelect.selectedIndex];
  const override = Number(capacityOverrideInput.value);
  const trainerValue = document.getElementById("trainer").value.trim();
  const repeatAuto = repeatAutoInput.checked;
  const selected = selectedDays();
  const days = repeatAuto ? selected : selected.slice(0, 1);
  return {
    title: selectedOption?.textContent?.trim() || "",
    courseTemplateId: courseTemplateSelect.value,
    description: document.getElementById("notes").value.trim() || "",
    trainer: trainerValue || "Staff",
    date: document.getElementById("date").value,
    validFrom: document.getElementById("date").value,
    validTo: document.getElementById("validTo").value,
    durationMinutes: Number(document.getElementById("durationMinutes").value),
    startTime: document.getElementById("startTime").value,
    endTime: document.getElementById("endTime").value,
    capacity: Number.isFinite(override) && override > 0 ? override : Number(document.getElementById("capacity").value),
    isActive: true,
    daysOfWeek: days,
    notes: document.getElementById("notes").value.trim(),
    internalNotes: ""
  };
}

function fillCourseForm(course) {
  document.getElementById("courseId").value = course.id;
  populateCourseTemplateSelect(course.courseTemplateId || "", true, course.title || "");
  document.getElementById("date").value = course.validFrom || course.date || selectedDate;
  document.getElementById("validTo").value = course.validTo || course.date || selectedDate;
  document.getElementById("durationMinutes").value = course.durationMinutes || 50;
  document.getElementById("startTime").value = course.startTime || "18:00";
  document.getElementById("endTime").value = course.endTime || "19:00";
  document.getElementById("capacity").value = course.capacity || 25;
  capacityOverrideInput.value = "";
  document.getElementById("trainer").value = course.trainer || "";
  document.getElementById("notes").value = course.notes || "";
  repeatAutoInput.checked = true;
  setDays(course.daysOfWeek || []);
  courseFormTitle.textContent = `Modifica programmazione • ${course.title}`;
}

function resetCourseForm() {
  courseForm.reset();
  document.getElementById("courseId").value = "";
  populateCourseTemplateSelect();
  document.getElementById("date").value = selectedDate;
  document.getElementById("validTo").value = selectedDate;
  document.getElementById("durationMinutes").value = 50;
  document.getElementById("startTime").value = "18:00";
  document.getElementById("endTime").value = "19:00";
  document.getElementById("capacity").value = 25;
  capacityOverrideInput.value = "";
  document.getElementById("trainer").value = "";
  document.getElementById("notes").value = "";
  repeatAutoInput.checked = true;
  setDays([]);
  courseFormTitle.textContent = "Nuova programmazione";
  syncCapacityFromTemplate();
}

function selectedDays() {
  return [...document.querySelectorAll(".dow:checked")].map((input) => input.value);
}

function setDays(days) {
  const set = new Set(days || []);
  document.querySelectorAll(".dow").forEach((input) => {
    input.checked = set.has(input.value);
  });
}

function populateCourseTemplateSelect(selectedId = "", includeInactiveSelected = false, fallbackTitle = "") {
  const active = courseTemplates.filter((entry) => entry.active);
  const options = [...active];
  if (includeInactiveSelected && selectedId) {
    const selected = courseTemplates.find((entry) => entry.id === selectedId);
    if (selected && !selected.active && !options.some((entry) => entry.id === selected.id)) {
      options.push(selected);
    }
  }

  if (!options.length && fallbackTitle) {
    courseTemplateSelect.innerHTML = `<option value="">${escapeHtml(fallbackTitle)}</option>`;
    courseTemplateSelect.value = "";
    return;
  }

  const currentSelected = options.find((entry) => entry.id === selectedId) || options[0] || null;
  courseTemplateSelect.innerHTML = options
    .map((entry) => {
      const suffix = entry.active ? "" : " (disattivato)";
      return `<option value="${escapeHtml(entry.id)}">${escapeHtml(entry.name + suffix)}</option>`;
    })
    .join("");
  courseTemplateSelect.value = currentSelected?.id || "";
}

function syncCapacityFromTemplate() {
  const selectedId = courseTemplateSelect.value;
  const template = courseTemplates.find((entry) => entry.id === selectedId);
  if (!template) return;
  const current = Number(document.getElementById("capacity").value);
  const editing = Boolean(document.getElementById("courseId").value.trim());
  if (!editing || !Number.isFinite(current) || current <= 0) {
    document.getElementById("capacity").value = template.defaultCapacity;
  }
}

function syncDurationByTime() {
  const start = document.getElementById("startTime").value;
  const end = document.getElementById("endTime").value;
  if (!start || !end) return;
  const mins = minutesFromTime(end) - minutesFromTime(start);
  if (mins > 0) document.getElementById("durationMinutes").value = mins;
}

function statusBadge(course) {
  if (!course.isActive) return { cls: "badge-inactive", label: "Disattivato" };
  if (course.spotsLeft === 0) return { cls: "badge-full", label: "Pieno" };
  if (course.isAlmostFull) return { cls: "badge-almost", label: "Quasi pieno" };
  return { cls: "badge-available", label: "Disponibile" };
}

function dayLoadState(dayCourses) {
  if (!dayCourses.length) return { cls: "badge-available", label: "Tranquilla" };
  const totalCapacity = dayCourses.reduce((sum, course) => sum + Number(course.capacity || 0), 0);
  const totalBooked = dayCourses.reduce((sum, course) => sum + Number(course.bookedCount || 0), 0);
  const ratio = totalCapacity > 0 ? totalBooked / totalCapacity : 0;
  if (ratio >= 0.85) return { cls: "badge-full", label: "Molto piena" };
  if (ratio >= 0.55) return { cls: "badge-almost", label: "Piena" };
  return { cls: "badge-available", label: "Tranquilla" };
}

function nextAttendance(status) {
  if (status === "unknown") return "present";
  if (status === "present") return "absent";
  return "unknown";
}

function attendanceLabel(status) {
  if (status === "present") return "Check-in ✓";
  if (status === "absent") return "Assente";
  return "Check-in";
}

function updateDateLabel() {
  selectedDateLabel.textContent = `Giorno selezionato: ${formatDateLong(selectedDate)}`;
  jumpDateInput.value = selectedDate;
}

function weekBounds(date) {
  const current = new Date(`${date}T00:00:00`);
  const day = current.getDay();
  const diffToMonday = (day + 6) % 7;
  current.setDate(current.getDate() - diffToMonday);
  const start = dateKeyLocal(current);
  const endDate = new Date(current);
  endDate.setDate(endDate.getDate() + 6);
  const end = dateKeyLocal(endDate);
  return { start, end };
}

function weekDaysFromDate(date) {
  const { start } = weekBounds(date);
  const base = new Date(`${start}T00:00:00`);
  const result = [];
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    result.push(dateKeyLocal(d));
  }
  return result;
}

function openModal(element) {
  element.classList.remove("hidden");
  element.setAttribute("aria-hidden", "false");
}

function closeModal(element) {
  element.classList.add("hidden");
  element.setAttribute("aria-hidden", "true");
}

function showToast(text, kind = "success") {
  const toast = document.createElement("div");
  toast.className = `toast ${kind}`;
  toast.textContent = text;
  toastStack.append(toast);
  setTimeout(() => {
    toast.classList.add("out");
    setTimeout(() => toast.remove(), 220);
  }, 1800);
}

async function apiFetch(url, options = {}, throwOnError = true) {
  const headers = {
    ...(options.headers || {}),
    authorization: `Bearer ${session?.token || ""}`
  };
  const response = await fetch(url, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok && throwOnError) throw new Error(data.error || "Richiesta fallita.");
  return data;
}

function setMessage(element, text, kind) {
  element.textContent = text;
  element.className = `message ${kind || ""}`.trim();
}

function todayIso() {
  return dateKeyLocal(new Date());
}

function moveDate(date, offsetDays) {
  const parsed = new Date(`${date}T00:00:00`);
  parsed.setDate(parsed.getDate() + offsetDays);
  return dateKeyLocal(parsed);
}

function moveMonth(date, offsetMonths) {
  const parsed = new Date(`${date}T00:00:00`);
  const day = parsed.getDate();
  parsed.setDate(1);
  parsed.setMonth(parsed.getMonth() + offsetMonths);
  const maxDay = new Date(parsed.getFullYear(), parsed.getMonth() + 1, 0).getDate();
  parsed.setDate(Math.min(day, maxDay));
  return dateKeyLocal(parsed);
}

function minutesFromTime(time) {
  const [h, m] = String(time || "00:00").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function formatDateLong(date) {
  return new Intl.DateTimeFormat("it-IT", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric"
  }).format(new Date(`${date}T00:00:00`));
}

function formatDateShort(date) {
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit"
  }).format(new Date(`${date}T00:00:00`));
}

function formatDateTime(iso) {
  if (!iso) return "-";
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(iso));
}

function formatDayNameLong(date) {
  return new Intl.DateTimeFormat("it-IT", { weekday: "long" }).format(new Date(`${date}T00:00:00`));
}

function formatDayNameShort(date) {
  return new Intl.DateTimeFormat("it-IT", { weekday: "short" }).format(new Date(`${date}T00:00:00`));
}

function toTime(totalMins) {
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function dateKeyLocal(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
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
