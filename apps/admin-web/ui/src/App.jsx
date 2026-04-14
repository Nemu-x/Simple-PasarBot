import React, { useEffect, useMemo, useState } from "react";

const tabs = [
  ["dashboard", "Dashboard"],
  ["subscriptions", "Subscriptions"],
  ["profiles", "Profiles"],
  ["promos", "Promos"],
  ["campaigns", "Campaigns"],
  ["pasarguard", "PasarGuard"],
  ["smoke", "Smoke Tests"]
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
    profiles: 0,
    promos: [],
    campaigns: [],
    subscriptions: [],
    pasarStatus: null,
    smoke: []
  });

  useEffect(() => {
    fetch("./api/csrf").then((r) => r.json()).then((j) => setCsrf(j.csrfToken || "")).catch(() => undefined);
  }, []);

  async function refreshAll() {
    const [users, subs, profiles, promos, campaigns, pasarStatus] = await Promise.all([
      api("admin/users"),
      api("admin/subscriptions"),
      api("admin/profiles"),
      api("admin/promos"),
      api("admin/campaigns"),
      api("admin/pasarguard/panel_status")
    ]);
    setState((s) => ({
      ...s,
      users: users.data?.data?.length || 0,
      subs: subs.data?.data?.length || 0,
      profiles: profiles.data?.data?.length || 0,
      promos: promos.data?.data || [],
      campaigns: campaigns.data?.data || [],
      subscriptions: subs.data?.data || [],
      pasarStatus: pasarStatus.data
    }));
  }

  useEffect(() => {
    refreshAll().catch(() => undefined);
  }, []);

  const kpis = useMemo(
    () => [
      ["Users", state.users],
      ["Subscriptions", state.subs],
      ["Profiles", state.profiles],
      ["Campaigns", state.campaigns.length]
    ],
    [state]
  );

  async function runSmoke() {
    const checks = [
      ["API Health", () => api("health")],
      ["Users", () => api("admin/users")],
      ["Subscriptions", () => api("admin/subscriptions")],
      ["Profiles", () => api("admin/profiles")],
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
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">Simple PasarBot</div>
        {tabs.map(([id, label]) => (
          <button key={id} className={`tab ${active === id ? "active" : ""}`} onClick={() => setActive(id)}>
            {label}
          </button>
        ))}
        <a className="logout" href="./logout">Logout</a>
      </aside>

      <main className="content">
        <header className="top">
          <h1>Control Center</h1>
          <button className="primary" onClick={() => refreshAll()}>Refresh</button>
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
              <h3>PasarGuard Status</h3>
              <pre>{JSON.stringify(state.pasarStatus, null, 2)}</pre>
            </article>
          </section>
        )}

        {active === "subscriptions" && (
          <section className="card">
            <h3>Subscriptions</h3>
            <table>
              <thead><tr><th>User</th><th>Plan</th><th>Status</th><th>Expires</th></tr></thead>
              <tbody>
                {state.subscriptions.map((s) => (
                  <tr key={s.id}><td>{s.userId}</td><td>{s.planId}</td><td>{s.status}</td><td>{s.expiresAt}</td></tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {active === "profiles" && (
          <section className="card">
            <h3>Profiles</h3>
            <p>Управление профилями остаётся через API `admin/profiles` (добавим визуальный CRUD в следующем батче).</p>
          </section>
        )}

        {active === "promos" && (
          <section className="grid">
            <article className="card">
              <h3>Create Promo</h3>
              <form onSubmit={createPromo} className="form">
                <input name="code" placeholder="Code" required />
                <select name="kind"><option value="amount">amount</option><option value="days">days</option></select>
                <input name="valueMinor" type="number" placeholder="Value Minor" />
                <button className="primary" type="submit">Save</button>
              </form>
            </article>
            <article className="card">
              <h3>Promos</h3>
              <pre>{JSON.stringify(state.promos, null, 2)}</pre>
            </article>
          </section>
        )}

        {active === "campaigns" && (
          <section className="card">
            <h3>Campaigns</h3>
            <pre>{JSON.stringify(state.campaigns, null, 2)}</pre>
          </section>
        )}

        {active === "pasarguard" && (
          <section className="card">
            <h3>PasarGuard</h3>
            <pre>{JSON.stringify(state.pasarStatus, null, 2)}</pre>
          </section>
        )}

        {active === "smoke" && (
          <section className="card">
            <div className="row">
              <h3>Smoke Matrix</h3>
              <button className="primary" onClick={runSmoke}>Run Full Matrix</button>
            </div>
            <table>
              <thead><tr><th>Check</th><th>Status</th><th>HTTP</th></tr></thead>
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
          </section>
        )}
      </main>
    </div>
  );
}
