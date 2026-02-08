const state = {
  token: localStorage.getItem("admin_panel_token") || "",
  business: null,
  appointments: [],
};

const REJECT_REASONS = [
  "No se recibio el pago",
  "Pago incompleto",
  "Servicio no disponible, se aplicara devolucion.",
];

const STATUS_LABELS = {
  pending_payment: "Pendiente pago",
  pending_approval: "Por aprobar",
  confirmed: "Confirmada",
  completed: "Completada",
  cancelled: "Cancelada",
  expired: "Expirada",
  no_show: "No asistio",
};

const ROUTES = {
  dashboard: { view: "viewDashboard", loader: loadDashboard },
  calendar: { view: "viewCalendar", loader: loadCalendar },
  services: { view: "viewServices", loader: loadServices },
  slots: { view: "viewSlots", loader: loadSlots },
};

const DEFAULT_ROUTE = "dashboard";

const $ = (id) => document.getElementById(id);

function authHeaders() {
  return state.token
    ? { Authorization: `Bearer ${state.token}` }
    : {};
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
      ...authHeaders(),
    },
  });

  if (response.status === 401) {
    logout();
    throw new Error("Sesion expirada. Inicia sesion de nuevo.");
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Error de servidor");
  }
  return data;
}

function setLoggedInUI(loggedIn) {
  $("loginCard").classList.toggle("hidden", loggedIn);
  $("app").classList.toggle("hidden", !loggedIn);
}

function fmtDate(iso) {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("es-HN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(d);
}

function fmtPrice(value) {
  return new Intl.NumberFormat("es-HN", {
    style: "currency",
    currency: "HNL",
    minimumFractionDigits: 2,
  }).format(Number(value));
}

function reasonPrompt() {
  const selected = window.prompt(
    `Motivo de rechazo:\n1) ${REJECT_REASONS[0]}\n2) ${REJECT_REASONS[1]}\n3) ${REJECT_REASONS[2]}\n\nEscribe 1, 2 o 3`
  );
  if (!selected) return null;
  if (selected.trim() === "1") return REJECT_REASONS[0];
  if (selected.trim() === "2") return REJECT_REASONS[1];
  if (selected.trim() === "3") return REJECT_REASONS[2];
  return null;
}

function statusPill(status) {
  const label = STATUS_LABELS[status] || status;
  return `<span class="pill pill-${status}">${label}</span>`;
}

function appointmentItem(a, actions = false) {
  const el = document.createElement("article");
  el.className = "list-item";
  el.innerHTML = `
    <div class="list-row">
      <strong>${a.service?.name || "Servicio"}</strong>
      ${statusPill(a.status)}
    </div>
    <p>Cliente: ${a.clientPhoneE164}</p>
    <p>Fecha: ${fmtDate(a.date)} | Hora: ${a.timeSlot?.startTime || "?"} \u2013 ${
    a.timeSlot?.endTime || "?"
  }</p>
    <p>Monto: ${fmtPrice(a.service?.price || 0)}</p>
  `;
  if (actions) {
    const row = document.createElement("div");
    row.className = "actions-row";
    const approve = document.createElement("button");
    approve.className = "btn primary";
    approve.textContent = "Aprobar";
    approve.setAttribute("aria-label", `Aprobar cita de ${a.clientPhoneE164}`);
    approve.onclick = async () => {
      approve.disabled = true;
      approve.textContent = "Aprobando\u2026";
      try {
        await api(`/api/admin/appointments/${a.id}/approve`, { method: "POST" });
        await refreshDashboard();
      } catch (err) {
        approve.disabled = false;
        approve.textContent = "Aprobar";
      }
    };
    const reject = document.createElement("button");
    reject.className = "btn danger";
    reject.textContent = "Rechazar";
    reject.setAttribute("aria-label", `Rechazar cita de ${a.clientPhoneE164}`);
    reject.onclick = async () => {
      const reason = reasonPrompt();
      if (!reason) return;
      reject.disabled = true;
      reject.textContent = "Rechazando\u2026";
      try {
        await api(`/api/admin/appointments/${a.id}/reject`, {
          method: "POST",
          body: JSON.stringify({ reason }),
        });
        await refreshDashboard();
      } catch (err) {
        reject.disabled = false;
        reject.textContent = "Rechazar";
      }
    };
    row.append(approve, reject);
    el.appendChild(row);
  }
  return el;
}

async function loadProfile() {
  const me = await api("/api/admin/auth/me");
  state.business = me.business;
  const userName =
    me.name ||
    me.username ||
    me.user?.name ||
    me.user?.username ||
    "Administrador";
  $("welcomeTitle").textContent = `Hola, ${userName}`;
  $("businessMeta").textContent = "Panel de administracion";
}

async function loadAppointments({ useDateFilter = false } = {}) {
  const query = new URLSearchParams();
  if (useDateFilter) {
    const dateFrom = $("dateFrom").value;
    const dateTo = $("dateTo").value;
    if (dateFrom) query.set("dateFrom", dateFrom);
    if (dateTo) query.set("dateTo", dateTo);
  }
  const data = await api(`/api/admin/appointments?${query.toString()}`);
  state.appointments = data.data || [];
}

function renderStats() {
  const by = (s) => state.appointments.filter((a) => a.status === s).length;
  $("statPendingPayment").textContent = String(by("pending_payment"));
  $("statPendingApproval").textContent = String(by("pending_approval"));
  $("statConfirmed").textContent = String(by("confirmed"));
  $("statCancelled").textContent = String(by("cancelled"));
}

function renderApprovals() {
  const root = $("approvalsList");
  root.innerHTML = "";
  const rows = state.appointments.filter((a) => a.status === "pending_approval");
  if (rows.length === 0) {
    root.innerHTML = '<p class="empty-state">No hay citas pendientes de aprobacion.</p>';
    return;
  }
  rows.forEach((a) => root.appendChild(appointmentItem(a, true)));
}

function renderCalendar() {
  const root = $("calendarList");
  root.innerHTML = "";
  if (state.appointments.length === 0) {
    root.innerHTML = '<p class="empty-state">No hay citas para el rango seleccionado.</p>';
    return;
  }
  state.appointments.forEach((a) => root.appendChild(appointmentItem(a)));
}

async function loadDashboard() {
  await loadAppointments({ useDateFilter: false });
  renderStats();
  renderApprovals();
}

async function refreshDashboard() {
  await loadDashboard();
}

async function loadCalendar() {
  const now = new Date();
  if (!$("dateFrom").value) {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    $("dateFrom").value = from.toISOString().slice(0, 10);
  }
  if (!$("dateTo").value) {
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    $("dateTo").value = to.toISOString().slice(0, 10);
  }
  await loadAppointments({ useDateFilter: true });
  renderCalendar();
}

async function refreshCalendar() {
  await loadAppointments({ useDateFilter: true });
  renderCalendar();
}

async function loadServices() {
  const data = await api("/api/admin/services");
  const root = $("servicesList");
  root.innerHTML = "";

  if (!data.data || data.data.length === 0) {
    root.innerHTML = '<p class="empty-state">No hay servicios registrados.</p>';
    return;
  }

  data.data.forEach((s) => {
    const el = document.createElement("article");
    el.className = "list-item";
    el.innerHTML = `
      <div class="list-row">
        <strong>${s.name}</strong>
        <span class="pill ${s.isActive ? "pill-confirmed" : "pill-expired"}">${s.isActive ? "Activo" : "Inactivo"}</span>
      </div>
      <p>Duracion: ${s.durationMinutes} min | Precio: ${fmtPrice(s.price)}</p>
    `;

    const actions = document.createElement("div");
    actions.className = "actions-row";
    const toggle = document.createElement("button");
    toggle.className = "btn ghost";
    toggle.textContent = s.isActive ? "Desactivar" : "Activar";
    toggle.setAttribute("aria-label", `${s.isActive ? "Desactivar" : "Activar"} ${s.name}`);
    toggle.onclick = async () => {
      toggle.disabled = true;
      try {
        await api(`/api/admin/services/${s.id}`, {
          method: "PUT",
          body: JSON.stringify({ isActive: !s.isActive }),
        });
        await loadServices();
      } catch (err) {
        toggle.disabled = false;
      }
    };
    const remove = document.createElement("button");
    remove.className = "btn danger";
    remove.textContent = "Eliminar";
    remove.setAttribute("aria-label", `Eliminar ${s.name}`);
    remove.onclick = async () => {
      if (!window.confirm(`Eliminar servicio "${s.name}"?`)) return;
      remove.disabled = true;
      try {
        await api(`/api/admin/services/${s.id}`, { method: "DELETE" });
        await loadServices();
      } catch (err) {
        remove.disabled = false;
      }
    };
    actions.append(toggle, remove);
    el.append(actions);
    root.append(el);
  });
}

async function loadSlots() {
  const dayOfWeek = $("slotDayFilter").value;
  const data = await api(`/api/admin/time-slots?dayOfWeek=${dayOfWeek}`);
  const root = $("slotsList");
  root.innerHTML = "";

  if (!data.data || data.data.length === 0) {
    root.innerHTML = '<p class="empty-state">No hay horarios para este dia.</p>';
    return;
  }

  data.data.forEach((slot) => {
    const el = document.createElement("article");
    el.className = "list-item";
    el.innerHTML = `
      <div class="list-row">
        <strong>${slot.startTime} \u2013 ${slot.endTime}</strong>
        <span class="pill ${slot.isActive ? "pill-confirmed" : "pill-expired"}">${slot.isActive ? "Activo" : "Inactivo"}</span>
      </div>
      <p>Capacidad: ${slot.maxAppointments}</p>
    `;
    const actions = document.createElement("div");
    actions.className = "actions-row";
    const toggle = document.createElement("button");
    toggle.className = "btn ghost";
    toggle.textContent = slot.isActive ? "Inhabilitar" : "Habilitar";
    toggle.setAttribute("aria-label", `${slot.isActive ? "Inhabilitar" : "Habilitar"} horario ${slot.startTime} \u2013 ${slot.endTime}`);
    toggle.onclick = async () => {
      toggle.disabled = true;
      try {
        await api(`/api/admin/time-slots/${slot.id}`, {
          method: "PATCH",
          body: JSON.stringify({ isActive: !slot.isActive }),
        });
        await loadSlots();
      } catch (err) {
        toggle.disabled = false;
      }
    };
    const remove = document.createElement("button");
    remove.className = "btn danger";
    remove.textContent = "Eliminar";
    remove.setAttribute("aria-label", `Eliminar horario ${slot.startTime} \u2013 ${slot.endTime}`);
    remove.onclick = async () => {
      if (!window.confirm(`Eliminar horario ${slot.startTime} \u2013 ${slot.endTime}?`)) return;
      remove.disabled = true;
      try {
        await api(`/api/admin/time-slots/${slot.id}`, { method: "DELETE" });
        await loadSlots();
      } catch (err) {
        remove.disabled = false;
      }
    };
    actions.append(toggle, remove);
    el.append(actions);
    root.append(el);
  });
}

/* ── Router ── */

function getRouteFromHash() {
  const hash = window.location.hash.replace("#", "");
  return ROUTES[hash] ? hash : DEFAULT_ROUTE;
}

async function navigateTo(route) {
  const config = ROUTES[route];
  if (!config) return;

  // Update nav active state
  document.querySelectorAll(".nav-item").forEach((link) => {
    const isActive = link.dataset.view === route;
    link.classList.toggle("active", isActive);
    if (isActive) {
      link.setAttribute("aria-current", "page");
      return;
    }
    link.removeAttribute("aria-current");
  });

  // Toggle views
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  $(config.view).classList.add("active");

  // Load data for this view
  try {
    await config.loader();
  } catch (err) {
    console.error(`Error loading ${route}:`, err);
  }
}

// Nav link clicks
document.querySelectorAll(".nav-item").forEach((link) => {
  link.addEventListener("click", (e) => {
    e.preventDefault();
    const route = link.dataset.view;
    if (route && ROUTES[route]) {
      history.pushState(null, "", `#${route}`);
      navigateTo(route);
    }
  });
});

// Back/forward browser buttons
window.addEventListener("popstate", () => {
  if (!state.token) return;
  navigateTo(getRouteFromHash());
});

function logout() {
  localStorage.removeItem("admin_panel_token");
  state.token = "";
  setLoggedInUI(false);
  history.replaceState(null, "", window.location.pathname);
}

$("loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("loginError").textContent = "";
  const submitBtn = event.target.querySelector('button[type="submit"]');
  const body = {
    username: $("username").value,
    password: $("password").value,
  };
  submitBtn.disabled = true;
  submitBtn.textContent = "Entrando\u2026";
  try {
    const data = await api("/api/admin/auth/login", {
      method: "POST",
      headers: {},
      body: JSON.stringify(body),
    });
    state.token = data.token;
    localStorage.setItem("admin_panel_token", data.token);
    await bootApp();
  } catch (error) {
    $("loginError").textContent = error.message || "No se pudo iniciar sesion. Verifica tus credenciales.";
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Entrar";
  }
});

$("logoutBtn").addEventListener("click", logout);
$("refreshApprovalsBtn").addEventListener("click", refreshDashboard);
$("loadCalendarBtn").addEventListener("click", refreshCalendar);
$("refreshServicesBtn").addEventListener("click", loadServices);
$("refreshSlotsBtn").addEventListener("click", loadSlots);
$("slotDayFilter").addEventListener("change", loadSlots);

$("serviceForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.target);
  const submitBtn = event.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = "Agregando\u2026";
  try {
    await api("/api/admin/services", {
      method: "POST",
      body: JSON.stringify({
        name: form.get("name"),
        durationMinutes: Number(form.get("durationMinutes")),
        price: Number(form.get("price")),
      }),
    });
    event.target.reset();
    await loadServices();
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Agregar";
  }
});

$("slotForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.target);
  const submitBtn = event.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = "Agregando\u2026";
  try {
    await api("/api/admin/time-slots", {
      method: "POST",
      body: JSON.stringify({
        dayOfWeek: Number($("slotDayFilter").value),
        startTime: form.get("startTime"),
        endTime: form.get("endTime"),
        maxAppointments: Number(form.get("maxAppointments")),
        isActive: true,
      }),
    });
    event.target.reset();
    await loadSlots();
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Agregar";
  }
});

async function bootApp() {
  setLoggedInUI(true);
  await loadProfile();
  const route = getRouteFromHash();
  history.replaceState(null, "", `#${route}`);
  await navigateTo(route);
}

(async () => {
  if (!state.token) {
    setLoggedInUI(false);
    return;
  }
  try {
    await bootApp();
  } catch {
    logout();
  }
})();
