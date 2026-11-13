
const { Bot } = require("grammy");
const axios = require("axios");

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

  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
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
      }
    }
  );

  if (!response.data.values) {
    throw new Error(response.data.message || "Market data unavailable");
  }

  const prices = response.data.values
    .map(item => Number(item.close))
    .reverse();

  if (prices.length < 22) {
    throw new Error("Not enough market data");
  }

  const price = prices[prices.length - 1];
  const ema9 = calculateEMA(prices, 9);
  const ema21 = calculateEMA(prices, 21);
  const rsi = calculateRSI(prices);

  let signal = "⏳ انتظار";
  let duration = "لا توجد مدة";

  if (ema9 > ema21 && price > ema9 && rsi >= 52 && rsi <= 68) {
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
    duration
  };
}

async function sendAnalysis(bot, chatId) {
  const data = await analyzeMarket();

  const message =
    "📊 تحليل اليورو دولار - Masaad\n\n" +
    "⏱ فريم التحليل: دقيقة واحدة\n\n" +
    "السعر: " + data.price.toFixed(5) + "\n" +
    "EMA 9: " + data.ema9.toFixed(5) + "\n" +
    "EMA 21: " + data.ema21.toFixed(5) + "\n" +
    "RSI: " + data.rsi.toFixed(2) + "\n\n" +
    "الإشارة: " + data.signal + "\n" +
    "المدة المقترحة: " + data.duration + "\n\n" +
    "⚠️ الإشارات تحليلية وليست ضماناً للربح.";

  await bot.api.sendMessage(chatId, message);
}

function registerCommands(bot) {
  const subscribers = new Set();

  bot.command("start", async ctx => {
    subscribers.add(ctx.chat.id);
    await ctx.reply(
      "أهلاً بك في Masaad 🤖\n" +
      "تم تفعيل التحليل التلقائي لليورو دولار.\n" +
      "يتم تحديث التحليل كل دقيقة."
    );
  });

  bot.command("help", async ctx => {
    await ctx.reply(
      "أوامر Masaad:\n" +
      "/start تشغيل التحليل التلقائي\n" +
      "/gold تحليل اليورو دولار الآن\n" +
      "/stop إيقاف الإشعارات التلقائية"
    );
  });

  bot.command("stop", async ctx => {
    subscribers.delete(ctx.chat.id);
    await ctx.reply("تم إيقاف الإشعارات التلقائية.");
  });

  bot.command("gold", async ctx => {
    try {
      await sendAnalysis(bot, ctx.chat.id);
    } catch (error) {
      await ctx.reply("تعذر جلب التحليل حالياً. حاول لاحقاً.");
    }
  });

  setInterval(async () => {
    for (const chatId of subscribers) {
      try {
        await sendAnalysis(bot, chatId);
      } catch (error) {
        console.error("Analysis error:", error.message);
      }
    }
  }, 60 * 1000);
}

export { registerCommands };
