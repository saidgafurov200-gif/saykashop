require("dotenv").config();

const { Telegraf, Markup } = require("telegraf");
const express = require("express");
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

// ================= НАСТРОЙКИ =================

const ADMIN_IDS = [
  7752578241
];

const BOT_TOKEN = process.env.BOT_TOKEN;
const CONTACT_USERNAME = process.env.CONTACT_USERNAME || "gafurov12478";
const CHANNEL_ID = process.env.CHANNEL_ID || "";
const CHANNEL_URL = process.env.CHANNEL_URL || "https://t.me/SGProductsss";
const PORT = process.env.PORT || 3000;

if (!BOT_TOKEN) {
  console.error("❌ Не указан BOT_TOKEN в файле .env");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("❌ Не указан DATABASE_URL в файле .env");
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);
const app = express();
const DB_FILE = path.join(__dirname, "database.json");

// ================= EXPRESS WEB-СЕРВЕР (Для 24/7 и UptimeRobot) =================

app.use(express.json());

app.get("/", (req, res) => {
  res.status(200).send("🚀 SGProducts Bot is running 24/7!");
});

app.listen(PORT, () => {
  console.log(`🌐 HTTP-сервер успешно запущен на порту ${PORT}`);
});

// ================= NEON POSTGRESQL =================

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "false"
    ? false
    : { rejectUnauthorized: false },
  max: 5,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000
});

let db = null;
let saveQueue = Promise.resolve();

function normalizeDB(saved = {}) {
  return {
    products: Array.isArray(saved.products)
      ? saved.products
      : DEFAULT_PRODUCTS.map(product => ({ ...product })),
    orders: Array.isArray(saved.orders) ? saved.orders : [],
    users: Array.isArray(saved.users) ? saved.users : [],
    nextOrderId: Math.max(1, Number(saved.nextOrderId) || 1)
  };
}

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sgproducts_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const result = await pool.query(
    "SELECT data FROM sgproducts_state WHERE id = 1"
  );

  if (result.rows.length > 0) {
    db = normalizeDB(result.rows[0].data);
    console.log("✅ Данные загружены из Neon PostgreSQL.");
    return;
  }

  let initialData = {};

  if (fs.existsSync(DB_FILE)) {
    try {
      initialData = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
      console.log("📦 Найден database.json — импортируем данные в Neon.");
    } catch (error) {
      console.error(
        "⚠️ Не удалось прочитать database.json:",
        error.message
      );
    }
  }

  db = normalizeDB(initialData);

  await pool.query(
    `INSERT INTO sgproducts_state (id, data)
     VALUES (1, $1::jsonb)
     ON CONFLICT (id) DO NOTHING`,
    [JSON.stringify(db)]
  );

  const savedResult = await pool.query(
    "SELECT data FROM sgproducts_state WHERE id = 1"
  );

  db = normalizeDB(savedResult.rows[0]?.data || db);

  console.log("✅ База SGProducts готова в Neon PostgreSQL.");
}

function saveDB() {
  if (!db) {
    return Promise.reject(
      new Error("База данных ещё не инициализирована.")
    );
  }

  const snapshot = JSON.stringify(db);

  saveQueue = saveQueue
    .then(() => pool.query(
      `INSERT INTO sgproducts_state (id, data, updated_at)
       VALUES (1, $1::jsonb, NOW())
       ON CONFLICT (id) DO UPDATE
       SET data = EXCLUDED.data,
           updated_at = NOW()`,
      [snapshot]
    ))
    .catch(error => {
      console.error("❌ Ошибка сохранения в Neon:", error.message);
    });

  return saveQueue;
}

// ================= КАТАЛОГ =================

const DEFAULT_PRODUCTS = [
  { id: "stars150", category: "Telegram Stars", name: "150 Stars", price: 2.59 },
  { id: "stars400", category: "Telegram Stars", name: "400 Stars", price: 6.99 },
  { id: "stars500", category: "Telegram Stars", name: "500 Stars (Bonus)", price: 8.29 },
  { id: "stars1000", category: "Telegram Stars", name: "1000 Stars (Bonus)", price: 15.99 },

  { id: "prem1", category: "Telegram Premium", name: "1 месяц", price: 3.49 },
  { id: "prem3", category: "Telegram Premium", name: "3 месяца", price: 8.99 },
  { id: "prem6", category: "Telegram Premium", name: "6 месяцев", price: 14.99 },
  { id: "prem12", category: "Telegram Premium", name: "12 месяцев", price: 26.99 },

  { id: "igf1", category: "Instagram", name: "1000 подписчиков", price: 0.99 },
  { id: "igf10", category: "Instagram", name: "10000 подписчиков", price: 8.99 },
  { id: "igf100", category: "Instagram", name: "100000 подписчиков", price: 39.99 },
  { id: "igf1000", category: "Instagram", name: "1000000 подписчиков", price: 99.99 },

  { id: "igv1", category: "Instagram", name: "1000 просмотров", price: 0.29 },
  { id: "igv10", category: "Instagram", name: "10000 просмотров", price: 2.99 },
  { id: "igv100", category: "Instagram", name: "100000 просмотров", price: 19.99 },
  { id: "igv1000", category: "Instagram", name: "1000000 просмотров", price: 59.99 },

  { id: "igl1", category: "Instagram", name: "1000 лайков", price: 0.59 },
  { id: "igl10", category: "Instagram", name: "10000 лайков", price: 6.99 },
  { id: "igl100", category: "Instagram", name: "100000 лайков", price: 32.99 },
  { id: "igl1000", category: "Instagram", name: "1000000 лайков", price: 74.99 },

  { id: "ttf1", category: "TikTok", name: "1000 подписчиков", price: 2.29 },
  { id: "ttf10", category: "TikTok", name: "10000 подписчиков", price: 18.99 },
  { id: "ttf100", category: "TikTok", name: "100000 подписчиков", price: 69.99 },
  { id: "ttf1000", category: "TikTok", name: "1000000 подписчиков", price: 139.99 },

  { id: "ttv1", category: "TikTok", name: "1000 просмотров", price: 0.25 },
  { id: "ttv10", category: "TikTok", name: "10000 просмотров", price: 1.99 },
  { id: "ttv100", category: "TikTok", name: "100000 просмотров", price: 14.99 },
  { id: "ttv1000", category: "TikTok", name: "1000000 просмотров", price: 49.99 },

  { id: "ttl1", category: "TikTok", name: "1000 лайков", price: 1.09 },
  { id: "ttl10", category: "TikTok", name: "10000 лайков", price: 9.99 },
  { id: "ttl100", category: "TikTok", name: "100000 лайков", price: 42.99 },

  { id: "crypto_usdt", category: "Crypto", name: "USDT → TRC20", price: 0, fee: 2.3 },
  { id: "crypto_card", category: "Crypto", name: "USDT → карта", price: 0, fee: 3 }
];

// ================= ОБЩИЕ ФУНКЦИИ =================

const isAdmin = id => ADMIN_IDS.includes(Number(id));
const money = n => "$" + Number(n).toFixed(2);

const userStates = new Map();
const activeChats = new Map();

function rememberUser(ctx) {
  if (!db || !ctx.from) return;

  const id = ctx.from.id;
  let user = db.users.find(u => u.id === id);

  if (!user) {
    user = {
      id,
      username: ctx.from.username || "",
      name: [ctx.from.first_name, ctx.from.last_name]
        .filter(Boolean)
        .join(" "),
      joinedAt: new Date().toISOString()
    };

    db.users.push(user);
  } else {
    user.username = ctx.from.username || user.username || "";
    user.name = [ctx.from.first_name, ctx.from.last_name]
      .filter(Boolean)
      .join(" ");
  }

  void saveDB();
}

function mainMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("⭐ Telegram Stars", "cat:Telegram Stars")],
    [Markup.button.callback("💎 Telegram Premium", "cat:Telegram Premium")],
    [Markup.button.callback("📸 Instagram", "cat:Instagram")],
    [Markup.button.callback("🎵 TikTok", "cat:TikTok")],
    [Markup.button.callback("💱 Crypto", "cat:Crypto")],
    [Markup.button.callback("📦 Мои заказы", "myorders")],
    [Markup.button.callback("👨‍💻 Поддержка", "support")]
  ]);
}

function adminMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("🆕 Новые заказы", "admin:new")],
    [Markup.button.callback("📦 Все заказы", "admin:orders")],
    [Markup.button.callback("👥 Клиенты", "admin:clients")],
    [Markup.button.callback("💰 Управление ценами", "admin:prices")],
    [Markup.button.callback("📊 Статистика", "admin:stats")]
  ]);
}

async function showAdminMenu(ctx) {
  return ctx.reply("🛠 Админ-панель SGProducts", adminMenu());
}

function orderKeyboard(order) {
  const buttons = [];

  if (order.status === "Новый") {
    buttons.push([
      Markup.button.callback("✅ Принять", `order:accept:${order.id}`),
      Markup.button.callback("❌ Отклонить", `order:reject:${order.id}`)
    ]);
  }

  if (order.status === "Принят") {
    buttons.push([
      Markup.button.callback("🏁 Завершить", `order:done:${order.id}`)
    ]);
  }

  buttons.push([
    Markup.button.callback("💬 Ответить клиенту", `order:chat:${order.id}`)
  ]);

  return Markup.inlineKeyboard(buttons);
}

function formatOrder(order) {
  return [
    `📦 Заказ №${order.id}`,
    `👤 Клиент: ${order.name || "Не указано"}`,
    `🆔 Telegram ID: ${order.userId}`,
    `🔖 Услуга: ${order.service}`,
    `💵 Цена: ${order.priceUSD == null ? "Не указана" : money(order.priceUSD)}`,
    order.feePercent != null ? `📈 Комиссия: ${order.feePercent}%` : "",
    `📝 Данные: ${order.details || "Не указаны"}`,
    `📌 Статус: ${order.status}`,
    `🕒 Дата: ${order.createdAt}`
  ].filter(Boolean).join("\n");
}

async function notifyAdmins(order) {
  for (const adminId of ADMIN_IDS) {
    try {
      await bot.telegram.sendMessage(
        adminId,
        formatOrder(order),
        orderKeyboard(order)
      );
    } catch (error) {
      console.error(
        `Не удалось уведомить администратора ${adminId}:`,
        error.message
      );
    }
  }
}

async function setOrderStatus(ctx, orderId, status) {
  const order = db.orders.find(o => o.id === Number(orderId));

  if (!order) {
    return ctx.reply("Заказ не найден.");
  }

  order.status = status;
  order.updatedAt = new Date().toISOString();

  await saveDB();

  await ctx.reply(
    `Заказ №${order.id}: статус изменён на «${status}».`
  );

  try {
    await bot.telegram.sendMessage(
      order.userId,
      `📦 Обновление заказа №${order.id}\nСтатус: ${status}`
    );
  } catch (error) {
    console.error("Не удалось уведомить клиента:", error.message);
  }
}

// ================= ПОДПИСКА НА КАНАЛ =================

async function hasSubscribed(userId) {
  if (!CHANNEL_ID) return true;

  try {
    const member = await bot.telegram.getChatMember(CHANNEL_ID, userId);

    return ["creator", "administrator", "member"].includes(member.status);
  } catch (error) {
    console.error("Проверка подписки:", error.message);
    return false;
  }
}

function subscriptionKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.url("📢 Подписаться", CHANNEL_URL)],
    [Markup.button.callback("🔄 Проверить подписку", "checksub")]
  ]);
}

bot.use(async (ctx, next) => {
  if (ctx.from) rememberUser(ctx);
  return next();
});

// ================= КОМАНДЫ =================

bot.start(async ctx => {
  userStates.delete(ctx.from.id);

  if (isAdmin(ctx.from.id)) {
    return ctx.reply(
      "👋 Добро пожаловать в SGProducts!\nТы администратор.",
      Markup.inlineKeyboard([
        [Markup.button.callback("🛠 Админ-панель", "admin:open")],
        [Markup.button.callback("🛍 Открыть каталог", "shop")]
      ])
    );
  }

  if (!(await hasSubscribed(ctx.from.id))) {
    return ctx.reply(
      "📢 Для продолжения подпишись на наш канал.",
      subscriptionKeyboard()
    );
  }

  return ctx.reply(
    "🛍 Добро пожаловать в SGProducts!\nВыбери нужную категорию:",
    mainMenu()
  );
});

bot.command("admin", async ctx => {
  if (!isAdmin(ctx.from.id)) {
    return ctx.reply("⛔ Нет доступа.");
  }

  return showAdminMenu(ctx);
});

bot.command("orders", async ctx => {
  if (!isAdmin(ctx.from.id)) {
    return ctx.reply("⛔ Нет доступа.");
  }

  const orders = db.orders.slice(-15).reverse();

  if (!orders.length) {
    return ctx.reply("📦 Заказов пока нет.");
  }

  for (const order of orders) {
    await ctx.reply(formatOrder(order), orderKeyboard(order));
  }
});

bot.command("prices", async ctx => {
  if (!isAdmin(ctx.from.id)) {
    return ctx.reply("⛔ Нет доступа.");
  }

  return ctx.reply(
    "💰 Цены можно посмотреть и изменить в админ-панели.",
    Markup.inlineKeyboard([
      [Markup.button.callback("Управление ценами", "admin:prices")]
    ])
  );
});

bot.command("stats", async ctx => {
  if (!isAdmin(ctx.from.id)) {
    return ctx.reply("⛔ Нет доступа.");
  }

  const total = db.orders.length;
  const completed = db.orders.filter(o => o.status === "Завершён").length;
  const pending = db.orders.filter(o => o.status === "Новый").length;

  return ctx.reply(
    `📊 Статистика SGProducts\n\n` +
    `👥 Клиентов: ${db.users.length}\n` +
    `📦 Заказов: ${total}\n` +
    `🆕 Новых: ${pending}\n` +
    `✅ Завершённых: ${completed}`
  );
});

bot.command("id", ctx => {
  return ctx.reply(`Твой Telegram ID: ${ctx.from.id}`);
});

bot.command("cancel", ctx => {
  userStates.delete(ctx.from.id);
  return ctx.reply("Действие отменено.", mainMenu());
});

bot.command("endchat", ctx => {
  if (!isAdmin(ctx.from.id)) {
    return ctx.reply("⛔ Нет доступа.");
  }

  activeChats.delete(ctx.from.id);
  return ctx.reply("💬 Режим ответа клиенту завершён.");
});

bot.command("setprice", async ctx => {
  if (!isAdmin(ctx.from.id)) {
    return ctx.reply("⛔ Нет доступа.");
  }

  const args = ctx.message.text.trim().split(/\s+/);

  if (args.length !== 3) {
    return ctx.reply(
      "Формат: /setprice ID ЦЕНА\n" +
      "Пример: /setprice stars150 2.99\n\n" +
      "Список ID можно получить через /priceids."
    );
  }

  const product = db.products.find(p => p.id === args[1]);
  const price = Number(args[2]);

  if (!product) {
    return ctx.reply("❌ Товар с таким ID не найден.");
  }

  if (!Number.isFinite(price) || price < 0 || price > 1000000) {
    return ctx.reply("❌ Укажи корректную цену.");
  }

  product.price = price;
  await saveDB();

  return ctx.reply(
    `✅ Цена товара ${product.name} теперь ${money(price)}.`
  );
});

bot.command("priceids", async ctx => {
  if (!isAdmin(ctx.from.id)) {
    return ctx.reply("⛔ Нет доступа.");
  }

  const text = db.products.map(p =>
    `${p.id} — ${p.name} (${p.category})` +
    (p.fee != null
      ? ` — комиссия ${p.fee}%`
      : ` — ${money(p.price)}`)
  ).join("\n");

  return ctx.reply("🧾 ID товаров для /setprice:\n\n" + text);
});

// ================= КНОПКИ КЛИЕНТА =================

bot.action("checksub", async ctx => {
  await ctx.answerCbQuery();

  if (await hasSubscribed(ctx.from.id)) {
    return ctx.reply("✅ Подписка подтверждена!", mainMenu());
  }

  return ctx.reply(
    "❌ Не вижу подписки. Подпишись и попробуй снова.",
    subscriptionKeyboard()
  );
});

bot.action("shop", async ctx => {
  await ctx.answerCbQuery();

  if (!(await hasSubscribed(ctx.from.id))) {
    return ctx.reply(
      "Сначала подпишись на канал.",
      subscriptionKeyboard()
    );
  }

  return ctx.reply("🛍 Выбери категорию:", mainMenu());
});

bot.action(/^cat:(.+)$/, async ctx => {
  await ctx.answerCbQuery();

  if (!(await hasSubscribed(ctx.from.id))) {
    return ctx.reply(
      "Сначала подпишись на канал.",
      subscriptionKeyboard()
    );
  }

  const category = ctx.match[1];
  const products = db.products.filter(p => p.category === category);

  if (!products.length) {
    return ctx.reply("В этой категории пока нет товаров.");
  }

  const buttons = products.map(p => [
    Markup.button.callback(
      p.fee != null
        ? `${p.name} — комиссия ${p.fee}%`
        : `${p.name} — ${money(p.price)}`,
      `buy:${p.id}`
    )
  ]);

  buttons.push([
    Markup.button.callback("⬅️ Назад", "shop")
  ]);

  return ctx.reply(
    `📂 ${category}\nВыбери услугу:`,
    Markup.inlineKeyboard(buttons)
  );
});

bot.action(/^buy:(.+)$/, async ctx => {
  await ctx.answerCbQuery();

  if (!(await hasSubscribed(ctx.from.id))) {
    return ctx.reply(
      "Сначала подпишись на канал.",
      subscriptionKeyboard()
    );
  }

  const product = db.products.find(p => p.id === ctx.match[1]);

  if (!product) {
    return ctx.reply("Товар не найден.");
  }

  userStates.set(ctx.from.id, {
    step: "details",
    productId: product.id
  });

  return ctx.reply(
    `🛒 Заказ: ${product.name}\n` +
    (product.fee != null
      ? `Комиссия: ${product.fee}%\n`
      : `Цена: ${money(product.price)}\n`) +
    "\nОтправь одним сообщением данные для заказа: " +
    "например, ссылку на профиль или нужную сумму.\n\n" +
    "Не отправляй пароль от аккаунта, коды входа " +
    "или данные банковской карты.\n\n" +
    "Для отмены введи /cancel."
  );
});

bot.action("myorders", async ctx => {
  await ctx.answerCbQuery();

  const orders = db.orders
    .filter(o => o.userId === ctx.from.id)
    .slice(-10)
    .reverse();

  if (!orders.length) {
    return ctx.reply("📦 У тебя пока нет заказов.", mainMenu());
  }

  for (const order of orders) {
    await ctx.reply(
      `📦 Заказ №${order.id}\n` +
      `${order.service}\n` +
      `Статус: ${order.status}\n` +
      (order.priceUSD == null
        ? ""
        : `Цена: ${money(order.priceUSD)}`)
    );
  }
});

bot.action("support", async ctx => {
  await ctx.answerCbQuery();

  return ctx.reply(
    `👨‍💻 Поддержка: @${CONTACT_USERNAME}\n` +
    "Или отправь сообщение здесь — администратор получит его."
  );
});

// ================= АДМИН-ПАНЕЛЬ =================

bot.action("admin:open", async ctx => {
  await ctx.answerCbQuery();

  if (!isAdmin(ctx.from.id)) {
    return ctx.reply("⛔ Нет доступа.");
  }

  return showAdminMenu(ctx);
});

bot.action("admin:back", async ctx => {
  await ctx.answerCbQuery();

  if (!isAdmin(ctx.from.id)) {
    return ctx.reply("⛔ Нет доступа.");
  }

  return showAdminMenu(ctx);
});

bot.action("admin:new", async ctx => {
  await ctx.answerCbQuery();

  if (!isAdmin(ctx.from.id)) {
    return ctx.reply("⛔ Нет доступа.");
  }

  const orders = db.orders.filter(o => o.status === "Новый");

  if (!orders.length) {
    return ctx.reply("🆕 Новых заказов нет.");
  }

  for (const order of orders) {
    await ctx.reply(formatOrder(order), orderKeyboard(order));
  }
});

bot.action("admin:orders", async ctx => {
  await ctx.answerCbQuery();

  if (!isAdmin(ctx.from.id)) {
    return ctx.reply("⛔ Нет доступа.");
  }

  const orders = db.orders.slice(-20).reverse();

  if (!orders.length) {
    return ctx.reply("📦 Заказов пока нет.");
  }

  for (const order of orders) {
    await ctx.reply(formatOrder(order), orderKeyboard(order));
  }
});

bot.action("admin:clients", async ctx => {
  await ctx.answerCbQuery();

  if (!isAdmin(ctx.from.id)) {
    return ctx.reply("⛔ Нет доступа.");
  }

  const users = db.users.slice(-20).reverse();

  if (!users.length) {
    return ctx.reply("Клиентов пока нет.");
  }

  const buttons = users.map(u => [
    Markup.button.callback(
      `${u.name || "Клиент"} · ${u.id}`,
      `client:${u.id}`
    )
  ]);

  buttons.push([
    Markup.button.callback("⬅️ Назад", "admin:back")
  ]);

  return ctx.reply(
    "👥 Клиенты. Выбери пользователя, чтобы написать ему:",
    Markup.inlineKeyboard(buttons)
  );
});

bot.action("admin:prices", async ctx => {
  await ctx.answerCbQuery();

  if (!isAdmin(ctx.from.id)) {
    return ctx.reply("⛔ Нет доступа.");
  }

  return ctx.reply(
    "💰 Управление ценами\n\n" +
    "1. Выполни /priceids, чтобы увидеть ID товаров.\n" +
    "2. Измени цену командой /setprice ID ЦЕНА.\n\n" +
    "Пример: /setprice stars150 2.99"
  );
});

bot.action("admin:stats", async ctx => {
  await ctx.answerCbQuery();

  if (!isAdmin(ctx.from.id)) {
    return ctx.reply("⛔ Нет доступа.");
  }

  const total = db.orders.length;
  const completed = db.orders.filter(o => o.status === "Завершён").length;
  const pending = db.orders.filter(o => o.status === "Новый").length;

  return ctx.reply(
    `📊 SGProducts\n\n` +
    `Клиентов: ${db.users.length}\n` +
    `Заказов: ${total}\n` +
    `Новых: ${pending}\n` +
    `Завершённых: ${completed}`
  );
});

bot.action(/^order:(accept|reject|done):(\d+)$/, async ctx => {
  await ctx.answerCbQuery();

  if (!isAdmin(ctx.from.id)) {
    return ctx.reply("⛔ Нет доступа.");
  }

  const [, action, id] = ctx.match;

  const status = {
    accept: "Принят",
    reject: "Отклонён",
    done: "Завершён"
  }[action];

  return setOrderStatus(ctx, id, status);
});

bot.action(/^order:chat:(\d+)$/, async ctx => {
  await ctx.answerCbQuery();

  if (!isAdmin(ctx.from.id)) {
    return ctx.reply("⛔ Нет доступа.");
  }

  const order = db.orders.find(o => o.id === Number(ctx.match[1]));

  if (!order) {
    return ctx.reply("Заказ не найден.");
  }

  activeChats.set(ctx.from.id, order.userId);

  return ctx.reply(
    `💬 Режим ответа включён для клиента ${order.userId}.\n` +
    "Напиши сообщение — оно будет отправлено клиенту.\n" +
    "Для завершения введи /endchat."
  );
});

bot.action(/^client:(\d+)$/, async ctx => {
  await ctx.answerCbQuery();

  if (!isAdmin(ctx.from.id)) {
    return ctx.reply("⛔ Нет доступа.");
  }

  activeChats.set(ctx.from.id, Number(ctx.match[1]));

  return ctx.reply(
    `💬 Режим ответа включён для клиента ${ctx.match[1]}.\n` +
    "Напиши сообщение клиенту. Для выхода введи /endchat."
  );
});

// ================= ОБРАБОТКА СООБЩЕНИЙ =================

bot.on("text", async (ctx, next) => {
  const message = ctx.message.text;
  const userId = ctx.from.id;

  if (message.startsWith("/")) {
    return next();
  }

  if (isAdmin(userId) && activeChats.has(userId)) {
    const targetId = activeChats.get(userId);

    try {
      await bot.telegram.sendMessage(
        targetId,
        `💬 Поддержка SGProducts:\n\n${message}`
      );

      return ctx.reply("✅ Сообщение отправлено клиенту.");
    } catch (error) {
      console.error("Ошибка отправки клиенту:", error.message);

      return ctx.reply(
        "❌ Не удалось отправить сообщение. " +
        "Возможно, клиент не запускал бота."
      );
    }
  }

  const state = userStates.get(userId);

  if (state?.step === "details") {
    const product = db.products.find(p => p.id === state.productId);

    if (!product) {
      userStates.delete(userId);

      return ctx.reply(
        "Товар не найден. Открой каталог заново.",
        mainMenu()
      );
    }

    const order = {
      id: db.nextOrderId++,
      userId,
      username: ctx.from.username || "",
      name: [ctx.from.first_name, ctx.from.last_name]
        .filter(Boolean)
        .join(" "),
      service: `${product.category}: ${product.name}`,
      productId: product.id,
      priceUSD: product.fee != null ? null : product.price,
      feePercent: product.fee,
      details: message.slice(0, 1500),
      status: "Новый",
      createdAt: new Date().toISOString()
    };

    db.orders.push(order);

    await saveDB();

    userStates.delete(userId);

    await ctx.reply(
      `✅ Заказ №${order.id} создан!\n\n` +
      `Услуга: ${order.service}\n` +
      (order.priceUSD == null
        ? `Комиссия: ${order.feePercent}%\n`
        : `Цена: ${money(order.priceUSD)}\n`) +
      "Статус: Новый\n\n" +
      "Администратор скоро свяжется с тобой.",
      mainMenu()
    );

    await notifyAdmins(order);
    return;
  }

  if (!isAdmin(userId)) {
    let delivered = false;

    for (const adminId of ADMIN_IDS) {
      try {
        await bot.telegram.sendMessage(
          adminId,
          `💬 Сообщение в поддержку\n` +
          `От: ${ctx.from.first_name || "Клиент"}\n` +
          `Username: ${ctx.from.username ? "@" + ctx.from.username : "нет"}\n` +
          `ID: ${userId}\n\n${message}`,
          Markup.inlineKeyboard([
            [Markup.button.callback("Ответить", `client:${userId}`)]
          ])
        );

        delivered = true;
      } catch (error) {
        console.error(
          `Не удалось отправить сообщение админу ${adminId}:`,
          error.message
        );
      }
    }

    return ctx.reply(
      delivered
        ? "✅ Сообщение отправлено в поддержку."
        : "⚠️ Не удалось связаться с поддержкой. Попробуй позже."
    );
  }

  return ctx.reply(
    "Используй /admin для админ-панели или /start для главного меню."
  );
});

// ================= ОШИБКИ И ЗАПУСК =================

bot.catch((error, ctx) => {
  console.error(
    "Ошибка Telegram-бота:",
    error.message,
    ctx?.update?.update_id
      ? `Update ID: ${ctx.update.update_id}`
      : ""
  );
});

async function startBot() {
  try {
    await initDB();

    bot.launch()
      .then(() => {
        console.log("✅ SGProducts запущен и подключён к Neon PostgreSQL.");
      })
      .catch(error => {
        console.error("❌ Ошибка запуска Telegram:", error.message);
      });

    console.log("🚀 Команда запуска бота отправлена.");
  } catch (error) {
    console.error("❌ Ошибка подключения к Neon:", error.message);
    await pool.end().catch(() => {});
    process.exitCode = 1;
  }
}

process.once("SIGINT", () => {
  bot.stop("SIGINT");
  void pool.end();
});

process.once("SIGTERM", () => {
  bot.stop("SIGTERM");
  void pool.end();
});

startBot();