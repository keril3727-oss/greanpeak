const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GEMINI_KEY = process.env.GEMINI_API_KEY;

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

async function identifyImage(bytes, mimeType) {
  if (!GEMINI_KEY) throw new Error("GEMINI_KEY_MISSING");
  const base64 = Buffer.from(bytes).toString("base64");
  const prompt = [
    "Определи вещь на фото максимально полезно для поиска товара в интернет-магазинах России и Беларуси.",
    "Не выдумывай бренд, модель или артикул. Если бренд неясен, оставь brand пустым, но обязательно опиши категорию и видимые признаки.",
    "Подбери поисковые фразы на русском и английском: тип вещи, фасон, материал, цвет, принт, отличительные детали.",
    "Верни только JSON: {",
    '"is_identifiable": boolean, "brand": string, "model_name": string,',
    '"model_code": string, "category": string, "color": string,',
    '"search_terms_ru": string, "search_terms_en": string, "confidence": number',
    "}. Не называй похожую вещь точным совпадением."
  ].join(" ");
  // Use the currently supported model; do not let an old Vercel env override select a retired model.
  const models = ["gemini-3.8-flash", "gemini-3.1-flash-lite"];
  const safeMimeType = String(mimeType || "").startsWith("image/") ? mimeType : "image/jpeg";
  let lastError = "Image recognition failed";
  for (const model of models) {
    const url = "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent?key=" + encodeURIComponent(GEMINI_KEY);
    // Bound each provider call so Telegram webhook never hangs until Vercel's hard timeout.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const r = await fetch(url, {
        method: "POST",
        signal: controller.signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: safeMimeType, data: base64 } }] }],
          generationConfig: { temperature: 0.1, responseMimeType: "application/json" }
        })
      });
      const data = await r.json();
      if (r.ok) {
        const raw = data.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";
        return JSON.parse(raw.trim());
      }
      lastError = data.error?.message || "Image recognition failed";
      const temporary = r.status === 429 || r.status >= 500 || /high demand|temporar|overload/i.test(lastError);
      if (!temporary) throw new Error(lastError);
    } catch (error) {
      lastError = error.name === "AbortError" ? "Gemini request timed out" : error.message;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error(lastError);
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
  const mimeType = type.split(";")[0].startsWith("image/") ? type.split(";")[0] : "image/jpeg";
  return { bytes, mimeType };
}

function makeSearchLinks(item) {
  const clean = (v) => String(v || "").trim();
  const brand = clean(item.brand);
  const model = clean(item.model_name);
  const code = clean(item.model_code);
  const category = clean(item.category);
  const color = clean(item.color);
  const ru = clean(item.search_terms_ru);
  const en = clean(item.search_terms_en);
  const base = [brand, model, code].filter(Boolean).join(" ");
  const broad = [brand, category, color, ru].filter(Boolean).join(" ");
  const queries = [
    ["Wildberries · поиск", "site:wildberries.ru " + (base || broad)],
    ["Ozon · поиск", "site:ozon.ru " + (base || broad)],
    ["Avito · Россия", "site:avito.ru " + (base || broad)],
    ["Kufar · Беларусь", "site:kufar.by " + (base || broad)],
    ["Onliner · Беларусь", "site:catalog.onliner.by " + (base || broad)],
    ["Яндекс · все магазины", broad || base],
    ["Google · похожие товары", [brand, category, color, ru, en].filter(Boolean).join(" ")]
  ];
  return queries.map(([label, query]) => ({
    text: label,
    url: "https://www.google.com/search?q=" + encodeURIComponent(query)
  }));
}

async function handlePhoto(message) {
  const chatId = message.chat.id;
  await say(chatId, "📸 Фото получил. Пытаюсь определить бренд и модель…");
  if (!GEMINI_KEY) {
    return say(chatId, "Распознавание пока не настроено. Попробуй позже.");
  }
  const photo = message.photo[message.photo.length - 1];
  const file = await getFileBytes(photo.file_id);
  const item = await identifyImage(file.bytes, file.mimeType);
  if (!item.category && !item.model_name && !item.search_terms_ru) {
    return say(chatId, "Не получилось разобрать вещь на фото. Попробуй прислать более чёткое фото целиком и отдельно логотип или бирку.");
  }
  const query = [item.brand, item.model_name, item.model_code].filter(Boolean).join(" ") || [item.category, item.color, item.search_terms_ru].filter(Boolean).join(" ");
  const keyboardRows = makeSearchLinks(item).map(button => [button]);
  await say(chatId,
    "🔎 Предположительно определено: " + query +
    (item.category ? "\nКатегория: " + item.category : "") +
    (item.color ? "\nЦвет: " + item.color : "") +
    (!item.brand ? "\nБренд точно не определён." : "") +
    "\n\nЯ расширил запрос и добавил поиск по похожим описаниям. Совпадение не гарантировано: проверь фото, характеристики и продавца перед покупкой.",
    { inline_keyboard: keyboardRows }
  );
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  if (!BOT_TOKEN) return res.status(503).json({ ok: false, error: "Bot is not configured" });
  const message = (req.body || {}).message;
  if (!message?.chat?.id) return res.status(200).json({ ok: true });
  const chatId = message.chat.id;
  try {
    if (message.photo?.length) {
      await handlePhoto(message);
    } else if (message.text === "/start") {
      await say(chatId,
        "Привет! Я RADAR 🔎\nОтправь фото одежды, обуви, сумки или аксессуара. Я попробую определить модель и дам ссылки на поиск в магазинах России и Беларуси.",
        keyboard()
      );
    } else if (message.text === "/help" || message.text === "ℹ️ Помощь") {
      await say(chatId, "Отправь фото одной вещи при хорошем освещении. Лучше, если видны логотип, бирка и детали. Поиск открывается ссылками; цены и наличие нужно проверить в магазине.", keyboard());
    } else if (message.text === "🔎 Найти по фото") {
      await say(chatId, "Пришли фотографию вещи одним сообщением.");
    } else {
      await say(chatId, "Чтобы начать поиск, отправь фотографию вещи.");
    }
  } catch (error) {
    console.error("RADAR bot error:", error.message);
    await say(chatId, "Не удалось обработать фото. Попробуй ещё раз чуть позже.");
  }
  return res.status(200).json({ ok: true });
};