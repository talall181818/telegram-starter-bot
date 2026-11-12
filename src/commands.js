
const API_KEY = process.env.TWELVEDATA_API_KEY;

export function registerCommands(bot) {
  bot.command("start", async (ctx) => {
    await ctx.reply(
      "أهلاً بك في Masaad 🤖\n\n" +
      "تحليل الذهب واليورو دولار.\n\n" +
      "/gold - تحليل الذهب\n" +
      "/eurusd - تحليل اليورو دولار\n" +
      "/help - المساعدة"
    );
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(
      "📊 أوامر بوت Masaad\n\n" +
      "/gold - تحليل الذهب\n" +
      "/eurusd - تحليل اليورو دولار"
    );
  });

  bot.command("gold", async (ctx) => {
    await analyze(ctx, "XAU/USD", "الذهب");
  });

  bot.command("eurusd", async (ctx) => {
    await analyze(ctx, "EUR/USD", "اليورو دولار");
  });
}

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

  const rs = averageGain / averageLoss;
  return 100 - (100 / (1 + rs));
}

function calculateATR(candles) {
  const ranges = [];

  for (let i = 1; i < candles.length; i++) {
    const current = candles[i];
    const previous = candles[i - 1];

    ranges.push(
      Math.max(
        current.high - current.low,
        Math.abs(current.high - previous.close),
        Math.abs(current.low - previous.close)
      )
    );
  }

  return ranges.reduce((a, b) => a + b, 0) /
    Math.max(ranges.length, 1);
}

// تجميع القمم والقيعان المتقاربة في مستويات واحدة
function clusterLevels(prices, candles, tolerance, type) {
  const sorted = [...prices].sort((a, b) => a - b);
  const clusters = [];

  for (const price of sorted) {
    let cluster = clusters.find(
      item => Math.abs(item.average - price) <= tolerance
    );

    if (!cluster) {
      cluster = { prices: [], average: price };
      clusters.push(cluster);
    }

    cluster.prices.push(price);
    cluster.average =
      cluster.prices.reduce((a, b) => a + b, 0) /
      cluster.prices.length;
  }

  return clusters.map(cluster => {
    const touches = candles.filter(candle => {
      const value = type === "resistance"
        ? candle.high
        : candle.low;

      return Math.abs(value - cluster.average) <= tolerance;
    }).length;

    return {
      price: cluster.average,
      touches,
      pivots: cluster.prices.length
    };
  });
}

// استخراج المستويات القوية من الشموع السابقة
function findStrongLevels(candles, currentPrice) {
  const atr = calculateATR(candles);
  const tolerance = Math.max(atr * 0.20, 0.00001);

  const highs = [];
  const lows = [];

  for (let i = 2; i < candles.length - 2; i++) {
    const high = candles[i].high;
    const low = candles[i].low;

    if (
      high >= candles[i - 1].high &&
      high >= candles[i - 2].high &&
      high >= candles[i + 1].high &&
      high >= candles[i + 2].high
    ) {
      highs.push(high);
    }

    if (
      low <= candles[i - 1].low &&
      low <= candles[i - 2].low &&
      low <= candles[i + 1].low &&
      low <= candles[i + 2].low
    ) {
      lows.push(low);
    }
  }

  const resistanceLevels = clusterLevels(
    highs, candles, tolerance, "resistance"
  );

  const supportLevels = clusterLevels(
    lows, candles, tolerance, "support"
  );

  // المستويات التي تم اختبارها مرتين أو أكثر
  const strongResistance = resistanceLevels
    .filter(level =>
      level.price > currentPrice && level.touches >= 2
    )
    .sort((a, b) => a.price - b.price);

  const strongSupport = supportLevels
    .filter(level =>
      level.price < currentPrice && level.touches >= 2
    )
    .sort((a, b) => b.price - a.price);

  // في حال عدم وجود مستوى متكرر، نستخدم أقرب قمة أو قاع واضح
  const fallbackResistance = resistanceLevels
    .filter(level => level.price > currentPrice)
    .sort((a, b) => a.price - b.price);

  const fallbackSupport = supportLevels
    .filter(level => level.price < currentPrice)
    .sort((a, b) => b.price - a.price);

  return {
    resistance:
      strongResistance[0] || fallbackResistance[0] || null,
    support:
      strongSupport[0] || fallbackSupport[0] || null
  };
}

async function analyze(ctx, symbol, name) {
  try {
    if (!API_KEY) {
      await ctx.reply("⚠️ مفتاح Twelve Data غير موجود.");
      return;
    }

    await ctx.reply("⏳ جاري تحليل " + name + "...");

    const url = new URL(
      "https://api.twelvedata.com/time_series"
    );

    url.searchParams.set("symbol", symbol);
    url.searchParams.set("interval", "1min");
    url.searchParams.set("outputsize", "60");
    url.searchParams.set("apikey", API_KEY);

    const response = await fetch(url);
    const data = await response.json();

    if (!data.values || data.values.length < 30) {
      throw new Error(data.message || "لا توجد بيانات كافية");
    }

    // آخر 50 شمعة مكتملة، مرتبة من الأقدم إلى الأحدث
    const candles = data.values
      .slice(1, 51)
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
    const rsi = calculateRSI(prices);

    const upTrend = ema9 > ema21 && price > ema9;
    const downTrend = ema9 < ema21 && price < ema9;

    // مستويات الاختراق تحسب من الشموع السابقة
    const history = candles.slice(0, -1);

    const signalLevels = findStrongLevels(
      history,
      previous.close
    );

    // مستويات العرض تحسب بالنسبة للسعر الحالي
    const displayLevels = findStrongLevels(
      history,
      price
    );

    const pip = symbol === "EUR/USD" ? 0.0001 : 0.01;

    const resistance = displayLevels.resistance;
    const support = displayLevels.support;

    const breakoutUp =
      signalLevels.resistance &&
      previous.close <= signalLevels.resistance.price &&
      current.close > signalLevels.resistance.price;

    const breakoutDown =
      signalLevels.support &&
      previous.close >= signalLevels.support.price &&
      current.close < signalLevels.support.price;

    const bullishCandle = current.close > current.open;
    const bearishCandle = current.close < current.open;

    const rsiAllowsBuy = rsi >= 50 && rsi < 70;
    const rsiAllowsSell = rsi > 30 && rsi <= 50;

    let signal = "⏳ انتظار";
    let direction = "غير مؤكد";
    let duration = "لا توجد مدة";

    if (
      breakoutUp &&
      upTrend &&
      rsiAllowsBuy &&
      bullishCandle
    ) {
      signal = "🟢 شراء UP - اختراق مؤكد";
      direction = "صاعد";
      duration = "دقيقة واحدة";
    } else if (
      breakoutDown &&
      downTrend &&
      rsiAllowsSell &&
      bearishCandle
    ) {
      signal = "🔴 بيع DOWN - كسر مؤكد";
      direction = "هابط";
      duration = "دقيقتان";
    }

    const decimals = symbol === "EUR/USD" ? 5 : 3;

    const resistanceText = resistance
      ? resistance.price.toFixed(decimals) +
        " (يبعد " +
        (Math.abs(resistance.price - price) / pip).toFixed(1) +
        " نقطة، اختُبر " + resistance.touches + " مرات)"
      : "لا يوجد مستوى مقاومة واضح";

    const supportText = support
      ? support.price.toFixed(decimals) +
        " (يبعد " +
        (Math.abs(price - support.price) / pip).toFixed(1) +
        " نقطة، اختُبر " + support.touches + " مرات)"
      : "لا يوجد مستوى دعم واضح";

    let warning = "";

    if (resistance && resistance.price - price <= pip * 3) {
      warning = "\n\n⚠️ السعر قريب من المقاومة";
    } else if (support && price - support.price <= pip * 3) {
      warning = "\n\n⚠️ السعر قريب من الدعم";
    }

    const message =
      "📊 تحليل " + name + "\n\n" +
      "⏱ فريم التحليل: دقيقة واحدة (1M)\n\n" +
      "السعر: " + price.toFixed(decimals) + "\n" +
      "EMA 9: " + ema9.toFixed(decimals) + "\n" +
      "EMA 21: " + ema21.toFixed(decimals) + "\n" +
      "RSI: " + rsi.toFixed(2) + "\n\n" +
      "🔺 أقوى مقاومة: " + resistanceText + "\n" +
      "🔻 أقوى دعم: " + supportText + "\n\n" +
      "الاتجاه: " + direction + "\n" +
      "الإشارة: " + signal + "\n" +
      "المدة المقترحة: " + duration +
      warning +
      "\n\n⚠️ الإشارات تحليلية وليست ضماناً للربح.";

    await ctx.reply(message);

  } catch (error) {
    console.error("Analysis error:", error);

    await ctx.reply(
      "⚠️ تعذر تحليل " + name +
      "\nتأكد من مفتاح Twelve Data والبيانات."
    );
  }
}

