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

async function authFlow() {
  const choice = prompt("Аккаунт Profit Radar:\n1 — Войти\n2 — Создать аккаунт\n3 — Восстановить пароль");
  if (choice === "1") return login();
  if (choice === "2") return signUp();
  if (choice === "3") return resetPassword();
  if (choice !== null) toast("Выберите 1, 2 или 3.");
}

async function login() {
  const email = prompt("Введите email аккаунта:");
  if (!email?.trim()) return;
  const password = prompt("Введите пароль:");
  if (!password) return;

  const {data,error} = await db.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password
  });

  if (error) {
    const message = error.message.toLowerCase().includes("invalid login credentials")
      ? "Неверный email или пароль. Если аккаунта ещё нет, выберите «Создать аккаунт»."
      : error.message;
    toast("Ошибка входа: " + message);
    return;
  }

  user = data.user;
  updateProfile();
  await loadCompany();
  toast("Вы успешно вошли!");
}

async function signUp() {
  const email = prompt("Введите email для нового аккаунта:");
  if (!email?.trim()) return;
  const password = prompt("Придумайте пароль (минимум 6 символов):");
  if (!password) return;
  if (password.length < 6) {
    toast("Пароль должен содержать минимум 6 символов.");
    return;
  }

  const {data,error} = await db.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: { emailRedirectTo: window.location.origin }
  });

  if (error) {
    const message = error.message.toLowerCase().includes("already registered")
      ? "Этот email уже зарегистрирован. Выберите «Войти» или восстановите пароль."
      : error.message;
    toast("Ошибка регистрации: " + message);
    return;
  }

  if (data.session && data.user) {
    user = data.user;
    updateProfile();
    toast("Аккаунт создан. Выполняю вход…");
    await loadCompany();
  } else {
    toast("Аккаунт почти готов! Откройте письмо от Supabase и подтвердите email, затем войдите.");
  }
}

async function resetPassword() {
  const email = prompt("Введите email аккаунта для восстановления пароля:");
  if (!email?.trim()) return;
  const {error} = await db.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: window.location.origin
  });
  if (error) {
    toast("Ошибка восстановления: " + error.message);
    return;
  }
  toast("Письмо для восстановления пароля отправлено на вашу почту.");
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

if ($("authBtn")) $("authBtn").onclick = authFlow;
if ($("settingsAuth")) $("settingsAuth").onclick = authFlow;

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


const moduleCache={products:[],customers:[],documents:[]};
const moduleConfig={
 products:{table:"products",page:"inventory",cols:[["name","Товар"],["sku","Артикул"],["category","Категория"],["quantity","Остаток"],["price","Цена"]]},
 customers:{table:"customers",page:"customers",cols:[["name","Клиент"],["company_name","Компания"],["email","Email"],["phone","Телефон"]]},
 documents:{table:"business_documents",page:"documents",cols:[["name","Документ"],["kind","Тип"],["created_at","Создан"]]}
};
function setupModule(k){
 const c=moduleConfig[k],p=$("page-"+c.page); if(!p)return;
 let panel=p.querySelector(".table-panel"); if(!panel){panel=document.createElement("article");panel.className="panel table-panel full-panel";p.appendChild(panel);}
 panel.innerHTML='<div class="panel-head"><div><h2>Записи компании</h2><p>Облачные данные компании</p></div><input class="table-search" id="'+k+'Search" placeholder="Поиск…"></div><div class="table-scroll"><table><thead><tr>'+c.cols.map(x=>'<th>'+x[1]+'</th>').join("")+'<th>ДЕЙСТВИЯ</th></tr></thead><tbody id="'+k+'Rows"></tbody></table></div>';
 $(k+"Search").oninput=e=>renderModule(k,e.target.value);
}
function renderModule(k,q){
 const c=moduleConfig[k],b=$(k+"Rows");if(!b)return;
 const rows=moduleCache[k].filter(r=>c.cols.some(x=>String(r[x[0]]??"").toLowerCase().includes((q||"").toLowerCase())));
 b.innerHTML=rows.map(r=>'<tr>'+c.cols.map(x=>'<td>'+esc(r[x[0]]??"")+'</td>').join("")+'<td><button class="link-btn" data-remove="'+esc(r.id)+'">Удалить</button></td></tr>').join("")||'<tr><td colspan="'+(c.cols.length+1)+'">Записей пока нет</td></tr>';
 b.querySelectorAll("[data-remove]").forEach(btn=>btn.onclick=()=>removeModule(k,btn.dataset.remove));
}
async function loadModule(k){
 if(!company){moduleCache[k]=[];renderModule(k);return;}
 const {data,error}=await db.from(moduleConfig[k].table).select("*").eq("company_id",company.id).order("created_at",{ascending:false});
 if(error){toast("Ошибка загрузки: "+error.message);return;}moduleCache[k]=data||[];renderModule(k);
}
async function addModule(k){
 if(!user||!company){toast("Сначала войдите и создайте компанию.");return;}
 const r={company_id:company.id};
 if(k==="products"){
  const name=prompt("Название товара:");if(!name?.trim())return;
  Object.assign(r,{name:name.trim(),sku:prompt("Артикул:")||"",category:prompt("Категория:")||"Другое",quantity:Number(prompt("Количество:","0")),price:Number(prompt("Цена за единицу (€):","0"))});
 }else if(k==="customers"){
  const name=prompt("Имя клиента / название компании:");if(!name?.trim())return;
  Object.assign(r,{name:name.trim(),company_name:prompt("Компания:")||"",email:prompt("Email:")||"",phone:prompt("Телефон:")||""});
 }else{
  const name=prompt("Название документа:");if(!name?.trim())return;
  Object.assign(r,{name:name.trim(),kind:prompt("Тип документа:","Счёт")||"Другое",notes:prompt("Описание или ссылка на файл:")||""});
 }
 if((k==="products")&&(!Number.isFinite(r.quantity)||r.quantity<0||!Number.isFinite(r.price)||r.price<0)){toast("Количество и цена должны быть неотрицательными числами.");return;}
 const {error}=await db.from(moduleConfig[k].table).insert(r);if(error){toast("Ошибка сохранения: "+error.message);return;}
 await loadModule(k);toast("Сохранено в облачной базе.");
}
async function removeModule(k,id){
 if(!confirm("Удалить запись?"))return;
 const {error}=await db.from(moduleConfig[k].table).delete().eq("id",id).eq("company_id",company.id);
 if(error){toast("Ошибка удаления: "+error.message);return;}await loadModule(k);toast("Запись удалена.");
}
function installModules(){
 ["products","customers","documents"].forEach(setupModule);
 if($("addProduct"))$("addProduct").onclick=()=>addModule("products");
 if($("addCustomer"))$("addCustomer").onclick=()=>addModule("customers");
 if($("addDocument"))$("addDocument").onclick=()=>addModule("documents");
 if($("helpBtn"))$("helpBtn").onclick=()=>alert("Profit Radar: создайте аккаунт и компанию, затем добавляйте операции, товары и клиентов. Экспорт финансов доступен в аналитике.");
 if($("searchBtn"))$("searchBtn").onclick=()=>{const q=prompt("Поиск по операциям, товарам и клиентам:");if(!q)return;const a=[];transactions.filter(x=>(x.name+" "+(x.category||"")).toLowerCase().includes(q.toLowerCase())).forEach(x=>a.push("Финансы: "+x.name));Object.keys(moduleCache).forEach(k=>moduleCache[k].filter(x=>JSON.stringify(x).toLowerCase().includes(q.toLowerCase())).forEach(x=>a.push(k+": "+x.name)));alert(a.join("\n")||"Ничего не найдено.");};
 const bell=document.querySelector(".notification");if(bell)bell.onclick=()=>alert(user?"Новых уведомлений пока нет.":"Войдите в аккаунт, чтобы использовать уведомления.");
 const avatar=document.querySelector(".top-avatar");if(avatar)avatar.onclick=authFlow;
}
const originalLoadCompany=loadCompany;
loadCompany=async function(){await originalLoadCompany();if(company)await Promise.all(["products","customers","documents"].map(loadModule));};
installModules();

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
