
const API_KEY = process.env.TWELVEDATA_API_KEY;

function ema(values, period) {
  const multiplier = 2 / (period + 1);
  let result = values[0];

  for (let i = 1; i < values.length; i++) {
    result = values[i] * multiplier +
      result * (1 - multiplier);
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

  const averageGain = gains / period;
  const averageLoss = losses / period;

  if (averageLoss === 0) return 100;
  if (averageGain === 0) return 0;

  const rs = averageGain / averageLoss;
  return 100 - (100 / (1 + rs));
}

function getPivotLevels(candles) {
  const highs = [];
  const lows = [];

  for (let i = 2; i < candles.length - 2; i++) {
    const high = candles[i].high;
    const low = candles[i].low;

    if (
      high > candles[i - 1].high &&
      high > candles[i - 2].high &&
      high > candles[i + 1].high &&
      high > candles[i + 2].high
    ) {
      highs.push(high);
    }

    if (
      low < candles[i - 1].low &&
      low < candles[i - 2].low &&
      low < candles[i + 1].low &&
      low < candles[i + 2].low
    ) {
      lows.push(low);
    }
  }

  return { highs, lows };
}

function nearestLevels(levels, price) {
  const resistance = levels.highs
    .filter(value => value > price)
    .sort((a, b) => a - b)[0];

  const support = levels.lows
    .filter(value => value < price)
    .sort((a, b) => b - a)[0];

  return { resistance, support };
}

async function analyze(ctx, symbol, name) {
  try {
    if (!API_KEY) {
      await ctx.reply("⚠️ مفتاح Twelve Data غير موجود في إعدادات البوت.");
      return;
    }

    await ctx.reply("⏳ جاري تحليل " + name + "...");

    const url = new URL("https://api.twelvedata.com/time_series");

    url.searchParams.set("symbol", symbol);
    url.searchParams.set("interval", "1min");
    url.searchParams.set("outputsize", "80");
    url.searchParams.set("apikey", API_KEY);

    const response = await fetch(url.toString());
    const data = await response.json();

    if (!response.ok || data.status === "error" || !data.values) {
      console.error("Twelve Data error:", data);
      await ctx.reply("⚠️ تعذر جلب بيانات " + name + ". حاول لاحقاً.");
      return;
    }

    // استبعاد الشمعة الأحدث لأنها قد تكون غير مكتملة
    const candles = data.values
      .slice(1)
      .reverse()
      .map(item => ({
        open: Number(item.open),
        high: Number(item.high),
        low: Number(item.low),
        close: Number(item.close)
      }))
      .filter(c =>
        Number.isFinite(c.open) &&
        Number.isFinite(c.high) &&
        Number.isFinite(c.low) &&
        Number.isFinite(c.close)
      );

    if (candles.length < 30) {
      await ctx.reply("⚠️ البيانات غير كافية للتحليل.");
      return;
    }

    const current = candles[candles.length - 1];
    const previous = candles[candles.length - 2];

    const price = current.close;
    const prices = candles.map(c => c.close);

    const ema9 = ema(prices, 9);
    const ema21 = ema(prices, 21);
    const rsi = calculateRSI(prices, 14);

    // حساب المستويات من الشموع السابقة فقط
    const historicalCandles = candles.slice(0, -2);
    const levels = getPivotLevels(historicalCandles);

    const resistance = nearestLevels(levels, price).resistance;
    const support = nearestLevels(levels, price).support;

    const pip = symbol === "XAU/USD" ? 0.01 : 0.0001;
    const decimals = symbol === "XAU/USD" ? 3 : 5;

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

    // اكتشاف الاختراق والكسر من نفس المستويات التاريخية
    const previousResistance =
      nearestLevels(levels, previous.close).resistance;

    const previousSupport =
      nearestLevels(levels, previous.close).support;

    const breakoutUp =
      previousResistance !== undefined &&
      previous.close <= previousResistance &&
      price > previousResistance;

    const breakoutDown =
      previousSupport !== undefined &&
      previous.close >= previousSupport &&
      price < previousSupport;

    const bullishCandle = current.close > current.open;
    const bearishCandle = current.close < current.open;

    const upTrend = ema9 > ema21 && price > ema9;
    const downTrend = ema9 < ema21 && price < ema9;

    let signal = "⏳ انتظار";
    let direction = "غير مؤكد";
    let duration = "لا توجد مدة مقترحة";
    let reason = "لا يوجد تأكيد كافٍ للدخول.";

    if (upTrend) direction = "صاعد";
    if (downTrend) direction = "هابط";

    // شروط الشراء
    const buySetup =
      upTrend &&
      bullishCandle &&
      rsi >= 52 &&
      rsi <= 68 &&
      (breakoutUp || (!nearResistance && price > ema9));

    // شروط البيع
    const sellSetup =
      downTrend &&
      bearishCandle &&
      rsi >= 32 &&
      rsi <= 48 &&
      (breakoutDown || (!nearSupport && price < ema9));

    if (buySetup) {
      signal = "🟢 شراء UP";
      direction = "صاعد";
      duration = "دقيقة واحدة";

      reason = breakoutUp
        ? "اختراق مقاومة مع اتجاه صاعد وزخم إيجابي."
        : "اتجاه صاعد وشمعة إيجابية وشروط الشراء مكتملة.";

    } else if (sellSetup) {
      signal = "🔴 بيع DOWN";
      direction = "هابط";
      duration = "دقيقتان";

      reason = breakoutDown
        ? "كسر دعم مع اتجاه هابط وزخم سلبي."
        : "اتجاه هابط وشمعة سلبية وشروط البيع مكتملة.";

    } else if (rsi < 30) {
      reason = "تشبع بيعي محتمل؛ انتظر تأكيد الارتداد.";

    } else if (rsi > 70) {
      reason = "تشبع شرائي محتمل؛ انتظر تأكيد التراجع.";

    } else if (nearResistance) {
      reason = "السعر قريب من المقاومة؛ انتظر اختراقاً أو ارتداداً مؤكداً.";

    } else if (nearSupport) {
      reason = "السعر قريب من الدعم؛ انتظر كسراً أو ارتداداً مؤكداً.";

    } else if (upTrend) {
      reason = "الميل صاعد، لكن شروط الشراء لم تكتمل.";

    } else if (downTrend) {
      reason = "الميل هابط، لكن شروط البيع لم تكتمل.";
    }

    const resistanceText = resistance !== undefined
      ? resistance.toFixed(decimals) +
        " (يبعد " + resistanceDistance.toFixed(1) + " بيب)"
      : "غير متوفر";

    const supportText = support !== undefined
      ? support.toFixed(decimals) +
        " (يبعد " + supportDistance.toFixed(1) + " بيب)"
      : "غير متوفر";

    await ctx.reply(
      "📊 تحليل " + name + "\n\n" +
      "⏱ فريم التحليل: دقيقة واحدة (1M)\n\n" +
      "السعر: " + price.toFixed(decimals) + "\n" +
      "EMA 9: " + ema9.toFixed(decimals) + "\n" +
      "EMA 21: " + ema21.toFixed(decimals) + "\n" +
      "RSI: " + rsi.toFixed(2) + "\n\n" +
      "🔺 أقرب مقاومة: " + resistanceText + "\n" +
      "🔻 أقرب دعم: " + supportText + "\n\n" +
      "الاتجاه: " + direction + "\n" +
      "الإشارة: " + signal + "\n" +
      "المدة المقترحة: " + duration + "\n\n" +
      "💡 سبب القرار: " + reason + "\n\n" +
      "⚠️ الإشارات تحليلية وليست ضماناً للربح."
    );

  } catch (error) {
    console.error("Analysis error:", error);
    await ctx.reply("⚠️ حدث خطأ أثناء التحليل. حاول مرة أخرى.");
  }
}

export function registerCommands(bot) {
  bot.command("start", ctx =>
    ctx.reply(
      "أهلاً بك في Masaad 🤖\n\n" +
      "مساعد تحليل الذهب واليورو دولار.\n\n" +
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

