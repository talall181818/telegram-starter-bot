
import fs from "node:fs/promises";

const sessions = new Map();
const STORE_FILE = new URL("./masaad-signals.json", import.meta.url);
let signals = [];

async function loadSignals() {
  try {
    signals = JSON.parse(await fs.readFile(STORE_FILE, "utf8"));
    if (!Array.isArray(signals)) signals = [];
  } catch {
    signals = [];
  }
}

let storeReady = loadSignals();

async function saveSignals() {
  await storeReady;
  await fs.writeFile(STORE_FILE, JSON.stringify(signals, null, 2));
}

// ==============================
// أدوات الأسعار
// ==============================

function normalizeDigits(value) {
  return String(value)
    .replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
    .replace(/٫/g, ".")
    .replace(/٬/g, "")
    .replace(/,/g, ".");
}

function parsePrice(value) {
  const cleaned = normalizeDigits(value).trim();

  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;

  const number = Number(cleaned);

  return Number.isFinite(number) && number > 0
    ? number
    : null;
}

// ==============================
// تحليل Smart اليدوي
// ==============================

function analyzeSmart(data) {
  const { high, low, open, current } = data;

  if (high <= low) return "⚠️ الأسعار غير صحيحة.";

  let decision = "⏸ انتظار";
  let strength = "لا يوجد كسر";
  let duration = "لا توجد صفقة";

  if (current > high) {
    decision = "🟢 شراء UP";
    strength = "اختراق أعلى الشمعة";
    duration = "دقيقة واحدة";
  } else if (current < low) {
    decision = "🔴 بيع DOWN";
    strength = "كسر أسفل الشمعة";
    duration = "دقيقة واحدة";
  }

  const trend =
    current > open ? "صاعد" :
    current < open ? "هابط" : "مستقر";

  return (
    `📊 تحليل Smart - Masaad\n\n` +
    `🔺 أعلى الشمعة السابقة: ${high}\n` +
    `🔻 أقل الشمعة السابقة: ${low}\n` +
    `🕯️ افتتاح الشمعة الجديدة: ${open}\n` +
    `💰 السعر الحالي: ${current}\n\n` +
    `📈 الحركة الحالية: ${trend}\n` +
    `🎯 القرار: ${decision}\n` +
    `💪 التأكيد: ${strength}\n` +
    `⏱️ المدة المقترحة: ${duration}\n` +
    `📉 الفريم: دقيقة واحدة\n\n` +
    `⚠️ تحليل تقديري وليس ضمانًا للربح.`
  );
}

// ==============================
// RSI 14
// ==============================

function calculateRSI(values, period = 14) {
  if (values.length <= period) {
    throw new Error("البيانات غير كافية لحساب RSI.");
  }

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const difference = values[i] - values[i - 1];

    if (difference > 0) gains += difference;
    else losses += Math.abs(difference);
  }

  let averageGain = gains / period;
  let averageLoss = losses / period;

  for (let i = period + 1; i < values.length; i++) {
    const difference = values[i] - values[i - 1];

    averageGain =
      (averageGain * (period - 1) + Math.max(difference, 0)) / period;

    averageLoss =
      (averageLoss * (period - 1) + Math.max(-difference, 0)) / period;
  }

  if (averageLoss === 0) return 100;
  if (averageGain === 0) return 0;

  const rs = averageGain / averageLoss;

  return 100 - 100 / (1 + rs);
}

// ==============================
// EMA 9 و EMA 21
// ==============================

function calculateEMA(values, period) {
  if (values.length < period) {
    throw new Error("البيانات غير كافية لحساب EMA.");
  }

  const multiplier = 2 / (period + 1);
  let ema = values[0];

  for (let i = 1; i < values.length; i++) {
    ema = (values[i] - ema) * multiplier + ema;
  }

  return ema;
}

// ==============================
// بيانات EUR/USD
// ==============================

async function fetchCandles() {
  const apiKey = process.env.TWELVEDATA_API_KEY;

  if (!apiKey) {
    throw new Error("أضف TWELVEDATA_API_KEY في FadeHost.");
  }

  const url = new URL("https://api.twelvedata.com/time_series");

  url.searchParams.set("symbol", "EUR/USD");
  url.searchParams.set("interval", "1min");
  url.searchParams.set("outputsize", "50");
  url.searchParams.set("apikey", apiKey);

  const response = await fetch(url);
  const result = await response.json();

  if (!response.ok || result.status === "error" || !result.values) {
    throw new Error(result.message || "تعذر الحصول على بيانات اليورو.");
  }

  // استبعاد أحدث شمعة غير مكتملة
  return result.values.slice(1).reverse();
}

async function fetchCurrentPrice() {
  const apiKey = process.env.TWELVEDATA_API_KEY;

  if (!apiKey) {
    throw new Error("أضف TWELVEDATA_API_KEY في FadeHost.");
  }

  const url = new URL("https://api.twelvedata.com/price");

  url.searchParams.set("symbol", "EUR/USD");
  url.searchParams.set("apikey", apiKey);

  const response = await fetch(url);
  const result = await response.json();
  const price = Number(result.price);

  if (!response.ok || !Number.isFinite(price) || price <= 0) {
    throw new Error(result.message || "تعذر قراءة السعر الحالي.");
  }

  return price;
}

// ==============================
// اختيار مدة الصفقة
// ==============================

function chooseDuration(rsi, direction) {
  const strength = direction === "BUY"
    ? rsi - 50
    : 50 - rsi;

  if (strength >= 12) return 30;
  if (strength >= 8) return 45;
  if (strength >= 5) return 60;

  return 120;
}

// ==============================
// استراتيجية الدخول بعد التصحيح
// ==============================

async function analyzeEurUsd() {
  const candles = await fetchCandles();

  if (candles.length < 25) {
    throw new Error("عدد الشموع غير كافٍ للتحليل.");
  }

  const closes = candles.map(c => Number(c.close));

  if (!closes.every(Number.isFinite)) {
    throw new Error("بيانات الإغلاق غير صحيحة.");
  }

  const rsi = calculateRSI(closes, 14);
  const ema9 = calculateEMA(closes, 9);
  const ema21 = calculateEMA(closes, 21);

  const recent = candles.slice(-4).map(c => ({
    open: Number(c.open),
    high: Number(c.high),
    low: Number(c.low),
    close: Number(c.close)
  }));

  if (
    recent.length < 4 ||
    !recent.every(c =>
      [c.open, c.high, c.low, c.close].every(Number.isFinite) &&
      c.high >= c.low &&
      c.close >= c.low &&
      c.close <= c.high
    )
  ) {
    throw new Error("بيانات الشموع غير صحيحة.");
  }

  const livePrice = await fetchCurrentPrice();

  const pullback = recent[2];
  const confirm = recent[3];

  const averageRange = recent.reduce(
    (sum, c) => sum + (c.high - c.low), 0
  ) / recent.length;

  if (averageRange <= 0) {
    throw new Error("مدى حركة السعر غير صالح.");
  }

  const maxDistance = averageRange * 0.15;

  let direction = null;
  let strength = "لم يكتمل التصحيح والتأكيد";

  // ==============================
  // شراء بعد التصحيح
  // ==============================

  const bullishTrend = ema9 > ema21;

  const bullishPullback =
    pullback.close < pullback.open &&
    pullback.low <= ema9 + averageRange * 0.15;

  const bullishConfirmation =
    confirm.close > confirm.open &&
    confirm.close > (pullback.open + pullback.close) / 2;

  const buyReady =
    bullishTrend &&
    bullishPullback &&
    bullishConfirmation &&
    livePrice > confirm.high &&
    livePrice > ema9 &&
    livePrice - confirm.high <= maxDistance &&
    rsi >= 52 &&
    rsi <= 66;

  // ==============================
  // بيع بعد التصحيح
  // ==============================

  const bearishTrend = ema9 < ema21;

  const bearishPullback =
    pullback.close > pullback.open &&
    pullback.high >= ema9 - averageRange * 0.15;

  const bearishConfirmation =
    confirm.close < confirm.open &&
    confirm.close < (pullback.open + pullback.close) / 2;

  const sellReady =
    bearishTrend &&
    bearishPullback &&
    bearishConfirmation &&
    livePrice < confirm.low &&
    livePrice < ema9 &&
    confirm.low - livePrice <= maxDistance &&
    rsi <= 48 &&
    rsi >= 34;

  if (buyReady) {
    direction = "BUY";
    strength = "تصحيح مكتمل وعودة الزخم الصاعد";
  } else if (sellReady) {
    direction = "SELL";
    strength = "تصحيح مكتمل وعودة الزخم الهابط";
  }

  const decision =
    direction === "BUY" ? "🟢 شراء UP" :
    direction === "SELL" ? "🔴 بيع DOWN" :
    "⏸ انتظار";

  const duration = direction
    ? chooseDuration(rsi, direction)
    : null;

  const message =
    `📊 تحليل EUR/USD - Masaad\n\n` +
    `💰 السعر الحالي: ${livePrice}\n\n` +
    `🔺 أعلى الشمعة السابقة: ${confirm.high}\n` +
    `🔻 أقل الشمعة السابقة: ${confirm.low}\n` +
    `🕯️ إغلاق الشمعة السابقة: ${confirm.close}\n\n` +
    `📊 RSI 14: ${rsi.toFixed(2)}\n` +
    `📈 EMA 9: ${ema9.toFixed(5)}\n` +
    `📉 EMA 21: ${ema21.toFixed(5)}\n\n` +
    `🎯 القرار: ${decision}\n` +
    `💪 قوة الترجيح: ${strength}\n` +
    `⏱️ المدة المقترحة: ${
      duration ? duration + " ثانية" : "لا توجد صفقة"
    }\n` +
    `📉 الفريم: دقيقة واحدة\n\n` +
    `⚠️ دخول بعد التصحيح، وليس ضمانًا للربح.`;

  return {
    message,
    direction,
    duration,
    price: livePrice
  };
}

// ==============================
// تقييم الإشارات
// ==============================

async function evaluateSignal(signal, bot) {
  const remaining = signal.expiresAt - Date.now();

  if (remaining > 0) {
    const timer = setTimeout(
      () => evaluateSignal(signal, bot).catch(() => {}),
      remaining
    );

    if (timer.unref) timer.unref();

    return;
  }

  try {
    const exitPrice = await fetchCurrentPrice();

    signal.exitPrice = exitPrice;
    signal.finishedAt = new Date().toISOString();

    if (signal.direction === "BUY") {
      signal.result =
        exitPrice > signal.entryPrice ? "WIN" :
        exitPrice < signal.entryPrice ? "LOSS" : "DRAW";
    } else {
      signal.result =
        exitPrice < signal.entryPrice ? "WIN" :
        exitPrice > signal.entryPrice ? "LOSS" : "DRAW";
    }

    await saveSignals();

    const resultText = {
      WIN: "🟢 رابحة",
      LOSS: "🔴 خاسرة",
      DRAW: "⚪ تعادل"
    }[signal.result];

    await bot.api.sendMessage(
      signal.chatId,
      `📊 نتيجة إشارة EUR/USD\n\n` +
      `الاتجاه: ${signal.direction === "BUY" ? "شراء UP" : "بيع DOWN"}\n` +
      `سعر الدخول: ${signal.entryPrice}\n` +
      `سعر التقييم: ${exitPrice}\n` +
      `المدة: ${signal.duration} ثانية\n\n` +
      `النتيجة: ${resultText}\n\n` +
      `⚠️ التقييم بسعر Twelve Data وليس سعر ExpertOption OTC.`
    );

  } catch (error) {
    signal.result = "ERROR";
    signal.error = error.message;

    await saveSignals();

    await bot.api.sendMessage(
      signal.chatId,
      "⚠️ تعذر تقييم الإشارة بسبب مشكلة في جلب السعر."
    ).catch(() => {});
  }
}

// ==============================
// استعادة الصفقات المعلقة
// ==============================

function restorePendingSignals(bot) {
  storeReady.then(() => {
    for (const signal of signals) {
      if (signal.result === "PENDING") {
        evaluateSignal(signal, bot).catch(() => {});
      }
    }
  });
}

// ==============================
// الإحصائيات
// ==============================

async function getStats() {
  await storeReady;

  const completed = signals.filter(s =>
    ["WIN", "LOSS", "DRAW"].includes(s.result)
  );

  const wins = completed.filter(s => s.result === "WIN").length;
  const losses = completed.filter(s => s.result === "LOSS").length;
  const draws = completed.filter(s => s.result === "DRAW").length;
  const pending = signals.filter(s => s.result === "PENDING").length;
  const errors = signals.filter(s => s.result === "ERROR").length;

  const counted = wins + losses;

  const accuracy = counted > 0
    ? (wins / counted * 100).toFixed(1)
    : "0.0";

  return (
    `📊 إحصائيات Masaad\n\n` +
    `📌 إجمالي الإشارات: ${signals.length}\n` +
    `🟢 الرابحة: ${wins}\n` +
    `🔴 الخاسرة: ${losses}\n` +
    `⚪ التعادل: ${draws}\n` +
    `⏳ قيد التقييم: ${pending}\n` +
    `⚠️ تعذر تقييمها: ${errors}\n\n` +
    `📈 نسبة النجاح: ${accuracy}%`
  );
}

// ==============================
// أوامر Telegram
// ==============================

export function registerCommands(bot) {
  restorePendingSignals(bot);

  bot.command("start", async ctx => {
    sessions.delete(ctx.chat.id);

    await ctx.reply(
      "أهلًا بك في Masaad 🤖\n\n" +
      "📊 /smart - تحليل Smart\n" +
      "💱 /eurusd - تحليل اليورو دولار\n" +
      "📈 /stats - نتائج الإشارات\n" +
      "📋 /help - المساعدة"
    );
  });

  bot.command("help", async ctx => {
    await ctx.reply(
      "📋 أوامر Masaad\n\n" +
      "/smart - تحليل Smart بكسر الشمعة\n" +
      "/eurusd - تحليل EUR/USD بعد التصحيح\n" +
      "/stats - إحصائيات الإشارات\n" +
      "/cancel - إلغاء التحليل اليدوي"
    );
  });

  // ==============================
  // Smart
  // ==============================

  bot.command("smart", async ctx => {
    sessions.set(ctx.chat.id, {
      type: "smart",
      step: 0,
      values: {}
    });

    await ctx.reply(
      "📊 تحليل Smart - فريم الدقيقة\n\n" +
      "أرسل أعلى سعر للشمعة السابقة:"
    );
  });

  // ==============================
  // EUR/USD
  // ==============================

  bot.command("eurusd", async ctx => {
    sessions.delete(ctx.chat.id);

    await ctx.reply("⏳ جاري تحليل EUR/USD بعد التصحيح...");

    try {
      const analysis = await analyzeEurUsd();

      await ctx.reply(analysis.message);

      if (!analysis.direction) return;

      await storeReady;

      const signal = {
        id: `${Date.now()}-${Math.random()}`,
        chatId: ctx.chat.id,
        direction: analysis.direction,
        entryPrice: analysis.price,
        duration: analysis.duration,
        createdAt: new Date().toISOString(),
        expiresAt: Date.now() + analysis.duration * 1000,
        result: "PENDING"
      };

      signals.push(signal);

      await saveSignals();

      await ctx.reply(
        `📝 تم تسجيل الإشارة للاختبار.\n` +
        `سيتم تقييمها بعد ${analysis.duration} ثانية.`
      );

      evaluateSignal(signal, bot).catch(() => {});

    } catch (error) {
      await ctx.reply(
        `⚠️ تعذر تحليل EUR/USD:\n${error.message}`
      );
    }
  });

  // ==============================
  // الإحصائيات
  // ==============================

  bot.command("stats", async ctx => {
    await ctx.reply(await getStats());
  });

  // ==============================
  // إلغاء التحليل
  // ==============================

  bot.command("cancel", async ctx => {
    sessions.delete(ctx.chat.id);

    await ctx.reply("تم إلغاء التحليل الحالي.");
  });

  // ==============================
  // إدخال أسعار Smart
  // ==============================

  bot.on("message:text", async ctx => {
    const chatId = ctx.chat.id;
    const text = ctx.message.text.trim();

    if (text.startsWith("/")) return;

    const session = sessions.get(chatId);

    if (!session || session.type !== "smart") {
      await ctx.reply(
        "اختر التحليل:\n/smart لتحليل Smart\n/eurusd لتحليل اليورو"
      );
      return;
    }

    const price = parsePrice(text);

    if (price === null) {
      await ctx.reply("⚠️ أرسل سعرًا صحيحًا، مثل: 1.10050");
      return;
    }

    const prompts = [
      "🔻 أرسل أقل سعر للشمعة السابقة:",
      "🕯️ أرسل افتتاح الشمعة الجديدة:",
      "💰 أرسل السعر الحالي:"
    ];

    const fields = ["high", "low", "open", "current"];

    session.values[fields[session.step]] = price;
    session.step++;

    if (session.step < 4) {
      sessions.set(chatId, session);

      await ctx.reply(prompts[session.step - 1]);
      return;
    }

    sessions.delete(chatId);

    if (session.values.high <= session.values.low) {
      await ctx.reply("⚠️ أعلى سعر يجب أن يكون أكبر من أقل سعر.");
      return;
    }

    if (
      session.values.open > session.values.high ||
      session.values.open < session.values.low
    ) {
      await ctx.reply("⚠️ الافتتاح يجب أن يكون بين أعلى وأقل سعر.");
      return;
    }

    await ctx.reply(analyzeSmart(session.values));
  });
}
