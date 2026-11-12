
const API_KEY = process.env.TWELVEDATA_API_KEY;

export function registerCommands(bot) {
  bot.command("start", ctx =>
    ctx.reply("أهلاً بك في Masaad 🤖\nتحليل الذهب واليورو دولار.\nأرسل /help")
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

  if (losses === 0) return 100;

  return 100 - 100 / (1 + gains / losses);
}

// البحث عن أقرب دعم ومقاومة
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

  // بديل عند عدم وجود قمة أو قاع واضح
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
    if (!API_KEY) throw new Error("API key missing");

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

    const candles = data.values.slice().reverse().map(c => ({
      open: Number(c.open),
      high: Number(c.high),
      low: Number(c.low),
      close: Number(c.close)
    }));

    if (candles.length < 25) {
      throw new Error("Not enough candles");
    }

    const closes = candles.map(c => c.close);
    const current = candles[candles.length - 1];
    const previous = candles[candles.length - 2];

    const fast = ema(closes, 9);
    const slow = ema(closes, 21);
    const momentum = rsi(closes);

    // آخر 30 شمعة مكتملة قبل الشمعة الحالية
    const history = candles.slice(-31, -1);

    const levels = findLevels(history, previous.close);

    const resistance = levels.resistance;
    const support = levels.support;

    const pip = symbol === "EUR/USD" ? 0.0001 : 0.01;

    const resistanceDistance = resistance === null
      ? null
      : Math.abs(resistance - current.close) / pip;

    const supportDistance = support === null
      ? null
      : Math.abs(current.close - support) / pip;

    const nearResistance =
      resistanceDistance !== null &&
      resistanceDistance <= 5;

    const nearSupport =
      supportDistance !== null &&
      supportDistance <= 5;

    const bullishCandle = current.close > current.open;
    const bearishCandle = current.close < current.open;

    const upTrend = fast > slow;
    const downTrend = fast < slow;

    const breakoutUp =
      resistance !== null &&
      previous.close <= resistance &&
      current.close > resistance &&
      bullishCandle;

    const breakoutDown =
      support !== null &&
      previous.close >= support &&
      current.close < support &&
      bearishCandle;

    let signal = "⏳ انتظار";
    let direction = "غير مؤكد";
    let duration = "لا توجد مدة مقترحة";

    // اختيار المدة حسب قوة الزخم
    if (
      breakoutUp &&
      upTrend &&
      momentum >= 50 &&
      momentum < 70
    ) {
      signal = "🟢 شراء UP - اختراق مؤكد";
      direction = "صاعد";
      duration = momentum >= 60
        ? "دقيقة واحدة"
        : "دقيقتان";
    } else if (
      breakoutDown &&
      downTrend &&
      momentum > 30 &&
      momentum <= 50
    ) {
      signal = "🔴 بيع DOWN - كسر مؤكد";
      direction = "هابط";
      duration = momentum <= 40
        ? "دقيقة واحدة"
        : "دقيقتان";
    } else if (
      nearResistance &&
      upTrend &&
      momentum >= 50 &&
      momentum < 70
    ) {
      signal = "🟡 استعداد شراء - قرب المقاومة";
      direction = "ميل صاعد";
    } else if (
      nearSupport &&
      downTrend &&
      momentum > 30 &&
      momentum <= 50
    ) {
      signal = "🟠 استعداد بيع - قرب الدعم";
      direction = "ميل هابط";
    }

    const warning =
      nearResistance || nearSupport
        ? "⚠️ السعر قريب من مستوى مهم"
        : "لا يوجد اقتراب من مستوى مهم";

    const resistanceText = resistance === null
      ? "غير متاح"
      : resistance.toFixed(symbol === "EUR/USD" ? 5 : 3) +
        " (يبعد " + resistanceDistance.toFixed(1) + " نقطة)";

    const supportText = support === null
      ? "غير متاح"
      : support.toFixed(symbol === "EUR/USD" ? 5 : 3) +
        " (يبعد " + supportDistance.toFixed(1) + " نقطة)";

    await ctx.reply(
      "📊 تحليل " + name + "\n\n" +
      "⏱ فريم التحليل: دقيقة واحدة (1M)\n\n" +
      "السعر: " + current.close + "\n" +
      "EMA 9: " + fast.toFixed(5) + "\n" +
      "EMA 21: " + slow.toFixed(5) + "\n" +
      "RSI: " + momentum.toFixed(2) + "\n\n" +
      "🔺 أقرب مقاومة: " + resistanceText + "\n" +
      "🔻 أقرب دعم: " + supportText + "\n\n" +
      "الاتجاه: " + direction + "\n" +
      "الإشارة: " + signal + "\n" +
      "المدة المقترحة: " + duration + "\n\n" +
      warning + "\n" +
      "⚠️ الإشارات تحليلية وليست ضماناً للربح."
    );

  } catch (error) {
    console.error("[analysis error]", error);

    await ctx.reply(
      "تعذر التحليل حاليًا. تحقق من مفتاح API والبيانات."
    );
  }
}

