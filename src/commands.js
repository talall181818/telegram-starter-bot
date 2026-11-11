const API_KEY = process.env.TWELVEDATA_API_KEY;

export function registerCommands(bot) {
  bot.command("start", async (ctx) => {
    await ctx.reply(
      "أهلًا بك في Masaad 🤖\n" +
      "بوت التحليل وإشارات التداول.\n\n" +
      "أرسل /help للمساعدة"
    );
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(
      "🤖 Masaad\n\n" +
      "/gold - تحليل الذهب\n" +
      "/eurusd - تحليل اليورو دولار\n" +
      "/help - المساعدة"
    );
  });

  bot.command("gold", async (ctx) => {
    await analyze(ctx, "XAU/USD", "الذهب");
  });

  bot.command("eurusd", async (ctx) => {
    await analyze(ctx, "EUR/USD", "اليورو مقابل الدولار");
  });
}

function calculateEMA(values, period) {
  const multiplier = 2 / (period + 1);
  let ema = values.slice(0, period)
    .reduce((a, b) => a + b, 0) / period;

  for (let i = period; i < values.length; i++) {
    ema = (values[i] - ema) * multiplier + ema;
  }
  return ema;
}

function calculateRSI(values, period = 14) {
  let gains = 0;
  let losses = 0;

  for (let i = values.length - period; i < values.length; i++) {
    const change = values[i] - values[i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }

  if (losses === 0) return 100;

  const rs = gains / losses;
  return 100 - (100 / (1 + rs));
}

async function analyze(ctx, symbol, name) {
  try {
    if (!API_KEY) {
      throw new Error("TWELVEDATA_API_KEY missing");
    }

    await ctx.reply("⏳ جاري تحليل " + name);

    const url = new URL(
      "https://api.twelvedata.com/time_series"
    );

    url.searchParams.set("symbol", symbol);
    url.searchParams.set("interval", "1min");
    url.searchParams.set("outputsize", "50");
    url.searchParams.set("apikey", API_KEY);

    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok || !data.values || data.values.length < 30) {
      throw new Error(data.message || "No market data");
    }

    const candles = data.values.slice().reverse();
    const prices = candles.map(c => Number(c.close));

    if (prices.some(p => !Number.isFinite(p))) {
      throw new Error("Invalid prices");
    }

    const ema9 = calculateEMA(prices, 9);
    const ema21 = calculateEMA(prices, 21);
    const rsi = calculateRSI(prices);

    let signal = "انتظار";
    let direction = "غير مؤكد";
    let duration = "لا توجد مدة مقترحة";

    if (ema9 > ema21 && rsi >= 50 && rsi <= 70) {
      signal = "🟢 شراء UP";
      direction = "صاعد";
      duration = "دقيقة واحدة";
    } else if (ema9 < ema21 && rsi >= 30 && rsi < 50) {
      signal = "🔴 بيع DOWN";
      direction = "هابط";
      duration = "دقيقتان";
    }

    const price = prices[prices.length - 1];

    await ctx.reply(
      "📊 تحليل " + name + "\n\n" +
      "السعر: " + price + "\n" +
      "EMA 9: " + ema9.toFixed(5) + "\n" +
      "EMA 21: " + ema21.toFixed(5) + "\n" +
      "RSI: " + rsi.toFixed(2) + "\n\n" +
      "الاتجاه: " + direction + "\n" +
      "الإشارة: " + signal + "\n" +
      "المدة المقترحة: " + duration + "\n\n" +
      "⚠️ الإشارات تحليلية وليست ضمانًا للربح."
    );

  } catch (error) {
    console.error("[analysis error]", error);
    await ctx.reply(
      "تعذر تحليل " + name +
      " حاليًا. تحقق من مفتاح Twelve Data والبيانات المتاحة."
    );
  }
}



