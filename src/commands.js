
const API_KEY = process.env.TWELVEDATA_API_KEY;

function ema(values, period) {
  const multiplier = 2 / (period + 1);
  let result = values[0];

  for (let i = 1; i < values.length; i++) {
    result = (values[i] - result) * multiplier + result;
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
    if (change < 0) losses += Math.abs(change);
  }

  if (losses === 0) return 100;

  const averageGain = gains / period;
  const averageLoss = losses / period;
  const rs = averageGain / averageLoss;

  return 100 - 100 / (1 + rs);
}

function getPivotLevels(candles) {
  const highs = [];
  const lows = [];

  for (let i = 2; i < candles.length - 2; i++) {
    const high = Number(candles[i].high);
    const low = Number(candles[i].low);

    if (
      high > Number(candles[i - 1].high) &&
      high > Number(candles[i - 2].high) &&
      high > Number(candles[i + 1].high) &&
      high > Number(candles[i + 2].high)
    ) {
      highs.push(high);
    }

    if (
      low < Number(candles[i - 1].low) &&
      low < Number(candles[i - 2].low) &&
      low < Number(candles[i + 1].low) &&
      low < Number(candles[i + 2].low)
    ) {
      lows.push(low);
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

    const url = new URL("https://api.twelvedata.com/time_series");

    url.search = new URLSearchParams({
      symbol,
      interval: "1min",
      outputsize: "60",
      order: "desc",
      apikey: API_KEY
    }).toString();

    const response = await fetch(url);
    const data = await response.json();

    if (!data.values || data.values.length < 30) {
      return ctx.reply("⚠️ لم تصل بيانات كافية للتحليل.");
    }

    // استبعاد الشمعة الأحدث حتى لا نعتمد على شمعة غير مكتملة
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
    const ema9 = ema(prices.slice(-30), 9);
    const ema21 = ema(prices.slice(-40), 21);
    const rsi = calculateRSI(prices, 14);

    const { highs, lows } = getPivotLevels(candles);
    const levels = nearestLevels({ highs, lows }, price);

    const pip = symbol === "XAU/USD" ? 0.01 : 0.0001;

    const resistance = levels.resistance;
    const support = levels.support;

    const resistanceDistance = resistance !== undefined
      ? (resistance - price) / pip
      : null;

    const supportDistance = support !== undefined
      ? (price - support) / pip
      : null;

    const nearResistance =
      resistanceDistance !== null &&
      resistanceDistance >= 0 &&
      resistanceDistance <= 5;

    const nearSupport =
      supportDistance !== null &&
      supportDistance >= 0 &&
      supportDistance <= 5;

    const breakoutUp =
      resistance !== undefined &&
      previous.close <= resistance &&
      price > resistance &&
      (price - resistance) / pip <= 10;

    const breakoutDown =
      support !== undefined &&
      previous.close >= support &&
      price < support &&
      (support - price) / pip <= 10;

    const bullishCandle = current.close > current.open;
    const bearishCandle = current.close < current.open;

    const upTrend = ema9 > ema21;
    const downTrend = ema9 < ema21;

    let signal = "⏳ انتظار";
    let direction = "غير مؤكد";
    let duration = "لا توجد مدة مقترحة";
    let reason = "لا يوجد اختراق أو كسر مؤكد حتى الآن.";

    if (
      breakoutUp &&
      upTrend &&
      rsi >= 50 &&
      rsi <= 70 &&
      bullishCandle
    ) {
      signal = "🟢 شراء UP - اختراق مؤكد";
      direction = "صاعد";
      duration = "دقيقة واحدة";
      reason = "تحققت شروط الاختراق والزخم الصاعد.";
    } else if (
      breakoutDown &&
      downTrend &&
      rsi >= 30 &&
      rsi <= 50 &&
      bearishCandle
    ) {
      signal = "🔴 بيع DOWN - كسر مؤكد";
      direction = "هابط";
      duration = "دقيقتان";
      reason = "تحققت شروط الكسر والزخم الهابط.";
    } else if (nearResistance) {
      reason = "السعر قريب من المقاومة؛ انتظر ابتعاده وإعادة اختبار المستوى.";
    } else if (nearSupport) {
      reason = "السعر قريب من الدعم؛ انتظر ابتعاده وإعادة اختبار المستوى.";
    } else if (rsi > 70) {
      reason = "مؤشر RSI مرتفع؛ لا تدخل شراء قبل هدوء الزخم.";
    } else if (rsi < 30) {
      reason = "مؤشر RSI منخفض؛ لا تدخل بيع قبل هدوء الزخم.";
    } else if (upTrend && !breakoutUp) {
      reason = "الميل صاعد، لكن لم يحدث اختراق مؤكد للمقاومة.";
    } else if (downTrend && !breakoutDown) {
      reason = "الميل هابط، لكن لم يحدث كسر مؤكد للدعم.";
    } else {
      reason = "الاتجاه غير واضح؛ انتظر تأكيد الحركة.";
    }

    const resistanceText = resistance !== undefined
      ? resistance.toFixed(symbol === "XAU/USD" ? 3 : 5) +
        " (يبعد " + resistanceDistance.toFixed(1) + " بيب)"
      : "غير متوفر";

    const supportText = support !== undefined
      ? support.toFixed(symbol === "XAU/USD" ? 3 : 5) +
        " (يبعد " + supportDistance.toFixed(1) + " بيب)"
      : "غير متوفر";

    await ctx.reply(
      "📊 تحليل " + name + "\n\n" +
      "⏱ فريم التحليل: دقيقة واحدة (1M)\n\n" +
      "السعر: " + price + "\n" +
      "EMA 9: " + ema9.toFixed(5) + "\n" +
      "EMA 21: " + ema21.toFixed(5) + "\n" +
      "RSI: " + rsi.toFixed(2) + "\n\n" +
      "🔺 أقرب مقاومة: " + resistanceText + "\n" +
      "🔻 أقرب دعم: " + supportText + "\n\n" +
      "الاتجاه: " + direction + "\n" +
      "الإشارة: " + signal + "\n" +
      "المدة المقترحة: " + duration + "\n\n" +
      "💡 سبب القرار: " + reason + "\n\n" +
      "⚠️ الإشارات تحليلية وليست ضمانًا للربح."
    );

  } catch (error) {
    console.error("Analysis error:", error);
    await ctx.reply("⚠️ حدث خطأ أثناء التحليل. حاول مرة أخرى.");
  }
}

export function registerCommands(bot) {
  bot.command("start", ctx =>
    ctx.reply("أهلًا بك في Masaad 🤖\n\nأرسل /help لعرض الأوامر.")
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

// Masaad latest deployment
