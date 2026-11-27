# RADAR Telegram bot — MVP

This is a Telegram webhook bot (not a Mini App). It is added on a separate branch so the existing production site and admin page are not changed.

## Runtime
- Vercel Node.js serverless route: /api/telegram
- Health check: /api/health
- Telegram bot: @P_radar_bot

## Required Vercel environment variables
Set these as encrypted Production variables:
- TELEGRAM_BOT_TOKEN — token from BotFather. Never put it in source code or chat.
- TELEGRAM_WEBHOOK_SECRET — random secret (1–256 chars, letters/numbers/underscore/hyphen).
- GEMINI_API_KEY — Google AI Studio key for image recognition.
- SERPAPI_KEY — SerpApi key for Google Shopping and web search.
- SUPABASE_URL — https://eahtreiygltslvwqzygf.supabase.co
- SUPABASE_SERVICE_ROLE_KEY — Supabase service-role secret; server only, never expose to browser.
- Optional: GEMINI_MODEL — defaults to gemini-2.5-flash.

Do not send secret values in Telegram or in a public issue. Add them only in the Vercel Environment Variables screen.

## Database
Run radar-bot/schema.sql in the RADAR Supabase SQL Editor. It only creates the promotional shop links table; it does not delete or modify the existing cinema tables.

The bot matches the domain of a found product to an active shop promotion and shows the advertiser's purchase link while the placement is active.

## Set Telegram webhook
After deploying the branch and adding the variables, set the webhook using Telegram's Bot API:
POST https://api.telegram.org/bot<TOKEN>/setWebhook
JSON body:
{"url":"https://<deployment-domain>/api/telegram","secret_token":"<same TELEGRAM_WEBHOOK_SECRET>"}

## MVP limitations
- Search uses SerpApi Google Shopping for Russia and Belarus and web results for used listings.
- Exact-match filtering is deliberately strict. If the model cannot be identified confidently or no exact title match is found, the bot says "Товар не найден".
- Availability and prices depend on indexed pages and search provider coverage. This is not a direct official integration with Wildberries, Ozon, or Poizon; those providers may require separate partner/API access.
- Belarusian prices are converted to RUB using a live exchange-rate endpoint when available. If conversion fails, that price is omitted.
- The existing admin UI still needs a dedicated "Реклама магазинов" section before promotions can be managed from the panel.
