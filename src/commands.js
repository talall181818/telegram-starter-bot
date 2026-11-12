
const API_KEY = process.env.TWELVEDATA_API_KEY;

function ema(values, period) {
  const k = 2 / (period + 1);
  let result = values[0];

  for (let i = 1; i < values.length; i++) {
    result = values[i] * k + result * (1 - k);
  }

  return result;
}

function calculateRSI(values, period = 14) {
  if (values.length <= period) return 50;

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

  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

async function analyze(ctx, symbol, name) {
  try {
    if (!API_KEY) {
      return ctx.reply("⚠️ مفتاح الأسعار غير موجود.");
    }

    const url =
      "https://api.twelvedata.com/time_series" +
      "?symbol=" + encodeURIComponent(symbol) +
      "&interval=1min&outputsize=100&apikey=" + API_KEY;

    const response = await fetch(url);
    const data = await response.json();

    if (
      !response.ok ||
      !data.values ||
      data.values.length < 35
    ) {
      console.error("Data error:", data);
      return ctx.reply("⚠️ بيانات السوق غير متوفرة حاليًا.");
    }

    // استبعاد الشمعة الحالية غير المكتملة
    const candles = data.values
      .slice(1)
      .reverse()
      .map(c => ({
        open: Number(c.open),
        high: Number(c.high),
        low: Number(c.low),
        close: Number(c.close)
      }));

    const prices = candles.map(c => c.close);

    const current = candles[candles.length - 1];
    const previous = candles[candles.length - 2];

    const price = current.close;

    const ema9 = ema(prices.slice(-40), 9);
    const ema21 = ema(prices.slice(-60), 21);
    const rsi = calculateRSI(prices);

    const bullish = current.close > current.open;
    const bearish = current.close < current.open;

    const upTrend = ema9 > ema21;
    const downTrend = ema9 < ema21;

    const rising = current.close > previous.close;
    const falling = current.close < previous.close;

    // نظام شراء متوازن
    const buySignal =
      upTrend &&
      price > ema9 &&
      bullish &&
      rising &&
      rsi >= 50 &&
      rsi <= 68;

    // نظام بيع متوازن
    const sellSignal =
      downTrend &&
      price < ema9 &&
      bearish &&
      falling &&
      rsi >= 32 &&
      rsi <= 50;

    let signal = "⏳ انتظار";
    let duration = "لا توجد مدة مقترحة";

    if (buySignal) {
      signal = "🟢 شراء UP";
      duration = rsi >= 58 ? "دقيقتان" : "دقيقة واحدة";
    } else if (sellSignal) {
      signal = "🔴 بيع DOWN";
      duration = rsi <= 42 ? "دقيقتان" : "دقيقة واحدة";
    }

    const decimals = symbol === "XAU/USD" ? 2 : 5;

    const reply =
      "📊 تحليل " + name + "\n\n" +
      "⏱ فريم التحليل: دقيقة واحدة\n\n" +
      "السعر: " + price.toFixed(decimals) + "\n" +
      "EMA 9: " + ema9.toFixed(decimals) + "\n" +
      "EMA 21: " + ema21.toFixed(decimals) + "\n" +
      "RSI: " + rsi.toFixed(2) + "\n\n" +
      "الإشارة: " + signal + "\n" +
      "المدة المقترحة: " + duration + "\n\n" +
      "⚠️ الإشارات تحليلية وليست ضمانًا للربح.";

    return ctx.reply(reply);

  } catch (error) {
    console.error("Analysis error:", error);
    return ctx.reply("⚠️ حدث خطأ أثناء التحليل.");
  }
}

export function registerCommands(bot) {

  bot.command("start", ctx =>
    ctx.reply(
      "أهلاً بك في Masaad 🤖\n\n" +
      "تحليل الذهب واليورو دولار.\n" +
      "أرسل /help للمساعدة."
    )
  );

  bot.command("help", ctx =>
    ctx.reply(
      "📌 أوامر Masaad\n\n" +
      "/gold - تحليل الذهب\n" +
      "/eurusd - تحليل اليورو دولار"
    )
  );

  bot.command("gold", ctx =>
    analyze(ctx, "XAU/USD", "الذهب")
  );

  bot.command("eurusd", ctx =>
    analyze(ctx, "EUR/USD", "اليورو دولار")
  );
}
