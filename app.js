(() => {
"use strict";

const SUPABASE_URL = "https://lrwvmqdtfssxiqfyehyd.supabase.co";
const SUPABASE_KEY = "sb_publishable_EzTtzLmOW0dvvLA9wCwmiA_O2Zo1Uv6";

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = id => document.getElementById(id);

let user = null;
let company = null;
let transactions = [];
let tasks = JSON.parse(localStorage.getItem("pr_tasks") || "[]");

const money = n => "€" + Number(n || 0).toLocaleString("ru-RU", {
  maximumFractionDigits: 2
});

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({
  "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
}[c]));

function toast(message) {
  const el = $("toast");
  if (!el) {
    alert(message);
    return;
  }
  el.textContent = message;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 3000);
}

// Дизайн
document.title = "Profit Radar — Финансовая система";

const colors = {
  "--bg":"#050907",
  "--panel":"#0d1711",
  "--panel2":"#122219",
  "--line":"#1b3526",
  "--text":"#effaf2",
  "--muted":"#84998b",
  "--green":"#42e58b",
  "--green2":"#1ca85d",
  "--orange":"#42e58b",
  "--blue":"#42e58b",
  "--purple":"#42e58b"
};

Object.entries(colors).forEach(([k,v]) =>
  document.documentElement.style.setProperty(k,v)
);

const brand = document.querySelector(".brand");
if (brand) {
  brand.innerHTML =
    '<span class="brand-mark">P<span>.</span></span>' +
    '<span><b>PROFIT RADAR</b><small>FINANCE CONTROL</small></span>';
}

document.querySelectorAll(".demo-pill").forEach(el => {
  el.textContent = "ОБЛАЧНЫЕ ДАННЫЕ";
});

// Аккаунт
function updateProfile() {
  if ($("profileName"))
    $("profileName").textContent = user?.email?.split("@")[0] || "Гость";

  if ($("profileEmail"))
    $("profileEmail").textContent = user?.email || "Войдите в аккаунт";
}

async function login() {
  const email = prompt("Введите email:");
  if (!email) return;

  const password = prompt("Введите пароль:");
  if (!password) return;

  const {data,error} = await db.auth.signInWithPassword({
    email: email.trim(),
    password
  });

  if (error) {
    toast("Ошибка входа: " + error.message);
    return;
  }

  user = data.user;
  updateProfile();
  await loadCompany();
}

// Создание и загрузка компании
function updateWorkspace() {
  const el = document.querySelector(".workspace");
  if (!el) return;

  el.innerHTML =
    "<span class='workspace-icon'>◈</span>" +
    "<span><b>" + esc(company?.name || "Нет компании") +
    "</b><small>" +
    (company ? "Облачное пространство" : "Создайте компанию") +
    "</small></span>";
}

async function loadCompany() {
  if (!user) return;

  const {data,error} = await db
    .from("company_members")
    .select("company_id,role")
    .eq("user_id",user.id)
    .limit(1)
    .maybeSingle();

  if (error) {
    toast("Ошибка поиска компании: " + error.message);
    return;
  }

  if (!data) {
    company = null;
    updateWorkspace();

    if (confirm("Компания ещё не создана. Создать сейчас?")) {
      await createCompany();
    }
    return;
  }

  const result = await db
    .from("companies")
    .select("id,name,created_by")
    .eq("id",data.company_id)
    .single();

  if (result.error) {
    toast("Ошибка загрузки компании: " + result.error.message);
    return;
  }

  company = result.data;
  updateWorkspace();
  await loadTransactions();
}

async function createCompany() {
  if (!user) {
    toast("Сначала войдите в аккаунт.");
    return;
  }

  const name = prompt("Название компании:");
  if (!name?.trim()) return;

  const {data,error} = await db
    .from("companies")
    .insert({
      name: name.trim(),
      created_by: user.id
    })
    .select("id,name,created_by")
    .single();

  if (error) {
    toast("Ошибка создания компании: " + error.message);
    return;
  }

  const membership = await db
    .from("company_members")
    .insert({
      company_id: data.id,
      user_id: user.id,
      role: "owner"
    });

  if (membership.error) {
    toast("Компания создана, но не удалось добавить владельца: " +
      membership.error.message);
    return;
  }

  company = data;
  updateWorkspace();
  await loadTransactions();
  toast("Компания успешно создана!");
}

// Финансы
async function loadTransactions() {
  if (!company) return;

  const {data,error} = await db
    .from("transactions")
    .select("*")
    .eq("company_id",company.id)
    .order("created_at",{ascending:false});

  if (error) {
    toast("Ошибка загрузки операций: " + error.message);
    return;
  }

  transactions = data || [];
  renderFinance();
}

function renderFinance() {
  const income = transactions
    .filter(x => x.type === "income")
    .reduce((s,x) => s + Number(x.amount || 0),0);

  const expense = transactions
    .filter(x => x.type === "expense")
    .reduce((s,x) => s + Number(x.amount || 0),0);

  const values = {
    totalIncome: income,
    financeIncome: income,
    totalExpense: expense,
    financeExpense: expense,
    totalProfit: income-expense,
    financeBalance: income-expense
  };

  Object.entries(values).forEach(([id,value]) => {
    if ($(id)) $(id).textContent = money(value);
  });

  if ($("recentRows")) {
    $("recentRows").innerHTML = transactions.slice(0,5).map(x =>
      `<tr>
        <td><b>${esc(x.name)}</b></td>
        <td>${esc(x.date || "")}</td>
        <td>${esc(x.category || "Другое")}</td>
        <td>${money(x.amount)}</td>
        <td>Сохранено</td>
      </tr>`
    ).join("");
  }

  renderFinanceRows();
  renderAnalytics();
}

function renderAnalytics() {
  const income = transactions.filter(x => x.type === "income").reduce((s,x) => s + Number(x.amount || 0),0);
  const expense = transactions.filter(x => x.type === "expense").reduce((s,x) => s + Number(x.amount || 0),0);
  const profit = income - expense;
  const incomeOps = transactions.filter(x => x.type === "income");
  const margin = income > 0 ? (profit / income * 100) : 0;
  const average = incomeOps.length ? income / incomeOps.length : 0;
  const set = (id,value) => { if ($(id)) $(id).textContent = value; };
  set("analyticsMargin", income > 0 ? margin.toLocaleString("ru-RU",{maximumFractionDigits:1}) + "%" : "—");
  set("analyticsAverage", incomeOps.length ? money(average) : "—");
  set("analyticsConversion", "Нет данных");
  set("analyticsRevenue", money(income));
  set("analyticsProfit", money(profit));
  set("analyticsExpense", money(expense));
  set("analyticsSalesPlan", "—");
  const bars = $("analyticsBars");
  if (bars) {
    const max = Math.max(income,expense,Math.abs(profit),1);
    bars.querySelectorAll("[data-analytics-bar]").forEach(el => {
      const key = el.dataset.analyticsBar;
      const value = key === "income" ? income : key === "profit" ? Math.max(0,profit) : expense;
      el.style.setProperty("--w", Math.max(0,Math.min(100,value/max*100)) + "%");
    });
  }
}

function renderFinanceRows(query = "") {
  if (!$("financeRows")) return;

  $("financeRows").innerHTML = transactions
    .filter(x => (x.name + " " + (x.category || ""))
      .toLowerCase().includes(query.toLowerCase()))
    .map(x => `
      <tr>
        <td>${esc(x.name)}</td>
        <td>${esc(x.date || "")}</td>
        <td>${esc(x.category || "Другое")}</td>
        <td>${x.type === "income" ? "Доход" : "Расход"}</td>
        <td>${money(x.amount)}</td>
      </tr>
    `).join("");
}

// Добавление операции
async function addTransaction(event) {
  event.preventDefault();

  if (!company || !user) {
    toast("Сначала войдите и создайте компанию.");
    return;
  }

  const name = $("opName").value.trim();
  const amount = Number($("opAmount").value);

  if (!name || amount <= 0) {
    toast("Проверьте название и сумму.");
    return;
  }

  const {error} = await db.from("transactions").insert({
    company_id: company.id,
    name,
    date: new Date().toISOString().slice(0,10),
    category: $("opCategory").value.trim() || "Другое",
    type: $("opType").value,
    amount
  });

  if (error) {
    toast("Ошибка сохранения: " + error.message);
    return;
  }

  await loadTransactions();

  $("operationForm").reset();
  $("modalBackdrop")?.classList.remove("open");
  toast("Операция сохранена!");
}

// Навигация
const titles = {
  overview:"Обзор",
  finance:"Финансы",
  inventory:"Склад",
  customers:"Клиенты",
  documents:"Документы",
  analytics:"Аналитика",
  planning:"Планирование",
  settings:"Настройки"
};

function navigate(page) {
  document.querySelectorAll(".page").forEach(x =>
    x.classList.remove("active")
  );

  $("page-" + page)?.classList.add("active");

  document.querySelectorAll(".nav-item").forEach(x =>
    x.classList.toggle("active",x.dataset.page === page)
  );

  if ($("crumbName")) $("crumbName").textContent = titles[page] || page;
  $("sidebar")?.classList.remove("open");
}

document.querySelectorAll(".nav-item").forEach(x => {
  x.onclick = () => navigate(x.dataset.page);
});

document.querySelectorAll("[data-goto]").forEach(x => {
  x.onclick = () => navigate(x.dataset.goto);
});

if ($("menuBtn")) {
  $("menuBtn").onclick = () => $("sidebar")?.classList.toggle("open");
}

if ($("authBtn")) $("authBtn").onclick = login;
if ($("settingsAuth")) $("settingsAuth").onclick = login;

if ($("operationForm")) {
  $("operationForm").addEventListener("submit",addTransaction);
}

if ($("quickAdd")) {
  $("quickAdd").onclick = () => {
    if (!user || !company) return toast("Сначала войдите и создайте компанию.");
    $("modalBackdrop")?.classList.add("open");
  };
}

if ($("financeAdd")) {
  $("financeAdd").onclick = () => $("quickAdd")?.click();
}

if ($("modalClose")) {
  $("modalClose").onclick = () => $("modalBackdrop")?.classList.remove("open");
}

if ($("financeSearch")) {
  $("financeSearch").addEventListener("input",e =>
    renderFinanceRows(e.target.value)
  );
}

// Задачи
function renderTasks() {
  const html = tasks.map((t,i) => `
    <label class="task">
      <input type="checkbox" data-task="${i}" ${t.done ? "checked" : ""}>
      <span>${esc(t.name)}</span>
    </label>
  `).join("");

  if ($("taskList")) $("taskList").innerHTML = html;
  if ($("planningList")) $("planningList").innerHTML = html;

  document.querySelectorAll("[data-task]").forEach(x => {
    x.onchange = () => {
      tasks[Number(x.dataset.task)].done = x.checked;
      localStorage.setItem("pr_tasks",JSON.stringify(tasks));
      renderTasks();
    };
  });
}

function addTask() {
  const name = prompt("Название задачи:");
  if (!name?.trim()) return;

  tasks.push({name:name.trim(),done:false});
  localStorage.setItem("pr_tasks",JSON.stringify(tasks));
  renderTasks();
}

if ($("addTask")) $("addTask").onclick = addTask;
if ($("planningTask")) $("planningTask").onclick = addTask;

// Экспорт
if ($("exportCsv")) {
  $("exportCsv").onclick = () => {
    const rows = [
      ["Название","Дата","Категория","Тип","Сумма"],
      ...transactions.map(x => [
        x.name,x.date,x.category,x.type,x.amount
      ])
    ];

    const csv = "\uFEFF" + rows.map(row =>
      row.map(v => '"' + String(v ?? "").replace(/"/g,'""') + '"')
        .join(";")
    ).join("\n");

    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob([csv],{type:"text/csv;charset=utf-8"})
    );
    a.download = "profit-radar.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };
}

// Запуск
async function init() {
  updateProfile();
  updateWorkspace();
  renderFinance();
  renderTasks();

  const {data,error} = await db.auth.getUser();

  if (error) {
    toast("Ошибка проверки аккаунта: " + error.message);
    return;
  }

  user = data.user;

  updateProfile();

  if (user) await loadCompany();

  db.auth.onAuthStateChange((_event,session) => {
    user = session?.user || null;
    updateProfile();

    if (user) {
      setTimeout(loadCompany,100);
    } else {
      company = null;
      transactions = [];
      updateWorkspace();
      renderFinance();
    }
  });
}

init();

})();
