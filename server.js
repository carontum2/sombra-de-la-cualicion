const crypto = require("crypto");
const express = require("express");
const dotenv = require("dotenv");
const { createClient } = require("@supabase/supabase-js");

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3000);

const SESSION_COOKIE = "sombra_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sessionSecret = process.env.SESSION_SECRET || "change-me";

const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

function asyncHandler(handler) {
  return function wrapped(req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function ensureSupabaseConfigured() {
  if (!supabase) {
    const error = new Error("Falta configurar SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.");
    error.status = 500;
    throw error;
  }
}

function signValue(value) {
  return crypto.createHmac("sha256", sessionSecret).update(value).digest("base64url");
}

function parseCookies(header) {
  if (!header) return {};
  const result = {};
  for (const pair of header.split(";")) {
    const index = pair.indexOf("=");
    if (index < 0) continue;
    const key = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    result[key] = decodeURIComponent(value);
  }
  return result;
}

function serializeCookie(name, value, options = {}) {
  const attributes = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge !== undefined) {
    attributes.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  }
  if (options.httpOnly) attributes.push("HttpOnly");
  if (options.sameSite) attributes.push(`SameSite=${options.sameSite}`);
  if (options.secure) attributes.push("Secure");
  if (options.path) attributes.push(`Path=${options.path}`);
  return attributes.join("; ");
}

function setSessionCookie(res, userId) {
  const payload = {
    userId,
    exp: Date.now() + SESSION_TTL_MS,
  };
  const json = JSON.stringify(payload);
  const signature = signValue(json);
  const signed = `${json}.${signature}`;
  const cookie = serializeCookie(SESSION_COOKIE, signed, {
    httpOnly: true,
    sameSite: "Lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
  res.setHeader("Set-Cookie", cookie);
}

function clearSessionCookie(res) {
  const cookie = serializeCookie(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "Lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  res.setHeader("Set-Cookie", cookie);
}

function verifySignedPayload(value) {
  if (!value) return null;
  const lastDot = value.lastIndexOf(".");
  if (lastDot <= 0) return null;
  const json = value.slice(0, lastDot);
  const signature = value.slice(lastDot + 1);
  if (signValue(json) !== signature) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function readSession(req) {
  const cookies = parseCookies(req.headers.cookie);
  const payload = verifySignedPayload(cookies[SESSION_COOKIE]);
  if (!payload || payload.exp < Date.now() || !payload.userId) {
    return null;
  }
  return payload;
}

function normalizeMinecraftUsername(username) {
  return String(username || "").trim();
}

function isValidMinecraftUsername(username) {
  return /^[A-Za-z0-9_]{3,16}$/.test(username);
}

function getMinecraftKey(username) {
  return `offline:${normalizeMinecraftUsername(username).toLowerCase()}`;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, expectedHash] = String(stored || "").split(":");
  if (!salt || !expectedHash) return false;
  const currentHash = crypto.scryptSync(password, salt, 64).toString("hex");
  const a = Buffer.from(currentHash, "hex");
  const b = Buffer.from(expectedHash, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
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

async function findSimilarUsername(username) {
  ensureSupabaseConfigured();
  const probe = username.slice(0, 4);
  const { data, error } = await supabase
    .from("users")
    .select("minecraft_name")
    .ilike("minecraft_name", `%${probe}%`)
    .limit(20);

  if (error || !data || data.length === 0) return null;
  let best = null;
  let bestScore = Infinity;
  for (const row of data) {
    const score = levenshtein(username.toLowerCase(), row.minecraft_name.toLowerCase());
    if (score < bestScore) {
      bestScore = score;
      best = row.minecraft_name;
    }
  }
  return bestScore <= 2 ? best : null;
}

async function getUserById(userId) {
  ensureSupabaseConfigured();
  const { data, error } = await supabase
    .from("users")
    .select("id,minecraft_uuid,minecraft_name,password_hash")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(`Supabase get user failed: ${error.message}`);
  return data || null;
}

async function getUserByMinecraftName(username) {
  ensureSupabaseConfigured();
  const uuidKey = getMinecraftKey(username);
  const { data, error } = await supabase
    .from("users")
    .select("id,minecraft_uuid,minecraft_name,password_hash")
    .eq("minecraft_uuid", uuidKey)
    .maybeSingle();
  if (error) throw new Error(`Supabase get user by name failed: ${error.message}`);
  return data || null;
}

async function createUser(username, password) {
  ensureSupabaseConfigured();
  const passwordHash = hashPassword(password);
  const { data, error } = await supabase
    .from("users")
    .insert({
      minecraft_uuid: getMinecraftKey(username),
      minecraft_name: username,
      password_hash: passwordHash,
    })
    .select("id,minecraft_uuid,minecraft_name,password_hash")
    .single();
  if (error) throw new Error(`Supabase create user failed: ${error.message}`);
  return data;
}

app.get("/", (_req, res) => {
  res.sendFile("index.html", { root: __dirname });
});

app.post(
  "/auth/register",
  asyncHandler(async (req, res) => {
    const username = normalizeMinecraftUsername(req.body.username);
    const password = String(req.body.password || "");

    if (!isValidMinecraftUsername(username)) {
      return res.status(400).json({ error: "El usuario debe parecer un nombre válido de Minecraft (3-16, letras/números/_)." });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres." });
    }

    const existing = await getUserByMinecraftName(username);
    if (existing) {
      return res.status(409).json({ error: "Ese usuario ya está registrado." });
    }

    const similar = await findSimilarUsername(username);
    if (similar) {
      return res.status(409).json({ error: `¿Quizá quisiste decir ${similar}?` });
    }

    const user = await createUser(username, password);
    setSessionCookie(res, user.id);

    res.status(201).json({
      message: "Cuenta creada correctamente.",
      user: { id: user.id, minecraft_name: user.minecraft_name },
    });
  })
);

app.post(
  "/auth/login",
  asyncHandler(async (req, res) => {
    const username = normalizeMinecraftUsername(req.body.username);
    const password = String(req.body.password || "");

    const user = await getUserByMinecraftName(username);
    if (!user || !verifyPassword(password, user.password_hash)) {
      const similar = await findSimilarUsername(username);
      const message = similar
        ? `Usuario o contraseña incorrectos. ¿Quizá quisiste decir ${similar}?`
        : "Usuario o contraseña incorrectos.";
      return res.status(401).json({ error: message });
    }

    setSessionCookie(res, user.id);
    res.json({
      message: "Sesión iniciada.",
      user: { id: user.id, minecraft_name: user.minecraft_name },
    });
  })
);

app.get("/auth/logout", (_req, res) => {
  clearSessionCookie(res);
  res.redirect("/");
});

app.get(
  "/api/session",
  asyncHandler(async (req, res) => {
    const session = readSession(req);
    if (!session) {
      return res.json({ loggedIn: false, user: null });
    }
    const user = await getUserById(session.userId);
    if (!user) {
      clearSessionCookie(res);
      return res.json({ loggedIn: false, user: null });
    }
    res.json({ loggedIn: true, user: { id: user.id, minecraft_name: user.minecraft_name } });
  })
);

app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  res.status(status).json({ error: err.message || "Error inesperado" });
});

app.listen(port, () => {
  console.log(`Servidor activo en http://localhost:${port}`);
});
