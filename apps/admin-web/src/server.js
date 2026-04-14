import express from "express";
import cookieParser from "cookie-parser";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

const cfg = {
  port: Number(process.env.ADMIN_WEB_PORT || 3000),
  apiBase: process.env.API_INTERNAL_URL || "http://api:8080",
  user: process.env.ADMIN_WEB_USER || "admin",
  pass: process.env.ADMIN_WEB_PASSWORD || "admin"
};
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "../public");

function isAuthed(req) {
  return req.cookies?.admin_session === "ok";
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
  if (req.body.username === cfg.user && req.body.password === cfg.pass) {
    res.cookie("admin_session", "ok", { httpOnly: true, sameSite: "lax" });
    return res.redirect("/");
  }
  return res.status(401).send(pageShell("<h1>Invalid credentials</h1><a href='/login'>Back</a>"));
});

app.get("/logout", (_req, res) => {
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
