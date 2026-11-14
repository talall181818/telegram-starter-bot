
const smartSessions = new Map();

function parsePrice(text) {
  const normalized = text.trim()
    .replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
    .replace(/٫/g, ".");

  const price = Number(normalized);
  return Number.isFinite(price) && price > 0 ? price : null;
}

// الوقت الحالي بتوقيت السعودية
function getSaudiMinute() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date());

  const get = type => parts.find(p => p.type === type).value;

  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

// تحويل وقت الشمعة السعودية إلى وقت قابل للمقارنة
function candleTimestamp(datetime) {
  const match = datetime.match(
    /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/
  );

  if (!match) return NaN;

  const [, year, month, day, hour, minute, second] = match;

  return Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour) - 3,
    Number(minute),
    Number(second)
  );
}

function formatSaudiTime(datetime) {
  const match = datetime.match(
    /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/
  );

  if (!match) return datetime;

  return `${match[3]}/${match[2]}/${match[1]} ${match[4]}:${match[5]} بتوقيت السعودية`;
}

function calculateEMA(values, period) {
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
    else losses -= change;
  }

  if (losses === 0) return 100;

  const rs = gains / losses;
  return 100 - (100 / (1 + rs));
}

async function analyzeEurusd(ctx) {
  const key = process.env.TWELVEDATA_API_KEY;

  if (!key) {
    return ctx.reply("⚠️ مفتاح Twelve Data غير موجود في FadeHost.");
  }

  await ctx.reply("⏳ جارٍ سحب بيانات اليورو وفحص الشموع...");

  try {
    const url = new URL(
      "https://api.twelvedata.com/time_series"
    );

    url.searchParams.set("symbol", "EUR/USD");
    url.searchParams.set("interval", "1min");
    url.searchParams.set("outputsize", "60");
    url.searchParams.set("timezone", "Asia/Riyadh");
    url.searchParams.set("apikey", key);

    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok || !data.values) {
      return ctx.reply(
        "⚠️ تعذر سحب البيانات:\n" +
        (data.message || "تحقق من مفتاح API.")
      );
    }

    const candles = data.values.map(c => ({
      open: Number(c.open),
      close: Number(c.close),
      time: c.datetime
    }));

    const currentMinute = getSaudiMinute();

    // استبعاد شمعة الدقيقة التي لم تكتمل بعد
    const completedCandles = candles.filter(c =>
      c.time < currentMinute &&
      Number.isFinite(c.open) &&
      Number.isFinite(c.close)
    );

    if (completedCandles.length < 22) {
      return ctx.reply(
        "⚠️ لا توجد شموع مكتملة كافية للتحليل."
      );
    }

    // أحدث شمعة مكتملة
    const lastCandle = completedCandles[0];

    // فحص عمر آخر شمعة
    const candleTime = candleTimestamp(lastCandle.time);
    const ageMinutes = (Date.now() - candleTime) / 60000;

    if (
      !Number.isFinite(candleTime) ||
      ageMinutes < 0 ||
      ageMinutes > 4
    ) {
      return ctx.reply(
        "⚠️ بيانات اليورو قديمة أو وقتها غير صحيح.\n" +
        "لن أعطي إشارة حتى تصل بيانات حديثة."
      );
    }

    // ترتيب الشموع من الأقدم إلى الأحدث
    completedCandles.reverse();

    const closes = completedCandles.map(c => c.close);

    const ema9 = calculateEMA(closes, 9);
    const ema21 = calculateEMA(closes, 21);
    const currentRsi = calculateRSI(closes);

    const latest = completedCandles[completedCandles.length - 1];
    const difference = ema9 - ema21;

    let direction = "متذبذب";
    let signal = "⏸ انتظار";
    let strength = "غير كافية";

    if (difference > 0) direction = "صاعد";
    if (difference < 0) direction = "هابط";

    const strongGap = Math.abs(difference) >= 0.00005;

    const bullish =
      difference > 0 &&
      strongGap &&
      currentRsi >= 55 &&
      currentRsi < 70 &&
      latest.close > latest.open;

    const bearish =
      difference < 0 &&
      strongGap &&
      currentRsi <= 45 &&
      currentRsi > 30 &&
      latest.close < latest.open;

    if (bullish) {
      signal = "🟢 شراء UP";
      strength = "متوسطة";
    } else if (bearish) {
      signal = "🔴 بيع DOWN";
      strength = "متوسطة";
    }

    await ctx.reply(
      "📊 تحليل EUR/USD - Masaad\n\n" +
      "💰 السعر: " + latest.close.toFixed(5) + "\n" +
      "📈 الاتجاه: " + direction + "\n" +
      "EMA 9: " + ema9.toFixed(5) + "\n" +
      "EMA 21: " + ema21.toFixed(5) + "\n" +
      "RSI: " + currentRsi.toFixed(2) + "\n\n" +
      "🎯 القرار: " + signal + "\n" +
      "💪 قوة الترجيح: " + strength + "\n" +
      "⏱ الفريم: دقيقة واحدة\n" +
      "🕯 الشمعة: مكتملة\n" +
      "🕒 وقت الشمعة: " +
      formatSaudiTime(latest.time) + "\n" +
      "🕒 وقت الفحص: " + currentMinute +
      " بتوقيت السعودية\n\n" +
      "⚠️ تحليل احتمالي وليس ضماناً للربح."
    );

  } catch (error) {
    console.error("EURUSD error:", error);
    await ctx.reply(
      "⚠️ حدث خطأ أثناء تحليل اليورو. حاول مرة أخرى."
    );
  }
}

export function registerCommands(bot) {

  bot.command("start", async ctx => {
    await ctx.reply(
      "أهلاً بك في Masaad 🤖\n\n" +
      "📊 اختر السوق:\n\n" +
      "/smart - تحليل Smart\n" +
      "/eurusd - تحليل اليورو دولار\n" +
      "/reset - إعادة تحليل Smart"
    );
  });

  bot.command("smart", async ctx => {
    smartSessions.set(ctx.from.id, []);

    await ctx.reply(
      "📊 تم اختيار Smart\n\n" +
      "أرسل سعر السوق الحالي فقط.\n" +
      "نحتاج 5 قراءات لتحليل الاتجاه."
    );
  });

  bot.command("eurusd", async ctx => {
    await analyzeEurusd(ctx);
  });

  bot.command("reset", async ctx => {
    smartSessions.set(ctx.from.id, []);

    await ctx.reply(
      "🔄 تم تصفير قراءات Smart.\n" +
      "أرسل السعر الأول."
    );
  });

  bot.on("message:text", async ctx => {
    const text = ctx.message.text.trim();

    if (text.startsWith("/")) return;

    const prices = smartSessions.get(ctx.from.id);

    if (!prices) return;

    const price = parsePrice(text);

    if (price === null) {
      return ctx.reply(
        "⚠️ أرسل السعر فقط، مثال: 263.4290"
      );
    }

    prices.push(price);

    if (prices.length < 5) {
      return ctx.reply(
        "📊 تحليل Smart - Masaad\n\n" +
        "💰 السعر الحالي: " + price + "\n" +
        "📈 تم تسجيل " + prices.length + " من 5 أسعار\n\n" +
        "⏳ أرسل السعر التالي فقط."
      );
    }

    const first = prices[0];
    const last = prices[prices.length - 1];
    const change = ((last - first) / first) * 100;

    let direction = "متذبذب";
    let signal = "⏸ انتظار";

    if (change > 0) {
      direction = "صاعد";
      signal = "🟢 شراء UP";
    } else if (change < 0) {
      direction = "هابط";
      signal = "🔴 بيع DOWN";
    }

    smartSessions.delete(ctx.from.id);

    await ctx.reply(
      "📊 تحليل Smart - Masaad\n\n" +
      "💰 السعر الحالي: " + last + "\n" +
      "📈 الاتجاه: " + direction + "\n" +
      "🎯 القرار: " + signal + "\n" +
      "💪 قوة الترجيح: مبدئية فقط\n" +
      "📋 عدد القراءات: 5\n\n" +
      "⚠️ تحليل مبسط للأسعار المرسلة، وليس ضماناً للربح."
    );
  });
}
