const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@skinvault.ru').trim().toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error('Set JWT_SECRET to a random value of at least 32 characters in server/.env.');
}

if (ADMIN_PASSWORD && ADMIN_PASSWORD.length < 12) {
  throw new Error('ADMIN_PASSWORD must be at least 12 characters long.');
}

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '20mb' }));

const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });

const db = new sqlite3.Database(path.join(dataDir, 'skinvault.db'));

const run = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ id: this.lastID, changes: this.changes });
    });
  });

const get = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
    });
  });

const all = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Отсутствует токен авторизации' });
  }

  try {
    const token = authHeader.replace('Bearer ', '');
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Невалидный токен' });
  }
};

const sanitizeUser = (user) => ({
  id: user.id,
  username: user.username,
  email: user.email,
  role: user.role,
  balance: user.balance,
});

const generateToken = (user) =>
  jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

const createCheckNumber = () => {
  const stamp = Date.now().toString().slice(-8);
  const random = Math.floor(Math.random() * 9000 + 1000);
  return `SV-${stamp}-${random}`;
};

async function initializeDatabase() {
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      balance INTEGER NOT NULL DEFAULT 5000,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS cases (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      price INTEGER NOT NULL,
      description TEXT NOT NULL,
      image TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS skins (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      rarity TEXT NOT NULL,
      price INTEGER NOT NULL,
      description TEXT NOT NULL,
      image TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS blog_posts (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      attachments TEXT DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS inventory (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      item_type TEXT NOT NULL,
      item_id TEXT NOT NULL,
      name TEXT NOT NULL,
      rarity TEXT,
      price INTEGER NOT NULL,
      image TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS payment_history (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      item_type TEXT NOT NULL,
      item_name TEXT NOT NULL,
      amount INTEGER NOT NULL,
      payment_method TEXT NOT NULL,
      check_number TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'paid',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
  `);

  const admin = await get('SELECT * FROM users WHERE email = ?', [ADMIN_EMAIL]);
  if (!admin && ADMIN_PASSWORD) {
    const adminId = 'admin-1';
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
    await run(
      `INSERT INTO users (id, username, email, password_hash, role, balance) VALUES (?, ?, ?, ?, ?, ?)`,
      [adminId, 'Admin', ADMIN_EMAIL, passwordHash, 'admin', 15000]
    );
  } else if (!admin) {
    console.warn('ADMIN_PASSWORD is not set; the admin account was not created.');
  }

  const caseCount = await get('SELECT COUNT(*) as count FROM cases');
  if ((caseCount?.count || 0) === 0) {
    await run(
      `INSERT INTO cases (id, name, price, description, image) VALUES
        ('case-start', 'Starter Case', 680, 'Классическая коллекция с редкими эффектами и игровыми бестселлерами.', 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=1200&q=80'),
        ('case-arcane', 'Arcane Drop', 1250, 'Особенные скины со светоотражающим покрытием и эффектом неонового свечения.', 'https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=1200&q=80'),
        ('case-legend', 'Legend Vault', 2100, 'Премиум набор с лимитированными предметами и редкими оранжевыми акцентами.', 'https://images.unsplash.com/photo-1526379095098-d400fd0bf935?auto=format&fit=crop&w=1200&q=80')`
    );
  }

  const skinCount = await get('SELECT COUNT(*) as count FROM skins');
  if ((skinCount?.count || 0) === 0) {
    await run(
      `INSERT INTO skins (id, name, rarity, price, description, image) VALUES
        ('skin-1', 'AWP | Hyper Beast', 'Mythic', 4900, 'Легендарный снайперский скин с чётким агрессивным дизайном.', 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=1200&q=80'),
        ('skin-2', 'M4A1-S | Neon Knight', 'Epic', 2800, 'Мощная стальная расцветка для агрессивной тактики и давления на карту.', 'https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=1200&q=80'),
        ('skin-3', 'USP-S | Glacier', 'Rare', 940, 'Чистый стиль для аккуратных раундов и коротких драк.', 'https://images.unsplash.com/photo-1526379095098-d400fd0bf935?auto=format&fit=crop&w=1200&q=80'),
        ('skin-4', 'AK-47 | Crimson Tide', 'Legendary', 5300, 'Кроваво-красная палитра с эффектом динамичной мощности.', 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=1200&q=80'),
        ('skin-5', 'Desert Eagle | Sunset', 'Epic', 2100, 'Премиальная расцветка с насыщенным оранжево-розовым свечением.', 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=80'),
        ('skin-6', 'Glock-18 | Night Pulse', 'Rare', 860, 'Сдержанный и эффектный дизайн для уверенных игроков.', 'https://images.unsplash.com/photo-1493711662062-fa541adb3fc8?auto=format&fit=crop&w=1200&q=80')`
    );
  }

  const blogCount = await get('SELECT COUNT(*) as count FROM blog_posts');
  if ((blogCount?.count || 0) === 0) {
    await run(
      `INSERT INTO blog_posts (id, title, content, attachments) VALUES
        ('blog-1', 'Новые редкие лоты в сезоне 4', 'Арбитражные наборы, свежие расцветки и высокоуровневые предметы стали доступны для открытий. Мы обновили систему выпадения редкостей.', '[]'),
        ('blog-2', 'Как собрать идеальную коллекцию скинов', 'Стратегия проста: изучайте редкости, следите за трейд-обзором и учитывайте визуальную ценность предметов. Это помогает избегать пустых покупок.', '[]')`
    );
  }
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ message: 'Все поля обязательны' });
    }

    const existing = await get('SELECT * FROM users WHERE email = ?', [email.trim().toLowerCase()]);
    if (existing) {
      return res.status(409).json({ message: 'Пользователь уже существует' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userId = `user-${Date.now()}`;
    await run(
      `INSERT INTO users (id, username, email, password_hash, role, balance) VALUES (?, ?, ?, ?, 'user', 5000)`,
      [userId, username.trim(), email.trim().toLowerCase(), passwordHash]
    );

    const user = await get('SELECT * FROM users WHERE id = ?', [userId]);
    const token = generateToken(user);

    return res.status(201).json({ token, user: sanitizeUser(user) });
  } catch (error) {
    return res.status(500).json({ message: 'Ошибка регистрации', error: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email и пароль обязательны' });
    }

    const user = await get('SELECT * FROM users WHERE email = ?', [email.trim().toLowerCase()]);
    if (!user) {
      return res.status(401).json({ message: 'Неверный email или пароль' });
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ message: 'Неверный email или пароль' });
    }

    const token = generateToken(user);
    return res.json({ token, user: sanitizeUser(user) });
  } catch (error) {
    return res.status(500).json({ message: 'Ошибка входа', error: error.message });
  }
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  const user = await get('SELECT * FROM users WHERE id = ?', [req.user.id]);
  if (!user) {
    return res.status(404).json({ message: 'Пользователь не найден' });
  }

  const inventory = await all(
    `SELECT * FROM inventory WHERE user_id = ? ORDER BY created_at DESC`,
    [user.id]
  );

  res.json({
    user: sanitizeUser(user),
    inventory,
  });
});

app.get('/api/cases', async (req, res) => {
  const items = await all('SELECT * FROM cases ORDER BY price ASC');
  res.json(items);
});

app.get('/api/skins', async (req, res) => {
  const items = await all('SELECT * FROM skins ORDER BY price ASC');
  res.json(items);
});

app.get('/api/blog', async (req, res) => {
  const posts = await all('SELECT * FROM blog_posts ORDER BY created_at DESC');
  res.json(posts.map((post) => ({ ...post, attachments: JSON.parse(post.attachments || '[]') })));
});

app.get('/api/payments/methods', (req, res) => {
  res.json([
    { id: 'bank-card', label: 'Карта', description: 'Visa / Mastercard' },
    { id: 'sberbank', label: 'Сбербанк', description: 'Сбербанк Онлайн' },
    { id: 'tinkoff', label: 'Тинькофф', description: 'Платёж по чеку' },
    { id: 'crypto', label: 'Крипто', description: 'USDT / BTC' },
  ]);
});

app.post('/api/payments/checkout', authMiddleware, async (req, res) => {
  try {
    const { type, itemId, paymentMethod } = req.body;
    const allowedMethods = ['bank-card', 'sberbank', 'tinkoff', 'crypto'];
    const method = allowedMethods.includes(paymentMethod) ? paymentMethod : 'bank-card';

    let item = null;
    if (type === 'case') {
      item = await get('SELECT * FROM cases WHERE id = ?', [itemId]);
    }
    if (type === 'skin') {
      item = await get('SELECT * FROM skins WHERE id = ?', [itemId]);
    }

    if (!item) {
      return res.status(404).json({ message: 'Товар не найден' });
    }

    const user = await get('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!user) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    if (user.balance < item.price) {
      return res.status(400).json({ message: 'Недостаточно средств на балансе' });
    }

    const newBalance = user.balance - item.price;
    await run('UPDATE users SET balance = ? WHERE id = ?', [newBalance, user.id]);

    let inventoryItem = item;
    if (type === 'case') {
      const reward = await get('SELECT * FROM skins ORDER BY RANDOM() LIMIT 1');
      inventoryItem = reward;
    }

    const inventoryId = `inv-${Date.now()}`;
    await run(
      `INSERT INTO inventory (id, user_id, item_type, item_id, name, rarity, price, image) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [inventoryId, user.id, type === 'case' ? 'case_reward' : 'skin', inventoryItem.id, inventoryItem.name, inventoryItem.rarity || 'Rare', inventoryItem.price, inventoryItem.image]
    );

    const checkNumber = createCheckNumber();
    await run(
      `INSERT INTO payment_history (id, user_id, item_type, item_name, amount, payment_method, check_number, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'paid')`,
      [
        `pay-${Date.now()}`,
        user.id,
        type,
        item.name,
        item.price,
        method,
        checkNumber,
      ]
    );

    const updatedUser = await get('SELECT * FROM users WHERE id = ?', [user.id]);
    const paymentMethods = {
      'bank-card': 'Карта',
      sberbank: 'Сбербанк',
      tinkoff: 'Тинькофф',
      crypto: 'Крипто',
    };

    res.json({
      message: type === 'case' ? 'Кейс успешно открыт' : 'Покупка успешно оформлена',
      check: {
        number: checkNumber,
        method: paymentMethods[method],
        amount: item.price,
        status: 'paid',
      },
      user: sanitizeUser(updatedUser),
    });
  } catch (error) {
    res.status(500).json({ message: 'Ошибка оплаты', error: error.message });
  }
});

app.get('/api/payments/history', authMiddleware, async (req, res) => {
  const history = await all(
    `SELECT * FROM payment_history WHERE user_id = ? ORDER BY created_at DESC`,
    [req.user.id]
  );
  res.json(history);
});

app.get('/api/user/inventory', authMiddleware, async (req, res) => {
  const inventory = await all(
    `SELECT * FROM inventory WHERE user_id = ? ORDER BY created_at DESC`,
    [req.user.id]
  );
  res.json(inventory);
});

app.post('/api/admin/cases', authMiddleware, async (req, res) => {
  const user = await get('SELECT * FROM users WHERE id = ?', [req.user.id]);
  if (user.role !== 'admin') {
    return res.status(403).json({ message: 'Нет доступа к админ-панели' });
  }

  const { name, price, description, image } = req.body;
  if (!name || !price || !description) {
    return res.status(400).json({ message: 'Заполните все поля' });
  }

  const id = `case-${Date.now()}`;
  await run(
    `INSERT INTO cases (id, name, price, description, image) VALUES (?, ?, ?, ?, ?)`,
    [id, name, Number(price), description, image || 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=1200&q=80']
  );

  const item = await get('SELECT * FROM cases WHERE id = ?', [id]);
  res.status(201).json(item);
});

app.post('/api/admin/skins', authMiddleware, async (req, res) => {
  const user = await get('SELECT * FROM users WHERE id = ?', [req.user.id]);
  if (user.role !== 'admin') {
    return res.status(403).json({ message: 'Нет доступа к админ-панели' });
  }

  const { name, rarity, price, description, image } = req.body;
  if (!name || !rarity || !price || !description) {
    return res.status(400).json({ message: 'Заполните все поля' });
  }

  const id = `skin-${Date.now()}`;
  await run(
    `INSERT INTO skins (id, name, rarity, price, description, image) VALUES (?, ?, ?, ?, ?, ?)`,
    [id, name, rarity, Number(price), description, image || 'https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=1200&q=80']
  );

  const item = await get('SELECT * FROM skins WHERE id = ?', [id]);
  res.status(201).json(item);
});

app.post('/api/admin/blog', authMiddleware, async (req, res) => {
  const user = await get('SELECT * FROM users WHERE id = ?', [req.user.id]);
  if (user.role !== 'admin') {
    return res.status(403).json({ message: 'Нет доступа к админ-панели' });
  }

  const { title, content, attachments } = req.body;
  if (!title || !content) {
    return res.status(400).json({ message: 'Заголовок и содержание обязательны' });
  }

  const id = `blog-${Date.now()}`;
  const files = Array.isArray(attachments) ? attachments : [];
  await run(
    `INSERT INTO blog_posts (id, title, content, attachments) VALUES (?, ?, ?, ?)`,
    [id, title, content, JSON.stringify(files)]
  );

  const post = await get('SELECT * FROM blog_posts WHERE id = ?', [id]);
  res.status(201).json({ ...post, attachments: JSON.parse(post.attachments || '[]') });
});

async function startServer() {
  await initializeDatabase();
  app.listen(PORT, () => {
    console.log(`SkinVault API started on http://localhost:${PORT}`);
  });
}

startServer();
