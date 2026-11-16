
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

const storeReady = loadSignals();

async function saveSignals() {
  await storeReady;
  await fs.writeFile(STORE_FILE, JSON.stringify(signals, null, 2));
}

// =================================
// أدوات الأسعار
// =================================

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
  return Number.isFinite(number) && number > 0 ? number : null;
}

// =================================
// تحليل Smart اليدوي
// =================================

function analyzeSmart(data) {
  const { high, low, open, current } = data;

  if (high <= low) return "⚠️ الأسعار غير صحيحة.";

  let decision = "⏸ انتظار";
  let reason = "لا يوجد اختراق مؤكد";

  if (current > high && current > open) {
    decision = "🟢 شراء UP";
    reason = "اختراق القمة وبداية صعود";
  } else if (current < low && current < open) {
    decision = "🔴 بيع DOWN";
    reason = "كسر القاع وبداية هبوط";
  }

  return (
    `📊 تحليل Smart - Masaad\n\n` +
    `🔺 أعلى الشمعة السابقة: ${high}\n` +
    `🔻 أقل الشمعة السابقة: ${low}\n` +
    `🕯️ افتتاح الشمعة: ${open}\n` +
    `💰 السعر الحالي: ${current}\n\n` +
    `🎯 القرار: ${decision}\n` +
    `💪 التأكيد: ${reason}\n` +
    `⏱️ الفريم: دقيقة واحدة\n\n` +
    `⚠️ تحليل تقديري وليس ضماناً للربح.`
  );
}

// =================================
// RSI 14
// =================================

function calculateRSI(values, period = 14) {
  if (values.length <= period) {
    throw new Error("البيانات غير كافية لحساب RSI.");
  }

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const change = values[i] - values[i - 1];

    gains += Math.max(change, 0);
    losses += Math.max(-change, 0);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < values.length; i++) {
    const change = values[i] - values[i - 1];

    avgGain =
      (avgGain * (period - 1) + Math.max(change, 0)) / period;

    avgLoss =
      (avgLoss * (period - 1) + Math.max(-change, 0)) / period;
  }

  if (avgLoss === 0) return 100;
  if (avgGain === 0) return 0;

  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

// =================================
// EMA
// =================================

function calculateEMA(values, period) {
  if (values.length < period) {
    throw new Error("البيانات غير كافية لحساب EMA.");
  }

  const multiplier = 2 / (period + 1);

  let ema = values
    .slice(0, period)
    .reduce((sum, value) => sum + value, 0) / period;

  for (let i = period; i < values.length; i++) {
    ema = (values[i] - ema) * multiplier + ema;
  }

  return ema;
}

// =================================
// جلب الشموع المكتملة
// =================================

async function fetchCandles() {
  const apiKey = process.env.TWELVEDATA_API_KEY;

  if (!apiKey) {
    throw new Error("مفتاح TWELVEDATA_API_KEY غير موجود.");
  }

  const url = new URL("https://api.twelvedata.com/time_series");

  url.searchParams.set("symbol", "EUR/USD");
  url.searchParams.set("interval", "1min");
  url.searchParams.set("outputsize", "60");
  url.searchParams.set("apikey", apiKey);

  const response = await fetch(url);
  const result = await response.json();

  if (!response.ok || !result.values || result.status === "error") {
    throw new Error(result.message || "تعذر جلب الشموع.");
  }

  // استبعاد أحدث شمعة غير مكتملة
  const candles = result.values.slice(1).reverse().map(c => ({
    open: Number(c.open),
    high: Number(c.high),
    low: Number(c.low),
    close: Number(c.close),
    time: c.datetime
  }));

  if (!candles.every(c =>
    [c.open, c.high, c.low, c.close].every(Number.isFinite) &&
    c.high >= c.low &&
    c.open >= c.low && c.open <= c.high &&
    c.close >= c.low && c.close <= c.high
  )) {
    throw new Error("بيانات الشموع غير صحيحة.");
  }

  return candles;
}

// =================================
// السعر الحالي
// =================================

async function fetchCurrentPrice() {
  const apiKey = process.env.TWELVEDATA_API_KEY;

  const url = new URL("https://api.twelvedata.com/price");
  url.searchParams.set("symbol", "EUR/USD");
  url.searchParams.set("apikey", apiKey);

  const response = await fetch(url);
  const result = await response.json();

  const price = Number(result.price);

  if (!response.ok || !Number.isFinite(price) || price <= 0) {
    throw new Error(result.message || "تعذر جلب السعر الحالي.");
  }

  return price;
}

// =================================
// مدة الصفقة
// =================================

function chooseDuration(rsi, direction) {
  if (direction === "BUY") {
    if (rsi <= 30) return 45;
    return 30;
  }

  if (direction === "SELL") {
    if (rsi >= 70) return 45;
    return 30;
  }

  return null;
}

// =================================
// استراتيجية Masaad الجديدة
// =================================

async function analyzeEurUsd() {
  const candles = await fetchCandles();

  if (candles.length < 30) {
    throw new Error("الشموع غير كافية للتحليل.");
  }

  const closes = candles.map(c => c.close);

  const rsi = calculateRSI(closes, 14);
  const ema9 = calculateEMA(closes, 9);
  const ema21 = calculateEMA(closes, 21);

  // آخر شمعتين مكتملتين
  const previous = candles[candles.length - 2];
  const confirm = candles[candles.length - 1];

  // الشمعة التأكيدية
  const bullish = confirm.close > confirm.open;
  const bearish = confirm.close < confirm.open;

  const range = confirm.high - confirm.low;
  const body = Math.abs(confirm.close - confirm.open);

  if (range <= 0) {
    throw new Error("مدى الشمعة غير صالح.");
  }

  // قوة إغلاق الشمعة
  const strongBullish =
    bullish &&
    body / range >= 0.35 &&
    (confirm.close - confirm.low) / range >= 0.65;

  const strongBearish =
    bearish &&
    body / range >= 0.35 &&
    (confirm.high - confirm.close) / range >= 0.65;

  // الاختراق المؤكد
  const bullishBreakout =
    strongBullish &&
    confirm.close > previous.high;

  const bearishBreakout =
    strongBearish &&
    confirm.close < previous.low;

  // التشبع مع بداية الانعكاس
  const oversoldBuy =
    rsi <= 30 &&
    strongBullish &&
    confirm.close > previous.close;

  const overboughtSell =
    rsi >= 70 &&
    strongBearish &&
    confirm.close < previous.close;

  // قراءة السعر الحالي
  const livePrice = await fetchCurrentPrice();

  // متوسط مدى آخر 10 شموع
  const recentCandles = candles.slice(-10);

  const averageRange = recentCandles.reduce(
    (sum, c) => sum + (c.high - c.low), 0
  ) / recentCandles.length;

  // منع الدخول بعد ابتعاد السعر عن نقطة التأكيد
  const distance = Math.abs(livePrice - confirm.close);

  const notChasing = distance <= averageRange * 1.0;

  let direction = null;
  let reason = "لا يوجد تأكيد كافٍ";
  let strength = "انتظار";

  // أولوية انعكاس التشبع
  if (oversoldBuy) {
    direction = "BUY";
    reason = "تشبع بيعي مع شمعة صاعدة تأكيدية";
    strength = "تأكيد انعكاس صاعد";
  } else if (overboughtSell) {
    direction = "SELL";
    reason = "تشبع شرائي مع شمعة هابطة تأكيدية";
    strength = "تأكيد انعكاس هابط";
  }

  // اختراق بداية الصعود
  else if (bullishBreakout) {
    direction = "BUY";
    reason = "اختراق قمة الشمعة السابقة وإغلاق صاعد مؤكد";
    strength = "تأكيد اختراق صاعد";
  }

  // كسر بداية الهبوط
  else if (bearishBreakout) {
    direction = "SELL";
    reason = "كسر قاع الشمعة السابقة وإغلاق هابط مؤكد";
    strength = "تأكيد اختراق هابط";
  }

  // منع مطاردة السعر
  if (direction && !notChasing) {
    direction = null;
    reason = "السعر ابتعد عن نقطة الاختراق - لا تطارد الدخول";
    strength = "الدخول متأخر";
  }

  const trend =
    ema9 > ema21 ? "صاعد" :
    ema9 < ema21 ? "هابط" : "متذبذب";

  const decision =
    direction === "BUY" ? "🟢 شراء UP" :
    direction === "SELL" ? "🔴 بيع DOWN" :
    "⏸ انتظار";

  const duration = direction
    ? chooseDuration(rsi, direction)
    : null;

  const message =
    `📊 تحليل EUR/USD - Masaad\n\n` +
    `💰 السعر الحالي: ${livePrice.toFixed(5)}\n\n` +
    `🔺 قمة الشمعة السابقة: ${previous.high.toFixed(5)}\n` +
    `🔻 قاع الشمعة السابقة: ${previous.low.toFixed(5)}\n` +
    `🕯️ إغلاق الشمعة السابقة: ${previous.close.toFixed(5)}\n\n` +
    `🕯️ إغلاق شمعة التأكيد: ${confirm.close.toFixed(5)}\n` +
    `📊 RSI 14: ${rsi.toFixed(2)}\n` +
    `📈 EMA 9: ${ema9.toFixed(5)}\n` +
    `📉 EMA 21: ${ema21.toFixed(5)}\n\n` +
    `📉 الاتجاه العام: ${trend}\n\n` +
    `🎯 القرار: ${decision}\n` +
    `💪 التأكيد: ${strength}\n` +
    `📝 السبب: ${reason}\n` +
    `⏱️ المدة المقترحة: ${duration ? duration + " ثانية" : "لا توجد صفقة"}\n` +
    `📉 الفريم: دقيقة واحدة\n\n` +
    `⚠️ إشارات احتمالية وليست ضماناً للربح.\n` +
    `⚠️ البيانات من Twelve Data وليست ExpertOption OTC.`;

  return {
    message,
    direction,
    duration,
    price: livePrice
  };
}

// =================================
// تقييم نتيجة الإشارة
// =================================

async function evaluateSignal(signal, bot) {
  const remaining = signal.expiresAt - Date.now();

  if (remaining > 0) {
    setTimeout(
      () => evaluateSignal(signal, bot).catch(() => {}),
      remaining
    );
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

// =================================
// استعادة الإشارات المعلقة
// =================================

function restorePendingSignals(bot) {
  storeReady.then(() => {
    for (const signal of signals) {
      if (signal.result === "PENDING") {
        evaluateSignal(signal, bot).catch(() => {});
      }
    }
  });
}

// =================================
// الإحصائيات
// =================================

async function getStats() {
  await storeReady;

  const completed = signals.filter(s =>
    ["WIN", "LOSS", "DRAW"].includes(s.result)
  );

  const wins = completed.filter(s => s.result === "WIN").length;
  const losses = completed.filter(s => s.result === "LOSS").length;
  const draws = completed.filter(s => s.result === "DRAW").length;
  const pending = signals.filter(s => s.result === "PENDING").length;

  const total = wins + losses;

  const accuracy = total
    ? (wins / total * 100).toFixed(1)
    : "0.0";

  return (
    `📊 إحصائيات Masaad\n\n` +
    `📌 إجمالي الإشارات: ${signals.length}\n` +
    `🟢 الرابحة: ${wins}\n` +
    `🔴 الخاسرة: ${losses}\n` +
    `⚪ التعادل: ${draws}\n` +
    `⏳ المعلقة: ${pending}\n\n` +
    `📈 نسبة النجاح: ${accuracy}%`
  );
}

// =================================
// أوامر البوت
// =================================

export function registerCommands(bot) {
  restorePendingSignals(bot);

  bot.command("start", async ctx => {
    sessions.delete(ctx.chat.id);

    await ctx.reply(
      `أهلاً بك في Masaad 🤖\n\n` +
      `💱 /eurusd - تحليل اليورو دولار\n` +
      `📊 /smart - تحليل Smart اليدوي\n` +
      `📈 /stats - إحصائيات الإشارات\n` +
      `📋 /help - المساعدة\n` +
      `🔄 /ping - اختبار البوت`
    );
  });

  bot.command("help", async ctx => {
    await ctx.reply(
      `📋 أوامر Masaad\n\n` +
      `/eurusd - تحليل EUR/USD\n` +
      `/smart - تحليل Smart\n` +
      `/stats - نتائج الإشارات\n` +
      `/cancel - إلغاء التحليل اليدوي\n` +
      `/ping - اختبار البوت\n\n` +
      `🔴 كسر القاع بشمعة هابطة = بيع\n` +
      `🟢 اختراق القمة بشمعة صاعدة = شراء\n` +
      `🟢 تشبع بيعي مع تأكيد صاعد = شراء\n` +
      `🔴 تشبع شرائي مع تأكيد هابط = بيع`
    );
  });

  // =================================
  // EUR/USD
  // =================================

  bot.command("eurusd", async ctx => {
    sessions.delete(ctx.chat.id);

    const waiting = await ctx.reply("⏳ جاري تحليل EUR/USD...");

    try {
      const analysis = await analyzeEurUsd();

      await ctx.api.editMessageText(
        ctx.chat.id,
        waiting.message_id,
        analysis.message
      );

      if (!analysis.direction) return;

      await storeReady;

      const signal = {
        id: `${Date.now()}-${ctx.chat.id}`,
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

  // =================================
  // Smart
  // =================================

  bot.command("smart", async ctx => {
    sessions.set(ctx.chat.id, {
      type: "smart",
      step: 0,
      values: {}
    });

    await ctx.reply(
      `📊 تحليل Smart اليدوي\n\n` +
      `أرسل أعلى سعر للشمعة السابقة:`
    );
  });

  // =================================
  // الإحصائيات
  // =================================

  bot.command("stats", async ctx => {
    await ctx.reply(await getStats());
  });

  // =================================
  // اختبار البوت
  // =================================

  bot.command("ping", async ctx => {
    await ctx.reply("🟢 Masaad يعمل بنجاح.");
  });

  // =================================
  // إلغاء الجلسة
  // =================================

  bot.command("cancel", async ctx => {
    sessions.delete(ctx.chat.id);
    await ctx.reply("تم إلغاء التحليل.");
  });

  // =================================
  // إدخال أسعار Smart
  // =================================

  bot.on("message:text", async ctx => {
    const chatId = ctx.chat.id;
    const text = ctx.message.text.trim();

    if (text.startsWith("/")) return;

    const session = sessions.get(chatId);

    if (!session || session.type !== "smart") {
      return;
    }

    const price = parsePrice(text);

    if (price === null) {
      await ctx.reply("⚠️ أرسل سعراً صحيحاً.");
      return;
    }

    const fields = ["high", "low", "open", "current"];

    const prompts = [
      "🔻 أرسل أقل سعر للشمعة السابقة:",
      "🕯️ أرسل افتتاح الشمعة الجديدة:",
      "💰 أرسل السعر الحالي:"
    ];

    session.values[fields[session.step]] = price;
    session.step++;

    if (session.step < 4) {
      await ctx.reply(prompts[session.step - 1]);
      return;
    }

    sessions.delete(chatId);

    const { high, low, open, current } = session.values;

    if (
      high <= low ||
      open < low || open > high
    ) {
      await ctx.reply("⚠️ الأسعار غير متوافقة. أعد المحاولة.");
      return;
    }

    await ctx.reply(analyzeSmart(session.values));
  });
}
