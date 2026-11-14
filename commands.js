
const smartSessions = new Map();

function parsePrice(text) {
  const normalized = text
    .trim()
    .replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
    .replace(/٫/g, ".");

  const price = Number(normalized);
  return Number.isFinite(price) && price > 0 ? price : null;
}

function ema(values, period) {
  const k = 2 / (period + 1);
  let result = values[0];

  for (let i = 1; i < values.length; i++) {
    result = values[i] * k + result * (1 - k);
  }
  return result;
}

function rsi(values, period = 14) {
  let gains = 0;
  let losses = 0;

  for (let i = values.length - period; i < values.length; i++) {
    const change = values[i] - values[i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }

  if (losses === 0) return 100;
  const rs = (gains / period) / (losses / period);
  return 100 - (100 / (1 + rs));
}

async function analyzeEurusd(ctx) {
  const key = process.env.TWELVEDATA_API_KEY;

  if (!key) {
    return ctx.reply("⚠️ مفتاح Twelve Data غير موجود في إعدادات FadeHost.");
  }

  await ctx.reply("⏳ جارٍ سحب بيانات EUR/USD وتحليلها...");

  try {
    const url = new URL("https://api.twelvedata.com/time_series");
    url.searchParams.set("symbol", "EUR/USD");
    url.searchParams.set("interval", "1min");
    url.searchParams.set("outputsize", "50");
    url.searchParams.set("apikey", key);

    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok || !data.values) {
      return ctx.reply(
        "⚠️ تعذر سحب البيانات: " +
        (data.message || "تحقق من مفتاح API أو حد الاستخدام.")
      );
    }

    const candles = data.values
      .map(c => ({
        open: Number(c.open),
        close: Number(c.close)
      }))
      .reverse();

    const closes = candles.map(c => c.close);

    if (closes.length < 22 || closes.some(v => !Number.isFinite(v))) {
      return ctx.reply("⚠️ البيانات المستلمة غير كافية للتحليل.");
    }

    const ema9 = ema(closes, 9);
    const ema21 = ema(closes, 21);
    const currentRsi = rsi(closes);

    let direction = "متذبذب";
    let signal = "⏸ انتظار";
    let strength = "ضعيفة";

    if (ema9 > ema21) direction = "صاعد";
    if (ema9 < ema21) direction = "هابط";

    if (ema9 > ema21 && currentRsi >= 50 && currentRsi < 70) {
      signal = "🟢 شراء UP";
      strength = "متوسطة";
    } else if (
      ema9 < ema21 &&
      currentRsi <= 50 &&
      currentRsi > 30
    ) {
      signal = "🔴 بيع DOWN";
      strength = "متوسطة";
    }

    return ctx.reply(
      "📊 تحليل EUR/USD - Masaad\n\n" +
      "💰 السعر الحالي: " + closes[closes.length - 1].toFixed(5) + "\n" +
      "📈 الاتجاه: " + direction + "\n" +
      "EMA 9: " + ema9.toFixed(5) + "\n" +
      "EMA 21: " + ema21.toFixed(5) + "\n" +
      "RSI: " + currentRsi.toFixed(2) + "\n\n" +
      "🎯 القرار: " + signal + "\n" +
      "💪 قوة الترجيح: " + strength + "\n" +
      "⏱ الفريم: دقيقة واحدة\n" +
      "⏳ المدة التحليلية: دقيقة واحدة\n\n" +
      "⚠️ تحليل آلي وليس ضماناً للربح."
    );

  } catch (error) {
    console.error("EURUSD error:", error);
    return ctx.reply("⚠️ حدث خطأ أثناء الاتصال بمصدر البيانات.");
  }
}

export function registerCommands(bot) {
  bot.command("start", async ctx => {
    await ctx.reply(
      "أهلاً بك في Masaad 🤖\n\n" +
      "📊 اختر السوق:\n" +
      "/smart - تحليل Smart\n" +
      "/eurusd - تحليل اليورو دولار\n" +
      "/reset - إعادة تحليل Smart"
    );
  });

  bot.command("smart", async ctx => {
    smartSessions.set(ctx.from.id, []);
    await ctx.reply(
      "📊 تم اختيار Smart\n\n" +
      "أرسل سعر السوق الحالي فقط.\n" +
      "سنجمع 5 قراءات لتحليل الاتجاه."
    );
  });

  bot.command("eurusd", async ctx => {
    await analyzeEurusd(ctx);
  });

  bot.command("reset", async ctx => {
    smartSessions.set(ctx.from.id, []);
    await ctx.reply("🔄 تم تصفير قراءات Smart. أرسل السعر الأول.");
  });

  bot.on("message:text", async ctx => {
    const text = ctx.message.text.trim();

    if (text.startsWith("/")) return;

    const prices = smartSessions.get(ctx.from.id);
    if (!prices) return;

    const price = parsePrice(text);

    if (price === null) {
      return ctx.reply("⚠️ أرسل السعر بالأرقام فقط، مثال: 263.4290");
    }

    prices.push(price);

    if (prices.length < 5) {
      return ctx.reply(
        "📊 تحليل Smart - Masaad\n\n" +
        "💰 السعر الحالي: " + price + "\n" +
        "📈 تم تسجيل " + prices.length + " من 5 أسعار\n\n" +
        "⏳ أرسل السعر التالي فقط."
      );
    }

    const first = prices[0];
    const last = prices[prices.length - 1];
    const change = ((last - first) / first) * 100;

    let direction = "متذبذب";
    let signal = "⏸ انتظار";

    if (change > 0) {
      direction = "صاعد";
      signal = "🟢 شراء UP";
    } else if (change < 0) {
      direction = "هابط";
      signal = "🔴 بيع DOWN";
    }

    smartSessions.delete(ctx.from.id);

    await ctx.reply(
      "📊 تحليل Smart - Masaad\n\n" +
      "💰 السعر الحالي: " + last + "\n" +
      "📈 الاتجاه: " + direction + "\n" +
      "🎯 القرار: " + signal + "\n" +
      "💪 قوة الترجيح: مبدئية فقط\n" +
      "⏱ المدة: 5 ثوانٍ (اقتراح غير مؤكد)\n\n" +
      "📋 عدد القراءات: 5\n\n" +
      "⚠️ تحليل مبسط للأسعار المرسلة، وليس ضماناً للربح."
    );
  });
}

