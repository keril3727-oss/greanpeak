(()=>{
const $=id=>document.getElementById(id);
window.Telegram?.WebApp?.ready();window.Telegram?.WebApp?.expand();
const {url,key}=window.RADAR_CONFIG||{};
const db=window.supabase?.createClient(url,key);
let data=[],saved=JSON.parse(localStorage.getItem('radar_saved')||'[]'),genre='Все';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const posterUrl=path=>path?db.storage.from('radar-posters').getPublicUrl(path).data.publicUrl:'';
function mapMovie(x){return {...x,poster:posterUrl(x.poster_path)}}
const card=x=>'<div class="movie" data-id="'+esc(x.id)+'"><div class="poster"><img loading="lazy" src="'+esc(x.poster)+'" alt="'+esc(x.title)+'"></div><h3>'+esc(x.title)+'</h3><p>'+esc(x.release_year||'')+' · '+esc(x.genre)+'</p></div>';
function draw(){
 const q=$('search').value.toLowerCase();
 const filtered=data.filter(x=>(genre==='Все'||x.genre===genre)&&x.title.toLowerCase().includes(q));
 $('catalog').innerHTML=filtered.filter(x=>x.type==='Фильм').map(card).join('')||'<p>Фильмы пока не опубликованы.</p>';
 $('seriesGrid').innerHTML=data.filter(x=>x.type==='Сериал').map(card).join('')||'<p>Сериалы появятся здесь.</p>';
 $('savedGrid').innerHTML=data.filter(x=>saved.includes(x.id)).map(card).join('')||'<p>Здесь будут избранные фильмы.</p>';
}
async function load(){
 if(!db){$('catalog').innerHTML='<p>Не удалось подключиться к каталогу.</p>';return}
 const {data:rows,error}=await db.from('movies').select('id,title,description,genre,release_year,poster_path,video_path,duration_minutes,type,is_published').eq('is_published',true).order('created_at',{ascending:false});
 if(error){$('catalog').innerHTML='<p>Ошибка загрузки каталога. Попробуйте позже.</p>';console.error(error);return}
 data=(rows||[]).map(mapMovie);draw();
}
async function open(id){
 const x=data.find(a=>a.id===id);if(!x)return;
 $('detail').innerHTML='<div class="detail"><img src="'+esc(x.poster)+'" alt="'+esc(x.title)+'"><div><h2>'+esc(x.title)+'</h2><small>'+esc(x.release_year||'')+' · '+esc(x.genre)+' · '+esc(x.type)+'</small><p>'+esc(x.description)+'</p><button id="watch">▶ Смотреть</button><button id="fav">☆ Избранное</button></div></div>';
 $('modal').classList.add('open');$('player').pause();$('player').removeAttribute('src');$('player').style.display='none';
 $('watch').onclick=async()=>{
  if(!x.video_path){alert('Видео ещё не добавлено.');return}
  const {data:link,error}=await db.storage.from('radar-videos').createSignedUrl(x.video_path,3600);
  if(error||!link?.signedUrl){alert('Не удалось открыть видео.');return}
  $('player').src=link.signedUrl;$('player').style.display='block';$('player').play().catch(()=>{});
 };
 $('fav').onclick=()=>{saved=saved.includes(id)?saved.filter(v=>v!==id):[...saved,id];localStorage.setItem('radar_saved',JSON.stringify(saved));draw();$('fav').textContent=saved.includes(id)?'★ В избранном':'☆ Избранное'};
}
document.addEventListener('click',e=>{const m=e.target.closest('.movie');if(m)open(m.dataset.id)});
$('close').onclick=()=>{$('modal').classList.remove('open');$('player').pause()};
$('search').oninput=draw;$('searchOpen').onclick=()=>$('search').focus();
$('genres').onclick=e=>{const b=e.target.closest('[data-g]');if(!b)return;genre=b.dataset.g;document.querySelectorAll('[data-g]').forEach(x=>x.classList.toggle('active',x===b));draw()};
load();
})();