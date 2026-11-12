
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

  for (let i = values.length - period; i < values.length; i++) {
    const change = values[i] - values[i - 1];

    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }

  if (losses === 0) return 100;

  const rs = (gains / period) / (losses / period);
  return 100 - 100 / (1 + rs);
}

function getPivotLevels(candles) {
  const history = candles.slice(-50);
  const highs = [];
  const lows = [];

  for (let i = 2; i < history.length - 2; i++) {
    const c = history[i];

    if (
      c.high > history[i - 1].high &&
      c.high > history[i - 2].high &&
      c.high > history[i + 1].high &&
      c.high > history[i + 2].high
    ) {
      highs.push(c.high);
    }

    if (
      c.low < history[i - 1].low &&
      c.low < history[i - 2].low &&
      c.low < history[i + 1].low &&
      c.low < history[i + 2].low
    ) {
      lows.push(c.low);
    }
  }

  return { highs, lows };
}

function nearestLevels(levels, price) {
  const resistance = levels.highs
    .filter(level => level > price)
    .sort((a, b) => a - b)[0];

  const support = levels.lows
    .filter(level => level < price)
    .sort((a, b) => b - a)[0];

  return { resistance, support };
}

async function analyze(ctx, symbol, name) {
  try {
    if (!API_KEY) {
      return ctx.reply("⚠️ مفتاح Twelve Data غير موجود.");
    }

    const url =
      "https://api.twelvedata.com/time_series" +
      `?symbol=${encodeURIComponent(symbol)}` +
      "&interval=1min&outputsize=60&order=desc" +
      `&apikey=${API_KEY}`;

    const response = await fetch(url);
    const data = await response.json();

    if (!data.values || data.values.length < 30) {
      return ctx.reply("⚠️ بيانات السوق غير كافية للتحليل.");
    }

    const candles = data.values
      .slice(1)
      .reverse()
      .map(item => ({
        open: Number(item.open),
        high: Number(item.high),
        low: Number(item.low),
        close: Number(item.close)
      }));

    const prices = candles.map(c => c.close);
    const current = candles[candles.length - 1];
    const previous = candles[candles.length - 2];

    const price = current.close;
    const ema9 = ema(prices, 9);
    const ema21 = ema(prices, 21);
    const rsi = calculateRSI(prices, 14);

    const pip = symbol === "EUR/USD" ? 0.0001 : 0.01;
    const digits = symbol === "EUR/USD" ? 5 : 2;

    // مستويات الشموع السابقة فقط
    const levels = getPivotLevels(candles.slice(0, -1));

    // أقرب المستويات للسعر الحالي
    const currentLevels = nearestLevels(levels, price);

    // مستويات الاختراق محسوبة من إغلاق الشمعة السابقة
    const previousLevels = nearestLevels(levels, previous.close);

    const resistance = currentLevels.resistance;
    const support = currentLevels.support;

    const resistanceBreak = previousLevels.resistance;
    const supportBreak = previousLevels.support;

    const nearResistance =
      resistance !== undefined &&
      Math.abs(resistance - price) <= pip * 5;

    const nearSupport =
      support !== undefined &&
      Math.abs(price - support) <= pip * 5;

    const upTrend = ema9 > ema21;
    const downTrend = ema9 < ema21;

    const bullishCandle = current.close > current.open;
    const bearishCandle = current.close < current.open;

    const breakoutUp =
      resistanceBreak !== undefined &&
      previous.close <= resistanceBreak &&
      price > resistanceBreak &&
      price - resistanceBreak <= pip * 10;

    const breakoutDown =
      supportBreak !== undefined &&
      previous.close >= supportBreak &&
      price < supportBreak &&
      supportBreak - price <= pip * 10;

    let signal = "⏳ انتظار";
    let direction = "غير مؤكد";
    let duration = "لا توجد مدة مقترحة";

    if (nearResistance || nearSupport) {
      signal = "⏳ انتظار - قريب من الدعم أو المقاومة";
    } else if (
      breakoutUp &&
      upTrend &&
      rsi >= 50 &&
      rsi < 70 &&
      bullishCandle
    ) {
      signal = "🟢 شراء UP - اختراق مؤكد";
      direction = "صاعد";
      duration = "دقيقة واحدة";
    } else if (
      breakoutDown &&
      downTrend &&
      rsi > 30 &&
      rsi <= 50 &&
      bearishCandle
    ) {
      signal = "🔴 بيع DOWN - كسر مؤكد";
      direction = "هابط";
      duration = "دقيقتان";
    }

    const resistanceText = resistance !== undefined
      ? `${resistance.toFixed(digits)} (يبعد ${((resistance - price) / pip).toFixed(1)} بيب)`
      : "غير متوفرة";

    const supportText = support !== undefined
      ? `${support.toFixed(digits)} (يبعد ${((price - support) / pip).toFixed(1)} بيب)`
      : "غير متوفر";

    await ctx.reply(
      `📊 تحليل ${name}\n\n` +
      `⏱ فريم التحليل: دقيقة واحدة (1M)\n\n` +
      `السعر: ${price.toFixed(digits)}\n` +
      `EMA 9: ${ema9.toFixed(digits)}\n` +
      `EMA 21: ${ema21.toFixed(digits)}\n` +
      `RSI: ${rsi.toFixed(2)}\n\n` +
      `🔺 أقرب مقاومة: ${resistanceText}\n` +
      `🔻 أقرب دعم: ${supportText}\n\n` +
      `الاتجاه: ${direction}\n` +
      `الإشارة: ${signal}\n` +
      `المدة المقترحة: ${duration}\n\n` +
      `⚠️ الإشارات تحليلية وليست ضمانًا للربح.`
    );

  } catch (error) {
    console.error("Analysis error:", error);
    await ctx.reply("⚠️ حدث خطأ أثناء التحليل.");
  }
}

export function registerCommands(bot) {
  bot.command("start", ctx =>
    ctx.reply(
      "أهلًا بك في Masaad 🤖\n\n" +
      "بوت تحليل الذهب واليورو دولار.\n" +
      "أرسل /help لعرض الأوامر."
    )
  );

  bot.command("help", ctx =>
    ctx.reply(
      "📋 أوامر Masaad\n\n" +
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

