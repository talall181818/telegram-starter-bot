
const REQUIRED_PRICES = 22;
const smartSessions = new Map();

function calculateEMA(values, period) {
  const k = 2 / (period + 1);
  let ema = values[0];

  for (let i = 1; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
  }

  return ema;
}

function calculateRSI(values, period = 14) {
  let gains = 0;
  let losses = 0;

  for (let i = values.length - period; i < values.length; i++) {
    const change = values[i] - values[i - 1];

    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }

  if (gains === 0 && losses === 0) return 50;
  if (losses === 0) return 100;
  if (gains === 0) return 0;

  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

function analyzeSmart(prices) {
  const ema9 = calculateEMA(prices, 9);
  const ema21 = calculateEMA(prices, 21);
  const rsi = calculateRSI(prices, 14);

  const latest = prices[prices.length - 1];
  const previous = prices[prices.length - 2];

  const changes = [];

  for (let i = prices.length - 5; i < prices.length; i++) {
    changes.push(prices[i] - prices[i - 1]);
  }

  const rising = changes.filter(x => x > 0).length;
  const falling = changes.filter(x => x < 0).length;

  let signal = "⏳ انتظار";
  let direction = "غير مؤكد";
  let duration = "لا توجد مدة";

  if (
    ema9 > ema21 &&
    latest > ema9 &&
    latest > previous &&
    rsi > 50 &&
    rising >= 4
  ) {
    signal = "🟢 شراء UP";
    direction = "صاعد";
    duration = rising === 5 && rsi < 70
      ? "دقيقة واحدة"
      : "30 ثانية";
  }

  else if (
    ema9 < ema21 &&
    latest < ema9 &&
    latest < previous &&
    rsi < 50 &&
    falling >= 4
  ) {
    signal = "🔴 بيع DOWN";
    direction = "هابط";
    duration = falling === 5 && rsi > 30
      ? "دقيقة واحدة"
      : "30 ثانية";
  }

  const netChange = latest - prices[0];

  return {
    latest,
    ema9,
    ema21,
    rsi,
    signal,
    direction,
    duration,
    netChange
  };
}

export function registerCommands(bot) {

  bot.command("start", async ctx => {
    await ctx.reply(
      "أهلاً بك في Masaad 🤖\n\n" +
      "📊 تحليل Smart وقراءات الأسعار\n\n" +
      "/smart - بدء تحليل Smart\n" +
      "/cancel - إلغاء التحليل\n" +
      "/help - المساعدة"
    );
  });

  bot.command("help", async ctx => {
    await ctx.reply(
      "📌 أوامر Masaad\n\n" +
      "/smart - استقبال 22 سعرًا وتحليلها تلقائيًا\n" +
      "/cancel - إلغاء استقبال الأسعار\n\n" +
      "أرسل الأسعار من الأقدم إلى الأحدث، " +
      "كل سعر في رسالة مستقلة."
    );
  });

  bot.command("smart", async ctx => {
    const key = `${ctx.chat.id}:${ctx.from.id}`;

    smartSessions.set(key, []);

    await ctx.reply(
      "📊 تحليل Smart - Masaad\n\n" +
      "ابدأ بإرسال 22 قراءة سعرية.\n\n" +
      "1️⃣ أرسل أقدم سعر أولاً.\n" +
      "2️⃣ أرسل كل سعر في رسالة منفصلة.\n" +
      "3️⃣ انتهِ بأحدث سعر.\n\n" +
      "سأبدأ التحليل تلقائيًا بعد السعر رقم 22.\n\n" +
      "⏳ القراءة 0 من 22"
    );
  });

  bot.command("cancel", async ctx => {
    const key = `${ctx.chat.id}:${ctx.from.id}`;

    smartSessions.delete(key);

    await ctx.reply("تم إلغاء تحليل Smart.");
  });

  bot.on("message:text", async ctx => {
    const key = `${ctx.chat.id}:${ctx.from.id}`;
    const prices = smartSessions.get(key);

    if (!prices) return;

    const text = ctx.message.text.trim();

    if (text.startsWith("/")) return;

    if (!/^\d+(?:\.\d+)?$/.test(text)) {
      await ctx.reply(
        "⚠️ أرسل السعر فقط، بدون رموز أو مبالغ.\n" +
        "مثال: 264.3215"
      );
      return;
    }

    const price = Number(text);

    if (!Number.isFinite(price) || price <= 0) {
      await ctx.reply("⚠️ السعر غير صحيح. حاول مرة أخرى.");
      return;
    }

    prices.push(price);

    if (prices.length < REQUIRED_PRICES) {
      await ctx.reply(
        `✅ تم تسجيل السعر: ${price}\n\n` +
        `📊 القراءات: ${prices.length} من ${REQUIRED_PRICES}\n` +
        `باقي ${REQUIRED_PRICES - prices.length} قراءة.`
      );
      return;
    }

    if (prices.length === REQUIRED_PRICES) {
      smartSessions.delete(key);

      const result = analyzeSmart(prices);

      const message =
        "📊 تحليل Smart - Masaad\n\n" +
        "🔢 عدد القراءات: 22\n" +
        "💰 آخر سعر: " + result.latest.toFixed(4) + "\n" +
        "📈 EMA 9: " + result.ema9.toFixed(5) + "\n" +
        "📉 EMA 21: " + result.ema21.toFixed(5) + "\n" +
        "📊 RSI: " + result.rsi.toFixed(2) + "\n\n" +
        "📍 الاتجاه: " + result.direction + "\n" +
        "🎯 الإشارة: " + result.signal + "\n" +
        "⏱ المدة المقترحة: " + result.duration + "\n\n" +
        "📐 التغير بين أول وآخر قراءة: " +
        result.netChange.toFixed(4) + "\n\n" +
        "⚠️ تحليل فني تقديري وليس ضمانًا للربح.\n" +
        "ابدأ تحليلًا جديدًا باستخدام /smart";

      await ctx.reply(message);
    }
  });
}
