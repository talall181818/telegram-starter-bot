
const API_KEY = process.env.TWELVEDATA_API_KEY;

export function registerCommands(bot) {
  bot.command("start", ctx =>
    ctx.reply("أهلاً بك في Masaad 🤖\nتحليل الذهب واليورو.\nأرسل /help")
  );

  bot.command("help", ctx =>
    ctx.reply("/gold - تحليل الذهب\n/eurusd - تحليل اليورو دولار")
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

async function analyze(ctx, symbol, name) {
  try {
    if (!API_KEY) throw new Error("API key missing");

    const url = new URL("https://api.twelvedata.com/time_series");
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

    const history = candles.slice(-21, -1);
    const resistance = Math.max(...history.map(c => c.high));
    const support = Math.min(...history.map(c => c.low));

    const nearResistance =
      current.close < resistance &&
      (resistance - current.close) / resistance <= 0.0015;

    const nearSupport =
      current.close > support &&
      (current.close - support) / support <= 0.0015;

    const earlyWarning = nearResistance || nearSupport;

    const bullishCandle = current.close > current.open;
    const bearishCandle = current.close < current.open;

    const upTrend = fast > slow;
    const downTrend = fast < slow;

    const breakoutUp =
      previous.close <= resistance &&
      current.close > resistance &&
      bullishCandle;

    const breakoutDown =
      previous.close >= support &&
      current.close < support &&
      bearishCandle;

    let signal = "⏳ انتظار";
    let direction = "غير مؤكد";
    let duration = "لا توجد مدة مقترحة";

    if (breakoutUp && upTrend && momentum >= 50 && momentum <= 75) {
      signal = "🟢 شراء UP - اختراق مؤكد";
      direction = "صاعد";
      duration = "دقيقة واحدة";
    } else if (
      breakoutDown && downTrend &&
      momentum >= 25 && momentum <= 50
    ) {
      signal = "🔴 بيع DOWN - كسر مؤكد";
      direction = "هابط";
      duration = "دقيقة واحدة";
    } else if (
      nearResistance && upTrend &&
      momentum >= 50 && momentum <= 68 && bullishCandle
    ) {
      signal = "🟡 استعداد شراء - قرب المقاومة";
      direction = "ميل صاعد";
    } else if (
      nearSupport && downTrend &&
      momentum >= 32 && momentum <= 50 && bearishCandle
    ) {
      signal = "🟠 استعداد بيع - قرب الدعم";
      direction = "ميل هابط";
    }

    const warningText = earlyWarning
      ? "⚠️ تنبيه مبكر: السعر قريب من الدعم أو المقاومة"
      : "لا يوجد تنبيه مبكر";

    await ctx.reply(
      `📊 تحليل ${name}\n\n` +
      `السعر: ${current.close}\n` +
      `EMA 9: ${fast.toFixed(5)}\n` +
      `EMA 21: ${slow.toFixed(5)}\n` +
      `RSI: ${momentum.toFixed(2)}\n\n` +
      `🔺 المقاومة: ${resistance}\n` +
      `🔻 الدعم: ${support}\n\n` +
      `الاتجاه: ${direction}\n` +
      `الإشارة: ${signal}\n` +
      `المدة المقترحة: ${duration}\n\n` +
      `${warningText}\n` +
      `⚠️ الإشارات تحليلية وليست ضماناً للربح.`
    );

  } catch (error) {
    console.error("[analysis error]", error);
    await ctx.reply(
      "تعذر التحليل حاليًا. تحقق من البيانات ومفتاح API."
    );
  }
}

