
const API_KEY = process.env.TWELVEDATA_API_KEY;

export function registerCommands(bot) {
  bot.command("start", ctx =>
    ctx.reply(
      "أهلاً بك في Masaad 🤖\n" +
      "تحليل الذهب واليورو دولار.\n" +
      "أرسل /help"
    )
  );

  bot.command("help", ctx =>
    ctx.reply(
      "📊 أوامر Masaad\n\n" +
      "/gold - تحليل الذهب\n" +
      "/eurusd - تحليل اليورو دولار"
    )
  );

  bot.command("gold", ctx => analyze(ctx, "XAU/USD", "الذهب"));
  bot.command("eurusd", ctx => analyze(ctx, "EUR/USD", "اليورو دولار"));
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

  if (losses === 0) return gains === 0 ? 50 : 100;

  return 100 - 100 / (1 + gains / losses);
}

// استخراج أقرب المستويات
function findLevels(candles, reference) {
  const resistanceCandidates = [];
  const supportCandidates = [];

  for (let i = 1; i < candles.length - 1; i++) {
    const c = candles[i];

    if (
      c.high >= candles[i - 1].high &&
      c.high >= candles[i + 1].high &&
      c.high > reference
    ) {
      resistanceCandidates.push(c.high);
    }

    if (
      c.low <= candles[i - 1].low &&
      c.low <= candles[i + 1].low &&
      c.low < reference
    ) {
      supportCandidates.push(c.low);
    }
  }

  if (resistanceCandidates.length === 0) {
    for (const c of candles) {
      if (c.high > reference) resistanceCandidates.push(c.high);
    }
  }

  if (supportCandidates.length === 0) {
    for (const c of candles) {
      if (c.low < reference) supportCandidates.push(c.low);
    }
  }

  return {
    resistance: resistanceCandidates.length
      ? Math.min(...resistanceCandidates)
      : null,

    support: supportCandidates.length
      ? Math.max(...supportCandidates)
      : null
  };
}

async function analyze(ctx, symbol, name) {
  try {
    if (!API_KEY) {
      throw new Error("API key missing");
    }

    const url = new URL(
      "https://api.twelvedata.com/time_series"
    );

    url.searchParams.set("symbol", symbol);
    url.searchParams.set("interval", "1min");
    url.searchParams.set("outputsize", "50");
    url.searchParams.set("apikey", API_KEY);

    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok || data.status === "error" || !data.values) {
      throw new Error(data.message || "Data unavailable");
    }

    // استبعاد الشمعة الحالية غير المكتملة
    const candles = data.values.slice(1).reverse().map(c => ({
      open: Number(c.open),
      high: Number(c.high),
      low: Number(c.low),
      close: Number(c.close)
    }));

    if (
      candles.length < 25 ||
      candles.some(c =>
        !Number.isFinite(c.open) ||
        !Number.isFinite(c.high) ||
        !Number.isFinite(c.low) ||
        !Number.isFinite(c.close)
      )
    ) {
      throw new Error("Not enough valid candles");
    }

    const closes = candles.map(c => c.close);

    const current = candles[candles.length - 1];
    const previous = candles[candles.length - 2];

    const fast = ema(closes, 9);
    const slow = ema(closes, 21);
    const momentum = rsi(closes);

    // آخر 30 شمعة مكتملة قبل شمعة الإشارة
    const history = candles.slice(-31, -1);

    // مستويات الاختراق مقارنة بالسعر السابق
    const breakoutLevels = findLevels(history, previous.close);

    // مستويات العرض مقارنة بالسعر الحالي
    const displayLevels = findLevels(history, current.close);

    const resistance = displayLevels.resistance;
    const support = displayLevels.support;

    const pip = symbol === "EUR/USD" ? 0.0001 : 0.01;

    const resistanceDistance = resistance === null
      ? null
      : (resistance - current.close) / pip;

    const supportDistance = support === null
      ? null
      : (current.close - support) / pip;

    const bullishCandle = current.close > current.open;
    const bearishCandle = current.close < current.open;

    const upTrend = fast > slow;
    const downTrend = fast < slow;

    const breakoutUp =
      breakoutLevels.resistance !== null &&
      previous.close <= breakoutLevels.resistance &&
      current.close > breakoutLevels.resistance &&
      bullishCandle;

    const breakoutDown =
      breakoutLevels.support !== null &&
      previous.close >= breakoutLevels.support &&
      current.close < breakoutLevels.support &&
      bearishCandle;

    // منع الدخول بعد الابتعاد عن نقطة الاختراق
    const maxExtension = 3 * pip;

    const goodBuyEntry =
      breakoutUp &&
      current.close - breakoutLevels.resistance <= maxExtension;

    const goodSellEntry =
      breakoutDown &&
      breakoutLevels.support - current.close <= maxExtension;

    let signal = "⏳ انتظار";
    let direction = "غير مؤكد";
    let duration = "لا توجد مدة";

    // شراء فقط عند توافق جميع الشروط
    if (
      goodBuyEntry &&
      upTrend &&
      momentum >= 50 &&
      momentum < 70 &&
      bullishCandle &&
      !goodSellEntry
    ) {
      signal = "🟢 شراء UP";
      direction = "صاعد";

      duration = momentum >= 60
        ? "دقيقة واحدة"
        : "دقيقتان";
    }

    // بيع فقط عند توافق جميع الشروط
    else if (
      goodSellEntry &&
      downTrend &&
      momentum > 30 &&
      momentum <= 50 &&
      bearishCandle &&
      !goodBuyEntry
    ) {
      signal = "🔴 بيع DOWN";
      direction = "هابط";

      duration = momentum <= 40
        ? "دقيقة واحدة"
        : "دقيقتان";
    }

    const formatPrice = value =>
      value.toFixed(symbol === "EUR/USD" ? 5 : 3);

    const resistanceText = resistance === null
      ? "غير متاح"
      : formatPrice(resistance) +
        " (يبعد " + resistanceDistance.toFixed(1) + " نقطة)";

    const supportText = support === null
      ? "غير متاح"
      : formatPrice(support) +
        " (يبعد " + supportDistance.toFixed(1) + " نقطة)";

    let warning = "لا يوجد اقتراب من مستوى مهم";

    if (
      resistanceDistance !== null &&
      resistanceDistance >= 0 &&
      resistanceDistance <= 5
    ) {
      warning = "⚠️ السعر قريب من المقاومة";
    } else if (
      supportDistance !== null &&
      supportDistance >= 0 &&
      supportDistance <= 5
    ) {
      warning = "⚠️ السعر قريب من الدعم";
    }

    await ctx.reply(
      "📊 تحليل " + name + "\n\n" +
      "⏱ فريم التحليل: دقيقة واحدة (1M)\n\n" +
      "السعر: " + formatPrice(current.close) + "\n" +
      "EMA 9: " + formatPrice(fast) + "\n" +
      "EMA 21: " + formatPrice(slow) + "\n" +
      "RSI: " + momentum.toFixed(2) + "\n\n" +
      "🔺 أقرب مقاومة: " + resistanceText + "\n" +
      "🔻 أقرب دعم: " + supportText + "\n\n" +
      "الاتجاه: " + direction + "\n" +
      "الإشارة: " + signal + "\n" +
      "المدة المقترحة: " + duration + "\n\n" +
      warning + "\n\n" +
      "⚠️ الإشارات تحليلية وليست ضماناً للربح."
    );

  } catch (error) {
    console.error("[analysis error]", error);

    await ctx.reply(
      "تعذر التحليل حالياً. تحقق من البيانات ومفتاح API."
    );
  }
}

