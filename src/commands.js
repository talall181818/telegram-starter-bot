
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
    throw new Error(response.data.message || "No market data");
  }

  const prices = response.data.values
    .map(item => Number(item.close))
    .reverse();

  if (prices.length < 22) throw new Error("Not enough data");

  const price = prices.at(-1);
  const ema9 = calculateEMA(prices, 9);
  const ema21 = calculateEMA(prices, 21);
  const rsi = calculateRSI(prices);

  let signal = "⏳ انتظار";
  let duration = "لا توجد مدة";

  if (ema9 > ema21 && price > ema9 && rsi >= 52 && rsi <= 68) {
    signal = "🟢 شراء UP";
    duration = "دقيقة واحدة";
  } else if (ema9 < ema21 && price < ema9 && rsi >= 32 && rsi <= 48) {
    signal = "🔴 بيع DOWN";
    duration = "دقيقتان";
  }

  return { price, ema9, ema21, rsi, signal, duration };
}

async function sendAnalysis(bot, chatId) {
  const d = await analyzeMarket();

  await bot.api.sendMessage(
    chatId,
    "📊 تحليل اليورو دولار - Masaad\n\n" +
    "⏱ فريم دقيقة واحدة\n\n" +
    "السعر: " + d.price.toFixed(5) + "\n" +
    "EMA 9: " + d.ema9.toFixed(5) + "\n" +
    "EMA 21: " + d.ema21.toFixed(5) + "\n" +
    "RSI: " + d.rsi.toFixed(2) + "\n\n" +
    "الإشارة: " + d.signal + "\n" +
    "المدة المقترحة: " + d.duration + "\n\n" +
    "⚠️ تحليل فقط وليس ضماناً للربح."
  );
}

export function registerCommands(bot) {
  const subscribers = new Set();

  bot.command("start", async ctx => {
    subscribers.add(ctx.chat.id);
    await ctx.reply("أهلاً بك في Masaad 🤖\nتم تفعيل التحليل التلقائي كل دقيقة.");
  });

  bot.command("help", ctx =>
    ctx.reply("/start تشغيل التحديث التلقائي\n/gold تحليل الآن\n/stop إيقاف التحديث")
  );

  bot.command("stop", ctx => {
    subscribers.delete(ctx.chat.id);
    return ctx.reply("تم إيقاف التحديث التلقائي.");
  });

  bot.command("gold", async ctx => {
    try {
      await sendAnalysis(bot, ctx.chat.id);
    } catch (e) {
      await ctx.reply("تعذر جلب البيانات: " + e.message);
    }
  });

  setInterval(async () => {
    for (const chatId of subscribers) {
      try {
        await sendAnalysis(bot, chatId);
      } catch (e) {
        console.error(e.message);
      }
    }
  }, 60 * 1000);
}
