import express from "express";
import cookieParser from "cookie-parser";

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

app.use(authMiddleware);

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

app.get("/", (_req, res) => {
  res.send(
    pageShell(`
<h1>Simple PasarBot Admin</h1>
<p><a href="/logout">Logout</a></p>
<section>
  <h2>PasarGuard connect</h2>
  <form id="pasar-form">
    <label>Panel URL</label><input name="panelUrl" placeholder="https://panel.example.com" />
    <label>Node API Base URL</label><input name="nodeApiBaseUrl" placeholder="https://node.example.com:8443" />
    <label>Admin username</label><input name="username" />
    <label>Admin password</label><input name="password" type="password" />
    <label>API key (optional if auto-detect works)</label><input name="apiKey" />
    <button type="submit">Connect</button>
  </form>
  <pre id="pasar-out"></pre>
</section>
<section>
  <h2>Plans</h2>
  <form id="plan-form">
    <label>ID</label><input name="id" placeholder="trial / free / m1 / m3 / m6 / m12" />
    <label>Name</label><input name="name" />
    <label>Days</label><input name="days" type="number" />
    <label>Traffic Limit Bytes</label><input name="trafficLimitBytes" type="number" />
    <label>Is Trial</label><select name="isTrial"><option value="false">false</option><option value="true">true</option></select>
    <button type="submit">Save plan</button>
  </form>
  <button id="load-plans">Refresh plans</button>
  <pre id="plans-out"></pre>
</section>
<section>
  <h2>Instructions</h2>
  <form id="instr-form">
    <label>Code</label><input name="code" value="connect_vpn" />
    <label>Locale</label><select name="locale"><option value="ru">ru</option><option value="en">en</option></select>
    <label>Platform</label><select name="platform"><option>universal</option><option>ios</option><option>android</option><option>mac</option><option>win</option></select>
    <label>Title</label><input name="title" />
    <label>Body</label><textarea name="body" rows="5"></textarea>
    <label>Image URL</label><input name="imageUrl" />
    <button type="submit">Save instruction</button>
  </form>
  <button id="load-instr">Refresh instructions</button>
  <pre id="instr-out"></pre>
</section>
<section>
  <h2>Subscriptions</h2>
  <button id="load-subs">Refresh subscriptions</button>
  <pre id="subs-out"></pre>
</section>
<script>
async function postJson(path, body){const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return r.json();}
async function getJson(path){const r=await fetch(path);return r.json();}
document.getElementById('pasar-form').onsubmit=async(e)=>{e.preventDefault();const f=new FormData(e.target);const body=Object.fromEntries(f.entries());const out=await postJson('/api/proxy/admin/pasarguard/connect',body);document.getElementById('pasar-out').textContent=JSON.stringify(out,null,2);}
document.getElementById('plan-form').onsubmit=async(e)=>{e.preventDefault();const f=new FormData(e.target);const body=Object.fromEntries(f.entries());body.days=Number(body.days);body.trafficLimitBytes=body.trafficLimitBytes?Number(body.trafficLimitBytes):null;body.isTrial=body.isTrial==='true';const out=await postJson('/api/proxy/admin/plans',body);document.getElementById('plans-out').textContent=JSON.stringify(out,null,2);}
document.getElementById('load-plans').onclick=async()=>{const out=await getJson('/api/proxy/plans');document.getElementById('plans-out').textContent=JSON.stringify(out,null,2);}
document.getElementById('instr-form').onsubmit=async(e)=>{e.preventDefault();const f=new FormData(e.target);const out=await postJson('/api/proxy/admin/instructions',Object.fromEntries(f.entries()));document.getElementById('instr-out').textContent=JSON.stringify(out,null,2);}
document.getElementById('load-instr').onclick=async()=>{const out=await getJson('/api/proxy/admin/instructions');document.getElementById('instr-out').textContent=JSON.stringify(out,null,2);}
document.getElementById('load-subs').onclick=async()=>{const out=await getJson('/api/proxy/admin/subscriptions');document.getElementById('subs-out').textContent=JSON.stringify(out,null,2);}
</script>
`)
  );
});

app.listen(cfg.port, () => {
  console.log(`Admin web listening on :${cfg.port}`);
});
