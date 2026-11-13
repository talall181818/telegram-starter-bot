
import axios from "axios";

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

  if (losses === 0) return 100;
  if (gains === 0) return 0;

  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

function getSaudiTime() {
  return new Intl.DateTimeFormat("ar-SA", {
    timeZone: "Asia/Riyadh",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(new Date());
}

async function analyzeMarket() {
  const response = await axios.get(
    "https://api.twelvedata.com/time_series",
    {
      params: {
        symbol: "EUR/USD",
        interval: "1min",
        outputsize: 60,
        apikey: process.env.TWELVEDATA_API_KEY
      },
      timeout: 15000
    }
  );

  if (!response.data.values) {
    throw new Error(
      response.data.message || "لم تصل بيانات السوق"
    );
  }

  const candles = response.data.values;
  const prices = candles
    .map(item => Number(item.close))
    .reverse();

  if (prices.length < 22) {
    throw new Error("البيانات غير كافية للتحليل");
  }

  const latestCandle = candles[0];
  const price = prices[prices.length - 1];

  const ema9 = calculateEMA(prices, 9);
  const ema21 = calculateEMA(prices, 21);
  const rsi = calculateRSI(prices, 14);

  let signal = "⏳ انتظار";
  let duration = "لا توجد مدة مقترحة";

  if (
    ema9 > ema21 &&
    price > ema9 &&
    rsi >= 52 &&
    rsi <= 68
  ) {
    signal = "🟢 شراء UP";
    duration = "دقيقة واحدة";
  } else if (
    ema9 < ema21 &&
    price < ema9 &&
    rsi >= 32 &&
    rsi <= 48
  ) {
    signal = "🔴 بيع DOWN";
    duration = "دقيقتان";
  }

  return {
    price,
    ema9,
    ema21,
    rsi,
    signal,
    duration,
    candleTime: latestCandle.datetime
  };
}

async function sendAnalysis(bot, chatId) {
  const d = await analyzeMarket();

  const message =
    "📊 تحليل اليورو دولار - Masaad\n\n" +
    "⏱ فريم دقيقة واحدة\n" +
    "🕒 وقت الإرسال: " + getSaudiTime() + "\n" +
    "🕯 وقت الشمعة: " + d.candleTime + "\n\n" +
    "السعر: " + d.price.toFixed(5) + "\n" +
    "EMA 9: " + d.ema9.toFixed(5) + "\n" +
    "EMA 21: " + d.ema21.toFixed(5) + "\n" +
    "RSI: " + d.rsi.toFixed(2) + "\n\n" +
    "الإشارة: " + d.signal + "\n" +
    "المدة المقترحة: " + d.duration + "\n\n" +
    "⚠️ الإشارات تحليلية وليست ضماناً للربح.";

  await bot.api.sendMessage(chatId, message);
}

export function registerCommands(bot) {
  const subscribers = new Set();

  bot.command("start", async ctx => {
    subscribers.add(ctx.chat.id);

    await ctx.reply(
      "أهلاً بك في Masaad 🤖\n" +
      "تم تفعيل التحليل التلقائي كل دقيقة.\n\n" +
      "استخدم /help لمعرفة الأوامر."
    );
  });

  bot.command("help", async ctx => {
    await ctx.reply(
      "📌 أوامر Masaad\n\n" +
      "/start - تشغيل التحليل التلقائي\n" +
      "/eurusd - تحليل اليورو دولار الآن\n" +
      "/gold - تحليل الآن\n" +
      "/stop - إيقاف التحليل التلقائي"
    );
  });

  bot.command("eurusd", async ctx => {
    try {
      await sendAnalysis(bot, ctx.chat.id);
    } catch (error) {
      await ctx.reply("تعذر التحليل: " + error.message);
    }
  });

  bot.command("gold", async ctx => {
    try {
      await sendAnalysis(bot, ctx.chat.id);
    } catch (error) {
      await ctx.reply("تعذر التحليل: " + error.message);
    }
  });

  bot.command("stop", async ctx => {
    subscribers.delete(ctx.chat.id);
    await ctx.reply("تم إيقاف التحليل التلقائي.");
  });

  async function sendToAllSubscribers() {
    for (const chatId of subscribers) {
      try {
        await sendAnalysis(bot, chatId);
      } catch (error) {
        console.error("Analysis error:", error.message);
      }
    }
  }

  function scheduleNextMinute() {
    const now = Date.now();
    const delay = 60000 - (now % 60000);

    setTimeout(async () => {
      await sendToAllSubscribers();

      setInterval(() => {
        sendToAllSubscribers();
      }, 60000);
    }, delay);
  }

  scheduleNextMinute();
}

