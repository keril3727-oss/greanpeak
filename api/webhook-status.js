const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ ok: false });
  if (!BOT_TOKEN) return res.status(503).json({ ok: false, error: "TELEGRAM_BOT_TOKEN_MISSING" });

  try {
    const response = await fetch("https://api.telegram.org/bot" + BOT_TOKEN + "/getWebhookInfo");
    const data = await response.json();
    if (!response.ok || !data.ok) {
      return res.status(502).json({ ok: false, error: data.description || "Telegram API error" });
    }
    const info = data.result || {};
    return res.status(200).json({
      ok: true,
      webhookConfigured: Boolean(info.url),
      url: info.url || null,
      pendingUpdates: info.pending_update_count || 0,
      lastErrorDate: info.last_error_date || null,
      lastErrorMessage: info.last_error_message || null,
      allowedUpdates: info.allowed_updates || null,
      hasCustomCertificate: Boolean(info.has_custom_certificate)
    });
  } catch (error) {
    return res.status(502).json({ ok: false, error: "Не удалось связаться с Telegram" });
  }
};
