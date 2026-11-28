const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const NEW_USERS_CHAT_ID = "-1003674295085";

async function trackNewUser(message) {
  if (!SUPABASE_URL || !SUPABASE_KEY || !message.from?.id) return;
  try {
    const response = await fetch(SUPABASE_URL + "/rest/v1/radar_bot_users", {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        authorization: "Bearer " + SUPABASE_KEY,
        "content-type": "application/json",
        Prefer: "resolution=ignore-duplicates,return=representation"
      },
      body: JSON.stringify({
        telegram_user_id: message.from.id,
        chat_id: message.chat.id,
        username: message.from.username || null,
        first_name: message.from.first_name || null,
        last_name: message.from.last_name || null
      })
    });
    if (!response.ok) throw new Error("Supabase insert failed: " + response.status);
    const inserted = await response.json();
    if (!Array.isArray(inserted) || inserted.length === 0) return;
    const countResponse = await fetch(SUPABASE_URL + "/rest/v1/radar_bot_users?select=telegram_user_id", {
      method: "HEAD",
      headers: {
        apikey: SUPABASE_KEY,
        authorization: "Bearer " + SUPABASE_KEY,
        Prefer: "count=exact",
        Range: "0-0"
      }
    });
    const range = countResponse.headers.get("content-range") || "";
    const total = range.split("/")[1] || "—";
    const name = [message.from.first_name, message.from.last_name].filter(Boolean).join(" ") || "не указано";
    const username = message.from.username ? "@" + message.from.username : "не указан";
    await say(NEW_USERS_CHAT_ID,
      "🆕 Новый пользователь RADAR\nИмя: " + name +
      "\nUsername: " + username +
      "\nID: " + message.from.id +
      "\nВсего пользователей: " + total
    );
  } catch (error) {
    console.error("RADAR user tracking error:", error.message);
  }
}

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
    "Ты эксперт по визуальной идентификации одежды, обуви, сумок и аксессуаров для поиска товаров в России и Беларуси.",
    "Осмотри логотипы, надписи, бирки, ярлыки, принты, форму карманов, швы, подошву, застёжки, силуэт и другие уникальные детали.",
    "Перепиши только реально читаемый текст с фото, включая артикулы и коды. Не угадывай нечитаемые символы.",
    "Определи бренд и модель только при наличии визуальных оснований. Не путай общий тип вещи с конкретной моделью. Не выдумывай артикулы.",
    "Если точная модель не подтверждается, оставь model_name и model_code пустыми, а search_terms_ru составь как точный описательный запрос по видимым признакам.",
    "Укажи отличительные признаки, которые поддерживают идентификацию. confidence — число от 0 до 1, уверенность именно в модели, а не в категории. Не завышай оценку.",
    "Верни только JSON: {",
    '\"is_identifiable\": boolean, \"brand\": string, \"model_name\": string,',
    '\"model_code\": string, \"category\": string, \"color\": string,',
    '\"visible_text\": string, \"distinctive_details\": [string],',
    '\"search_terms_ru\": string, \"search_terms_en\": string,',
    '\"confidence\": number, \"exact_model_confirmed\": boolean',
    "}. exact_model_confirmed=true только при сильных подтверждениях конкретной модели или артикула."
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
  const exact = [brand, model, code].filter(Boolean).join(" ");
  // When the model is unknown, search by visual description instead of brand alone.
  const hasSpecificModel = Boolean(model || code);
  const broad = [brand, category, color, ru].filter(Boolean).join(" ");
  const q = encodeURIComponent(hasSpecificModel ? exact : (broad || exact || "одежда"));
  return [
    { text: "Ozon", url: "https://www.ozon.ru/search/?text=" + q },
    { text: "Wildberries", url: "https://www.wildberries.ru/catalog/0/search.aspx?search=" + q },
    { text: "Avito", url: "https://www.avito.ru/rossiya?q=" + q },
    { text: "Kufar", url: "https://www.kufar.by/l?query=" + q },
    { text: "💰 Купить по лучшей цене", url: "https://t.me/radar_shmot" },
    { text: "📢 Купить рекламу · @verpot", url: "https://t.me/verpot" }
  ];
}

async function supabaseRpc(name, body) {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error("Supabase billing is not configured");
  const response = await fetch(SUPABASE_URL + "/rest/v1/rpc/" + name, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      authorization: "Bearer " + SUPABASE_KEY,
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || ("Supabase RPC failed: " + response.status));
  return data;
}

async function sendStarsInvoice(chatId, userId) {
  const payload = "radar_search:" + userId + ":" + Date.now();
  return telegram("sendInvoice", {
    chat_id: chatId,
    title: "Поиск по фото",
    description: "Один дополнительный поиск вещи по фотографии.",
    payload,
    provider_token: "",
    currency: "XTR",
    prices: [{ label: "1 поиск", amount: 5 }]
  });
}

async function handlePhoto(message) {
  const chatId = message.chat.id;
  const userId = message.from?.id;
  if (!userId) return say(chatId, "Не удалось определить пользователя. Нажми /start и попробуй снова.");
  const quota = await supabaseRpc("radar_consume_search", { p_telegram_user_id: userId });
  if (!quota?.allowed) {
    await say(chatId, "🎟 Бесплатные поиски на эту неделю закончились. Следующий поиск стоит 5 Telegram Stars.");
    await sendStarsInvoice(chatId, userId);
    return;
  }
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
  const query = [item.brand, item.model_name, item.model_code].filter(Boolean).join(" ") || [item.brand, item.category, item.color, item.search_terms_ru].filter(Boolean).join(" ");
  const keyboardRows = makeSearchLinks(item).map(button => [button]);
  keyboardRows.push([{ text: "👕 Примерить", callback_data: "tryon_coming_soon" }]);
  const confidence = Math.max(0, Math.min(1, Number(item.confidence) || 0));
  const confidenceLabel = confidence >= 0.85 ? "высокая" : confidence >= 0.6 ? "средняя" : "низкая";
  const details = Array.isArray(item.distinctive_details) ? item.distinctive_details.filter(Boolean).slice(0, 4) : [];
  await say(chatId,
    "🔎 Результат распознавания: " + (query || "модель не определена") +
    (item.category ? "\nКатегория: " + item.category : "") +
    (item.color ? "\nЦвет: " + item.color : "") +
    (item.visible_text ? "\nТекст/бирка: " + String(item.visible_text).slice(0, 180) : "") +
    (details.length ? "\nОтличительные детали: " + details.join("; ") : "") +
    "\nУверенность в модели: " + confidenceLabel + " (" + Math.round(confidence * 100) + "%)" +
    (item.exact_model_confirmed === true ? "\nМодель имеет признаки точного совпадения." : "\nТочная модель пока не подтверждена — поиск по описанию.") +
    "\n\nСверяй фотографии, артикул и характеристики в магазине: похожие вещи могут выглядеть почти одинаково.",
    { inline_keyboard: keyboardRows }
  );
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  if (!BOT_TOKEN) return res.status(503).json({ ok: false, error: "Bot is not configured" });
  const update = req.body || {};
  const callback = update.callback_query;
  if (callback?.data === "tryon_coming_soon") {
    try {
      await telegram("answerCallbackQuery", { callback_query_id: callback.id, text: "Скоро будет!" });
      if (callback.message?.chat?.id) {
        await say(callback.message.chat.id, "👕 Виртуальная примерка одежды и обуви сейчас в разработке. Пока кнопка показывает заглушку — генерация фото и оплата ещё не подключены. Когда функция будет готова, здесь можно будет примерить найденную вещь.");
      }
    } catch (error) {
      console.error("RADAR callback error:", error.message);
    }
    return res.status(200).json({ ok: true });
  }
  if (update.pre_checkout_query) {
    try {
      const query = update.pre_checkout_query;
      const validPayload = /^radar_search:(\d+):\d+$/.test(query.invoice_payload || "") &&
        Number((query.invoice_payload || "").split(":")[1]) === Number(query.from?.id) &&
        query.currency === "XTR" && query.total_amount === 5;
      await telegram("answerPreCheckoutQuery", {
        pre_checkout_query_id: query.id,
        ok: validPayload,
        ...(!validPayload ? { error_message: "Платёж не прошёл проверку. Закрой счёт и попробуй ещё раз." } : {})
      });
    } catch (error) {
      console.error("RADAR pre-checkout error:", error.message);
    }
    return res.status(200).json({ ok: true });
  }
  const message = update.message;
  if (!message?.chat?.id) return res.status(200).json({ ok: true });
  const chatId = message.chat.id;
  try {
    if (message.successful_payment) {
      const payment = message.successful_payment;
      const payload = String(payment.invoice_payload || "");
      const match = payload.match(/^radar_search:(\d+):\d+$/);
      if (!match || Number(match[1]) !== Number(message.from?.id) ||
          payment.currency !== "XTR" || payment.total_amount !== 5) {
        throw new Error("Invalid RADAR Stars payment payload");
      }
      const result = await supabaseRpc("radar_add_paid_search", {
        p_telegram_user_id: Number(match[1]),
        p_charge_id: payment.telegram_payment_charge_id,
        p_amount: payment.total_amount,
        p_currency: payment.currency
      });
      await say(chatId, result?.credited
        ? "⭐ Оплата получена! Добавлен 1 поиск. Теперь отправь фото вещи ещё раз."
        : "Этот платёж уже был учтён. Отправь фото вещи, чтобы продолжить.");
    } else if (message.photo?.length) {
      await handlePhoto(message);
    } else if (message.text === "/start") {
      await trackNewUser(message);
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