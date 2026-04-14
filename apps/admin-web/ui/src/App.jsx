import React, { useEffect, useMemo, useState } from "react";

const tabs = [
  ["dashboard", "Дашборд"],
  ["subscriptions", "Подписки"],
  ["profiles", "Профили"],
  ["instructions", "Инструкции"],
  ["promos", "Промокоды"],
  ["campaigns", "Кампании"],
  ["pasarguard", "PasarGuard"],
  ["security", "Безопасность"],
  ["smoke", "Смок-тесты"]
];

async function api(path, options = {}) {
  const r = await fetch(`./api/${path}`, options);
  return { ok: r.ok, status: r.status, data: await r.json().catch(() => ({})) };
}

export function App() {
  const [active, setActive] = useState("dashboard");
  const [csrf, setCsrf] = useState("");
  const [state, setState] = useState({
    users: 0,
    subs: 0,
    profilesCount: 0,
    profiles: [],
    promos: [],
    campaigns: [],
    instructions: [],
    subscriptions: [],
    pasarStatus: null,
    smoke: [],
    settings: {},
    pasarSettings: {}
  });
  const [toast, setToast] = useState("");

  useEffect(() => {
    fetch("./api/csrf").then((r) => r.json()).then((j) => setCsrf(j.csrfToken || "")).catch(() => undefined);
  }, []);

  async function refreshAll() {
    const [users, subs, profiles, promos, campaigns, instructions, pasarStatus, pasarSettings] = await Promise.all([
      api("admin/users"),
      api("admin/subscriptions"),
      api("admin/profiles"),
      api("admin/promos"),
      api("admin/campaigns"),
      api("admin/instructions"),
      api("admin/pasarguard/panel_status"),
      api("admin/pasarguard/settings")
    ]);
    setState((s) => ({
      ...s,
      users: users.data?.data?.length || 0,
      subs: subs.data?.data?.length || 0,
      profilesCount: profiles.data?.data?.length || 0,
      profiles: profiles.data?.data || [],
      promos: promos.data?.data || [],
      campaigns: campaigns.data?.data || [],
      instructions: instructions.data?.data || [],
      subscriptions: subs.data?.data || [],
      pasarStatus: pasarStatus.data,
      pasarSettings: pasarSettings.data?.data || {}
    }));
  }

  function notify(text) {
    setToast(text);
    setTimeout(() => setToast(""), 2200);
  }

  useEffect(() => {
    refreshAll().catch(() => undefined);
  }, []);

  const kpis = useMemo(
    () => [
      ["Пользователи", state.users],
      ["Подписки", state.subs],
      ["Профили", state.profilesCount],
      ["Кампании", state.campaigns.length]
    ],
    [state]
  );
  const pasarConnected = Boolean(state.pasarStatus?.connected);

  async function runSmoke() {
    const checks = [
      ["API Health", () => api("health")],
      ["Users", () => api("admin/users")],
      ["Subscriptions", () => api("admin/subscriptions")],
      ["Profiles", () => api("admin/profiles")],
      ["Instructions", () => api("admin/instructions")],
      ["Promos", () => api("admin/promos")],
      ["Campaigns", () => api("admin/campaigns")],
      ["Channel Policies", () => api("admin/channel-policies")],
      ["Incidents", () => api("admin/incidents?limit=20")],
      ["Analytics", () => api("admin/analytics/summary")],
      ["Pasar status", () => api("admin/pasarguard/panel_status")],
      ["Miniapp catalog", () => api("miniapp/catalog")]
    ];
    const out = [];
    for (const [name, fn] of checks) {
      try {
        const r = await fn();
        out.push({ name, ok: r.ok, status: r.status });
      } catch (_e) {
        out.push({ name, ok: false, status: 0 });
      }
    }
    setState((s) => ({ ...s, smoke: out }));
  }

  async function createPromo(e) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body = {
      code: String(fd.get("code") || "").trim(),
      kind: fd.get("kind") || "amount",
      valueMinor: Number(fd.get("valueMinor") || 0),
      active: true
    };
    await api("admin/promos", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
      body: JSON.stringify(body)
    });
    e.currentTarget.reset();
    await refreshAll();
    notify("Промокод сохранен");
  }

  async function deleteSubscription(userId) {
    await api(`admin/subscriptions/${userId}`, {
      method: "DELETE",
      headers: { "X-CSRF-Token": csrf }
    });
    await refreshAll();
    notify("Подписка удалена");
  }

  async function saveProfile(e) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body = {
      id: String(fd.get("id") || "").trim(),
      name: String(fd.get("name") || "").trim(),
      durationDays: Number(fd.get("durationDays") || 30),
      priceMinor: Number(fd.get("priceMinor") || 0),
      currency: "RUB",
      trafficLimitBytes: fd.get("trafficLimitBytes") ? Number(fd.get("trafficLimitBytes")) : null,
      nodeTemplate: fd.get("nodeTemplate") || "no-whitelist",
      requireChannelMember: fd.get("requireChannelMember") === "true",
      isTrial: fd.get("isTrial") === "true",
      active: true
    };
    await api("admin/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
      body: JSON.stringify(body)
    });
    e.currentTarget.reset();
    await refreshAll();
    notify("Профиль сохранен");
  }

  async function saveInstruction(e) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body = {
      code: fd.get("code"),
      locale: fd.get("locale"),
      platform: fd.get("platform"),
      title: fd.get("title"),
      body: fd.get("body")
    };
    await api("admin/instructions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
      body: JSON.stringify(body)
    });
    await refreshAll();
    notify("Инструкция сохранена");
  }

  async function connectPasar(e) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body = {
      panelUrl: fd.get("panelUrl"),
      nodeApiBaseUrl: fd.get("nodeApiBaseUrl"),
      username: fd.get("username"),
      password: fd.get("password"),
      wlTemplateName: fd.get("wlTemplateName"),
      noWlTemplateName: fd.get("noWlTemplateName"),
      trialTemplateName: fd.get("trialTemplateName")
    };
    await api("admin/pasarguard/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
      body: JSON.stringify(body)
    });
    await refreshAll();
    notify("Подключение сохранено");
  }

  async function deleteInstruction(id) {
    await api(`admin/instructions/${id}`, {
      method: "DELETE",
      headers: { "X-CSRF-Token": csrf }
    });
    await refreshAll();
    notify("Инструкция удалена");
  }

  async function deletePromo(code) {
    await api(`admin/promos/${encodeURIComponent(code)}`, {
      method: "DELETE",
      headers: { "X-CSRF-Token": csrf }
    });
    await refreshAll();
    notify("Промокод удален");
  }

  async function createCampaign(e) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await api("admin/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
      body: JSON.stringify({
        id: String(fd.get("id") || "").trim() || undefined,
        name: String(fd.get("name") || "").trim(),
        channel: String(fd.get("channel") || "telegram"),
        payload: {}
      })
    });
    e.currentTarget.reset();
    await refreshAll();
    notify("Кампания сохранена");
  }

  async function deleteCampaignById(id) {
    await api(`admin/campaigns/${id}`, {
      method: "DELETE",
      headers: { "X-CSRF-Token": csrf }
    });
    await refreshAll();
    notify("Кампания удалена");
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">Nemu-X-PasarBot</div>
        {tabs.map(([id, label]) => (
          <button key={id} className={`tab ${active === id ? "active" : ""}`} onClick={() => setActive(id)}>
            {label}
          </button>
        ))}
        <a className="logout" href="./logout">Выход</a>
        <a className="repo" href="https://github.com/Nemu-x/Simple-PasarBot" target="_blank" rel="noreferrer">
          GitHub проекта
        </a>
      </aside>

      <main className="content">
        {toast ? <div className="toast">{toast}</div> : null}
        <header className="top">
          <h1>Центр управления</h1>
          <button className="primary" onClick={() => refreshAll()}>Обновить</button>
        </header>

        {active === "dashboard" && (
          <section className="grid">
            {kpis.map(([k, v]) => (
              <article className="card kpi" key={k}>
                <p>{k}</p>
                <h2>{v}</h2>
              </article>
            ))}
            <article className="card wide">
              <h3>Статус PasarGuard</h3>
              <div className={`status-pill ${pasarConnected ? "ok" : "bad"}`}>
                {pasarConnected ? "Подключено" : "Отключено"}
              </div>
              <p className="muted">Шаблонов: {state.pasarStatus?.templatesCount ?? 0}</p>
            </article>
          </section>
        )}

        {active === "subscriptions" && (
          <section className="card">
            <h3>Подписки</h3>
            <table>
              <thead><tr><th>User</th><th>Plan</th><th>Status</th><th>Expires</th><th>Действие</th></tr></thead>
              <tbody>
                {state.subscriptions.map((s) => (
                  <tr key={s.id}>
                    <td>{s.userId}</td><td>{s.planId}</td><td>{s.status}</td><td>{s.expiresAt}</td>
                    <td><button className="danger" onClick={() => deleteSubscription(s.userId)}>Удалить</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {active === "profiles" && (
          <section className="grid">
            <article className="card">
              <h3>Создать/обновить профиль</h3>
              <form className="form" onSubmit={saveProfile}>
                <input name="id" placeholder="ID: trial/m1/m3..." required />
                <input name="name" placeholder="Название" required />
                <input name="durationDays" type="number" placeholder="Дни" defaultValue={30} />
                <input name="priceMinor" type="number" placeholder="Цена в копейках" defaultValue={0} />
                <input name="trafficLimitBytes" type="number" placeholder="Лимит трафика (optional)" />
                <select name="nodeTemplate"><option value="no-whitelist">no-whitelist</option><option value="whitelist">whitelist</option></select>
                <select name="requireChannelMember"><option value="true">Требовать канал</option><option value="false">Канал не обязателен</option></select>
                <select name="isTrial"><option value="false">Платный</option><option value="true">Триал</option></select>
                <button className="primary" type="submit">Сохранить профиль</button>
              </form>
            </article>
            <article className="card">
              <h3>Список профилей</h3>
              <table>
                <thead><tr><th>ID</th><th>Название</th><th>Дни</th><th>Цена</th></tr></thead>
                <tbody>
                  {state.profiles.map((p) => (
                    <tr key={p.id}><td>{p.id}</td><td>{p.name}</td><td>{p.durationDays}</td><td>{p.priceMinor}</td></tr>
                  ))}
                </tbody>
              </table>
            </article>
          </section>
        )}

        {active === "instructions" && (
          <section className="grid">
            <article className="card">
              <h3>Создать инструкцию</h3>
              <form className="form" onSubmit={saveInstruction}>
                <input name="code" defaultValue="connect_vpn" required />
                <select name="locale"><option value="ru">ru</option><option value="en">en</option></select>
                <select name="platform"><option value="universal">universal</option><option value="ios">ios</option><option value="android">android</option><option value="mac">mac</option><option value="win">win</option></select>
                <input name="title" placeholder="Заголовок" required />
                <input name="body" placeholder="Текст" required />
                <button className="primary" type="submit">Сохранить инструкцию</button>
              </form>
            </article>
            <article className="card">
              <h3>Инструкции</h3>
              <table>
                <thead><tr><th>Lang</th><th>Platform</th><th>Title</th><th>Body</th><th></th></tr></thead>
                <tbody>
                  {state.instructions.map((it) => (
                    <tr key={it.id}>
                      <td>{it.lang}</td>
                      <td>{it.platform}</td>
                      <td>{it.title}</td>
                      <td>{String(it.body || "").slice(0, 80)}...</td>
                      <td><button className="danger" onClick={() => deleteInstruction(it.id)}>Удалить</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </article>
          </section>
        )}

        {active === "promos" && (
          <section className="grid">
            <article className="card">
              <h3>Создать промокод</h3>
              <form onSubmit={createPromo} className="form">
                <input name="code" placeholder="Code" required />
                <select name="kind"><option value="amount">amount</option><option value="days">days</option></select>
                <input name="valueMinor" type="number" placeholder="Value Minor" />
                <button className="primary" type="submit">Сохранить</button>
              </form>
            </article>
            <article className="card">
              <h3>Промокоды</h3>
              <table>
                <thead><tr><th>Code</th><th>Type</th><th>Value</th><th>Used</th><th></th></tr></thead>
                <tbody>
                  {state.promos.map((p) => (
                    <tr key={p.code}>
                      <td>{p.code}</td><td>{p.kind}</td><td>{p.valueMinor ?? p.valueDays ?? 0}</td><td>{p.usedCount}</td>
                      <td><button className="danger" onClick={() => deletePromo(p.code)}>Удалить</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </article>
          </section>
        )}

        {active === "campaigns" && (
          <section className="grid">
            <article className="card">
              <h3>Создать кампанию</h3>
              <form className="form" onSubmit={createCampaign}>
                <input name="id" placeholder="ID (optional)" />
                <input name="name" placeholder="Название" required />
                <input name="channel" defaultValue="telegram" />
                <button className="primary" type="submit">Сохранить кампанию</button>
              </form>
            </article>
            <article className="card">
              <h3>Кампании</h3>
              <table>
                <thead><tr><th>ID</th><th>Name</th><th>Channel</th><th></th></tr></thead>
                <tbody>
                  {state.campaigns.map((c) => (
                    <tr key={c.id}>
                      <td>{c.id}</td><td>{c.name}</td><td>{c.channel}</td>
                      <td><button className="danger" onClick={() => deleteCampaignById(c.id)}>Удалить</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </article>
          </section>
        )}

        {active === "pasarguard" && (
          <section className="grid">
            <article className="card">
              <h3>Подключение к панели PasarGuard</h3>
              <form className="form" onSubmit={connectPasar}>
                <input name="panelUrl" placeholder="https://panel.example.com" defaultValue={state.pasarSettings?.panelUrl || ""} />
                <input name="nodeApiBaseUrl" placeholder="https://node.example.com" defaultValue={state.pasarSettings?.nodeApiBaseUrl || ""} />
                <input name="username" placeholder="admin username" defaultValue={state.pasarSettings?.username || ""} />
                <input name="password" type="password" placeholder="admin password" />
                <input name="wlTemplateName" placeholder="WL template name" defaultValue={state.pasarSettings?.wlTemplateName || ""} />
                <input name="noWlTemplateName" placeholder="NO-WL template name" defaultValue={state.pasarSettings?.noWlTemplateName || ""} />
                <input name="trialTemplateName" placeholder="Trial template name" defaultValue={state.pasarSettings?.trialTemplateName || ""} />
                <button className="primary" type="submit">Сохранить подключение</button>
              </form>
            </article>
            <article className="card">
              <h3>Статус подключения</h3>
              <div className={`status-pill ${pasarConnected ? "ok" : "bad"}`}>
                {pasarConnected ? "Подключено" : "Отключено"}
              </div>
              <p className="muted">Templates: {state.pasarStatus?.templatesCount ?? 0}</p>
              <p className="muted">Причина: {state.pasarStatus?.reason || "-"}</p>
            </article>
          </section>
        )}

        {active === "security" && (
          <section className="card">
            <h3>Безопасность панели</h3>
            <ul>
              <li>Сессии + fingerprint + TTL: включено</li>
              <li>CSRF для POST/DELETE: включено</li>
              <li>Rate limit логина: включено</li>
              <li>Admin API token proxy: {state.pasarStatus ? "включен" : "проверь .env"}</li>
            </ul>
            <p>Рекомендуется: длинные значения `ADMIN_SESSION_SECRET` и `ADMIN_API_TOKEN`, плюс HTTPS only.</p>
          </section>
        )}

        {active === "smoke" && (
          <section className="card">
            <div className="row">
              <h3>Smoke Matrix</h3>
              <button className="primary" onClick={runSmoke}>Запустить full matrix</button>
            </div>
            <table>
              <thead><tr><th>Проверка</th><th>Статус</th><th>HTTP</th></tr></thead>
              <tbody>
                {state.smoke.map((s) => (
                  <tr key={s.name}>
                    <td>{s.name}</td>
                    <td>{s.ok ? "PASS" : "FAIL"}</td>
                    <td>{s.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p>PASS означает, что endpoint отвечает корректно. Это smoke, не e2e бизнес-валидация.</p>
          </section>
        )}
      </main>
    </div>
  );
}
