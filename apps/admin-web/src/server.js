import express from "express";
import cookieParser from "cookie-parser";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

const cfg = {
  port: Number(process.env.ADMIN_WEB_PORT || 3000),
  apiBase: process.env.API_INTERNAL_URL || "http://api:8080",
  user: process.env.ADMIN_WEB_USER || "admin",
  pass: process.env.ADMIN_WEB_PASSWORD || "admin",
  passwordHash: process.env.ADMIN_WEB_PASSWORD_HASH || "",
  sessionSecret: process.env.ADMIN_SESSION_SECRET || "",
  sessionTtlHours: Number(process.env.ADMIN_SESSION_TTL_HOURS || 12),
  secureCookies: (process.env.ADMIN_SECURE_COOKIE || "true").toLowerCase() === "true"
};
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "../public");
const sessionStore = new Map();
const loginAttempts = new Map();

function nowMs() {
  return Date.now();
}

function sessionTtlMs() {
  return Math.max(1, cfg.sessionTtlHours) * 60 * 60 * 1000;
}

function fingerprint(req) {
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";
  const ua = req.headers["user-agent"] || "unknown";
  return crypto.createHash("sha256").update(`${ip}|${ua}`).digest("hex");
}

function signSessionId(sessionId) {
  const secret = cfg.sessionSecret || "dev-insecure-secret";
  return crypto.createHmac("sha256", secret).update(sessionId).digest("hex");
}

function issueSession(req) {
  const id = crypto.randomBytes(32).toString("hex");
  const sig = signSessionId(id);
  sessionStore.set(id, { id, sig, fingerprint: fingerprint(req), expiresAt: nowMs() + sessionTtlMs() });
  return `${id}.${sig}`;
}

function parseSessionCookie(raw) {
  if (!raw || !raw.includes(".")) {
    return null;
  }
  const [id, sig] = raw.split(".");
  if (!id || !sig) {
    return null;
  }
  return { id, sig };
}

function cleanupSessions() {
  const now = nowMs();
  for (const [id, value] of sessionStore.entries()) {
    if (value.expiresAt <= now) {
      sessionStore.delete(id);
    }
  }
}

function isRateLimited(req) {
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";
  const current = loginAttempts.get(ip) || { count: 0, resetAt: nowMs() + 15 * 60 * 1000 };
  if (current.resetAt <= nowMs()) {
    loginAttempts.set(ip, { count: 0, resetAt: nowMs() + 15 * 60 * 1000 });
    return false;
  }
  return current.count >= 10;
}

function registerFailedAttempt(req) {
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";
  const current = loginAttempts.get(ip) || { count: 0, resetAt: nowMs() + 15 * 60 * 1000 };
  if (current.resetAt <= nowMs()) {
    loginAttempts.set(ip, { count: 1, resetAt: nowMs() + 15 * 60 * 1000 });
    return;
  }
  current.count += 1;
  loginAttempts.set(ip, current);
}

function clearAttempts(req) {
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";
  loginAttempts.delete(ip);
}

async function verifyPassword(input) {
  if (cfg.passwordHash) {
    return bcrypt.compare(input, cfg.passwordHash);
  }
  return input === cfg.pass;
}

function isAuthed(req) {
  cleanupSessions();
  const parsed = parseSessionCookie(req.cookies?.admin_session);
  if (!parsed) {
    return false;
  }
  const expectedSig = signSessionId(parsed.id);
  if (parsed.sig !== expectedSig) {
    return false;
  }
  const current = sessionStore.get(parsed.id);
  if (!current) {
    return false;
  }
  if (current.sig !== parsed.sig) {
    return false;
  }
  if (current.expiresAt <= nowMs()) {
    sessionStore.delete(parsed.id);
    return false;
  }
  if (current.fingerprint !== fingerprint(req)) {
    sessionStore.delete(parsed.id);
    return false;
  }
  current.expiresAt = nowMs() + sessionTtlMs();
  sessionStore.set(parsed.id, current);
  return true;
}

function authMiddleware(req, res, next) {
  if (!isAuthed(req)) {
    return res.redirect("/login");
  }
  return next();
}

function pageShell(content) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Simple PasarBot Admin</title>
<style>body{font-family:Arial,sans-serif;max-width:1000px;margin:20px auto;padding:0 12px}section{border:1px solid #ddd;border-radius:8px;padding:12px;margin:10px 0}input,textarea,select{width:100%;padding:8px;margin:6px 0}button{padding:8px 12px}pre{background:#f6f6f6;padding:8px;overflow:auto}</style>
</head><body>${content}</body></html>`;
}

app.get("/login", (_req, res) => {
  res.send(
    pageShell(`
<h1>Admin Login</h1>
<form method="post" action="/login">
<label>Username</label><input name="username" />
<label>Password</label><input name="password" type="password" />
<button type="submit">Sign in</button>
</form>
`)
  );
});

app.post("/login", (req, res) => {
  if (isRateLimited(req)) {
    return res.status(429).send(pageShell("<h1>Too many attempts. Try later.</h1><a href='/login'>Back</a>"));
  }
  verifyPassword(req.body.password || "")
    .then((passwordOk) => {
      if (req.body.username === cfg.user && passwordOk) {
        const token = issueSession(req);
        clearAttempts(req);
        res.cookie("admin_session", token, {
          httpOnly: true,
          sameSite: "strict",
          secure: cfg.secureCookies,
          maxAge: sessionTtlMs()
        });
        return res.redirect("/");
      }
      registerFailedAttempt(req);
      return res.status(401).send(pageShell("<h1>Invalid credentials</h1><a href='/login'>Back</a>"));
    })
    .catch(() => {
      registerFailedAttempt(req);
      return res.status(500).send(pageShell("<h1>Auth error</h1><a href='/login'>Back</a>"));
    });
});

app.get("/logout", (req, res) => {
  const parsed = parseSessionCookie(req.cookies?.admin_session);
  if (parsed) {
    sessionStore.delete(parsed.id);
  }
  res.clearCookie("admin_session");
  res.redirect("/login");
});

app.use("/api/proxy", authMiddleware);

app.get("/api/proxy/*", async (req, res) => {
  const endpoint = req.params[0];
  const response = await fetch(`${cfg.apiBase}/${endpoint}${req.url.includes("?") ? `?${req.url.split("?")[1]}` : ""}`);
  const json = await response.json().catch(() => ({}));
  res.status(response.status).json(json);
});

app.post("/api/proxy/*", async (req, res) => {
  const endpoint = req.params[0];
  const response = await fetch(`${cfg.apiBase}/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req.body)
  });
  const json = await response.json().catch(() => ({}));
  res.status(response.status).json(json);
});

app.delete("/api/proxy/*", async (req, res) => {
  const endpoint = req.params[0];
  const response = await fetch(`${cfg.apiBase}/${endpoint}`, { method: "DELETE" });
  const json = await response.json().catch(() => ({}));
  res.status(response.status).json(json);
});

app.use(authMiddleware, express.static(publicDir));

app.get("/", authMiddleware, (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.listen(cfg.port, () => {
  console.log(`Admin web listening on :${cfg.port}`);
});
