const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const SERPAPI_KEY = process.env.SERPAPI_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const tg = (method) => "https://api.telegram.org/bot" + BOT_TOKEN + "/" + method;

async function telegram(method, payload) {
  const r = await fetch(tg(method), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await r.json();
  if (!r.ok || !data.ok) throw new Error(data.description || ("Telegram " + method + " failed"));
  return data.result;
}

async function say(chatId, text, replyMarkup) {
  return telegram("sendMessage", {
    chat_id: chatId, text,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {})
  });
}

function keyboard() {
  return { keyboard: [[{ text: "🔎 Найти по фото" }], [{ text: "ℹ️ Помощь" }]], resize_keyboard: true };
}

function normalize(s) {
  return String(s || "").toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-я0-9]+/gi, " ").trim();
}

function isExactTitle(title, item) {
  const t = " " + normalize(title) + " ";
  const brand = normalize(item.brand);
  const model = normalize(item.model_name);
  const code = normalize(item.model_code);
  if (!brand || !t.includes(" " + brand + " ")) return false;
  if (code) return t.includes(" " + code + " ");
  if (!model) return false;
  const words = model.split(" ").filter(w => w.length > 1);
  return words.length > 0 && words.every(w => t.includes(" " + w + " "));
}

async function identifyImage(bytes, mimeType) {
  if (!GEMINI_KEY) throw new Error("GEMINI_KEY_MISSING");
  const base64 = Buffer.from(bytes).toString("base64");
  const prompt = [
    "Определи предмет на фото для поиска ТОЧНОЙ модели товара.",
    "Не угадывай. Если по фото нельзя надёжно определить бренд и точную модель, is_identifiable=false.",
    "Верни только JSON без Markdown со свойствами:",
    '{"is_identifiable":boolean,"brand":string,"model_name":string,"model_code":string,"category":string,"color":string,"confidence":number}.',
    "confidence от 0 до 1. model_code — артикул/код модели, если он реально виден или надёжно известен."
  ].join(" ");
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const url = "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent?key=" + encodeURIComponent(GEMINI_KEY);
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: base64 } }] }],
      generationConfig: { temperature: 0.1, responseMimeType: "application/json" }
    })
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error?.message || "Image recognition failed");
  const raw = data.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";
  return JSON.parse(raw.trim());
}

async function getFileBytes(fileId) {
  const infoResponse = await fetch(tg("getFile") + "?file_id=" + encodeURIComponent(fileId));
  const info = await infoResponse.json();
  if (!info.ok || !info.result?.file_path) throw new Error("Не удалось получить фотографию");
  const file = await fetch("https://api.telegram.org/file/bot" + BOT_TOKEN + "/" + info.result.file_path);
  if (!file.ok) throw new Error("Не удалось скачать фотографию");
  const type = file.headers.get("content-type") || "image/jpeg";
  const bytes = await file.arrayBuffer();
  if (bytes.byteLength > 8 * 1024 * 1024) throw new Error("Фото слишком большое. Отправь изображение меньшего размера.");
  return { bytes, mimeType: type.split(";")[0] };
}

async function searchSerp(query, gl, engine) {
  const params = new URLSearchParams({ engine: engine || "google_shopping", q: query, gl, hl: "ru", api_key: SERPAPI_KEY });
  const r = await fetch("https://serpapi.com/search.json?" + params);
  const data = await r.json();
  if (!r.ok || data.error) throw new Error(data.error || "Поиск товаров временно недоступен");
  return engine === "google" ? (data.organic_results || []) : (data.shopping_results || []);
}

function priceInfo(value) {
  const s = String(value || "");
  const m = s.match(/(?:₽|руб\.?|RUB|BYN|Br|бел\.\s*руб\.?|\$|€)\s*([\d\s.,]+)/i) ||
            s.match(/([\d\s.,]+)\s*(?:₽|руб\.?|RUB|BYN|Br|€|\$)/i);
  if (!m) return null;
  const amount = Number(m[1].replace(/\s/g, "").replace(",", ".").replace(/\.(?=.*\.)/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const currency = /BYN|Br|бел\.\s*руб/i.test(s) ? "BYN" : /€/.test(s) ? "EUR" : /\$/.test(s) ? "USD" : "RUB";
  return { amount, currency };
}

async function toRub(price) {
  if (!price) return null;
  if (price.currency === "RUB") return Math.round(price.amount);
  try {
    const r = await fetch("https://open.er-api.com/v6/latest/" + price.currency);
    const data = await r.json();
    const rate = data?.rates?.RUB;
    return rate ? Math.round(price.amount * rate) : null;
  } catch { return null; }
}

async function activePromotion(domain) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !domain) return null;
  const url = new URL("/rest/v1/radar_shop_promotions", SUPABASE_URL);
  url.searchParams.set("domain", "eq." + domain);
  url.searchParams.set("is_active", "eq.true");
  url.searchParams.set("starts_at", "lte." + new Date().toISOString());
  url.searchParams.set("ends_at", "gte." + new Date().toISOString());
  url.searchParams.set("select", "shop_name,target_url");
  url.searchParams.set("limit", "1");
  const r = await fetch(url, { headers: {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    authorization: "Bearer " + SUPABASE_SERVICE_ROLE_KEY
  }});
  if (!r.ok) return null;
  const rows = await r.json();
  return rows[0] || null;
}

function hostname(link) {
  try { return new URL(link).hostname.replace(/^www\./, ""); } catch { return ""; }
}

async function findProducts(item) {
  if (!SERPAPI_KEY) throw new Error("SEARCH_KEY_MISSING");
  const query = [item.brand, item.model_name, item.model_code].filter(Boolean).join(" ");
  const results = await Promise.all([
    searchSerp(query, "ru", "google_shopping"),
    searchSerp(query, "by", "google_shopping"),
    searchSerp('"' + query + '" site:avito.ru OR site:youla.ru', "ru", "google")
  ]);
  const fresh = [...results[0], ...results[1]].filter(x => x.link && isExactTitle(x.title, item));
  const used = results[2].filter(x => x.link && isExactTitle(x.title, item));
  const products = [];
  for (const x of fresh.slice(0, 5)) {
    const p = priceInfo(x.price || x.extracted_price);
    const rub = await toRub(p);
    products.push({
      title: x.title, priceRub: rub,
      priceLabel: rub ? rub.toLocaleString("ru-RU") + " ₽" : "Цена не указана",
      link: x.link, source: x.source || hostname(x.link),
      condition: "Новая"
    });
  }
  for (const x of used.slice(0, 5)) {
    const p = priceInfo(x.snippet || x.rich_snippet?.top?.detected_extensions?.price);
    const rub = await toRub(p);
    if (!rub) continue;
    products.push({
      title: x.title, priceRub: rub, priceLabel: rub.toLocaleString("ru-RU") + " ₽",
      link: x.link, source: hostname(x.link), condition: "Б/у"
    });
  }
  return products;
}

async function handlePhoto(message) {
  const chatId = message.chat.id;
  await say(chatId, "📸 Получил фото. Определяю модель и ищу точное совпадение…");
  if (!GEMINI_KEY || !SERPAPI_KEY) {
    return say(chatId, "Поиск пока настраивается: не подключены сервисы распознавания и поиска товаров. Попробуй позже.");
  }
  const photo = message.photo[message.photo.length - 1];
  const file = await getFileBytes(photo.file_id);
  const item = await identifyImage(file.bytes, file.mimeType);
  if (!item.is_identifiable || Number(item.confidence) < 0.85 || !item.brand || !item.model_name) {
    return say(chatId, "Не удалось надёжно определить точную модель. Попробуй отправить фото логотипа, бирки или вещи целиком.");
  }
  const products = await findProducts(item);
  if (!products.length) return say(chatId, "Товар не найден. Точного совпадения в доступных источниках не обнаружено.");
  const prices = products.map(x => x.priceRub).filter(Number.isFinite);
  const min = prices.length ? Math.min(...prices) : null;
  const header = "🔎 " + item.brand + " " + item.model_name + (item.model_code ? " · " + item.model_code : "");
  await say(chatId, header + (min ? "\nМинимальная найденная цена: " + min.toLocaleString("ru-RU") + " ₽" : ""));
  for (const product of products.slice(0, 6)) {
    const promo = await activePromotion(hostname(product.link));
    const url = promo?.target_url || product.link;
    const label = promo ? "Приобрести можно тут · " + promo.shop_name : "Приобрести можно тут";
    await say(chatId,
      "🛍 " + product.title + "\n" + product.condition + ": " + product.priceLabel + "\nМагазин: " + product.source,
      { inline_keyboard: [[{ text: label, url }]] }
    );
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  if (!BOT_TOKEN) return res.status(503).json({ ok: false, error: "Bot is not configured" });
  if (WEBHOOK_SECRET && req.headers["x-telegram-bot-api-secret-token"] !== WEBHOOK_SECRET) {
    return res.status(401).json({ ok: false });
  }
  const message = (req.body || {}).message;
  if (!message?.chat?.id) return res.status(200).json({ ok: true });
  const chatId = message.chat.id;
  try {
    if (message.photo?.length) {
      await handlePhoto(message);
    } else if (message.text === "/start") {
      await say(chatId,
        "Привет! Я RADAR 🔎\nОтправь фото одежды, обуви, сумки или аксессуара — попробую найти точную модель и предложения в России и Беларуси. Похожие товары вместо точного совпадения не показываю.",
        keyboard()
      );
    } else if (message.text === "/help" || message.text === "ℹ️ Помощь") {
      await say(chatId, "Отправь фотографию одной вещи при хорошем освещении. Чем лучше видны логотип, бирка и детали модели, тем выше шанс точного распознавания.", keyboard());
    } else if (message.text === "🔎 Найти по фото") {
      await say(chatId, "Пришли фотографию вещи одним сообщением.");
    } else {
      await say(chatId, "Чтобы начать поиск, отправь фотографию вещи. Нужна именно фотография, не ссылка.");
    }
  } catch (error) {
    console.error("RADAR bot error:", error.message);
    await say(chatId, "Не удалось выполнить поиск. Попробуй ещё раз чуть позже.");
  }
  return res.status(200).json({ ok: true });
}
