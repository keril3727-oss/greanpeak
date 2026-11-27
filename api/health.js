export default function handler(req, res) {
  res.status(200).json({
    service: "RADAR Telegram bot",
    status: "code_ready",
    configured: {
      telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_WEBHOOK_SECRET),
      imageRecognition: Boolean(process.env.GEMINI_API_KEY),
      productSearch: Boolean(process.env.SERPAPI_KEY),
      shopPromotions: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
    }
  });
}
