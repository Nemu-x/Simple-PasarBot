const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
let pasarTemplates = [];
let pasarSettings = {};
let csrfToken = "";

async function ensureCsrf() {
  if (csrfToken) return csrfToken;
  const r = await fetch("./api/csrf");
  const json = await r.json();
  csrfToken = json.csrfToken || "";
  return csrfToken;
}

async function getJson(path) {
  const r = await fetch(`./api/${path}`);
  return r.json();
}
async function postJson(path, body) {
  const token = await ensureCsrf();
  const r = await fetch(`./api/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": token },
    body: JSON.stringify(body)
  });
  return r.json();
}
async function deleteJson(path) {
  const token = await ensureCsrf();
  const r = await fetch(`./api/${path}`, { method: "DELETE", headers: { "X-CSRF-Token": token } });
  return r.json();
}

function switchTab(tab) {
  $$(".tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  $$(".tab").forEach((t) => t.classList.toggle("active", t.id === `tab-${tab}`));
}
$$(".tabs button").forEach((btn) => btn.addEventListener("click", () => switchTab(btn.dataset.tab)));

async function refreshDashboard() {
  const [users, subs, plans] = await Promise.all([
    getJson("admin/users"),
    getJson("admin/subscriptions"),
    getJson("plans")
  ]);
  $("#stat-users").textContent = users?.data?.length ?? 0;
  $("#stat-subs").textContent = subs?.data?.length ?? 0;
  $("#stat-plans").textContent = plans?.plans?.length ?? 0;
}
$("#refresh-dashboard").onclick = refreshDashboard;

$("#pasar-form").onsubmit = async (e) => {
  e.preventDefault();
  const payload = Object.fromEntries(new FormData(e.target).entries());
  const nameToId = new Map((pasarTemplates || []).map((t) => [String(t.name || ""), t.id]));
  payload.wlTemplateId = payload.wlTemplateName ? nameToId.get(payload.wlTemplateName) || null : null;
  payload.noWlTemplateId = payload.noWlTemplateName ? nameToId.get(payload.noWlTemplateName) || null : null;
  payload.trialTemplateId = payload.trialTemplateName ? nameToId.get(payload.trialTemplateName) || null : null;
  const out = await postJson("admin/pasarguard/connect", payload);
  $("#pasar-out").textContent = JSON.stringify(out, null, 2);
  await refreshPasarStatus();
};

async function refreshPasarSettings() {
  const out = await getJson("admin/pasarguard/settings");
  const form = $("#pasar-form");
  const data = out?.data || {};
  pasarSettings = data;
  [
    "panelUrl",
    "subscriptionUrlPattern",
    "username",
    "password"
  ].forEach((key) => {
    if (form.elements[key]) {
      form.elements[key].value = data[key] || "";
    }
  });
  $("#pasar-out").textContent = JSON.stringify(out, null, 2);
}

async function refreshPasarTemplates() {
  const out = await getJson("admin/pasarguard/templates");
  pasarTemplates = out?.templates || [];
  ["wlTemplateName", "noWlTemplateName", "trialTemplateName"].forEach((name) => {
    const select = $(`#pasar-form select[name='${name}']`);
    if (!select) return;
    select.innerHTML = "<option value=''>Select template</option>";
    pasarTemplates.forEach((t) => {
      const option = document.createElement("option");
      option.value = String(t.name || "");
      option.textContent = `${t.name} (#${t.id})`;
      select.appendChild(option);
    });
    const savedName = name === "wlTemplateName"
      ? pasarSettings.wlTemplateName
      : name === "noWlTemplateName"
        ? pasarSettings.noWlTemplateName
        : pasarSettings.trialTemplateName;
    if (savedName) {
      select.value = savedName;
    }
  });
  $("#pasar-templates-out").textContent = JSON.stringify(out, null, 2);
}
$("#refresh-pasar-templates").onclick = refreshPasarTemplates;

async function refreshPasarStatus() {
  const badge = $("#pasar-status");
  const out = await getJson("admin/pasarguard/panel_status");
  const ok = Boolean(out?.connected);
  badge.textContent = ok ? "Connected" : "Disconnected";
  badge.classList.toggle("status-green", ok);
  badge.classList.toggle("status-red", !ok);
}

async function refreshPlans() {
  const out = await getJson("plans");
  const tbody = $("#plans-table tbody");
  tbody.innerHTML = "";
  (out.plans || []).forEach((p) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${p.id}</td><td>${p.name}</td><td>${p.days}</td><td>${p.trafficLimitBytes ?? "-"}</td><td>${p.isTrial}</td><td><button data-id="${p.id}">Delete</button></td>`;
    tr.querySelector("button").onclick = async () => {
      await deleteJson(`admin/plans/${p.id}`);
      await refreshPlans();
      await refreshDashboard();
    };
    tbody.appendChild(tr);
  });
}
$("#refresh-plans").onclick = refreshPlans;
$("#plan-form").onsubmit = async (e) => {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(e.target).entries());
  body.days = Number(body.days);
  body.trafficLimitBytes = body.trafficLimitBytes ? Number(body.trafficLimitBytes) : null;
  body.isTrial = body.isTrial === "true";
  await postJson("admin/plans", body);
  e.target.reset();
  await refreshPlans();
  await refreshDashboard();
};

async function refreshProfiles() {
  const out = await getJson("admin/profiles");
  const tbody = $("#profiles-table tbody");
  tbody.innerHTML = "";
  (out.data || []).forEach((p) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${p.id}</td><td>${p.name}</td><td>${p.durationDays}</td><td>${p.priceMinor} ${p.currency}</td><td>${p.nodeTemplate}</td><td>${p.isTrial}</td><td>${p.requireChannelMember}</td><td>${p.active}</td>`;
    tbody.appendChild(tr);
  });
}
$("#refresh-profiles").onclick = refreshProfiles;
$("#profile-form").onsubmit = async (e) => {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(e.target).entries());
  body.durationDays = Number(body.durationDays);
  body.priceMinor = Number(body.priceMinor || 0);
  body.trafficLimitBytes = body.trafficLimitBytes ? Number(body.trafficLimitBytes) : null;
  body.pasarTemplateId = body.pasarTemplateId ? Number(body.pasarTemplateId) : null;
  body.isTrial = body.isTrial === "true";
  body.requireChannelMember = body.requireChannelMember === "true";
  body.active = body.active === "true";
  await postJson("admin/profiles", body);
  await refreshProfiles();
};

async function refreshInstructions() {
  const out = await getJson("admin/instructions");
  const tbody = $("#instr-table tbody");
  tbody.innerHTML = "";
  (out.data || []).forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${row.code}</td><td>${row.lang}</td><td>${row.platform}</td><td>${row.title}</td><td>${row.body}</td>`;
    tbody.appendChild(tr);
  });
}
$("#refresh-instr").onclick = refreshInstructions;
$("#instr-form").onsubmit = async (e) => {
  e.preventDefault();
  const payload = Object.fromEntries(new FormData(e.target).entries());
  await postJson("admin/instructions", payload);
  await refreshInstructions();
};

async function refreshUsers() {
  const out = await getJson("admin/users");
  const tbody = $("#users-table tbody");
  tbody.innerHTML = "";
  (out.data || []).forEach((u) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${u.telegramId}</td><td>${u.preferredLanguage}</td><td>${u.hasUsedTrial}</td><td>${u.createdAt}</td>`;
    tbody.appendChild(tr);
  });
}
$("#refresh-users").onclick = refreshUsers;

async function refreshSubs() {
  const out = await getJson("admin/subscriptions");
  const tbody = $("#subs-table tbody");
  tbody.innerHTML = "";
  (out.data || []).forEach((s) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${s.userId}</td><td>${s.planId}</td><td>${s.status}</td><td>${s.expiresAt}</td><td>${s.subscriptionUrl || "-"}</td><td><button data-id="${s.userId}">Delete</button></td>`;
    tr.querySelector("button").onclick = async () => {
      await deleteJson(`admin/subscriptions/${s.userId}`);
      await refreshSubs();
      await refreshDashboard();
    };
    tbody.appendChild(tr);
  });
}
$("#refresh-subs").onclick = refreshSubs;

async function refreshAudit() {
  const out = await getJson("admin/audit?limit=100");
  const tbody = $("#audit-table tbody");
  tbody.innerHTML = "";
  (out.data || []).forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${row.createdAt}</td><td>${row.actor}</td><td>${row.action}</td><td>${row.target}</td>`;
    tbody.appendChild(tr);
  });
}
$("#refresh-audit").onclick = refreshAudit;

async function refreshPromos() {
  const out = await getJson("admin/promos");
  const tbody = $("#promos-table tbody");
  tbody.innerHTML = "";
  (out.data || []).forEach((p) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${p.code}</td><td>${p.kind}</td><td>${p.valueMinor ?? p.valueDays ?? "-"}</td><td>${p.usedCount}</td><td>${p.active}</td>`;
    tbody.appendChild(tr);
  });
}
$("#refresh-promos").onclick = refreshPromos;
$("#promo-form").onsubmit = async (e) => {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(e.target).entries());
  body.valueMinor = body.valueMinor ? Number(body.valueMinor) : null;
  body.valueDays = body.valueDays ? Number(body.valueDays) : null;
  body.maxUses = body.maxUses ? Number(body.maxUses) : null;
  body.active = body.active === "true";
  await postJson("admin/promos", body);
  await refreshPromos();
};

async function refreshCampaigns() {
  const out = await getJson("admin/campaigns");
  const tbody = $("#campaigns-table tbody");
  tbody.innerHTML = "";
  (out.data || []).forEach((c) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${c.id}</td><td>${c.name}</td><td>${c.channel}</td><td>${c.active}</td>`;
    tbody.appendChild(tr);
  });
}
$("#refresh-campaigns").onclick = refreshCampaigns;
$("#campaign-form").onsubmit = async (e) => {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(e.target).entries());
  body.active = body.active === "true";
  body.payload = JSON.parse(body.payload || "{}");
  await postJson("admin/campaigns", body);
  await refreshCampaigns();
};
$("#create-broadcast").onclick = async () => {
  const out = await postJson("admin/broadcasts", { payload: { source: "admin-ui" } });
  $("#broadcast-out").textContent = JSON.stringify(out, null, 2);
};

async function refreshPolicies() {
  const out = await getJson("admin/channel-policies");
  const tbody = $("#policies-table tbody");
  tbody.innerHTML = "";
  (out.data || []).forEach((p) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${p.code}</td><td>${JSON.stringify(p.payload)}</td><td>${p.active}</td>`;
    tbody.appendChild(tr);
  });
}
$("#refresh-policies").onclick = refreshPolicies;
$("#policy-form").onsubmit = async (e) => {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(e.target).entries());
  body.active = body.active === "true";
  body.payload = JSON.parse(body.payload || "{}");
  await postJson("admin/channel-policies", body);
  await refreshPolicies();
};

async function refreshIncidents() {
  const out = await getJson("admin/incidents?limit=100");
  const tbody = $("#incidents-table tbody");
  tbody.innerHTML = "";
  (out.data || []).forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${row.createdAt}</td><td>${row.level}</td><td>${row.source}</td><td>${row.message}</td>`;
    tbody.appendChild(tr);
  });
}
$("#refresh-incidents").onclick = refreshIncidents;

async function refreshAnalytics() {
  const out = await getJson("admin/analytics/summary");
  $("#analytics-out").textContent = JSON.stringify(out, null, 2);
}
$("#refresh-analytics").onclick = refreshAnalytics;

Promise.all([
  refreshDashboard(),
  refreshPlans(),
  refreshProfiles(),
  refreshInstructions(),
  refreshUsers(),
  refreshSubs(),
  refreshAudit(),
  refreshPromos(),
  refreshCampaigns(),
  refreshPolicies(),
  refreshIncidents(),
  refreshAnalytics(),
  refreshPasarSettings().then(() => refreshPasarTemplates()),
  refreshPasarStatus()
]);
