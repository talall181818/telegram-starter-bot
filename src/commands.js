
const API_KEY = process.env.TWELVEDATA_API_KEY;

function ema(values, period) {
  const multiplier = 2 / (period + 1);
  let result = values[0];

  for (let i = 1; i < values.length; i++) {
    result = values[i] * multiplier + result * (1 - multiplier);
  }

  return result;
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

  const rs = (gains / period) / (losses / period);
  return 100 - 100 / (1 + rs);
}

function getLevels(candles) {
  const supports = [];
  const resistances = [];

  for (let i = 2; i < candles.length - 2; i++) {
    const c = candles[i];

    if (
      c.low < candles[i - 1].low &&
      c.low < candles[i - 2].low &&
      c.low < candles[i + 1].low &&
      c.low < candles[i + 2].low
    ) {
      supports.push(c.low);
    }

    if (
      c.high > candles[i - 1].high &&
      c.high > candles[i - 2].high &&
      c.high > candles[i + 1].high &&
      c.high > candles[i + 2].high
    ) {
      resistances.push(c.high);
    }
  }

  return { supports, resistances };
}

function nearestLevel(levels, price, type) {
  const filtered = levels.filter(level =>
    type === "support" ? level < price : level > price
  );

  if (!filtered.length) return null;

  return type === "support"
    ? Math.max(...filtered)
    : Math.min(...filtered);
}

async function analyze(ctx, symbol, name) {
  try {
    if (!API_KEY) {
      return ctx.reply("⚠️ مفتاح Twelve Data غير موجود في إعدادات البوت.");
    }

    const url =
      "https://api.twelvedata.com/time_series" +
      "?symbol=" + encodeURIComponent(symbol) +
      "&interval=1min&outputsize=100&apikey=" + API_KEY;

    const response = await fetch(url);
    const data = await response.json();

    if (!data.values || data.values.length < 30) {
      return ctx.reply("⚠️ لا توجد بيانات كافية للتحليل حاليًا.");
    }

    // تجاهل الشمعة الحالية غير المكتملة
    const candles = data.values.slice(1).reverse().map(c => ({
      open: Number(c.open),
      high: Number(c.high),
      low: Number(c.low),
      close: Number(c.close)
    }));

    const prices = candles.map(c => c.close);
    const last = candles[candles.length - 1];
    const previous = candles[candles.length - 2];

    const price = last.close;
    const ema9 = ema(prices.slice(-40), 9);
    const ema21 = ema(prices.slice(-60), 21);
    const rsi = calculateRSI(prices);

    const { supports, resistances } = getLevels(candles.slice(0, -2));

    const support = nearestLevel(supports, price, "support");
    const resistance = nearestLevel(resistances, price, "resistance");

    const pip = symbol === "XAU/USD" ? 0.01 : 0.0001;
    const decimals = symbol === "XAU/USD" ? 2 : 5;

    const supportDistance = support === null
      ? null : (price - support) / pip;

    const resistanceDistance = resistance === null
      ? null : (resistance - price) / pip;

    const bullishCandle = last.close > last.open;
    const bearishCandle = last.close < last.open;

    const upTrend = ema9 > ema21 && price > ema9;
    const downTrend = ema9 < ema21 && price < ema9;

    const breakoutUp =
      resistance !== null &&
      previous.close <= resistance &&
      price > resistance;

    const breakoutDown =
      support !== null &&
      previous.close >= support &&
      price < support;

    const nearResistance =
      resistanceDistance !== null && resistanceDistance <= 1.5;

    const nearSupport =
      supportDistance !== null && supportDistance <= 1.5;

    let signal = "⏳ انتظار";
    let direction = "غير مؤكد";
    let duration = "لا توجد مدة مقترحة";
    let reason = "الشروط غير مكتملة؛ انتظر تأكيد الاتجاه.";

    // شروط الشراء
    const buyMomentum =
      upTrend &&
      bullishCandle &&
      rsi >= 52 &&
      rsi <= 70;

    // شروط البيع
    const sellMomentum =
      downTrend &&
      bearishCandle &&
      rsi >= 30 &&
      rsi <= 48;

    if (buyMomentum && (breakoutUp || !nearResistance)) {
      signal = "🟢 شراء UP";
      direction = "صاعد";
      duration = "دقيقة واحدة";
      reason = breakoutUp
        ? "اختراق المقاومة مع تأكيد الاتجاه الصاعد."
        : "الاتجاه صاعد والزخم يدعم الشراء.";
    } else if (sellMomentum && (breakoutDown || !nearSupport)) {
      signal = "🔴 بيع DOWN";
      direction = "هابط";
      duration = "دقيقتان";
      reason = breakoutDown
        ? "كسر الدعم مع تأكيد الاتجاه الهابط."
        : "الاتجاه هابط والزخم يدعم البيع.";
    } else if (nearResistance) {
      reason = "السعر قريب من المقاومة؛ لا تستعجل الشراء.";
    } else if (nearSupport) {
      reason = "السعر قريب من الدعم؛ لا تستعجل البيع.";
    } else if (rsi > 70) {
      reason = "السوق في منطقة تشبع شرائي.";
    } else if (rsi < 30) {
      reason = "السوق في منطقة تشبع بيعي.";
    } else if (!upTrend && !downTrend) {
      reason = "الاتجاه غير واضح؛ ننتظر تأكيد الحركة.";
    }

    const fmt = n => n === null ? "غير متوفر" : n.toFixed(decimals);

    const reply =
      "📊 تحليل " + name + "\n\n" +
      "⏱ فريم التحليل: دقيقة واحدة (1M)\n\n" +
      "السعر: " + fmt(price) + "\n" +
      "EMA 9: " + fmt(ema9) + "\n" +
      "EMA 21: " + fmt(ema21) + "\n" +
      "RSI: " + rsi.toFixed(2) + "\n\n" +
      "🔺 أقرب مقاومة: " + fmt(resistance) +
      (resistanceDistance === null ? "" :
        " (يبعد " + resistanceDistance.toFixed(1) + " بيب)") + "\n" +
      "🔻 أقرب دعم: " + fmt(support) +
      (supportDistance === null ? "" :
        " (يبعد " + supportDistance.toFixed(1) + " بيب)") + "\n\n" +
      "الاتجاه: " + direction + "\n" +
      "الإشارة: " + signal + "\n" +
      "المدة المقترحة: " + duration + "\n\n" +
      "💡 سبب القرار: " + reason + "\n\n" +
      "⚠️ الإشارات تحليلية وليست ضمانًا للربح.";

    return ctx.reply(reply);

  } catch (error) {
    console.error("Analysis error:", error);
    return ctx.reply("⚠️ حدث خطأ أثناء التحليل. حاول مرة أخرى.");
  }
}

export function registerCommands(bot) {
  bot.command("start", ctx =>
    ctx.reply(
      "أهلاً بك في Masaad 🤖\n\n" +
      "تحليل الذهب واليورو دولار.\n" +
      "أرسل /help لعرض الأوامر."
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
