import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "../public");

const cfg = {
  port: Number(process.env.MINIAPP_PORT || 3200),
  apiBase: process.env.API_INTERNAL_URL || "http://api:8080"
};

app.use(express.json({ limit: "64kb" }));
app.use(express.static(publicDir));

app.post("/session", async (req, res) => {
  const response = await fetch(`${cfg.apiBase}/miniapp/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ initData: req.body?.initData || "" })
  });
  const payload = await response.json().catch(() => ({}));
  return res.status(response.status).json(payload);
});

app.post("/renew", async (req, res) => {
  const response = await fetch(`${cfg.apiBase}/subscriptions/renew`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      telegramId: req.body?.telegramId,
      profileId: req.body?.profileId
    })
  });
  const payload = await response.json().catch(() => ({}));
  return res.status(response.status).json(payload);
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.listen(cfg.port, () => {
  console.log(`Mini app listening on :${cfg.port}`);
});
