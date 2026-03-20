const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const loginModal = document.getElementById("loginModal");
const loginOverlay = document.getElementById("loginOverlay");
const closeModal = document.getElementById("closeModal");
const loginForm = document.getElementById("loginForm");
const signupBtn = document.getElementById("signupBtn");
const authStatus = document.getElementById("authStatus");
const authMessage = document.getElementById("authMessage");
const errorBox = document.getElementById("errorBox");

let supabase = null;
const STORAGE_KEY = "sdc_user_email";

function setMessage(text, isError = false) {
  authMessage.textContent = text;
  authMessage.style.color = isError ? "#ff8fa3" : "";
}

function reportError(text) {
  if (!errorBox) return;
  errorBox.textContent = text;
  errorBox.classList.add("has-error");
}

function clearError() {
  if (!errorBox) return;
  errorBox.textContent = "Sin errores";
  errorBox.classList.remove("has-error");
}

function updateAuthUI(email) {
  if (email) {
    authStatus.textContent = `Conectado como ${email}`;
    logoutBtn.disabled = false;
    loginBtn.disabled = true;
  } else {
    authStatus.textContent = "No conectado";
    logoutBtn.disabled = true;
    loginBtn.disabled = false;
  }
}

function openModal() {
  if (!loginOverlay || !loginModal) {
    reportError("No se pudo abrir el globo de login.");
    return;
  }
  clearError();
  loginOverlay.classList.add("is-open");
  loginModal.classList.remove("closing");
  loginModal.classList.add("is-open");
  loginOverlay.setAttribute("aria-hidden", "false");
}

function closeModalSafe() {
  if (!loginOverlay.classList.contains("is-open")) return;
  loginModal.classList.remove("is-open");
  loginModal.classList.add("closing");
  const finishClose = () => {
    loginModal.classList.remove("closing");
    loginOverlay.classList.remove("is-open");
    loginOverlay.setAttribute("aria-hidden", "true");
    loginModal.removeEventListener("animationend", finishClose);
  };
  loginModal.addEventListener("transitionend", finishClose);
}

function initSupabase() {
  if (!window.supabase) {
    setMessage("Cargando Supabase...");
    reportError("Supabase JS no cargó.");
    return null;
  }

  const url = window.SUPABASE_URL;
  const key = window.SUPABASE_ANON_KEY;

  if (!url || url.includes("TU-PROYECTO") || !key || key.includes("TU-ANON-KEY")) {
    setMessage("Configura tu URL y ANON KEY de Supabase.", true);
    reportError("Supabase no configurado.");
    return null;
  }

  return window.supabase.createClient(url, key);
}

async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function levenshtein(a, b) {
  const matrix = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[a.length][b.length];
}

async function findSimilarEmail(email) {
  const probe = email.split("@")[0]?.slice(0, 4) || email;
  const { data } = await supabase
    .from("usuarios")
    .select("email")
    .ilike("email", `%${probe}%`)
    .limit(20);

  if (!data || data.length === 0) return null;
  let best = null;
  let bestScore = Infinity;

  for (const row of data) {
    const score = levenshtein(email.toLowerCase(), row.email.toLowerCase());
    if (score < bestScore) {
      bestScore = score;
      best = row.email;
    }
  }

  return bestScore <= 2 ? best : null;
}

async function handleLogin(event) {
  event.preventDefault();
  if (!supabase) {
    setMessage("Supabase no está configurado.", true);
    reportError("Supabase no está listo.");
    return;
  }

  const formData = new FormData(loginForm);
  const email = formData.get("email");
  const password = formData.get("password");

  setMessage("Autenticando...");
  const passwordHash = await hashPassword(password);
  const { data, error } = await supabase
    .from("usuarios")
    .select("email,password_hash")
    .eq("email", email)
    .single();

  if (error || !data) {
    const similar = await findSimilarEmail(email);
    if (similar) {
      setMessage(`¿Quizá quisiste decir ${similar}?`, true);
      reportError("Posible typo en email.");
      return;
    }

    const insertResult = await supabase.from("usuarios").insert([
      {
        email,
        password_hash: passwordHash,
      },
    ]);

    if (insertResult.error) {
      setMessage(insertResult.error.message, true);
      reportError(insertResult.error.message);
      return;
    }

    localStorage.setItem(STORAGE_KEY, email);
    updateAuthUI(email);
    setMessage("Cuenta creada y sesión iniciada.");
    closeModalSafe();
    return;
  }

  if (data.password_hash !== passwordHash) {
    setMessage("Contraseña incorrecta.", true);
    reportError("Contraseña incorrecta.");
    return;
  }

  localStorage.setItem(STORAGE_KEY, email);
  updateAuthUI(email);
  setMessage("Listo. Bienvenido a la Coalición.");
  closeModalSafe();
}

async function handleSignup() {
  if (!supabase) {
    setMessage("Supabase no está configurado.", true);
    reportError("Supabase no está listo.");
    return;
  }

  const formData = new FormData(loginForm);
  const email = formData.get("email");
  const password = formData.get("password");

  setMessage("Creando cuenta...");
  const passwordHash = await hashPassword(password);
  const { data: existing } = await supabase
    .from("usuarios")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (existing) {
    setMessage("Ese email ya existe.", true);
    reportError("Email ya existe.");
    return;
  }

  const { error } = await supabase.from("usuarios").insert([
    {
      email,
      password_hash: passwordHash,
    },
  ]);

  if (error) {
    setMessage(error.message, true);
    reportError(error.message);
    return;
  }

  setMessage("Cuenta creada. Ya puedes iniciar sesión.");
}

async function handleLogout() {
  localStorage.removeItem(STORAGE_KEY);
  updateAuthUI(null);
  setMessage("Sesión cerrada.");
}

function bindEvents() {
  loginBtn.addEventListener("click", openModal);
  closeModal.addEventListener("click", closeModalSafe);
  loginForm.addEventListener("submit", handleLogin);
  signupBtn.addEventListener("click", handleSignup);
  logoutBtn.addEventListener("click", handleLogout);

  loginOverlay.addEventListener("click", (event) => {
    if (event.target === loginOverlay) {
      closeModalSafe();
    }
  });
}

async function init() {
  supabase = initSupabase();
  bindEvents();

  if (!supabase) {
    updateAuthUI(null);
    return;
  }

  const storedEmail = localStorage.getItem(STORAGE_KEY);
  updateAuthUI(storedEmail);
}

window.addEventListener("error", (event) => {
  reportError(event.message || "Error desconocido.");
});

window.addEventListener("unhandledrejection", (event) => {
  const message = event.reason?.message || "Promesa rechazada.";
  reportError(message);
});

init();
