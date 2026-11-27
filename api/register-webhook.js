const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    res.setHeader("content-type", "text/html; charset=utf-8");
    return res.status(200).send(`<!doctype html>
<html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>RADAR — подключение Telegram</title>
<body style="font:16px Arial;max-width:420px;margin:40px auto;padding:20px">
<h2>Подключение RADAR</h2>
<p>Нажми кнопку — сервер сам подключит Telegram. Пароль вводить не нужно.</p>
<button id="go" style="margin-top:12px;padding:12px 18px">Подключить Telegram</button><p id="out"></p>
<script>
document.getElementById("go").addEventListener("click",async()=>{
 const out=document.getElementById("out");const b=document.getElementById("go");
 b.disabled=true;out.textContent="Подключаю…";
 try{
  const r=await fetch("/api/register-webhook",{method:"POST"});
  const d=await r.json();
  out.textContent=d.ok?"Готово! Telegram подключён.": "Ошибка: "+(d.error||"не удалось подключить");
 }catch(_){out.textContent="Ошибка соединения. Попробуй ещё раз."}
 finally{b.disabled=false}
});
</script></body></html>`);
  }
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  if (!BOT_TOKEN) {
    return res.status(503).json({ ok: false, error: "В Vercel не настроен TELEGRAM_BOT_TOKEN" });
  }
  // Use the stable branch alias, not a one-off deployment hostname.
  const webhookUrl = "https://profit-radar-finances-git-radar-bot-mvp-kerilasolo.vercel.app/api/telegram";
  const response = await fetch("https://api.telegram.org/bot" + BOT_TOKEN + "/setWebhook", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      url: webhookUrl,
      allowed_updates: ["message"],
      drop_pending_updates: true
    })
  });
  const data = await response.json();
  if (!response.ok || !data.ok) return res.status(502).json({ ok: false, error: data.description || "Telegram не принял webhook" });
  return res.status(200).json({ ok: true });
};
