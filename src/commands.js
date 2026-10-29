export function registerCommands(bot) {
  bot.command("start", async (ctx) => {
    await ctx.reply(
      "أهلًا بك في Masaad 🤖\n\n" +
      "أرسل /gold لتحليل الذهب\n" +
      "أرسل /eurusd لتحليل اليورو\n\n" +
      "مدة الصفقة المطلوبة: دقيقة واحدة"
    );
  });

  bot.command("gold", async (ctx) => {
    await analyze(ctx, "XAUUSD", "الذهب");
  });

  bot.command("eurusd", async (ctx) => {
    await analyze(ctx, "EURUSD", "اليورو مقابل الدولار");
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(
      "أوامر Masaad:\n/gold - الذهب\n/eurusd - اليورو"
    );
  });

  bot.command("ping", async (ctx) => {
    await ctx.reply("البوت يعمل ✅");
  });
}

async function analyze(ctx, symbol, name) {
  try {
    const response = await fetch(
      "https://biquote.io/api/" + symbol
    );

    if (!response.ok) {
      throw new Error("Market data unavailable");
    }

    const data = await response.json();
    const bid = Number(data.bid);
    const ask = Number(data.ask);

    if (!Number.isFinite(bid) || !Number.isFinite(ask)) {
      throw new Error("Invalid price data");
    }

    await ctx.reply(
      "📊 " + name + "\n" +
      "سعر الشراء: " + ask + "\n" +
      "سعر البيع: " + bid + "\n\n" +
      "📌 الإشارة: انتظار\n" +
      "السبب: نحتاج بيانات أسعار متتابعة لتحليل الاتجاه.\n" +
      "⏱️ مدة الصفقة: دقيقة واحدة\n" +
      "⚠️ لم تتأكد إشارة شراء أو بيع."
    );
  } catch (error) {
    await ctx.reply("تعذر جلب بيانات " + name + " الآن.");
  }
}
const data = await response.json();
const bid = Number(data.bid);
const ask = Number(data.ask);
const change = Number(data.dayDiffPercent);

if (!Number.isFinite(bid) || !Number.isFinite(ask)) {
  throw new Error("Invalid price data");
}

let trend = "متذبذب";
if (data.direction === "UP") trend = "صاعد يوميًا";
if (data.direction === "DOWN") trend = "هابط يوميًا";

await ctx.reply(
  "📊 " + name + "\n" +
  "سعر الشراء: " + ask + "\n" +
  "سعر البيع: " + bid + "\n" +
  "الاتجاه اليومي: " + trend + "\n" +
  "التغير اليومي: " +
  (Number.isFinite(change) ? change.toFixed(3) + "%" : "غير متاح") +
  "\n\n📌 إشارة الدقيقة: انتظار\n" +
  "السبب: نحتاج بيانات حركة متتابعة لتحديد دخول محتمل.\n" +
  "⏱️ مدة الصفقة: دقيقة واحدة\n" +
  "⚠️ الاتجاه اليومي ليس إشارة مؤكدة للدقيقة."
);
