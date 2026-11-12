
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
  let gains = 0;
  let losses = 0;

  for (let i = values.length - period; i < values.length; i++) {
    const change = values[i] - values[i - 1];

    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }

  if (losses === 0) return 100;

  const rs = gains / Math.max(losses, 0.000000001);
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
      return ctx.reply("⚠️ مفتاح TWELVEDATA_API_KEY غير موجود.");
    }

    const url =
      "https://api.twelvedata.com/time_series" +
      "?symbol=" + encodeURIComponent(symbol) +
      "&interval=1min&outputsize=100&apikey=" + API_KEY;

    const response = await fetch(url);

    if (!response.ok) {
      return ctx.reply("⚠️ تعذر الاتصال بمصدر الأسعار. حاول لاحقًا.");
    }

    const data = await response.json();

    if (!data.values || data.values.length < 30) {
      return ctx.reply("⚠️ البيانات غير كافية للتحليل.");
    }

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

    const { supports, resistances } =
      getLevels(candles.slice(0, -2));

    const support = nearestLevel(supports, price, "support");
    const resistance = nearestLevel(resistances, price, "resistance");

    const previousSupport =
      nearestLevel(supports, previous.close, "support");

    const previousResistance =
      nearestLevel(resistances, previous.close, "resistance");

    const bullish = last.close > last.open;
    const bearish = last.close < last.open;

    const upTrend = ema9 > ema21 && price > ema9;
    const downTrend = ema9 < ema21 && price < ema9;

    const pip = symbol === "XAU/USD" ? 0.01 : 0.0001;
    const decimals = symbol === "XAU/USD" ? 2 : 5;

    // اختراق المقاومة
    const breakoutUp =
      previousResistance !== null &&
      previous.close <= previousResistance &&
      price > previousResistance &&
      bullish;

    // كسر الدعم
    const breakoutDown =
      previousSupport !== null &&
      previous.close >= previousSupport &&
      price < previousSupport &&
      bearish;

    // ارتداد من الدعم
    const supportBounce =
      support !== null &&
      previous.low <= support + pip * 2 &&
      price > support &&
      bullish &&
      price > previous.close;

    // رفض من المقاومة
    const resistanceReject =
      resistance !== null &&
      previous.high >= resistance - pip * 2 &&
      price < resistance &&
      bearish &&
      price < previous.close;

    const buySignal =
      upTrend &&
      rsi >= 52 &&
      rsi <= 68 &&
      (breakoutUp || supportBounce);

    const sellSignal =
      downTrend &&
      rsi >= 32 &&
      rsi <= 48 &&
      (breakoutDown || resistanceReject);

    let signal = "⏳ انتظار";
    let duration = "لا توجد مدة";

    if (buySignal) {
      signal = "🟢 شراء UP";

      duration =
        breakoutUp && rsi >= 58
          ? "دقيقتان"
          : "دقيقة واحدة";

    } else if (sellSignal) {
      signal = "🔴 بيع DOWN";

      duration =
        breakoutDown && rsi <= 42
          ? "دقيقتان"
          : "دقيقة واحدة";
    }

    const reply =
      "📊 " + name + "\n\n" +
      "السعر: " + price.toFixed(decimals) + "\n\n" +
      "الإشارة: " + signal + "\n" +
      "المدة المقترحة: " + duration + "\n\n" +
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
