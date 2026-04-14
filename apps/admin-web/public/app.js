const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

async function getJson(path) {
  const r = await fetch(`/api/proxy/${path}`);
  return r.json();
}
async function postJson(path, body) {
  const r = await fetch(`/api/proxy/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return r.json();
}
async function deleteJson(path) {
  const r = await fetch(`/api/proxy/${path}`, { method: "DELETE" });
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
  const out = await postJson("admin/pasarguard/connect", payload);
  $("#pasar-out").textContent = JSON.stringify(out, null, 2);
};

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
    tr.innerHTML = `<td>${s.userId}</td><td>${s.planId}</td><td>${s.status}</td><td>${s.expiresAt}</td><td>${s.subscriptionUrl || "-"}</td>`;
    tbody.appendChild(tr);
  });
}
$("#refresh-subs").onclick = refreshSubs;

Promise.all([refreshDashboard(), refreshPlans(), refreshInstructions(), refreshUsers(), refreshSubs()]);
