
const sessions = new Map();
const autoJobs = new Map();

// ---------------- GENERAL ----------------

function parsePrice(text) {
  const normalized = text.trim()
    .replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
    .replace(/٫/g, ".")
    .replace(/,/g, ".");

  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;

  const value = Number(normalized);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function getSaudiTime() {
  return new Date().toLocaleString("en-GB", {
    timeZone: "Asia/Riyadh",
    hour12: false
  });
}

// ---------------- SMART ----------------

function analyzeSmart(high, low, nextOpen) {
  const range = high - low;
  const midpoint = (high + low) / 2;

  let signal = "⏳ انتظار";
  let direction = "غير مؤكد";

  if (range > 0 && nextOpen > high) {
    signal = "🟢 شراء UP";
    direction = "افتتاح أعلى من القمة";
  } else if (range > 0 && nextOpen < low) {
    signal = "🔴 بيع DOWN";
    direction = "افتتاح أدنى من القاع";
  } else if (nextOpen > midpoint) {
    direction = "الافتتاح داخل النصف العلوي";
  } else if (nextOpen < midpoint) {
    direction = "الافتتاح داخل النصف السفلي";
  }

  return { range, midpoint, signal, direction };
}

// ---------------- EUR/USD INDICATORS ----------------

function calculateEMA(values, period) {
  const multiplier = 2 / (period + 1);
  let ema = values[0];

  for (let i = 1; i < values.length; i++) {
    ema = values[i] * multiplier +
      ema * (1 - multiplier);
  }

  return ema;
}

function calculateRSI(values, endIndex, period = 14) {
  if (endIndex < period) return 50;

  let gains = 0;
  let losses = 0;

  for (
    let i = endIndex - period + 1;
    i <= endIndex;
    i++
  ) {
    const change = values[i] - values[i - 1];

    if (change > 0) gains += change;
    if (change < 0) losses += Math.abs(change);
  }

  const averageGain = gains / period;
  const averageLoss = losses / period;

  if (averageGain === 0 && averageLoss === 0) return 50;
  if (averageLoss === 0) return 100;

  const rs = averageGain / averageLoss;
  return 100 - (100 / (1 + rs));
}

async function analyzeEURUSD() {
  const apiKey = process.env.TWELVEDATA_API_KEY;

  if (!apiKey) {
    throw new Error("مفتاح Twelve Data غير موجود في FadeHost.");
  }

  const url =
    "https://api.twelvedata.com/time_series" +
    "?symbol=EUR/USD" +
    "&interval=1min" +
    "&outputsize=60" +
    "&apikey=" + encodeURIComponent(apiKey);

  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok || data.status === "error" || !data.values) {
    throw new Error(data.message || "تعذر سحب بيانات اليورو.");
  }

  const allCandles = data.values
    .slice()
    .sort((a, b) => a.datetime.localeCompare(b.datetime));

  // نستبعد أحدث شمعة لاحتمال أنها لم تكتمل
  const candles = allCandles.slice(0, -1);

  if (candles.length < 25) {
    throw new Error("البيانات غير كافية للتحليل.");
  }

  const closes = candles.map(c => Number(c.close));

  if (closes.some(v => !Number.isFinite(v))) {
    throw new Error("بيانات الأسعار غير صحيحة.");
  }

  const last = candles[candles.length - 1];
  const previous = candles[candles.length - 2];

  const ema9 = calculateEMA(closes.slice(-30), 9);
  const ema21 = calculateEMA(closes.slice(-30), 21);

  const previousCloses = closes.slice(0, -1);
  const previousEMA9 = calculateEMA(previousCloses.slice(-30), 9);
  const previousEMA21 = calculateEMA(previousCloses.slice(-30), 21);

  const rsi = calculateRSI(closes, closes.length - 1);
  const previousRSI = calculateRSI(closes, closes.length - 2);

  const price = Number(last.close);
  const open = Number(last.open);

  const emaGap = Math.abs(ema9 - ema21);
  const minimumGap = 0.00002;

  const bullishTrend = ema9 > ema21 && emaGap > minimumGap;
  const bearishTrend = ema9 < ema21 && emaGap > minimumGap;

  const rsiRising = rsi > previousRSI;
  const rsiFalling = rsi < previousRSI;

  const emaGapGrowing =
    Math.abs(ema9 - ema21) >
    Math.abs(previousEMA9 - previousEMA21);

  const bullishCandle = price > open && price > ema9;
  const bearishCandle = price < open && price < ema9;

  let signal = "⏸ انتظار";
  let reason = "شروط الدخول غير مكتملة";
  let strength = "غير كافية";
  let direction = "متذبذب";
  let momentum = "مستقر";

  if (rsiRising) momentum = "يتحسن";
  if (rsiFalling) momentum = "يضعف";

  if (bullishTrend) direction = "صاعد";
  if (bearishTrend) direction = "هابط";

  // شراء
  if (
    bullishTrend &&
    rsi >= 52 &&
    rsi < 68 &&
    rsiRising &&
    emaGapGrowing &&
    bullishCandle
  ) {
    signal = "🟢 شراء UP";
    reason = "الاتجاه والزخم والشمعة تؤكد الصعود";
    strength = "متوسطة";
  }

  // بيع
  else if (
    bearishTrend &&
    rsi <= 48 &&
    rsi > 32 &&
    rsiFalling &&
    emaGapGrowing &&
    bearishCandle
  ) {
    signal = "🔴 بيع DOWN";
    reason = "الاتجاه والزخم والشمعة تؤكد الهبوط";
    strength = "متوسطة";
  }

  // أسباب الانتظار
  else if (emaGap <= minimumGap) {
    reason = "المتوسطات متقاربة والسوق متذبذب";
  } else if (rsi >= 68) {
    reason = "الزخم مرتفع وننتظر تأكيداً جديداً";
  } else if (rsi <= 32) {
    reason = "الزخم منخفض وننتظر تأكيداً جديداً";
  } else if (bullishTrend && !rsiRising) {
    reason = "الاتجاه صاعد لكن الزخم لا يتحسن";
  } else if (bearishTrend && !rsiFalling) {
    reason = "الاتجاه هابط لكن الزخم لا يتقوى";
  } else if (!emaGapGrowing) {
    reason = "قوة الاتجاه لا تتوسع بعد";
  } else if (bullishTrend && !bullishCandle) {
    reason = "ننتظر شمعة صاعدة تؤكد الاتجاه";
  } else if (bearishTrend && !bearishCandle) {
    reason = "ننتظر شمعة هابطة تؤكد الاتجاه";
  } else {
    reason = "ننتظر توافق المؤشرات";
  }

  return {
    price,
    ema9,
    ema21,
    rsi,
    previousRSI,
    direction,
    signal,
    reason,
    strength,
    momentum,
    candleTime: last.datetime
  };
}

// ---------------- EUR/USD REPORT ----------------

function makeEURUSDReport(result) {
  return (
    "📊 تحليل EUR/USD - Masaad\n\n" +
    "💰 السعر: " + result.price.toFixed(5) + "\n" +
    "📈 الاتجاه: " + result.direction + "\n" +
    "EMA 9: " + result.ema9.toFixed(5) + "\n" +
    "EMA 21: " + result.ema21.toFixed(5) + "\n" +
    "RSI الحالي: " + result.rsi.toFixed(2) + "\n" +
    "RSI السابق: " + result.previousRSI.toFixed(2) + "\n\n" +
    "📊 الزخم: " + result.momentum + "\n" +
    "🎯 القرار: " + result.signal + "\n" +
    "💪 قوة الترجيح: " + result.strength + "\n" +
    "📝 السبب: " + result.reason + "\n\n" +
    "⏱ الفريم: دقيقة واحدة\n" +
    "🕯 الشمعة: مكتملة حسب آخر بيانات المصدر\n" +
    "🕒 وقت الشمعة: " + result.candleTime + "\n" +
    "🕒 وقت الفحص: " + getSaudiTime() + "\n\n" +
    "🔄 الفحص القادم بعد 60 ثانية.\n" +
    "لإيقاف الفحص أرسل /stop\n\n" +
    "⚠️ تحليل احتمالي وليس ضماناً للربح."
  );
}

// ---------------- AUTOMATIC ANALYSIS ----------------

function stopAuto(key) {
  const job = autoJobs.get(key);

  if (job && job.timer) {
    clearInterval(job.timer);
  }

  autoJobs.delete(key);
}

async function runAutoAnalysis(bot, chatId, key) {
  const job = autoJobs.get(key);

  if (!job || job.running) return;

  job.running = true;

  try {
    const result = await analyzeEURUSD();

    await bot.api.sendMessage(
      chatId,
      makeEURUSDReport(result)
    );

  } catch (error) {
    console.error("EURUSD error:", error);

    await bot.api.sendMessage(
      chatId,
      "⚠️ تعذر تحليل EUR/USD.\n" +
      error.message +
      "\n\nتم إيقاف الفحص التلقائي. أرسل /eurusd للمحاولة مجدداً."
    );

    stopAuto(key);

  } finally {
    const currentJob = autoJobs.get(key);

    if (currentJob) {
      currentJob.running = false;
    }
  }
}

// ---------------- BOT COMMANDS ----------------

export function registerCommands(bot) {

  bot.command("start", async ctx => {
    await ctx.reply(
      "أهلاً بك في Masaad 🤖\n\n" +
      "📊 الأسواق المتاحة:\n\n" +
      "/smart - تحليل Smart اليدوي\n" +
      "/eurusd - تحليل اليورو التلقائي كل دقيقة\n" +
      "/stop - إيقاف تحليل اليورو\n" +
      "/cancel - إلغاء تحليل Smart\n" +
      "/help - المساعدة"
    );
  });

  bot.command("help", async ctx => {
    await ctx.reply(
      "📌 أوامر Masaad\n\n" +
      "/smart - تحليل Smart اليدوي\n" +
      "أدخل قمة الشمعة ثم قاعها ثم افتتاح الشمعة الثانية.\n\n" +
      "/eurusd - يبدأ تحليل اليورو فوراً ويكرر الفحص كل 60 ثانية.\n\n" +
      "/stop - إيقاف تحليل اليورو التلقائي.\n" +
      "/cancel - إلغاء تحليل Smart."
    );
  });

  // ---------------- SMART ----------------

  bot.command("smart", async ctx => {
    const key = `${ctx.chat.id}:${ctx.from.id}`;

    sessions.set(key, {
      step: 0,
      high: null,
      low: null
    });

    await ctx.reply(
      "📊 تحليل Smart - فريم الدقيقة 1M\n\n" +
      "أرسل قمة الشمعة السابقة فقط."
    );
  });

  bot.command("cancel", async ctx => {
    const key = `${ctx.chat.id}:${ctx.from.id}`;
    sessions.delete(key);

    await ctx.reply("تم إلغاء تحليل Smart.");
  });

  // ---------------- EURUSD AUTO START ----------------

  bot.command("eurusd", async ctx => {
    const key = `${ctx.chat.id}:${ctx.from.id}`;
    const chatId = ctx.chat.id;

    if (autoJobs.has(key)) {
      await ctx.reply(
        "✅ تحليل EUR/USD التلقائي يعمل بالفعل.\n\n" +
        "يتم الفحص كل 60 ثانية.\n" +
        "لإيقافه أرسل /stop"
      );
      return;
    }

    const job = {
      timer: null,
      running: false
    };

    autoJobs.set(key, job);

    await ctx.reply(
      "🤖 تم تشغيل تحليل EUR/USD التلقائي.\n" +
      "سيتم إرسال أول تحليل الآن، ثم تحديث جديد كل 60 ثانية.\n\n" +
      "لإيقافه أرسل /stop"
    );

    job.timer = setInterval(() => {
      runAutoAnalysis(bot, chatId, key);
    }, 60000);

    await runAutoAnalysis(bot, chatId, key);
  });

  // ---------------- EURUSD AUTO STOP ----------------

  bot.command("stop", async ctx => {
    const key = `${ctx.chat.id}:${ctx.from.id}`;

    if (!autoJobs.has(key)) {
      await ctx.reply("لا يوجد تحليل تلقائي يعمل حالياً.");
      return;
    }

    stopAuto(key);

    await ctx.reply(
      "🛑 تم إيقاف تحليل EUR/USD التلقائي.\n" +
      "لإعادة تشغيله أرسل /eurusd"
    );
  });

  // ---------------- SMART PRICE INPUT ----------------

  bot.on("message:text", async ctx => {
    const key = `${ctx.chat.id}:${ctx.from.id}`;
    const session = sessions.get(key);

    if (!session) return;

    const text = ctx.message.text.trim();

    if (text.startsWith("/")) return;

    const price = parsePrice(text);

    if (price === null) {
      await ctx.reply("⚠️ أرسل السعر فقط، مثال: 264.273");
      return;
    }

    if (session.step === 0) {
      session.high = price;
      session.step = 1;

      await ctx.reply(
        `✅ القمة: ${price}\n\n` +
        "أرسل الآن قاع الشمعة السابقة."
      );
      return;
    }

    if (session.step === 1) {
      if (price >= session.high) {
        await ctx.reply(
          "⚠️ القاع يجب أن يكون أقل من القمة. أرسل القاع الصحيح."
        );
        return;
      }

      session.low = price;
      session.step = 2;

      await ctx.reply(
        `✅ القاع: ${price}\n\n` +
        "أرسل الآن افتتاح الشمعة الثانية."
      );
      return;
    }

    if (session.step === 2) {
      const result = analyzeSmart(
        session.high,
        session.low,
        price
      );

      sessions.delete(key);

      await ctx.reply(
        "📊 تحليل Smart - Masaad\n" +
        "⏱ فريم الدقيقة 1M\n\n" +
        "🔺 القمة: " + session.high + "\n" +
        "🔻 القاع: " + session.low + "\n" +
        "🕯 افتتاح الشمعة الثانية: " + price + "\n\n" +
        "📏 نطاق الشمعة: " + result.range.toFixed(5) + "\n" +
        "📍 منتصف النطاق: " + result.midpoint.toFixed(5) + "\n" +
        "📈 القراءة: " + result.direction + "\n\n" +
        "🎯 الإشارة: " + result.signal + "\n\n" +
        "⚠️ تحليل مبدئي فقط؛ هذه القيم وحدها لا تؤكد اتجاه السوق.\n\n" +
        "لبدء تحليل جديد أرسل /smart"
      );
    }
  });
}
