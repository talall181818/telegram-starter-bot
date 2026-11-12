
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
    result =
      values[i] * multiplier +
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
  return 100 - 100 / (1 + rs);
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

// تجميع القمم والقيعان المتقاربة
function makeClusters(pivots, tolerance) {
  const sorted = [...pivots].sort((a, b) => a.price - b.price);
  const clusters = [];

  for (const pivot of sorted) {
    let cluster = clusters.find(
      item => Math.abs(item.average - pivot.price) <= tolerance
    );

    if (!cluster) {
      cluster = {
        prices: [],
        average: pivot.price
      };
      clusters.push(cluster);
    }

    cluster.prices.push(pivot.price);

    cluster.average =
      cluster.prices.reduce((a, b) => a + b, 0) /
      cluster.prices.length;
  }

  return clusters.map(cluster => ({
    price: cluster.average,
    touches: cluster.prices.length
  }));
}

// البحث عن مستويات قوية من آخر 200 شمعة
function findStrongLevels(candles, currentPrice, pip) {
  const atr = calculateATR(candles);
  const tolerance = Math.max(atr * 0.25, pip * 1.5);
  const minimumDistance = pip * 5;

  const highs = [];
  const lows = [];

  // قمة أو قاع محاط بثلاث شمعات من كل جهة
  for (let i = 3; i < candles.length - 3; i++) {
    const high = candles[i].high;
    const low = candles[i].low;

    const left = candles.slice(i - 3, i);
    const right = candles.slice(i + 1, i + 4);

    const isSwingHigh =
      left.every(c => high > c.high) &&
      right.every(c => high >= c.high);

    const isSwingLow =
      left.every(c => low < c.low) &&
      right.every(c => low <= c.low);

    if (isSwingHigh) highs.push({ price: high });
    if (isSwingLow) lows.push({ price: low });
  }

  const resistanceClusters = makeClusters(highs, tolerance);
  const supportClusters = makeClusters(lows, tolerance);

  // لا نقبل المستوى إلا إذا تكرر اختباره مرتين على الأقل
  const resistances = resistanceClusters
    .filter(level =>
      level.touches >= 2 &&
      level.price - currentPrice >= minimumDistance
    );

  const supports = supportClusters
    .filter(level =>
      level.touches >= 2 &&
      currentPrice - level.price >= minimumDistance
    );

  // الأقوى أولاً، وعند تساوي القوة نختار الأقرب
  resistances.sort((a, b) =>
    b.touches - a.touches ||
    (a.price - currentPrice) - (b.price - currentPrice)
  );

  supports.sort((a, b) =>
    b.touches - a.touches ||
    (currentPrice - a.price) - (currentPrice - b.price)
  );

  return {
    resistance: resistances[0] || null,
    support: supports[0] || null
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
    url.searchParams.set("outputsize", "201");
    url.searchParams.set("order", "desc");
    url.searchParams.set("apikey", API_KEY);

    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok || !data.values || data.values.length < 100) {
      throw new Error(data.message || "لا توجد بيانات كافية");
    }

    // استبعاد أحدث شمعة، ثم ترتيب الباقي من الأقدم للأحدث
    const candles = data.values
      .slice(1, 201)
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

    const pip = symbol === "EUR/USD" ? 0.0001 : 0.01;
    const decimals = symbol === "EUR/USD" ? 5 : 3;

    const upTrend = ema9 > ema21 && price > ema9;
    const downTrend = ema9 < ema21 && price < ema9;

    // استخدام الشموع السابقة فقط في حساب المستويات
    const history = candles.slice(0, -1);

    const levelsForDisplay = findStrongLevels(
      history,
      price,
      pip
    );

    // مستويات الاختراق تحسب نسبة إلى إغلاق الشمعة السابقة
    const levelsForSignal = findStrongLevels(
      history,
      previous.close,
      pip
    );

    const resistance = levelsForDisplay.resistance;
    const support = levelsForDisplay.support;

    const breakoutUp =
      levelsForSignal.resistance &&
      previous.close <= levelsForSignal.resistance.price &&
      current.close > levelsForSignal.resistance.price + pip * 0.5;

    const breakoutDown =
      levelsForSignal.support &&
      previous.close >= levelsForSignal.support.price &&
      current.close < levelsForSignal.support.price - pip * 0.5;

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

    const resistanceText = resistance
      ? resistance.price.toFixed(decimals) +
        " (يبعد " +
        ((resistance.price - price) / pip).toFixed(1) +
        " نقطة، اختُبر " + resistance.touches + " مرات)"
      : "لا توجد مقاومة قوية تبعد 5 نقاط أو أكثر";

    const supportText = support
      ? support.price.toFixed(decimals) +
        " (يبعد " +
        ((price - support.price) / pip).toFixed(1) +
        " نقطة، اختُبر " + support.touches + " مرات)"
      : "لا يوجد دعم قوي يبعد 5 نقاط أو أكثر";

    let warning = "";

    if (resistance && support) {
      const resistanceDistance = resistance.price - price;
      const supportDistance = price - support.price;

      if (resistanceDistance < supportDistance) {
        warning = "\n\n⚠️ السعر أقرب إلى المقاومة";
      } else {
        warning = "\n\n⚠️ السعر أقرب إلى الدعم";
      }
    } else if (resistance) {
      warning = "\n\n⚠️ توجد مقاومة قوية أعلى السعر";
    } else if (support) {
      warning = "\n\n⚠️ يوجد دعم قوي أسفل السعر";
    } else {
      warning = "\n\n⚠️ لم يتم العثور على مستويات قوية كافية";
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
      "\nالسبب: " + error.message
    );
  }
}
