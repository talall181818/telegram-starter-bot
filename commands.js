
const sessions = new Map();

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

function durationFor(strength) {
  return strength === "strong" ? "دقيقتان" : "45 ثانية";
}

// ==============================
// Smart: تحليل يدوي
// ==============================

function analyzeSmart(data) {
  const { high, low, open, current } = data;
  const range = high - low;

  if (range <= 0) {
    return "⚠️ الأسعار غير صحيحة. أعد المحاولة.";
  }

  const position = (current - low) / range;
  const change = current - open;

  let decision = "⏸ انتظار";
  let strength = "weak";
  let duration = "لا توجد مدة مقترحة";

  if (current > high) {
    decision = "🟢 شراء UP";
    strength = "strong";
  } else if (current < low) {
    decision = "🔴 بيع DOWN";
    strength = "strong";
  } else if (change > range * 0.08 && position >= 0.65) {
    decision = "🟢 شراء UP";
    strength = "medium";
  } else if (change < -range * 0.08 && position <= 0.35) {
    decision = "🔴 بيع DOWN";
    strength = "medium";
  }

  if (decision !== "⏸ انتظار") {
    duration = durationFor(strength);
  }

  const trend =
    current > open ? "صاعد" :
    current < open ? "هابط" : "مستقر";

  const confidence =
    strength === "strong" ? "قوية نسبيًا" :
    strength === "medium" ? "متوسطة" : "غير كافية";

  return (
    `📊 تحليل Smart - Masaad\n\n` +
    `🔺 أعلى الشمعة السابقة: ${high}\n` +
    `🔻 أقل الشمعة السابقة: ${low}\n` +
    `🕯️ افتتاح الشمعة الجديدة: ${open}\n` +
    `💰 السعر الحالي: ${current}\n\n` +
    `📈 الحركة الحالية: ${trend}\n` +
    `🎯 القرار: ${decision}\n` +
    `💪 قوة الترجيح: ${confidence}\n` +
    `⏱️ المدة المقترحة: ${duration}\n` +
    `📉 الفريم: دقيقة واحدة\n\n` +
    `⚠️ تحليل تقديري من الأسعار المدخلة، وليس ضمانًا للربح.`
  );
}

// ==============================
// EUR/USD: بيانات تلقائية
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

async function analyzeEurUsd() {
  const apiKey = process.env.TWELVEDATA_API_KEY;

  if (!apiKey) {
    return "⚠️ لم أجد TWELVEDATA_API_KEY في إعدادات FadeHost.";
  }

  try {
    const url = new URL("https://api.twelvedata.com/time_series");
    url.searchParams.set("symbol", "EUR/USD");
    url.searchParams.set("interval", "1min");
    url.searchParams.set("outputsize", "40");
    url.searchParams.set("apikey", apiKey);

    const response = await fetch(url);
    const result = await response.json();

    if (!response.ok || result.status === "error" || !result.values) {
      return (
        "⚠️ تعذر جلب بيانات EUR/USD.\n" +
        (result.message || "تحقق من مفتاح Twelve Data وحدود الاستخدام.")
      );
    }

    // Twelve Data يعيد أحدث شمعة أولاً؛ نعكس الترتيب للحساب.
    const candles = result.values.slice().reverse();
    const closes = candles.map(c => Number(c.close));

    if (closes.length < 22 || closes.some(v => !Number.isFinite(v))) {
      return "⚠️ البيانات المستلمة غير كافية للتحليل.";
    }

    const ema9 = calculateEMA(closes, 9);
    const ema21 = calculateEMA(closes, 21);
    const rsi = calculateRSI(closes, 14);

    const last = candles[candles.length - 1];
    const previous = candles[candles.length - 2];

    const current = Number(last.close);
    const previousClose = Number(previous.close);

    const bullish =
      ema9 > ema21 &&
      rsi >= 52 &&
      rsi < 70 &&
      current > previousClose;

    const bearish =
      ema9 < ema21 &&
      rsi <= 48 &&
      rsi > 30 &&
      current < previousClose;

    let decision = "⏸ انتظار";
    let strength = "غير كافية";
    let duration = "لا توجد صفقة مقترحة";
    let trend = "متذبذب";

    if (ema9 > ema21) trend = "صاعد";
    if (ema9 < ema21) trend = "هابط";

    if (bullish) {
      decision = "🟢 شراء UP";
      strength = rsi >= 55 ? "قوية نسبيًا" : "متوسطة";
      duration = rsi >= 55 ? "دقيقتان" : "45 ثانية";
    } else if (bearish) {
      decision = "🔴 بيع DOWN";
      strength = rsi <= 45 ? "قوية نسبيًا" : "متوسطة";
      duration = rsi <= 45 ? "دقيقتان" : "45 ثانية";
    }

    return (
      `📊 تحليل EUR/USD - Masaad\n\n` +
      `💰 السعر الحالي: ${current}\n` +
      `📈 الاتجاه: ${trend}\n` +
      `EMA 9: ${ema9.toFixed(5)}\n` +
      `EMA 21: ${ema21.toFixed(5)}\n` +
      `RSI: ${rsi.toFixed(2)}\n\n` +
      `🎯 القرار: ${decision}\n` +
      `💪 قوة الترجيح: ${strength}\n` +
      `⏱️ المدة المقترحة: ${duration}\n` +
      `📉 الفريم: دقيقة واحدة\n` +
      `🕯️ وقت آخر شمعة: ${last.datetime}\n\n` +
      `⚠️ البيانات من Twelve Data، وقد تختلف عن سعر EUR/USD OTC في ExpertOption. الإشارة تقديرية وليست ضمانًا للربح.`
    );
  } catch (error) {
    return "⚠️ حدث خطأ أثناء الاتصال بمصدر بيانات EUR/USD. حاول مرة أخرى.";
  }
}

// ==============================
// أوامر البوت
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
      "/eurusd - تحليل EUR/USD تلقائيًا\n" +
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

    await ctx.reply("⏳ جاري جلب بيانات EUR/USD وتحليل السوق...");

    const analysis = await analyzeEurUsd();
    await ctx.reply(analysis);
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

