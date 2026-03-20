const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const loginModal = document.getElementById("loginModal");
const closeModal = document.getElementById("closeModal");
const loginForm = document.getElementById("loginForm");
const signupBtn = document.getElementById("signupBtn");
const authStatus = document.getElementById("authStatus");
const authMessage = document.getElementById("authMessage");

let supabase = null;
const STORAGE_KEY = "sdc_user_email";

function setMessage(text, isError = false) {
  authMessage.textContent = text;
  authMessage.style.color = isError ? "#ff8fa3" : "";
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
  loginModal.showModal();
}

function closeModalSafe() {
  loginModal.close();
}

function initSupabase() {
  if (!window.supabase) {
    setMessage("Cargando Supabase...");
    return null;
  }

  const url = window.SUPABASE_URL;
  const key = window.SUPABASE_ANON_KEY;

  if (!url || url.includes("TU-PROYECTO") || !key || key.includes("TU-ANON-KEY")) {
    setMessage("Configura tu URL y ANON KEY de Supabase.", true);
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

async function handleLogin(event) {
  event.preventDefault();
  if (!supabase) {
    setMessage("Supabase no está configurado.", true);
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
    setMessage("Usuario no encontrado.", true);
    return;
  }

  if (data.password_hash !== passwordHash) {
    setMessage("Contraseña incorrecta.", true);
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

  loginModal.addEventListener("click", (event) => {
    const rect = loginModal.getBoundingClientRect();
    const isInDialog =
      rect.top <= event.clientY &&
      event.clientY <= rect.top + rect.height &&
      rect.left <= event.clientX &&
      event.clientX <= rect.left + rect.width;
    if (!isInDialog) {
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

init();
