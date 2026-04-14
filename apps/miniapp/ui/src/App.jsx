import React, { useEffect, useState } from "react";

async function call(path, method = "GET", body) {
  const r = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  return { ok: r.ok, data: await r.json().catch(() => ({})) };
}

function Card({ title, children, actions }) {
  return (
    <section className="card">
      <div className="row">
        <h3>{title}</h3>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function App() {
  const [session, setSession] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [giftTo, setGiftTo] = useState("");
  const [log, setLog] = useState("");

  async function load() {
    const tg = window.Telegram && window.Telegram.WebApp;
    const initData = tg?.initData || "";
    const [s, c] = await Promise.all([call("/session", "POST", { initData }), call("/catalog")]);
    if (s.ok) setSession(s.data);
    if (c.ok) setCatalog(c.data.profiles || []);
  }

  useEffect(() => {
    load().catch(() => undefined);
  }, []);

  async function renew(profileId) {
    const telegramId = session?.user?.telegramId;
    if (!telegramId) return;
    const r = await call("/renew", "POST", { telegramId, profileId });
    setLog(JSON.stringify(r.data, null, 2));
    await load();
  }

  async function sendGift() {
    const fromTelegramId = session?.user?.telegramId;
    if (!fromTelegramId || !giftTo) return;
    const r = await call("/gifts/create", "POST", { fromTelegramId, toTelegramId: giftTo, profileId: "m1" });
    setLog(JSON.stringify(r.data, null, 2));
  }

  async function guestCheckout() {
    const telegramId = session?.user?.telegramId;
    if (!telegramId) return;
    const r = await call("/landing/checkout", "POST", { telegramId, profileId: "m1", utm: { source: "miniapp" } });
    setLog(JSON.stringify(r.data, null, 2));
  }

  return (
    <main className="page">
      <h1>VPN Cabinet</h1>
      <p className="muted">Premium user cabinet for Pasar subscriptions</p>

      <div className="grid">
        <Card title="User"><pre>{JSON.stringify(session?.user || {}, null, 2)}</pre></Card>
        <Card title="Subscription"><pre>{JSON.stringify(session?.subscription || {}, null, 2)}</pre></Card>
        <Card title="Profile"><pre>{JSON.stringify(session?.profile || {}, null, 2)}</pre></Card>
        <Card title="Payments"><pre>{JSON.stringify(session?.payments || [], null, 2)}</pre></Card>
        <Card title="Catalog"><pre>{JSON.stringify(catalog, null, 2)}</pre></Card>
        <Card
          title="Renew"
          actions={
            <div className="actions">
              {["m1", "m3", "m6", "m12"].map((id) => (
                <button key={id} onClick={() => renew(id)}>{id.toUpperCase()}</button>
              ))}
            </div>
          }
        >
          <p className="muted">One-click renew by profile</p>
        </Card>
        <Card
          title="Gift Subscription"
          actions={<button onClick={sendGift}>Send Gift</button>}
        >
          <input value={giftTo} onChange={(e) => setGiftTo(e.target.value)} placeholder="Receiver Telegram ID" />
        </Card>
        <Card title="Guest Checkout" actions={<button onClick={guestCheckout}>Create Order</button>}>
          <p className="muted">Landing flow simulation for m1</p>
        </Card>
      </div>

      <Card title="Action Log">
        <pre>{log || "No actions yet."}</pre>
      </Card>
    </main>
  );
}
