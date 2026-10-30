// Profit Radar — облачный кабинет
(() => {
"use strict";
const URL="https://lrwvmqdtfssxiqfyehyd.supabase.co";
const KEY="sb_publishable_EzTtzLmOW0dvvLA9wCwmiA_O2Zo1Uv6";
const db=window.supabase?.createClient(URL,KEY), $=id=>document.getElementById(id);
let user=null,company=null,transactions=[],tasks=JSON.parse(localStorage.getItem("pr_tasks")||"[]");
const euro=n=>"€"+Number(n||0).toLocaleString("ru-RU",{maximumFractionDigits:2});
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function toast(s){const t=$("toast");if(t){t.textContent=s;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),3000)}}

document.title="Profit Radar — Финансовая система";
const root=document.documentElement;
Object.entries({"--bg":"#050907","--panel":"#0d1711","--panel2":"#122219","--line":"#1b3526","--text":"#effaf2","--muted":"#84998b","--green":"#42e58b","--green2":"#1ca85d","--orange":"#42e58b","--blue":"#42e58b","--purple":"#42e58b"}).forEach(([k,v])=>root.style.setProperty(k,v));
const brand=document.querySelector(".brand");
if(brand){brand.setAttribute("aria-label","Profit Radar");brand.innerHTML='<span class="brand-mark">P<span>.</span></span><span><b>PROFIT RADAR</b><small>FINANCE CONTROL</small></span>'}
document.querySelectorAll(".demo-pill").forEach(x=>x.innerHTML="<i></i> ОБЛАЧНЫЕ ДАННЫЕ");
document.querySelectorAll(".help-card p").forEach(x=>x.textContent="Помощь по работе с Profit Radar.");
document.querySelectorAll(".modal .overline").forEach(x=>x.textContent="PROFIT RADAR");
document.querySelectorAll(".demo-note").forEach(x=>x.textContent="Отображаются реальные операции выбранной компании. Демонстрационные суммы отключены.");
document.querySelectorAll(".orange-icon,.blue-icon,.purple-icon").forEach(x=>{x.style.background="#153a25";x.style.color="#42e58b"});

function profile(){ $("profileName").textContent=user?.email?.split("@")[0]||"Гость Profit Radar";$("profileEmail").textContent=user?.email||"Войдите в аккаунт"; }
function workspace(){const w=document.querySelector(".workspace");if(w)w.innerHTML='<span class="workspace-icon">◈</span><span><b>'+esc(company?.name||"Нет компании")+'</b><small>'+(company?"Облачное пространство":"Войдите и создайте компанию")+'</small></span><span class="dots">•••</span>'}
async function login(){
 if(!db)return toast("Supabase не загрузился.");
 const email=prompt("Введите email:");if(!email)return;
 const password=prompt("Введите пароль (минимум 6 символов):");if(!password)return;
 try{
  let r=await db.auth.signInWithPassword({email:email.trim(),password});
  if(r.error){
   if(!confirm("Войти не удалось. Создать аккаунт с этим email?"))throw r.error;
   r=await db.auth.signUp({email:email.trim(),password,options:{emailRedirectTo:location.origin}});
   if(r.error)throw r.error;
   if(!r.data.session)return toast("Аккаунт создан. Подтвердите email в письме, затем войдите.");
  }
  user=r.data.user;profile();await loadCompany();
 }catch(e){toast(e.message||"Ошибка авторизации")}
}
async function loadCompany(){
 if(!user)return;
 try{
  const m=await db.from("company_members").select("company_id,role").eq("user_id",user.id).limit(1).maybeSingle();
  if(m.error)throw m.error;
  if(!m.data){company=null;transactions=[];workspace();render();if(confirm("У вас пока нет компании. Создать?"))await createCompany();return}
  const c=await db.from("companies").select("id,name,created_by").eq("id",m.data.company_id).single();
  if(c.error)throw c.error;company=c.data;workspace();await loadTransactions();
 }catch(e){toast("Ошибка загрузки компании: "+e.message)}
}
async function createCompany(){
 const name=prompt("Название компании:");if(!name?.trim())return;
 try{
  const c=await db.from("companies").insert({name:name.trim(),created_by:user.id}).select("id,name,created_by").single();
  if(c.error)throw c.error;
  const m=await db.from("company_members").insert({company_id:c.data.id,user_id:user.id,role:"owner"});
  if(m.error)throw m.error;
  company=c.data;workspace();await loadTransactions();toast("Компания создана.");
 }catch(e){toast("Не удалось создать компанию: "+e.message)}
}
async function loadTransactions(){
 if(!company){transactions=[];render();return}
 try{const r=await db.from("transactions").select("*").eq("company_id",company.id);if(r.error)throw r.error;
 transactions=(r.data||[]).sort((a,b)=>String(b.date||b.created_at||"").localeCompare(String(a.date||a.created_at||"")));render()
 }catch(e){toast("Ошибка загрузки операций: "+e.message)}
}
function render(){
 const inc=transactions.filter(x=>x.type==="income").reduce((s,x)=>s+Number(x.amount||0),0);
 const exp=transactions.filter(x=>x.type==="expense").reduce((s,x)=>s+Number(x.amount||0),0);
 ["totalIncome","financeIncome"].forEach(id=>$(id)&&($(id).textContent=euro(inc)));
 ["totalExpense","financeExpense"].forEach(id=>$(id)&&($(id).textContent=euro(exp)));
 ["totalProfit","financeBalance"].forEach(id=>$(id)&&($(id).textContent=euro(inc-exp)));
 if($("recentRows"))$("recentRows").innerHTML=transactions.slice(0,5).map(x=>'<tr><td><b>'+esc(x.name)+'</b></td><td>'+esc(x.date||"")+'</td><td>'+esc(x.category||"Другое")+'</td><td class="'+(x.type==="income"?"amount-positive":"amount-negative")+'">'+(x.type==="income"?"+":"−")+euro(x.amount)+'</td><td><span class="status good">Сохранено</span></td></tr>').join("");
 financeRows();
}
function financeRows(q=""){
 if(!$("financeRows"))return;
 q=q.toLowerCase();
 $("financeRows").innerHTML=transactions.filter(x=>(String(x.name||"")+" "+String(x.category||"")).toLowerCase().includes(q)).map(x=>'<tr><td><b>'+esc(x.name)+'</b></td><td>'+esc(x.date||"")+'</td><td>'+esc(x.category||"Другое")+'</td><td>'+(x.type==="income"?"Доход":"Расход")+'</td><td class="'+(x.type==="income"?"amount-positive":"amount-negative")+'">'+(x.type==="income"?"+":"−")+euro(x.amount)+'</td></tr>').join("");
}
const titles={overview:"Обзор",finance:"Финансы",inventory:"Склад",customers:"Клиенты",documents:"Документы",analytics:"Аналитика",planning:"Планирование",settings:"Настройки"};
function navigate(p){document.querySelectorAll(".page").forEach(x=>x.classList.remove("active"));$("page-"+p)?.classList.add("active");document.querySelectorAll(".nav-item").forEach(x=>x.classList.toggle("active",x.dataset.page===p));$("crumbName").textContent=titles[p]||p;$("sidebar").classList.remove("open");scrollTo({top:0,behavior:"smooth"})}
document.querySelectorAll(".nav-item").forEach(x=>x.onclick=()=>navigate(x.dataset.page));
document.querySelectorAll("[data-goto]").forEach(x=>x.onclick=()=>navigate(x.dataset.goto));
$("menuBtn").onclick=()=>$("sidebar").classList.toggle("open");
$("authBtn").onclick=$("settingsAuth").onclick=login;
function openModal(){if(!user)return toast("Сначала войдите.");if(!company)return toast("Сначала создайте компанию.");$("modalBackdrop").classList.add("open")}
$("quickAdd").onclick=$("financeAdd").onclick=openModal;
$("modalClose").onclick=()=>$("modalBackdrop").classList.remove("open");
$("modalBackdrop").addEventListener("click",e=>{if(e.target===$("modalBackdrop"))$("modalBackdrop").classList.remove("open")});
$("operationForm").addEventListener("submit",async e=>{
 e.preventDefault();if(!user||!company)return toast("Войдите и создайте компанию.");
 const name=$("opName").value.trim(),amount=Number($("opAmount").value);if(!name||amount<=0)return;
 try{
  const r=await db.from("transactions").insert({company_id:company.id,name,date:new Date().toLocaleDateString("ru-RU"),category:$("opCategory").value.trim()||"Другое",type:$("opType").value,amount});
  if(r.error)throw r.error;await loadTransactions();e.target.reset();$("modalBackdrop").classList.remove("open");toast("Операция сохранена в облаке.");
 }catch(err){toast("Ошибка сохранения: "+err.message)}
});
$("financeSearch").addEventListener("input",e=>financeRows(e.target.value));
function renderTasks(){
 const html=tasks.map((t,i)=>'<label class="task"><input type="checkbox" data-task="'+i+'" '+(t.done?"checked":"")+'><span class="checkmark"></span><span><b>'+esc(t.name)+'</b><small>Личная задача</small></span></label>').join("");
 $("taskList").innerHTML=html;$("planningList").innerHTML=html;
 document.querySelectorAll("[data-task]").forEach(x=>x.onchange=()=>{tasks[+x.dataset.task].done=x.checked;localStorage.setItem("pr_tasks",JSON.stringify(tasks));renderTasks()});
}
function addTask(){const n=prompt("Название задачи:");if(n?.trim()){tasks.push({name:n.trim(),done:false});localStorage.setItem("pr_tasks",JSON.stringify(tasks));renderTasks()}}
$("addTask").onclick=$("planningTask").onclick=addTask;
$("searchBtn").onclick=()=>{const q=prompt("Что найти?");if(q){const x=transactions.find(t=>String(t.name).toLowerCase().includes(q.toLowerCase()));toast(x?"Найдена операция: "+x.name:"Не найдено")}};
$("helpBtn").onclick=()=>toast("Помощь Profit Radar");
$("chartPeriod").onchange=()=>toast("Период: "+$("chartPeriod").value);
$("exportCsv").onclick=()=>{const rows=[["Название","Дата","Категория","Тип","Сумма"],...transactions.map(x=>[x.name,x.date,x.category,x.type,x.amount])];const csv="\uFEFF"+rows.map(r=>r.map(v=>'"'+String(v??"").replace(/"/g,'""')+'"').join(";")).join("\n");const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));a.download="profit-radar.csv";a.click();URL.revokeObjectURL(a.href)};
["addProduct","addCustomer","addDocument"].forEach(id=>$(id).onclick=()=>toast("Этот раздел подключим отдельно."));
async function init(){
 if(!db)return toast("Не удалось подключить Supabase.");
 const r=await db.auth.getUser();user=r.data?.user||null;profile();workspace();render();renderTasks();
 if(user)await loadCompany();
 db.auth.onAuthStateChange((_e,s)=>{user=s?.user||null;profile();if(user)setTimeout(loadCompany,0);else{company=null;transactions=[];workspace();render()}});
}
init();
})();
