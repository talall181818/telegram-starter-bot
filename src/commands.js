
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
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < values.length; i++) {
    const change = values[i] - values[i - 1];
    const gain = Math.max(change, 0);
    const loss = Math.max(-change, 0);

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;

  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

// استخراج القمم والقيعان من الشموع السابقة
function getLevels(candles) {
  const highs = [];
  const lows = [];

  for (let i = 2; i < candles.length - 2; i++) {
    const c = candles[i];

    if (
      c.high > candles[i - 1].high &&
      c.high > candles[i - 2].high &&
      c.high > candles[i + 1].high &&
      c.high > candles[i + 2].high
    ) {
      highs.push(c.high);
    }

    if (
      c.low < candles[i - 1].low &&
      c.low < candles[i - 2].low &&
      c.low < candles[i + 1].low &&
      c.low < candles[i + 2].low
    ) {
      lows.push(c.low);
    }
  }

  return { highs, lows };
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
    const data = await response.json();

    if (!response.ok || !data.values || data.values.length < 40) {
      console.error("Twelve Data error:", data);
      return ctx.reply("⚠️ البيانات غير متوفرة حاليًا. حاول لاحقًا.");
    }

    // حذف الشمعة الأحدث لاحتمال أنها لم تكتمل
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

    // المستويات مأخوذة من الشموع السابقة فقط
    const { highs, lows } = getLevels(
      candles.slice(0, -1)
    );

    const resistance = nearestLevel(
      highs,
      previous.close,
      "resistance"
    );

    const support = nearestLevel(
      lows,
      previous.close,
      "support"
    );

    const bullishCandle = current.close > current.open;
    const bearishCandle = current.close < current.open;

    const upTrend = ema9 > ema21 && price > ema9;
    const downTrend = ema9 < ema21 && price < ema9;

    const pip = symbol === "XAU/USD" ? 0.01 : 0.0001;

    // اختراق المقاومة بإغلاق شمعة مكتملة
    const breakoutUp =
      resistance !== null &&
      previous.close <= resistance &&
      current.close > resistance + pip * 0.5 &&
      bullishCandle;

    // كسر الدعم بإغلاق شمعة مكتملة
    const breakoutDown =
      support !== null &&
      previous.close >= support &&
      current.close < support - pip * 0.5 &&
      bearishCandle;

    let signal = "⏳ انتظار";
    let duration = "لا توجد مدة مقترحة";

    if (
      breakoutUp &&
      upTrend &&
      rsi >= 50 &&
      rsi <= 68
    ) {
      signal = "🟢 شراء UP";
      duration = rsi >= 58 ? "دقيقتان" : "دقيقة واحدة";

    } else if (
      breakoutDown &&
      downTrend &&
      rsi >= 32 &&
      rsi <= 50
    ) {
      signal = "🔴 بيع DOWN";
      duration = rsi <= 42 ? "دقيقتان" : "دقيقة واحدة";
    }

    const decimals = symbol === "XAU/USD" ? 2 : 5;

    const reply =
      "📊 تحليل " + name + "\n\n" +
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
