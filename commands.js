
const smartPrices = new Map();

function calculateEMA(values, period) {
  const k = 2 / (period + 1);
  let ema = values[0];

  for (let i = 1; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
  }

  return ema;
}

function calculateRSI(values, period = 14) {
  let gains = 0;
  let losses = 0;

  for (let i = values.length - period; i < values.length; i++) {
    const change = values[i] - values[i - 1];
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }

  if (losses === 0) return 100;

  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

async function getEURUSDAnalysis() {
  const key = process.env.TWELVEDATA_API_KEY;

  if (!key) {
    throw new Error("مفتاح TWELVEDATA_API_KEY غير موجود");
  }

  const url =
    "https://api.twelvedata.com/time_series?symbol=EUR/USD&interval=1min&outputsize=50&apikey=" +
    encodeURIComponent(key);

  const response = await fetch(url);
  const data = await response.json();

  if (!data.values || !Array.isArray(data.values)) {
    throw new Error(data.message || "تعذر جلب بيانات اليورو دولار");
  }

  const prices = data.values
    .map(item => Number(item.close))
    .filter(Number.isFinite)
    .reverse();

  if (prices.length < 22) {
    throw new Error("البيانات غير كافية للتحليل");
  }

  const price = prices[prices.length - 1];
  const ema9 = calculateEMA(prices.slice(-9), 9);
  const ema21 = calculateEMA(prices.slice(-21), 21);
  const rsi = calculateRSI(prices);

  let signal = "⏳ انتظار";

  if (ema9 > ema21 && price > ema9 && rsi < 70) {
    signal = "🟢 شراء UP";
  } else if (ema9 < ema21 && price < ema9 && rsi > 30) {
    signal = "🔴 بيع DOWN";
  }

  const saudiTime = new Intl.DateTimeFormat("ar-SA", {
    timeZone: "Asia/Riyadh",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  }).format(new Date());

  return (
    "📊 تحليل اليورو دولار - Masaad\n\n" +
    "⏱ فريم دقيقة واحدة\n" +
    "🕒 توقيت السعودية: " + saudiTime + "\n\n" +
    "السعر: " + price.toFixed(5) + "\n" +
    "EMA 9: " + ema9.toFixed(5) + "\n" +
    "EMA 21: " + ema21.toFixed(5) + "\n" +
    "RSI: " + rsi.toFixed(2) + "\n\n" +
    "الإشارة: " + signal + "\n" +
    "المدة المقترحة: دقيقة واحدة\n\n" +
    "⚠️ تحليل فني وليس ضمانًا للربح."
  );
}

function analyzeSmart(prices) {
  const ema9 = calculateEMA(prices.slice(-9), 9);
  const ema21 = calculateEMA(prices.slice(-21), 21);
  const price = prices[prices.length - 1];

  let signal = "⏳ انتظار";

  if (ema9 > ema21 && price > ema9) {
    signal = "🟢 شراء UP";
  } else if (ema9 < ema21 && price < ema9) {
    signal = "🔴 بيع DOWN";
  }

  return (
    "📊 تحليل Smart - Masaad\n\n" +
    "عدد القراءات: " + prices.length + "\n" +
    "السعر الأخير: " + price + "\n" +
    "EMA 9: " + ema9.toFixed(5) + "\n" +
    "EMA 21: " + ema21.toFixed(5) + "\n\n" +
    "الإشارة: " + signal + "\n" +
    "المدة المقترحة: 30 ثانية\n\n" +
    "⚠️ التحليل يعتمد على الأسعار المدخلة يدويًا."
  );
}

function registerCommands(bot) {
  bot.command("start", async ctx => {
    await ctx.reply(
      "أهلاً بك في Masaad 🤖\n\n" +
      "📊 تحليل Smart و EUR/USD\n\n" +
      "/smart - تحليل Smart\n" +
      "/eurusd - تحليل اليورو دولار\n" +
      "/help - المساعدة\n" +
      "/ping - اختبار البوت"
    );
  });

  bot.command("help", async ctx => {
    await ctx.reply(
      "📌 أوامر Masaad\n\n" +
      "/smart - أدخل 22 سعرًا لتحليل Smart\n" +
      "/eurusd - تحليل اليورو دولار\n" +
      "/ping - اختبار البوت"
    );
  });

  bot.command("ping", async ctx => {
    await ctx.reply("✅ Masaad يعمل ويستقبل الأوامر.");
  });

  bot.command("smart", async ctx => {
    smartPrices.set(ctx.chat.id, []);

    await ctx.reply(
      "📊 تحليل Smart\n\n" +
      "أرسل 22 قراءة سعرية، كل سعر في رسالة منفصلة."
    );
  });

  bot.command("eurusd", async ctx => {
    await ctx.reply("⏳ جاري تحليل اليورو دولار...");

    try {
      const result = await getEURUSDAnalysis();
      await ctx.reply(result);
    } catch (error) {
      console.error(error);
      await ctx.reply("❌ تعذر التحليل: " + error.message);
    }
  });

  bot.on("message:text", async ctx => {
    const chatId = ctx.chat.id;
    const prices = smartPrices.get(chatId);

    if (!prices) return;

    const value = Number(ctx.message.text.trim());

    if (!Number.isFinite(value) || value <= 0) {
      await ctx.reply("أرسل سعرًا رقميًا صحيحًا فقط.");
      return;
    }

    prices.push(value);

    if (prices.length < 22) {
      await ctx.reply("تم تسجيل السعر " + prices.length + " من 22");
      return;
    }

    smartPrices.delete(chatId);
    await ctx.reply(analyzeSmart(prices));
  });
}

module.exports = { registerCommands };

