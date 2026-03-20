const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const logoutFab = document.getElementById("logoutFab");
const loginPanel = document.getElementById("loginPanel");
const loginModal = document.getElementById("loginModal");
const closeModal = document.getElementById("closeModal");
const loginForm = document.getElementById("loginForm");
const signupBtn = document.getElementById("signupBtn");
const authStatus = document.getElementById("authStatus");
const authMessage = document.getElementById("authMessage");
const errorBox = document.getElementById("errorBox");

function setStatus(message, isError = false) {
  if (errorBox) {
    errorBox.textContent = message || "Sin errores";
    errorBox.classList.toggle("has-error", Boolean(isError));
  }
  if (authMessage && message) {
    authMessage.textContent = message;
    authMessage.style.color = isError ? "#ff8fa3" : "";
  }
}

function updateAuthUI(session) {
  if (session?.loggedIn && session.user) {
    authStatus.textContent = `Conectado como ${session.user.minecraft_name}`;
    logoutBtn.disabled = false;
    loginBtn.disabled = true;
    if (logoutFab) {
      logoutFab.hidden = false;
      logoutFab.classList.add("show");
    }
    hideLoginPanel();
    return;
  }

  authStatus.textContent = "No conectado";
  logoutBtn.disabled = true;
  loginBtn.disabled = false;
  if (logoutFab) {
    logoutFab.classList.remove("show");
    logoutFab.hidden = true;
  }
  if (loginPanel) loginPanel.classList.remove("hidden");
}

function hideLoginPanel() {
  if (!loginPanel || !loginModal) return;
  loginModal.classList.add("closing");
  loginPanel.classList.add("hidden");
  const cleanup = () => {
    loginModal.classList.remove("closing");
    loginModal.removeEventListener("transitionend", cleanup);
  };
  loginModal.addEventListener("transitionend", cleanup);
  setTimeout(cleanup, 400);
}

function openLoginPanel() {
  if (!loginPanel || !loginModal) return;
  loginPanel.classList.remove("hidden");
  loginModal.classList.remove("closing");
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const raw = await response.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    data = { error: raw || "Error inesperado" };
  }
  if (!response.ok) {
    throw new Error(data.error || "Error inesperado");
  }
  return data;
}

async function loadSession() {
  try {
    const session = await fetchJson("/api/session");
    updateAuthUI(session);
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function handleLogin(event) {
  event.preventDefault();
  const form = new FormData(loginForm);
  setStatus("Iniciando sesión...");

  try {
    const data = await fetchJson("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: form.get("username"),
        password: form.get("password"),
      }),
    });
    setStatus(data.message || "Sesión iniciada.");
    await loadSession();
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function handleRegister() {
  const form = new FormData(loginForm);
  setStatus("Creando cuenta...");

  try {
    const data = await fetchJson("/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: form.get("username"),
        password: form.get("password"),
      }),
    });
    setStatus(data.message || "Cuenta creada.");
    await loadSession();
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function handleLogout() {
  try {
    await fetch("/auth/logout");
  } finally {
    updateAuthUI({ loggedIn: false, user: null });
    openLoginPanel();
    setStatus("Sesión cerrada.");
  }
}

function bindEvents() {
  if (loginBtn) loginBtn.addEventListener("click", openLoginPanel);
  if (closeModal) closeModal.addEventListener("click", hideLoginPanel);
  if (loginForm) loginForm.addEventListener("submit", handleLogin);
  if (signupBtn) signupBtn.addEventListener("click", handleRegister);
  if (logoutBtn) logoutBtn.addEventListener("click", handleLogout);
  if (logoutFab) logoutFab.addEventListener("click", handleLogout);

  if (loginPanel) {
    loginPanel.addEventListener("click", (event) => {
      if (event.target === loginPanel) {
        hideLoginPanel();
      }
    });
  }
}

bindEvents();
loadSession();
