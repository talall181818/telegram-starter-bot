
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
  return Number.isFinite(number) && number > 0 ? number : null;
}

// ==============================
// Smart اليدوي
// ==============================

function analyzeSmart(data) {
  const { high, low, open, current } = data;
  const range = high - low;

  if (range <= 0) return "⚠️ الأسعار غير صحيحة.";

  const position = (current - low) / range;
  const change = current - open;

  let decision = "⏸ انتظار";
  let strength = "غير كافية";
  let duration = "لا توجد مدة مقترحة";

  if (current > high) {
    decision = "🟢 شراء UP";
    strength = "قوية نسبيًا";
    duration = "دقيقتان";
  } else if (current < low) {
    decision = "🔴 بيع DOWN";
    strength = "قوية نسبيًا";
    duration = "دقيقتان";
  } else if (change > range * 0.08 && position >= 0.65) {
    decision = "🟢 شراء UP";
    strength = "متوسطة";
    duration = "45 ثانية";
  } else if (change < -range * 0.08 && position <= 0.35) {
    decision = "🔴 بيع DOWN";
    strength = "متوسطة";
    duration = "45 ثانية";
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
    `💪 قوة الترجيح: ${strength}\n` +
    `⏱️ المدة المقترحة: ${duration}\n` +
    `📉 الفريم: دقيقة واحدة\n\n` +
    `⚠️ تحليل تقديري وليس ضمانًا للربح.`
  );
}

// ==============================
// المؤشرات
// ==============================

function calculateEMA(values, period) {
  const multiplier = 2 / (period + 1);

  let ema = values.slice(0, period)
    .reduce((sum, value) => sum + value, 0) / period;

  for (let i = period; i < values.length; i++) {
    ema = (values[i] - ema) * multiplier + ema;
  }

  return ema;
}

function calculateRSI(values, period = 14) {
  if (values.length <= period) return 50;

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

  const rs = averageGain / averageLoss;
  return 100 - 100 / (1 + rs);
}

function inspectTrend(candles) {
  const closes = candles.map(c => Number(c.close));

  if (closes.length < 25) {
    throw new Error("البيانات غير كافية لحساب المؤشرات.");
  }

  const ema9 = calculateEMA(closes, 9);
  const ema21 = calculateEMA(closes, 21);
  const rsi = calculateRSI(closes, 14);

  const recent = candles.slice(-4);
  const firstClose = Number(recent[0].close);
  const last = recent[recent.length - 1];
  const lastClose = Number(last.close);
  const lastOpen = Number(last.open);

  let upCandles = 0;
  let downCandles = 0;

  for (const candle of recent) {
    if (Number(candle.close) > Number(candle.open)) upCandles++;
    if (Number(candle.close) < Number(candle.open)) downCandles++;
  }

  let trend = "متذبذب";

  if (
    ema9 > ema21 &&
    lastClose > firstClose &&
    upCandles >= 2
  ) {
    trend = "صاعد";
  }

  if (
    ema9 < ema21 &&
    lastClose < firstClose &&
    downCandles >= 2
  ) {
    trend = "هابط";
  }

  const candleRange = Number(last.high) - Number(last.low);
  const body = Math.abs(lastClose - lastOpen);
  const bodyRatio = candleRange > 0 ? body / candleRange : 0;

  return {
    trend,
    ema9,
    ema21,
    rsi,
    price: lastClose,
    candleUp: lastClose > lastOpen,
    candleDown: lastClose < lastOpen,
    bodyRatio,
    time: last.datetime
  };
}

// ==============================
// بيانات Twelve Data
// ==============================

async function fetchCandles(interval) {
  const apiKey = process.env.TWELVEDATA_API_KEY;

  if (!apiKey) {
    throw new Error("أضف TWELVEDATA_API_KEY في FadeHost.");
  }

  const url = new URL("https://api.twelvedata.com/time_series");

  url.searchParams.set("symbol", "EUR/USD");
  url.searchParams.set("interval", interval);
  url.searchParams.set("outputsize", "50");
  url.searchParams.set("apikey", apiKey);

  const response = await fetch(url);
  const result = await response.json();

  if (!response.ok || result.status === "error" || !result.values) {
    throw new Error(result.message || "تعذر الحصول على بيانات السوق.");
  }

  return result.values.slice().reverse();
}

async function fetchCurrentPrice() {
  const apiKey = process.env.TWELVEDATA_API_KEY;

  const url = new URL("https://api.twelvedata.com/price");
  url.searchParams.set("symbol", "EUR/USD");
  url.searchParams.set("apikey", apiKey);

  const response = await fetch(url);
  const result = await response.json();

  const price = Number(result.price);

  if (!response.ok || !Number.isFinite(price) || price <= 0) {
    throw new Error(result.message || "تعذر قراءة سعر التقييم.");
  }

  return price;
}

// ==============================
// اختيار مدة الإشارة
// ==============================

function chooseDuration(one, five) {
  const rsi = one.rsi;

  if (
    one.bodyRatio >= 0.75 &&
    ((one.trend === "صاعد" && rsi >= 62) ||
     (one.trend === "هابط" && rsi <= 38))
  ) {
    return 30;
  }

  if (
    one.bodyRatio >= 0.60 &&
    ((one.trend === "صاعد" && rsi >= 58) ||
     (one.trend === "هابط" && rsi <= 42))
  ) {
    return 45;
  }

  if (
    (one.trend === "صاعد" && rsi >= 54 && rsi <= 67) ||
    (one.trend === "هابط" && rsi >= 33 && rsi <= 46)
  ) {
    return 60;
  }

  return 120;
}

// ==============================
// تقييم الإشارة وحفظ النتيجة
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
      `⚠️ التقييم حسب Twelve Data وليس سعر ExpertOption OTC.`
    );

  } catch (error) {
    signal.result = "ERROR";
    signal.error = error.message;
    await saveSignals();

    await bot.api.sendMessage(
      signal.chatId,
      "⚠️ تعذر تقييم الإشارة بسبب مشكلة في جلب السعر.\n" +
      "لم يتم احتسابها رابحة أو خاسرة."
    ).catch(() => {});
  }
}

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
// تحليل EUR/USD
// ==============================

async function analyzeEurUsd() {
  const [candles1m, candles5m] = await Promise.all([
    fetchCandles("1min"),
    fetchCandles("5min")
  ]);

  const one = inspectTrend(candles1m);
  const five = inspectTrend(candles5m);

  let direction = null;
  let strength = "غير كافية";
  let duration = null;

  const buyConfirmed =
    one.trend === "صاعد" &&
    five.trend === "صاعد" &&
    one.candleUp &&
    one.ema9 > one.ema21 &&
    one.rsi >= 54 &&
    one.rsi <= 67;

  const sellConfirmed =
    one.trend === "هابط" &&
    five.trend === "هابط" &&
    one.candleDown &&
    one.ema9 < one.ema21 &&
    one.rsi >= 33 &&
    one.rsi <= 46;

  if (buyConfirmed) {
    direction = "BUY";
    strength = "تأكيد فني";
  } else if (sellConfirmed) {
    direction = "SELL";
    strength = "تأكيد فني";
  }

  if (direction) {
    duration = chooseDuration(one, five);
  }

  const decision =
    direction === "BUY" ? "🟢 شراء UP" :
    direction === "SELL" ? "🔴 بيع DOWN" :
    "⏸ انتظار";

  const message =
    `📊 تحليل EUR/USD - Masaad\n\n` +
    `💰 السعر: ${one.price}\n\n` +
    `📈 اتجاه الدقيقة: ${one.trend}\n` +
    `📉 اتجاه 5 دقائق: ${five.trend}\n\n` +
    `EMA 9: ${one.ema9.toFixed(5)}\n` +
    `EMA 21: ${one.ema21.toFixed(5)}\n` +
    `RSI: ${one.rsi.toFixed(2)}\n\n` +
    `🎯 القرار: ${decision}\n` +
    `💪 قوة الترجيح: ${strength}\n` +
    `⏱️ المدة المقترحة: ${duration ? duration + " ثانية" : "لا توجد صفقة"}\n\n` +
    `🕯️ آخر شمعة دقيقة: ${one.time}\n` +
    `🕯️ آخر شمعة 5 دقائق: ${five.time}\n\n` +
    `⚠️ الإشارة تقديرية وليست مضمونة. بيانات Twelve Data قد تختلف عن ExpertOption OTC.`;

  return {
    message,
    direction,
    duration,
    price: one.price
  };
}

// ==============================
// إحصائيات الإشارات
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
    `📈 نسبة النجاح: ${accuracy}%\n\n` +
    `ملاحظة: النسبة محسوبة من الإشارات المكتملة فقط، وبأسعار Twelve Data.`
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
      "📊 /smart - تحليل Smart اليدوي\n" +
      "💱 /eurusd - تحليل اليورو تلقائيًا\n" +
      "📈 /stats - نتائج الإشارات\n" +
      "📋 /help - المساعدة"
    );
  });

  bot.command("help", async ctx => {
    await ctx.reply(
      "📋 أوامر Masaad\n\n" +
      "/smart - تحليل Smart بإدخال الأسعار\n" +
      "/eurusd - تحليل EUR/USD\n" +
      "/stats - إحصائيات الإشارات\n" +
      "/cancel - إلغاء التحليل اليدوي"
    );
  });

  bot.command("smart", async ctx => {
    sessions.set(ctx.chat.id, {
      type: "smart",
      step: 0,
      values: {}
    });

    await ctx.reply(
      "📊 بدأ تحليل Smart اليدوي.\n\n" +
      "أرسل أعلى سعر للشمعة السابقة:"
    );
  });

  bot.command("eurusd", async ctx => {
    sessions.delete(ctx.chat.id);

    await ctx.reply("⏳ جاري تحليل EUR/USD...");

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

  bot.command("stats", async ctx => {
    await ctx.reply(await getStats());
  });

  bot.command("cancel", async ctx => {
    sessions.delete(ctx.chat.id);
    await ctx.reply("تم إلغاء التحليل الحالي.");
  });

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
      await ctx.reply("⚠️ أرسل سعرًا رقميًا صحيحًا، مثل: 263.643");
      return;
    }

    const prompts = [
      "🔻 أرسل أقل سعر للشمعة السابقة:",
      "🕯️ أرسل سعر افتتاح الشمعة الجديدة:",
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
      await ctx.reply(
        "⚠️ أعلى سعر يجب أن يكون أكبر من أقل سعر.\n" +
        "أرسل /smart للبدء من جديد."
      );
      return;
    }

    if (
      session.values.open > session.values.high ||
      session.values.open < session.values.low ||
      session.values.current <= 0
    ) {
      await ctx.reply("⚠️ تحقق من الأسعار المدخلة وأعد التحليل.");
      return;
    }

    await ctx.reply(analyzeSmart(session.values));
  });
}

