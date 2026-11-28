const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const NEW_USERS_CHAT_ID = "-1003674295085";

async function trackNewUser(message) {
  if (!SUPABASE_URL || !SUPABASE_KEY || !message.from?.id) return;
  try {
    const userId = Number(message.from.id);
    const startPayload = String(message.text || "").trim().split(/\\s+/, 2)[1] || "";
    const refMatch = startPayload.match(/^ref_(\\d+)$/);
    let referredBy = refMatch ? Number(refMatch[1]) : null;
    if (!Number.isSafeInteger(referredBy) || referredBy === userId) referredBy = null;
    if (referredBy) {
      const check = await fetch(SUPABASE_URL + "/rest/v1/radar_bot_users?telegram_user_id=eq." + referredBy + "&select=telegram_user_id&limit=1", { headers: { apikey: SUPABASE_KEY, authorization: "Bearer " + SUPABASE_KEY } });
      const rows = check.ok ? await check.json() : [];
      if (!Array.isArray(rows) || !rows.length) referredBy = null;
    }
    const response = await fetch(SUPABASE_URL + "/rest/v1/radar_bot_users", {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, authorization: "Bearer " + SUPABASE_KEY, "content-type": "application/json", Prefer: "resolution=ignore-duplicates,return=representation" },
      body: JSON.stringify({ telegram_user_id: userId, chat_id: message.chat.id, username: message.from.username || null, first_name: message.from.first_name || null, last_name: message.from.last_name || null, referred_by: referredBy })
    });
    if (!response.ok) throw new Error("Supabase insert failed: " + response.status);
    const inserted = await response.json();
    if (!Array.isArray(inserted) || !inserted.length) return;
    const countResponse = await fetch(SUPABASE_URL + "/rest/v1/radar_bot_users?select=telegram_user_id", { method: "HEAD", headers: { apikey: SUPABASE_KEY, authorization: "Bearer " + SUPABASE_KEY, Prefer: "count=exact", Range: "0-0" } });
    const total = (countResponse.headers.get("content-range") || "").split("/")[1] || "—";
    const name = [message.from.first_name, message.from.last_name].filter(Boolean).join(" ") || "не указано";
    const username = message.from.username ? "@" + message.from.username : "не указан";
    let refLine = "";
    if (referredBy) {
      const rr = await fetch(SUPABASE_URL + "/rest/v1/radar_bot_users?telegram_user_id=eq." + referredBy + "&select=username,first_name&limit=1", { headers: { apikey: SUPABASE_KEY, authorization: "Bearer " + SUPABASE_KEY } });
      const refs = rr.ok ? await rr.json() : [];
      refLine = "\nПригласил: " + (refs[0]?.username ? "@" + refs[0].username : (refs[0]?.first_name || "ID " + referredBy));
    }
    await say(NEW_USERS_CHAT_ID, "🆕 Новый пользователь RADAR\nИмя: " + name + "\nUsername: " + username + "\nID: " + userId + refLine + "\nВсего пользователей: " + total);
  } catch (error) { console.error("RADAR user tracking error:", error.message); }
}

async function getReferralCount(userId) {
  const response = await fetch(SUPABASE_URL + "/rest/v1/radar_bot_users?referred_by=eq." + Number(userId) + "&select=telegram_user_id", { method: "HEAD", headers: { apikey: SUPABASE_KEY, authorization: "Bearer " + SUPABASE_KEY, Prefer: "count=exact", Range: "0-0" } });
  if (!response.ok) throw new Error("Не удалось получить статистику приглашений");
  const count = Number((response.headers.get("content-range") || "").split("/")[1]);
  return Number.isFinite(count) ? count : 0;
}

async function getReferralLeaderboard() {
  return supabaseRpc("radar_referral_leaderboard", {});
}

function referralLink(userId) {
  return "https://t.me/P_radar_bot?start=ref_" + Number(userId);
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
  return { keyboard: [[{ text: "🔎 Найти по фото" }], [{ text: "🎁 Моя ссылка" }], [{ text: "ℹ️ Помощь" }]], resize_keyboard: true };
}

async function identifyImage(bytes, mimeType) {
  if (!GEMINI_KEY) throw new Error("GEMINI_KEY_MISSING");
  const base64 = Buffer.from(bytes).toString("base64");
  const prompt = [
    "Ты эксперт по визуальной идентификации одежды, обуви, сумок и аксессуаров для поиска товаров в России и Беларуси.",
    "Осмотри логотипы, надписи, бирки, ярлыки, принты, форму карманов, швы, подошву, застёжки, силуэт и другие уникальные детали.",
    "Перепиши только реально читаемый текст с фото, включая артикулы и коды. Не угадывай нечитаемые символы.",
    "Определи бренд и модель только при наличии визуальных оснований. Не путай общий тип вещи с конкретной моделью. Не выдумывай артикулы.",
    "Определи также подтип товара, предполагаемый материал, принт/узор, посадку и целевую категорию (мужская/женская/детская/унисекс) только если это видно; неизвестное оставляй пустым.",
    "Разделяй наблюдения и догадки: не выводи бренд по одному лишь стилю, не считай похожий силуэт доказательством модели. Если точная модель не подтверждается, оставь model_name и model_code пустыми.",
    "Сформируй search_terms_ru как естественный запрос для магазинов РФ/РБ: бренд (если подтверждён) + тип вещи + цвет + 2-3 уникальные детали. search_terms_en — аналогичный запрос на английском.",
    "Укажи отличительные признаки, которые поддерживают идентификацию. confidence — число от 0 до 1, уверенность именно в модели, а не в категории. Для точной модели требуй читаемый артикул/название или несколько очень характерных совпадающих деталей.",
    "Верни только JSON: {",
    '\"is_identifiable\": boolean, \"brand\": string, \"model_name\": string,',
    '\"model_code\": string, \"category\": string, \"subcategory\": string,',
    '\"color\": string, \"material\": string, \"pattern\": string, \"fit\": string, \"gender\": string,',
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
  const clean = (v) => String(v || "").replace(/\\s+/g, " ").trim();
  const brand = clean(item.brand);
  const model = clean(item.model_name);
  const code = clean(item.model_code);
  const category = clean(item.subcategory || item.category);
  const color = clean(item.color);
  const material = clean(item.material);
  const pattern = clean(item.pattern);
  const ru = clean(item.search_terms_ru);
  const details = Array.isArray(item.distinctive_details) ? item.distinctive_details.filter(Boolean).slice(0, 2).join(" ") : "";
  // Do not label an unverified guess as an exact-model search.
  const confirmed = item.exact_model_confirmed === true && Boolean(model || code);
  const preciseText = [brand, model, code, category].filter(Boolean).join(" ");
  const descriptiveText = [brand, ru || [category, color, material, pattern, details].filter(Boolean).join(" ")].filter(Boolean).join(" ");
  const exactQuery = encodeURIComponent(preciseText || descriptiveText || "одежда");
  const similarQuery = encodeURIComponent(descriptiveText || preciseText || "одежда");
  const shops = [
    { name: "Ozon", base: "https://www.ozon.ru/search/?text=" },
    { name: "Wildberries", base: "https://www.wildberries.ru/catalog/0/search.aspx?search=" },
    { name: "Avito", base: "https://www.avito.ru/rossiya?q=" },
    { name: "Kufar", base: "https://www.kufar.by/l?query=" }
  ];
  const links = [];
  for (const shop of shops) {
    links.push({
      text: (confirmed ? "🎯 " : "🔎 ") + shop.name + (confirmed ? " · модель" : " · поиск"),
      url: shop.base + (confirmed ? exactQuery : similarQuery)
    });
  }
  links.push({ text: "💰 Купить по лучшей цене", url: "https://t.me/radar_shmot" });
  links.push({ text: "📢 Купить рекламу · @verpot", url: "https://t.me/verpot" });
  return links;
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
  if (!GEMINI_KEY) return say(chatId, "Распознавание пока не настроено. Попробуй позже.");
  const quota = await supabaseRpc("radar_consume_search", { p_telegram_user_id: userId });
  if (!quota?.allowed) {
    await say(chatId, "🎟 Бесплатные поиски на эту неделю закончились. Следующий поиск стоит 5 Telegram Stars.");
    await sendStarsInvoice(chatId, userId);
    return;
  }
  await say(chatId, "📸 Фото получил. Пытаюсь определить бренд и модель…");
  let file;
  let item;
  try {
    const photo = message.photo[message.photo.length - 1];
    file = await getFileBytes(photo.file_id);
    item = await identifyImage(file.bytes, file.mimeType);
  } catch (error) {
    try {
      await supabaseRpc("radar_refund_search", {
        p_telegram_user_id: userId,
        p_kind: quota.kind,
        p_week_start: quota.week_start
      });
    } catch (refundError) {
      console.error("RADAR search refund error:", refundError.message);
    }
    throw new Error("Поиск не выполнен. Попробуй ещё раз — попытка возвращена.");
  }
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
    (item.subcategory ? "\nПодтип: " + item.subcategory : "") +
    (item.color ? "\nЦвет: " + item.color : "") +
    (item.material ? "\nМатериал: " + item.material : "") +
    (item.pattern ? "\nУзор: " + item.pattern : "") +
    (item.fit ? "\nПосадка: " + item.fit : "") +
    (item.gender ? "\nЛинейка: " + item.gender : "") +
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
  if (callback?.data === "get_ref_link") {
    try {
      const userId = callback.from?.id;
      const count = await getReferralCount(userId);
      await telegram("answerCallbackQuery", { callback_query_id: callback.id });
      await say(callback.message.chat.id,
        "🎁 Твоя личная ссылка для розыгрыша:\n" + referralLink(userId) +
        "\n\n👥 Приглашено друзей: " + count +
        "\n\nЗасчитываются только новые пользователи, которые впервые запускают бота по твоей ссылке."
      );
    } catch (error) {
      console.error("RADAR referral callback error:", error.message);
      await telegram("answerCallbackQuery", { callback_query_id: callback.id, text: "Не удалось получить ссылку. Попробуй ещё раз." });
    }
    return res.status(200).json({ ok: true });
  }
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
    } else if (message.text === "/start" || String(message.text || "").startsWith("/start ")) {
      await trackNewUser(message);
      await say(chatId,
        "🎁 РОЗЫГРЫШ RADAR!\n\nПобедит тот, кто пригласит больше всего новых пользователей в бота.\n\n🏆 Чем больше друзей пригласишь — тем выше твои шансы на победу!\n\nНажми кнопку ниже, чтобы получить личную ссылку для приглашений.",
        { inline_keyboard: [[{ text: "🎁 Получить реферальную ссылку", callback_data: "get_ref_link" }]] }
      );
    } else if (message.text === "/ref" || message.text === "🎁 Моя ссылка") {
      const inviteCount = await getReferralCount(message.from.id);
      await say(chatId, "🎁 Твоя реферальная ссылка:\n" + referralLink(message.from.id) + "\n\nПриглашено новых пользователей: " + inviteCount + "\n\nЗасчитываются только новые аккаунты, которые впервые запускают бота по твоей ссылке.");
    } else if ((String(message.text || "").split("@")[0] === "/refstats" || String(message.text || "").split("@")[0] === "/refleaderboard") &&
      (String(message.from?.username || "").toLowerCase() === "verpot" || String(chatId) === NEW_USERS_CHAT_ID)) {
      const rows = await getReferralLeaderboard();
      const list = Array.isArray(rows) ? rows : [];
      const totalInvited = list.reduce((sum, row) => sum + Number(row.invited_count || 0), 0);
      const totalResponse = await fetch(SUPABASE_URL + "/rest/v1/radar_bot_users?select=telegram_user_id", { method: "HEAD", headers: { apikey: SUPABASE_KEY, authorization: "Bearer " + SUPABASE_KEY, Prefer: "count=exact", Range: "0-0" } });
      const totalUsers = (totalResponse.headers.get("content-range") || "").split("/")[1] || "—";
      const top = list.slice(0, 30).map((row, i) => (i + 1) + ". " + (row.username ? "@" + row.username : (row.first_name || "Без имени")) + " — " + Number(row.invited_count || 0) + " приглаш.");
      await say(chatId, "📊 Статистика розыгрыша RADAR\nВсего пользователей: " + totalUsers + "\nПришли по реферальным ссылкам: " + totalInvited + "\n\n🏆 Таблица лидеров:\n" + (top.join("\n") || "Пока приглашений нет."));
    } else if (message.text === "/help" || message.text === "ℹ️ Помощь") {
      await say(chatId, "Отправь фото одной вещи при хорошем освещении. Лучше, если видны логотип, бирка и детали. Поиск открывается ссылками; цены и наличие нужно проверить в магазине.", keyboard());
    } else if (message.text === "🔎 Найти по фото") {
      await say(chatId, "Пришли фотографию вещи одним сообщением.");
    } else {
      await say(chatId, "Чтобы начать поиск, отправь фотографию вещи.");
    }
  } catch (error) {
    console.error("RADAR bot error:", error.message);
    await say(chatId, error.message.includes("Поиск не выполнен") ? error.message : "Не удалось обработать фото. Попробуй ещё раз чуть позже.");
  }
  return res.status(200).json({ ok: true });
};