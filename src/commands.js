// export function registerCommands(bot) {
  bot.command("start", (ctx) => {
    return ctx.reply("أهلًا بك في Masaad 🤖");
  });

  bot.command("help", (ctx) => {
    return ctx.reply(
      "Masaad\n" +
      "الأسواق: العملات والذهب والبيتكوين\n" +
      "الفريم: دقيقة واحدة\n" +
      "إشارات السوق الحقيقية لم تُربط بعد."
    );
  });

  bot.command("ping", (ctx) => {
    return ctx.reply("البوت يعمل");
  });
}
