
const sessions = new Map();

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
    `⚠️ تحليل تقديري من الأسعار المدخلة، وليس ضمانًا للربح.`
  );
}

// ==============================
// مؤشرات EUR/USD
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
    const gain = Math.max(difference, 0);
    const loss = Math.max(-difference, 0);

    averageGain = (averageGain * (period - 1) + gain) / period;
    averageLoss = (averageLoss * (period - 1) + loss) / period;
  }

  if (averageLoss === 0) return 100;

  const rs = averageGain / averageLoss;
  return 100 - 100 / (1 + rs);
}

// يحدد الاتجاه باستخدام EMA وحركة آخر الشموع
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
  const lastClose = Number(recent[recent.length - 1].close);

  let upCandles = 0;
  let downCandles = 0;

  for (const candle of recent) {
    const open = Number(candle.open);
    const close = Number(candle.close);

    if (close > open) upCandles++;
    if (close < open) downCandles++;
  }

  let trend = "متذبذب";

  const bullish =
    ema9 > ema21 &&
    lastClose > firstClose &&
    upCandles >= 2;

  const bearish =
    ema9 < ema21 &&
    lastClose < firstClose &&
    downCandles >= 2;

  if (bullish) trend = "صاعد";
  if (bearish) trend = "هابط";

  return {
    trend,
    ema9,
    ema21,
    rsi,
    price: lastClose,
    time: recent[recent.length - 1].datetime
  };
}

// ==============================
// جلب بيانات Twelve Data
// ==============================

async function fetchCandles(interval) {
  const apiKey = process.env.TWELVEDATA_API_KEY;

  if (!apiKey) {
    throw new Error("مفتاح TWELVEDATA_API_KEY غير موجود في FadeHost.");
  }

  const url = new URL("https://api.twelvedata.com/time_series");

  url.searchParams.set("symbol", "EUR/USD");
  url.searchParams.set("interval", interval);
  url.searchParams.set("outputsize", "50");
  url.searchParams.set("apikey", apiKey);

  const response = await fetch(url);
  const result = await response.json();

  if (!response.ok || result.status === "error" || !result.values) {
    throw new Error(
      result.message || "تعذر الحصول على بيانات السوق."
    );
  }

  return result.values.slice().reverse();
}

// ==============================
// تحليل EUR/USD بفريمين
// ==============================

async function analyzeEurUsd() {
  try {
    const [candles1m, candles5m] = await Promise.all([
      fetchCandles("1min"),
      fetchCandles("5min")
    ]);

    const oneMinute = inspectTrend(candles1m);
    const fiveMinutes = inspectTrend(candles5m);

    let decision = "⏸ انتظار";
    let strength = "غير كافية";
    let duration = "لا توجد صفقة مقترحة";

    if (
      oneMinute.trend === "صاعد" &&
      fiveMinutes.trend === "صاعد" &&
      oneMinute.rsi >= 50 &&
      oneMinute.rsi < 70
    ) {
      decision = "🟢 شراء UP";
      strength = "قوية نسبيًا";
      duration = "دقيقتان";
    } else if (
      oneMinute.trend === "هابط" &&
      fiveMinutes.trend === "هابط" &&
      oneMinute.rsi <= 50 &&
      oneMinute.rsi > 30
    ) {
      decision = "🔴 بيع DOWN";
      strength = "قوية نسبيًا";
      duration = "دقيقتان";
    } else if (
      oneMinute.trend === fiveMinutes.trend &&
      oneMinute.trend !== "متذبذب"
    ) {
      if (
        oneMinute.trend === "صاعد" &&
        oneMinute.rsi < 70
      ) {
        decision = "🟢 شراء UP";
        strength = "متوسطة";
        duration = "45 ثانية";
      } else if (
        oneMinute.trend === "هابط" &&
        oneMinute.rsi > 30
      ) {
        decision = "🔴 بيع DOWN";
        strength = "متوسطة";
        duration = "45 ثانية";
      }
    }

    return (
      `📊 تحليل EUR/USD - Masaad\n\n` +
      `💰 السعر: ${oneMinute.price}\n\n` +
      `📈 اتجاه الدقيقة: ${oneMinute.trend}\n` +
      `📉 اتجاه 5 دقائق: ${fiveMinutes.trend}\n\n` +
      `EMA 9: ${oneMinute.ema9.toFixed(5)}\n` +
      `EMA 21: ${oneMinute.ema21.toFixed(5)}\n` +
      `RSI: ${oneMinute.rsi.toFixed(2)}\n\n` +
      `🎯 القرار: ${decision}\n` +
      `💪 قوة الترجيح: ${strength}\n` +
      `⏱️ المدة المقترحة: ${duration}\n\n` +
      `🕯️ آخر شمعة دقيقة: ${oneMinute.time}\n` +
      `🕯️ آخر شمعة 5 دقائق: ${fiveMinutes.time}\n\n` +
      `⚠️ البيانات من Twelve Data وقد تختلف عن EUR/USD OTC في ExpertOption. الإشارة تقديرية وليست ضمانًا للربح.`
    );

  } catch (error) {
    return `⚠️ تعذر تحليل EUR/USD:\n${error.message}`;
  }
}

// ==============================
// أوامر Telegram
// ==============================

export function registerCommands(bot) {

  bot.command("start", async ctx => {
    sessions.delete(ctx.chat.id);

    await ctx.reply(
      "أهلًا بك في Masaad 🤖\n\n" +
      "📊 /smart - تحليل Smart اليدوي\n" +
      "💱 /eurusd - تحليل اليورو تلقائيًا\n" +
      "📋 /help - المساعدة"
    );
  });

  bot.command("help", async ctx => {
    await ctx.reply(
      "📋 أوامر Masaad\n\n" +
      "/smart - تحليل Smart بإدخال الأسعار\n" +
      "/eurusd - تحليل EUR/USD تلقائيًا بفريم الدقيقة و5 دقائق\n" +
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

    await ctx.reply(
      "⏳ جاري تحليل EUR/USD على فريم الدقيقة و5 دقائق..."
    );

    await ctx.reply(await analyzeEurUsd());
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
        "اختر التحليل:\n/smart لتحليل Smart\n/eurusd لتحليل اليورو تلقائيًا"
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
        "⚠️ أعلى سعر يجب أن يكون أكبر من أقل سعر.\nأرسل /smart للبدء من جديد."
      );
      return;
    }

    await ctx.reply(analyzeSmart(session.values));
  });
}
