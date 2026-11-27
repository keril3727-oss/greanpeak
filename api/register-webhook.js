const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    res.setHeader("content-type", "text/html; charset=utf-8");
    return res.status(200).send(`<!doctype html>
<html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>RADAR — подключение Telegram</title>
<body style="font:16px Arial;max-width:420px;margin:40px auto;padding:20px">
<h2>Подключение RADAR</h2><p>Вставь секрет из Vercel. Он отправится только этому серверу для настройки webhook.</p>
<form id="f"><input id="s" type="password" autocomplete="off" required placeholder="TELEGRAM_WEBHOOK_SECRET" style="box-sizing:border-box;width:100%;padding:12px">
<button style="margin-top:12px;padding:12px 18px">Подключить Telegram</button></form><p id="out"></p>
<script>
document.getElementById("f").addEventListener("submit",async e=>{
 e.preventDefault();const out=document.getElementById("out");out.textContent="Подключаю…";
 try{const r=await fetch("/api/register-webhook",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({secret:document.getElementById("s").value})});
 const d=await r.json();out.textContent=d.ok?"Готово! Telegram подключён.":"Ошибка: "+(d.error||"не удалось подключить");
 }catch(_){out.textContent="Ошибка соединения. Попробуй ещё раз."}
});
</script></body></html>`);
  }
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  if (!BOT_TOKEN || !WEBHOOK_SECRET) return res.status(503).json({ ok: false, error: "Переменные окружения не настроены" });
  const supplied = req.body && req.body.secret;
  if (typeof supplied !== "string" || supplied.length < 16 || supplied !== WEBHOOK_SECRET) {
    return res.status(401).json({ ok: false, error: "Неверный секрет" });
  }
  const host = process.env.VERCEL_URL;
  if (!host) return res.status(503).json({ ok: false, error: "Не определён адрес Vercel" });
  const webhookUrl = "https://" + host + "/api/telegram";
  const response = await fetch("https://api.telegram.org/bot" + BOT_TOKEN + "/setWebhook", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: WEBHOOK_SECRET,
      allowed_updates: ["message"],
      drop_pending_updates: true
    })
  });
  const data = await response.json();
  if (!response.ok || !data.ok) return res.status(502).json({ ok: false, error: data.description || "Telegram не принял webhook" });
  return res.status(200).json({ ok: true });
};
