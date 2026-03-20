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
const toggleViewBtn = document.getElementById("toggleViewBtn");
const storeSection = document.getElementById("storeSection");
const wikiSection = document.getElementById("wikiSection");
const wikiList = document.getElementById("wikiList");
const wikiDetail = document.getElementById("wikiDetail");
const wikiDetailTitle = document.getElementById("wikiDetailTitle");
const wikiDetailDesc = document.getElementById("wikiDetailDesc");
const wikiDetailContent = document.getElementById("wikiDetailContent");
const wikiDetailImage = document.getElementById("wikiDetailImage");
const wikiBackBtn = document.getElementById("wikiBackBtn");
const wikiAdmin = document.getElementById("wikiAdmin");
const wikiForm = document.getElementById("wikiForm");
const commentForm = document.getElementById("commentForm");
const commentList = document.getElementById("commentList");

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

let currentSession = { loggedIn: false, user: null };
let activeWikiId = null;
let pollTimer = null;

function updateAuthUI(session) {
  currentSession = session || { loggedIn: false, user: null };
  if (session?.loggedIn && session.user) {
    authStatus.textContent = `Conectado como ${session.user.minecraft_name}`;
    logoutBtn.disabled = false;
    loginBtn.disabled = true;
    if (logoutFab) {
      logoutFab.hidden = false;
      logoutFab.classList.add("show");
    }
    hideLoginPanel();
    if (wikiAdmin) {
      wikiAdmin.classList.toggle("hidden", !session.user.isAdmin);
    }
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
  if (wikiAdmin) wikiAdmin.classList.add("hidden");
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

async function loadWikis() {
  try {
    const data = await fetchJson("/api/wikis");
    wikiList.innerHTML = "";
    data.items.forEach((item) => {
      const div = document.createElement("div");
      div.className = "wiki-item";
      div.dataset.id = item.id;
      div.innerHTML = `<strong>${item.title}</strong><div class=\"comment-meta\">${item.description}</div>`;
      div.addEventListener("click", () => openWikiDetail(item.id));
      wikiList.appendChild(div);
    });
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function openWikiDetail(id) {
  activeWikiId = id;
  wikiList.classList.add("hidden");
  wikiDetail.classList.remove("hidden");
  wikiBackBtn.classList.remove("hidden");
  try {
    const data = await fetchJson(`/api/wikis/${id}`);
    wikiDetailTitle.textContent = data.wiki.title;
    wikiDetailDesc.textContent = data.wiki.description;
    wikiDetailContent.textContent = data.wiki.content;
    if (data.wiki.image_url) {
      wikiDetailImage.src = data.wiki.image_url;
      wikiDetailImage.classList.remove("hidden");
      wikiDetailImage.onerror = () => {
        wikiDetailImage.classList.add("hidden");
        setStatus("La imagen no se pudo cargar. Revisa el link de Drive.", true);
      };
    } else {
      wikiDetailImage.classList.add("hidden");
    }
    await loadComments();
  } catch (error) {
    setStatus(error.message, true);
  }
}

function backToWikiList() {
  activeWikiId = null;
  wikiDetail.classList.add("hidden");
  wikiBackBtn.classList.add("hidden");
  wikiList.classList.remove("hidden");
}

async function loadComments() {
  if (!activeWikiId) return;
  try {
    const data = await fetchJson(`/api/wikis/${activeWikiId}/comments`);
    commentList.innerHTML = "";
    data.items.forEach((item) => {
      const wrapper = document.createElement("div");
      wrapper.className = "comment-item";
      wrapper.innerHTML = `
        <div>
          <div><strong>${item.author}</strong></div>
          <div>${item.content}</div>
          <div class=\"comment-meta\">${new Date(item.created_at).toLocaleString()}</div>
        </div>
      `;
      if (currentSession?.user?.isAdmin) {
        const actions = document.createElement("div");
        actions.className = "comment-actions";
        const del = document.createElement("button");
        del.className = "comment-delete";
        del.textContent = "Borrar";
        del.addEventListener("click", async () => {
          try {
            await fetchJson(`/api/comments/${item.id}`, { method: "DELETE" });
            await loadComments();
          } catch (error) {
            setStatus(error.message, true);
          }
        });
        actions.appendChild(del);
        wrapper.appendChild(actions);
      }
      commentList.appendChild(wrapper);
    });
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

async function handleWikiCreate(event) {
  event.preventDefault();
  if (!currentSession?.user?.isAdmin) {
    setStatus("Solo Rontumero puede crear wikis.", true);
    return;
  }
  const form = new FormData(wikiForm);
  const rawImageUrl = String(form.get("image_url") || "").trim();
  let imageUrl = rawImageUrl;
  if (rawImageUrl.includes("drive.google.com")) {
    try {
      const url = new URL(rawImageUrl);
      const idParam = url.searchParams.get("id");
      let fileId = idParam;
      if (!fileId && url.pathname.includes("/file/d/")) {
        const parts = url.pathname.split("/file/d/");
        fileId = parts[1]?.split("/")[0] || "";
      }
      if (fileId) {
        imageUrl = `https://drive.google.com/uc?export=view&id=${fileId}`;
      }
    } catch {
      imageUrl = rawImageUrl;
    }
  }
  try {
    await fetchJson("/api/wikis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.get("title"),
        description: form.get("description"),
        image_url: imageUrl,
        content: form.get("content"),
      }),
    });
    wikiForm.reset();
    await loadWikis();
    setStatus("Wiki creada.");
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function handleCommentSubmit(event) {
  event.preventDefault();
  if (!activeWikiId) return;
  if (!currentSession?.loggedIn) {
    setStatus("Debes iniciar sesión para comentar.", true);
    return;
  }
  const form = new FormData(commentForm);
  try {
    await fetchJson(`/api/wikis/${activeWikiId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: form.get("comment") }),
    });
    commentForm.reset();
    await loadComments();
    setStatus("Comentario enviado.");
  } catch (error) {
    setStatus(error.message, true);
  }
}

function toggleView() {
  const isWiki = !wikiSection.classList.contains("hidden");
  if (isWiki) {
    wikiSection.classList.add("hidden");
    storeSection.classList.remove("hidden");
    toggleViewBtn.textContent = "Ver Wiki";
  } else {
    storeSection.classList.add("hidden");
    wikiSection.classList.remove("hidden");
    toggleViewBtn.textContent = "Ver Tienda";
    loadWikis();
  }
}

function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(async () => {
    try {
      if (!wikiSection.classList.contains("hidden")) {
        if (activeWikiId) {
          await openWikiDetail(activeWikiId);
        } else {
          await loadWikis();
        }
      }
    } catch {
      // Silent to avoid spam
    }
  }, 1000);
}

function bindEvents() {
  if (loginBtn) loginBtn.addEventListener("click", openLoginPanel);
  if (closeModal) closeModal.addEventListener("click", hideLoginPanel);
  if (loginForm) loginForm.addEventListener("submit", handleLogin);
  if (signupBtn) signupBtn.addEventListener("click", handleRegister);
  if (logoutBtn) logoutBtn.addEventListener("click", handleLogout);
  if (logoutFab) logoutFab.addEventListener("click", handleLogout);
  if (toggleViewBtn) toggleViewBtn.addEventListener("click", toggleView);
  if (wikiBackBtn) wikiBackBtn.addEventListener("click", backToWikiList);
  if (wikiForm) wikiForm.addEventListener("submit", handleWikiCreate);
  if (commentForm) commentForm.addEventListener("submit", handleCommentSubmit);

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
startPolling();
