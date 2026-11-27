module.exports = function handler(req, res) {
  res.status(200).json({
    service: "RADAR Telegram bot",
    status: "code_ready",
    configured: {
      telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_WEBHOOK_SECRET),
      imageRecognition: Boolean(process.env.GEMINI_API_KEY),
      shopPromotionsDatabase: Boolean(process.env.SUPABASE_URL)
    },
    searchMode: "free_search_links_no_price_scraping"
  });
};
