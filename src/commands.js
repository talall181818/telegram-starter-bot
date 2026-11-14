
const sessions = new Map();

function parsePrice(text) {
  const normalized = text.trim()
    .replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
    .replace(/٫/g, ".")
    .replace(/,/g, ".");

  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;

  const value = Number(normalized);
  return Number.isFinite(value) && value > 0 ? value : null;
}

// ---------------- SMART ----------------

function analyzeSmart(high, low, nextOpen) {
  const range = high - low;
  const midpoint = (high + low) / 2;

  let signal = "⏳ انتظار";
  let direction = "غير مؤكد";

  if (range > 0 && nextOpen > high) {
    signal = "🟢 شراء UP";
    direction = "افتتاح أعلى من القمة";
  } else if (range > 0 && nextOpen < low) {
    signal = "🔴 بيع DOWN";
    direction = "افتتاح أدنى من القاع";
  } else if (nextOpen > midpoint) {
    direction = "الافتتاح داخل النصف العلوي";
  } else if (nextOpen < midpoint) {
    direction = "الافتتاح داخل النصف السفلي";
  }

  return { range, midpoint, signal, direction };
}

// ---------------- EUR/USD INDICATORS ----------------

function calculateEMA(values, period) {
  const multiplier = 2 / (period + 1);
  let ema = values[0];

  for (let i = 1; i < values.length; i++) {
    ema = (values[i] * multiplier) + (ema * (1 - multiplier));
  }

  return ema;
}

function calculateRSI(values, endIndex, period = 14) {
  if (endIndex < period) return 50;

  let gains = 0;
  let losses = 0;

  for (let i = endIndex - period + 1; i <= endIndex; i++) {
    const change = values[i] - values[i - 1];

    if (change > 0) gains += change;
    if (change < 0) losses += Math.abs(change);
  }

  const averageGain = gains / period;
  const averageLoss = losses / period;

  if (averageLoss === 0 && averageGain === 0) return 50;
  if (averageLoss === 0) return 100;

  const rs = averageGain / averageLoss;
  return 100 - (100 / (1 + rs));
}

async function analyzeEURUSD() {
  const apiKey = process.env.TWELVEDATA_API_KEY;

  if (!apiKey) {
    throw new Error("مفتاح Twelve Data غير موجود في إعدادات الاستضافة.");
  }

  const url =
    "https://api.twelvedata.com/time_series" +
    "?symbol=EUR/USD" +
    "&interval=1min" +
    "&outputsize=60" +
    "&apikey=" + encodeURIComponent(apiKey);

  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok || data.status === "error" || !data.values) {
    throw new Error(data.message || "تعذر جلب بيانات EUR/USD.");
  }

  // ترتيب الشموع من الأقدم إلى الأحدث
  const allCandles = data.values
    .slice()
    .sort((a, b) => a.datetime.localeCompare(b.datetime));

  // استبعاد أحدث شمعة حتى لا نعتمد على شمعة قد تكون غير مكتملة
  const candles = allCandles.slice(0, -1);

  if (candles.length < 25) {
    throw new Error("البيانات غير كافية للتحليل حالياً.");
  }

  const closes = candles.map(c => Number(c.close));
  const last = candles[candles.length - 1];
  const previous = candles[candles.length - 2];

  const ema9 = calculateEMA(closes.slice(-30), 9);
  const ema21 = calculateEMA(closes.slice(-30), 21);

  const rsi = calculateRSI(closes, closes.length - 1);
  const previousRSI = calculateRSI(closes, closes.length - 2);

  const close = Number(last.close);
  const open = Number(last.open);

  const bullishTrend = ema9 > ema21;
  const bearishTrend = ema9 < ema21;

  const rsiRising = rsi > previousRSI;
  const rsiFalling = rsi < previousRSI;

  const bullishCandle = close > open && close > ema9;
  const bearishCandle = close < open && close < ema9;

  let signal = "⏸ انتظار";
  let reason = "شروط الدخول غير مكتملة";
  let strength = "غير كافية";
  let direction = "متذبذب";

  if (bullishTrend) direction = "صاعد";
  if (bearishTrend) direction = "هابط";

  // شروط الشراء
  if (
    bullishTrend &&
    rsi >= 52 &&
    rsi < 68 &&
    rsiRising &&
    bullishCandle
  ) {
    signal = "🟢 شراء UP";
    reason = "المتوسطات والزخم والشمعة تؤكد الصعود";
    strength = "متوسطة";
  }

  // شروط البيع
  else if (
    bearishTrend &&
    rsi <= 48 &&
    rsi > 32 &&
    rsiFalling &&
    bearishCandle
  ) {
    signal = "🔴 بيع DOWN";
    reason = "المتوسطات والزخم والشمعة تؤكد الهبوط";
    strength = "متوسطة";
  }

  // توضيح سبب الانتظار
  else if (rsi >= 68) {
    reason = "الزخم مرتفع؛ ننتظر تأكيداً قبل الشراء";
  } else if (rsi <= 32) {
    reason = "الزخم منخفض جداً؛ ننتظر تأكيداً قبل البيع";
  } else if (!bullishTrend && !bearishTrend) {
    reason = "المتوسطات متساوية تقريباً والسوق متذبذب";
  } else if (bullishTrend && !rsiRising) {
    reason = "الاتجاه صاعد لكن الزخم لا يتقوى";
  } else if (bearishTrend && !rsiFalling) {
    reason = "الاتجاه هابط لكن ضغط البيع لا يتقوى";
  } else if (bullishTrend && !bullishCandle) {
    reason = "ننتظر شمعة صاعدة تؤكد الاتجاه";
  } else if (bearishTrend && !bearishCandle) {
    reason = "ننتظر شمعة هابطة تؤكد الاتجاه";
  } else {
    reason = "ننتظر توافق المؤشرات قبل الدخول";
  }

  return {
    price: close,
    ema9,
    ema21,
    rsi,
    previousRSI,
    direction,
    signal,
    reason,
    strength,
    candleTime: last.datetime
  };
}

export function registerCommands(bot) {

  bot.command("start", async ctx => {
    await ctx.reply(
      "أهلاً بك في Masaad 🤖\n\n" +
      "📊 الأسواق المتاحة:\n\n" +
      "/smart - تحليل Smart اليدوي\n" +
      "/eurusd - تحليل اليورو دولار تلقائياً\n" +
      "/cancel - إلغاء تحليل Smart\n" +
      "/help - المساعدة"
    );
  });

  bot.command("help", async ctx => {
    await ctx.reply(
      "📌 أوامر Masaad\n\n" +
      "/smart - تحليل Smart\n" +
      "أدخل قمة الشمعة ثم قاعها ثم افتتاح الشمعة الثانية.\n\n" +
      "/eurusd - سحب بيانات اليورو وتحليلها تلقائياً.\n\n" +
      "/cancel - إلغاء تحليل Smart."
    );
  });

  // ---------------- SMART COMMAND ----------------

  bot.command("smart", async ctx => {
    const key = `${ctx.chat.id}:${ctx.from.id}`;

    sessions.set(key, {
      step: 0,
      high: null,
      low: null
    });

    await ctx.reply(
      "📊 تحليل Smart - فريم الدقيقة 1M\n\n" +
      "أرسل قمة الشمعة السابقة فقط."
    );
  });

  bot.command("cancel", async ctx => {
    const key = `${ctx.chat.id}:${ctx.from.id}`;
    sessions.delete(key);
    await ctx.reply("تم إلغاء تحليل Smart.");
  });

  // ---------------- EURUSD COMMAND ----------------

  bot.command("eurusd", async ctx => {
    await ctx.reply("⏳ جارٍ سحب بيانات EUR/USD وتحليل المؤشرات...");

    try {
      const result = await analyzeEURUSD();

      await ctx.reply(
        "📊 تحليل EUR/USD - Masaad\n\n" +
        "💰 السعر: " + result.price.toFixed(5) + "\n" +
        "📈 الاتجاه: " + result.direction + "\n" +
        "EMA 9: " + result.ema9.toFixed(5) + "\n" +
        "EMA 21: " + result.ema21.toFixed(5) + "\n" +
        "RSI الحالي: " + result.rsi.toFixed(2) + "\n" +
        "RSI السابق: " + result.previousRSI.toFixed(2) + "\n\n" +
        "🎯 القرار: " + result.signal + "\n" +
        "💪 قوة الترجيح: " + result.strength + "\n" +
        "📝 السبب: " + result.reason + "\n" +
        "⏱ الفريم: دقيقة واحدة\n" +
        "🕯 الشمعة: مكتملة حسب آخر بيانات المصدر\n" +
        "🕒 وقت الشمعة: " + result.candleTime + "\n\n" +
        "🔄 للتحليل القادم أرسل /eurusd بعد 60 ثانية.\n\n" +
        "⚠️ تحليل احتمالي وليس ضماناً للربح."
      );

    } catch (error) {
      console.error("EURUSD error:", error);

      await ctx.reply(
        "⚠️ تعذر تحليل EUR/USD.\n" +
        error.message
      );
    }
  });

  // ---------------- SMART PRICE INPUT ----------------

  bot.on("message:text", async ctx => {
    const key = `${ctx.chat.id}:${ctx.from.id}`;
    const session = sessions.get(key);

    if (!session) return;

    const text = ctx.message.text.trim();
    if (text.startsWith("/")) return;

    const price = parsePrice(text);

    if (price === null) {
      await ctx.reply("⚠️ أرسل السعر فقط، مثال: 264.273");
      return;
    }

    if (session.step === 0) {
      session.high = price;
      session.step = 1;

      await ctx.reply(
        `✅ القمة: ${price}\n\n` +
        "أرسل الآن قاع الشمعة السابقة."
      );
      return;
    }

    if (session.step === 1) {
      if (price >= session.high) {
        await ctx.reply(
          "⚠️ القاع يجب أن يكون أقل من القمة. أرسل القاع الصحيح."
        );
        return;
      }

      session.low = price;
      session.step = 2;

      await ctx.reply(
        `✅ القاع: ${price}\n\n` +
        "أرسل الآن افتتاح الشمعة الثانية."
      );
      return;
    }

    if (session.step === 2) {
      const result = analyzeSmart(
        session.high,
        session.low,
        price
      );

      sessions.delete(key);

      await ctx.reply(
        "📊 تحليل Smart - Masaad\n" +
        "⏱ فريم الدقيقة 1M\n\n" +
        "🔺 القمة: " + session.high + "\n" +
        "🔻 القاع: " + session.low + "\n" +
        "🕯 افتتاح الشمعة الثانية: " + price + "\n\n" +
        "📏 نطاق الشمعة: " + result.range.toFixed(5) + "\n" +
        "📍 منتصف النطاق: " + result.midpoint.toFixed(5) + "\n" +
        "📈 القراءة: " + result.direction + "\n\n" +
        "🎯 الإشارة: " + result.signal + "\n\n" +
        "⚠️ تحليل مبدئي؛ هذه القيم وحدها لا تؤكد اتجاه السوق.\n\n" +
        "لبدء تحليل جديد أرسل /smart"
      );
    }
  });
}
