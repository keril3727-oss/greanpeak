(() => {
"use strict";

const SUPABASE_URL = "https://lrwvmqdtfssxiqfyehyd.supabase.co";
const SUPABASE_KEY = "sb_publishable_EzTtzLmOW0dvvLA9wCwmiA_O2Zo1Uv6";

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = id => document.getElementById(id);

// Keep native browser focus behavior so Android opens the keyboard from a real tap.

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
  if (!el) { console.info(message); return; }
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


function showForm(title, description, fields, submitText="Сохранить") {
 return new Promise(resolve=>{
  document.querySelector(".pr-form-backdrop")?.remove();
  const backdrop=document.createElement("div");backdrop.className="pr-form-backdrop";
  const inputs=fields.map((f,i)=>{const id="pr-field-"+i;
   if(f.type==="select")return '<label class="pr-field" for="'+id+'">'+esc(f.label)+'<select id="'+id+'" '+(f.required?"required":"")+'>'+f.options.map(o=>'<option value="'+esc(o.value)+'" '+(o.value===f.value?"selected":"")+'>'+esc(o.label)+'</option>').join("")+'</select></label>';
   return '<label class="pr-field" for="'+id+'">'+esc(f.label)+'<input id="'+id+'" type="'+(f.type||"text")+'" placeholder="'+esc(f.placeholder||"")+'" value="'+esc(f.value??"")+'" '+(f.required?"required":"")+' '+(f.min!==undefined?'min="'+f.min+'"':"")+' '+(f.step!==undefined?'step="'+f.step+'"':"")+' '+(f.autocomplete?'autocomplete="'+f.autocomplete+'"':"")+' '+(f.inputmode?'inputmode="'+f.inputmode+'"':"")+'></label>';
  }).join("");
  backdrop.innerHTML='<div class="pr-form-card" role="dialog" aria-modal="true"><button type="button" class="pr-form-close">×</button><div class="pr-form-kicker">PROFIT RADAR</div><h2>'+esc(title)+'</h2><p>'+esc(description||"Заполните поля ниже.")+'</p><form class="pr-form">'+inputs+'<button class="pr-form-submit" type="submit">'+esc(submitText)+'</button></form></div>';
  document.body.appendChild(backdrop);
  const close=()=>{backdrop.remove();resolve(null);};
  backdrop.querySelector(".pr-form-close").onclick=close;backdrop.addEventListener("click",e=>{if(e.target===backdrop)close();});
  backdrop.querySelector("form").onsubmit=e=>{e.preventDefault();const values={};fields.forEach((f,i)=>{const el=backdrop.querySelector("#pr-field-"+i);values[f.name]=f.type==="number"?Number(el.value):el.value.trim();});backdrop.remove();resolve(values);};
  // На мобильных браузерах не вызываем focus() автоматически:
  // это может открыть системную панель/буфер обмена вместо клавиатуры.
  // Пользователь сам выбирает поле и открывает клавиатуру касанием.
 });
}
function showConfirm(title,description,confirmText="Подтвердить"){
 return new Promise(resolve=>{const b=document.createElement("div");b.className="pr-form-backdrop";b.innerHTML='<div class="pr-form-card" role="dialog" aria-modal="true"><button class="pr-form-close" type="button">×</button><div class="pr-form-kicker">PROFIT RADAR</div><h2>'+esc(title)+'</h2><p>'+esc(description)+'</p><div class="pr-form-actions"><button type="button" class="pr-form-cancel">Отмена</button><button type="button" class="pr-form-submit">'+esc(confirmText)+'</button></div></div>';document.body.appendChild(b);const done=v=>{b.remove();resolve(v);};b.querySelector(".pr-form-close").onclick=()=>done(false);b.querySelector(".pr-form-cancel").onclick=()=>done(false);b.querySelector(".pr-form-submit").onclick=()=>done(true);b.addEventListener("click",e=>{if(e.target===b)done(false);});});
}
// Аккаунт
function updateProfile() {
  if ($("profileName"))
    $("profileName").textContent = user?.email?.split("@")[0] || "Гость";

  if ($("profileEmail"))
    $("profileEmail").textContent = user?.email || "Войдите в аккаунт";
}

async function authFlow(){
 const v=await showForm("Ваш аккаунт","Выберите действие.",[{name:"action",label:"Что хотите сделать?",type:"select",value:"login",options:[{value:"login",label:"Войти"},{value:"signup",label:"Создать аккаунт"},{value:"reset",label:"Восстановить пароль"}]}],"Продолжить");if(!v)return;
 if(v.action==="login")return login();if(v.action==="signup")return signUp();return resetPassword();
}
async function login(){const v=await showForm("Вход в аккаунт","Введите данные вашего аккаунта.",[{name:"email",label:"Email",type:"email",required:true,autocomplete:"email",inputmode:"email",placeholder:"name@example.com"},{name:"password",label:"Пароль",type:"password",required:true,autocomplete:"current-password"}],"Войти");if(!v)return;
 const {data,error}=await db.auth.signInWithPassword({email:v.email.toLowerCase(),password:v.password});
 if(error){const m=error.message.toLowerCase().includes("invalid login credentials")?"Неверный email или пароль. Если аккаунта ещё нет, выберите «Создать аккаунт».":error.message;toast("Ошибка входа: "+m);return;}user=data.user;updateProfile();await loadCompany();toast("Вы успешно вошли!");
}
async function signUp(){const v=await showForm("Создать аккаунт","Укажите email и придумайте пароль от 6 символов.",[{name:"email",label:"Email",type:"email",required:true,autocomplete:"email",inputmode:"email",placeholder:"name@example.com"},{name:"password",label:"Пароль",type:"password",required:true,autocomplete:"new-password"}],"Создать аккаунт");if(!v)return;
 if(v.password.length<6){toast("Пароль должен содержать минимум 6 символов.");return;}const {data,error}=await db.auth.signUp({email:v.email.toLowerCase(),password:v.password,options:{emailRedirectTo:window.location.origin}});
 if(error){const m=error.message.toLowerCase().includes("already registered")?"Этот email уже зарегистрирован. Выберите «Войти» или восстановите пароль.":error.message;toast("Ошибка регистрации: "+m);return;}
 if(data.session&&data.user){user=data.user;updateProfile();toast("Аккаунт создан. Выполняю вход…");await loadCompany();}else toast("Аккаунт почти готов! Откройте письмо от Supabase и подтвердите email, затем войдите.");
}
async function resetPassword(){const v=await showForm("Восстановить пароль","Отправим ссылку для восстановления на вашу почту.",[{name:"email",label:"Email аккаунта",type:"email",required:true,autocomplete:"email",inputmode:"email"}],"Отправить ссылку");if(!v)return;
 const {error}=await db.auth.resetPasswordForEmail(v.email.toLowerCase(),{redirectTo:window.location.origin});if(error){toast("Ошибка восстановления: "+error.message);return;}toast("Письмо для восстановления пароля отправлено на вашу почту.");
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

    if (await showConfirm("Компания ещё не создана","Создать рабочее пространство для вашего бизнеса?","Создать компанию")) {
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

  const values=await showForm("Новая компания","Создайте рабочее пространство для учёта бизнеса.",[{name:"name",label:"Название компании",required:true,placeholder:"Например, Coffee Point"}],"Создать компанию");if(!values)return;const name=values.name;

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

async function addTask(){const v=await showForm("Новая задача","Добавьте дело в планирование.",[{name:"name",label:"Название задачи",required:true,placeholder:"Например, проверить выручку"}],"Добавить задачу");if(!v)return;tasks.push({name:v.name,done:false});localStorage.setItem("pr_tasks",JSON.stringify(tasks));renderTasks();}

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
 let fields=[],title="";
 if(k==="products"){title="Новый товар";fields=[{name:"name",label:"Название товара",required:true},{name:"sku",label:"Артикул"},{name:"category",label:"Категория"},{name:"quantity",label:"Количество",type:"number",required:true,min:0,step:"1",value:0,inputmode:"decimal"},{name:"price",label:"Цена за единицу (€)",type:"number",required:true,min:0,step:"0.01",value:0,inputmode:"decimal"}];}
 else if(k==="customers"){title="Новый клиент";fields=[{name:"name",label:"Имя клиента / компания",required:true},{name:"company_name",label:"Компания"},{name:"email",label:"Email",type:"email",inputmode:"email"},{name:"phone",label:"Телефон",type:"tel",inputmode:"tel"}];}
 else{title="Новый документ";fields=[{name:"name",label:"Название документа",required:true},{name:"kind",label:"Тип документа",value:"Счёт"},{name:"notes",label:"Описание или ссылка"}];}
 const v=await showForm(title,"Данные сохранятся в облачной базе компании.",fields,"Сохранить");if(!v)return;const r={company_id:company.id,...v};
 if(k==="products"&&(!Number.isFinite(r.quantity)||r.quantity<0||!Number.isFinite(r.price)||r.price<0)){toast("Количество и цена должны быть неотрицательными числами.");return;}
 if(k==="products")r.category=r.category||"Другое";if(k==="documents")r.kind=r.kind||"Другое";
 const {error}=await db.from(moduleConfig[k].table).insert(r);if(error){toast("Ошибка сохранения: "+error.message);return;}await loadModule(k);toast("Сохранено в облачной базе.");
}
async function removeModule(k,id){if(!await showConfirm("Удалить запись?","Эту запись нельзя будет восстановить.","Удалить"))return;const {error}=await db.from(moduleConfig[k].table).delete().eq("id",id).eq("company_id",company.id);if(error){toast("Ошибка удаления: "+error.message);return;}await loadModule(k);toast("Запись удалена.");}

function installModules(){
 ["products","customers","documents"].forEach(setupModule);
 if($("addProduct"))$("addProduct").onclick=()=>addModule("products");
 if($("addCustomer"))$("addCustomer").onclick=()=>addModule("customers");
 if($("addDocument"))$("addDocument").onclick=()=>addModule("documents");
 if($("helpBtn"))$("helpBtn").onclick=()=>toast("Создайте аккаунт и компанию, затем добавляйте операции, товары и клиентов. Экспорт доступен в аналитике.");
 if($("searchBtn"))$("searchBtn").onclick=async()=>{const v=await showForm("Поиск","Найдите операции, товары или клиентов.",[{name:"q",label:"Что ищем?",required:true}],"Найти");if(!v)return;const q=v.q.toLowerCase(),found=[];transactions.filter(x=>(x.name+" "+(x.category||"")).toLowerCase().includes(q)).forEach(x=>found.push("Финансы: "+x.name));Object.keys(moduleCache).forEach(k=>moduleCache[k].filter(x=>JSON.stringify(x).toLowerCase().includes(q)).forEach(x=>found.push(k+": "+x.name)));toast(found.length?found.slice(0,3).join(" • "):"Ничего не найдено.");};
 const bell=document.querySelector(".notification");if(bell)bell.onclick=()=>toast(user?"Новых уведомлений пока нет.":"Войдите в аккаунт, чтобы использовать уведомления.");
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
