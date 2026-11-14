
const smartPrices = new Map();

function calculateEMA(values, period) {
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

  for (let i = values.length - period; i < values.length; i++) {
    const change = values[i] - values[i - 1];

    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }

  if (losses === 0) return gains === 0 ? 50 : 100;

  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

// قراءة اتجاه مجموعة من الشموع المكتملة
function getCandleTrend(candles) {
  const up = candles.filter(c => c.close > c.open).length;
  const down = candles.filter(c => c.close < c.open).length;

  const first = candles[0].open;
  const last = candles[candles.length - 1].close;

  if (last > first && up > down) {
    return "صاعد";
  }

  if (last < first && down > up) {
    return "هابط";
  }

  return "متذبذب";
}

function analyzeSmart(history) {
  if (history.length < 22) {
    return (
      "📊 تحليل Smart - Masaad\n\n" +
      "السعر المسجل: " +
      history[history.length - 1].toFixed(4) +
      "\nالقراءات: " + history.length + "/22\n\n" +
      "أرسل أسعارًا إضافية حتى يكتمل التحليل."
    );
  }

  const price = history[history.length - 1];
  const ema9 = calculateEMA(history, 9);
  const ema21 = calculateEMA(history, 21);
  const rsi = calculateRSI(history);

  let signal = "⏳ انتظار";
  let duration = "لا توجد مدة مقترحة";

  if (ema9 > ema21 && price > ema9 && rsi >= 52 && rsi <= 70) {
    signal = "🟢 شراء UP";
    duration = "30 ثانية";
  } else if (
    ema9 < ema21 &&
    price < ema9 &&
    rsi >= 30 &&
    rsi <= 48
  ) {
    signal = "🔴 بيع DOWN";
    duration = "30 ثانية";
  }

  return (
    "📊 تحليل Smart - Masaad\n\n" +
    "السعر: " + price.toFixed(4) + "\n" +
    "EMA 9: " + ema9.toFixed(4) + "\n" +
    "EMA 21: " + ema21.toFixed(4) + "\n" +
    "RSI: " + rsi.toFixed(2) + "\n\n" +
    "الإشارة: " + signal + "\n" +
    "المدة المقترحة: " + duration + "\n\n" +
    "⚠️ التحليل يعتمد على الأسعار المدخلة يدويًا، وليس سعرًا مباشرًا من ExpertOption."
  );
}

async function getEURUSDAnalysis() {
  const apiKey = process.env.TWELVEDATA_API_KEY;

  if (!apiKey) {
    return "⚠️ مفتاح TWELVEDATA_API_KEY غير موجود في إعدادات الاستضافة.";
  }

  const url =
    "https://api.twelvedata.com/time_series?symbol=EUR/USD&interval=1min&outputsize=60&apikey=" +
    encodeURIComponent(apiKey);

  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok || !Array.isArray(data.values)) {
    return "⚠️ تعذر جلب بيانات اليورو دولار. تحقق من Twelve Data.";
  }

  // ترتيب الشموع من الأقدم إلى الأحدث
  // واستبعاد أحدث شمعة لاحتمال أنها لم تكتمل
  const candles = data.values
    .slice(1)
    .map(item => ({
      open: Number(item.open),
      high: Number(item.high),
      low: Number(item.low),
      close: Number(item.close),
      time: item.datetime
    }))
    .reverse();

  if (
    candles.length < 30 ||
    candles.some(c =>
      !Number.isFinite(c.open) ||
      !Number.isFinite(c.close)
    )
  ) {
    return "⚠️ بيانات الشموع غير كافية أو غير صالحة.";
  }

  const prices = candles.map(c => c.close);

  const price = prices[prices.length - 1];
  const ema9 = calculateEMA(prices, 9);
  const ema21 = calculateEMA(prices, 21);
  const rsi = calculateRSI(prices);

  // الاتجاه القصير والمتوسط
  const trend5 = getCandleTrend(candles.slice(-5));
  const trend15 = getCandleTrend(candles.slice(-15));

  let direction = "متذبذب";

  if (trend5 === "صاعد" && trend15 === "صاعد") {
    direction = "صاعد";
  } else if (trend5 === "هابط" && trend15 === "هابط") {
    direction = "هابط";
  } else if (trend5 !== trend15) {
    direction = "متضارب";
  }

  let signal = "⏳ انتظار";
  let duration = "لا توجد مدة مقترحة";
  let reason = "";

  // شروط الشراء
  const buyCondition =
    trend5 === "صاعد" &&
    trend15 === "صاعد" &&
    ema9 > ema21 &&
    price > ema9 &&
    rsi >= 50 &&
    rsi <= 68;

  // شروط البيع
  const sellCondition =
    trend5 === "هابط" &&
    trend15 === "هابط" &&
    ema9 < ema21 &&
    price < ema9 &&
    rsi >= 32 &&
    rsi <= 50;

  if (buyCondition) {
    signal = "🟢 شراء UP";
    duration = "دقيقة واحدة";
    reason = "الشموع والمتوسطات والزخم متفقة على الصعود.";
  } else if (sellCondition) {
    signal = "🔴 بيع DOWN";
    duration = "دقيقة واحدة";
    reason = "الشموع والمتوسطات والزخم متفقة على الهبوط.";
  } else {
    if (trend5 !== trend15) {
      reason = "اتجاه آخر 5 شموع يختلف عن اتجاه 15 شمعة.";
    } else if (direction === "متذبذب") {
      reason = "حركة الشموع غير واضحة.";
    } else if (direction === "صاعد" && ema9 <= ema21) {
      reason = "الشموع صاعدة لكن المتوسطات لم تؤكد الصعود.";
    } else if (direction === "هابط" && ema9 >= ema21) {
      reason = "الشموع هابطة لكن المتوسطات لم تؤكد الهبوط.";
    } else if (rsi > 68) {
      reason = "RSI مرتفع؛ لا نطارد الشراء.";
    } else if (rsi < 32) {
      reason = "RSI منخفض؛ لا نطارد البيع.";
    } else {
      reason = "شروط الدخول لم تكتمل.";
    }
  }

  const strength =
    buyCondition || sellCondition
      ? "متوافقة فنيًا"
      : "غير كافية";

  return (
    "📊 تحليل EUR/USD - Masaad\n\n" +
    "💰 السعر: " + price.toFixed(5) + "\n" +
    "📈 الاتجاه العام: " + direction + "\n\n" +
    "📊 اتجاه آخر 5 شموع: " + trend5 + "\n" +
    "📊 اتجاه آخر 15 شمعة: " + trend15 + "\n\n" +
    "EMA 9: " + ema9.toFixed(5) + "\n" +
    "EMA 21: " + ema21.toFixed(5) + "\n" +
    "RSI: " + rsi.toFixed(2) + "\n\n" +
    "🎯 القرار: " + signal + "\n" +
    "💪 قوة الترجيح: " + strength + "\n" +
    "📝 سبب القرار: " + reason + "\n" +
    "⏱ المدة المقترحة: " + duration + "\n" +
    "🕯 آخر شمعة مكتملة: " + candles[candles.length - 1].time + "\n\n" +
    "⚠️ تحليل احتمالي وليس ضمانًا للربح."
  );
}

export function registerCommands(bot) {
  bot.command("start", async ctx => {
    await ctx.reply(
      "أهلاً بك في Masaad 🤖\n\n" +
      "📊 تحليل Smart و EUR/USD\n\n" +
      "/smart - تحليل Smart اليدوي\n" +
      "/eurusd - تحليل اليورو دولار عند الطلب\n" +
      "/help - المساعدة"
    );
  });

  bot.command("help", async ctx => {
    await ctx.reply(
      "📋 أوامر Masaad\n\n" +
      "/smart - إدخال أسعار Smart يدويًا\n" +
      "/eurusd - تحليل اليورو دولار\n" +
      "/reset - مسح قراءات Smart\n" +
      "/help - المساعدة\n\n" +
      "تحليل اليورو يعمل عند الطلب فقط، ولا توجد رسائل تلقائية."
    );
  });

  bot.command("smart", async ctx => {
    smartPrices.set(ctx.from.id, []);

    await ctx.reply(
      "📊 بدأ إدخال أسعار Smart.\n" +
      "أرسل السعر الحالي، ثم أرسل القراءات التالية بالتتابع.\n" +
      "يلزم 22 قراءة قبل التحليل."
    );
  });

  bot.command("reset", async ctx => {
    smartPrices.delete(ctx.from.id);
    await ctx.reply("تم مسح قراءات Smart. أرسل /smart للبدء من جديد.");
  });

  bot.command("eurusd", async ctx => {
    await ctx.reply("⏳ جاري تحليل اليورو دولار...");

    try {
      const result = await getEURUSDAnalysis();
      await ctx.reply(result);
    } catch (error) {
      console.error("EURUSD error:", error);
      await ctx.reply("⚠️ حدث خطأ أثناء تحليل اليورو دولار.");
    }
  });

  bot.on("message:text", async ctx => {
    const userId = ctx.from.id;
    const input = ctx.message.text.trim();

    if (!smartPrices.has(userId)) return;
    if (input.startsWith("/")) return;

    const normalized = input
      .replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
      .replace(/٫/g, ".");

    if (!/^\d+(\.\d+)?$/.test(normalized)) return;

    const price = Number(normalized);

    if (!Number.isFinite(price) || price <= 0) {
      await ctx.reply("أرسل سعرًا صحيحًا.");
      return;
    }

    const history = smartPrices.get(userId);
    history.push(price);

    if (history.length > 100) history.shift();

    await ctx.reply(analyzeSmart(history));
  });
}
