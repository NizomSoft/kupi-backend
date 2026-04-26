const express = require('express');
const cors = require('cors');
const initSqlJs = require('sql.js');
const Redis = require('ioredis');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const redis = new Redis('redis://localhost:6379');
const PORT = 3000;
const JWT_SECRET = 'kupi-secret-2024';

app.use(cors());
app.use(express.json());
app.use('/photos', express.static('photos'));

let db;

async function loadDb() {
  const SQL = await initSqlJs();
  db = new SQL.Database(fs.readFileSync('/data/data/com.termux/files/home/kupi-backend/kupi.db'));
}

function saveDb() {
  fs.writeFileSync('kupi.db', Buffer.from(db.export()));
}

function getUserId(req) {
  try { const a = req.headers.authorization; if (!a) return null; return jwt.verify(a.startsWith('Bearer ') ? a.slice(7) : a, JWT_SECRET).userId; } catch(e) { return null; }
}

loadDb().then(() => console.log('\n🚀 КУПИ API :' + PORT + ' | Товаров: ' + db.exec('SELECT COUNT(*) FROM products')[0].values[0][0] + '\n'));

// АВТОРИЗАЦИЯ
app.post('/api/auth/register', async (req, res) => {
  const { name, email, phone, password } = req.body;
  if (!password || password.length < 4) return res.status(400).json({ error: 'Пароль минимум 4 символа' });
  const ex = db.exec('SELECT id FROM users WHERE email = ? OR phone = ?', [email || '', phone || '']);
  if (ex[0]?.values?.length) return res.status(400).json({ error: 'Уже существует' });
  const hash = await bcrypt.hash(password, 10);
  db.run('INSERT INTO users (name, email, phone, password) VALUES (?, ?, ?, ?)', [name || 'Пользователь', email || '', phone || '', hash]);
  saveDb();
  const userId = db.exec('SELECT MAX(id) FROM users')[0].values[0][0];
  db.run('INSERT OR IGNORE INTO settings (userId) VALUES (?)', [userId]); saveDb();
  res.json({ token: jwt.sign({ userId }, JWT_SECRET), user: { id: userId, name: name || 'Пользователь', email, phone } });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, phone, password } = req.body;
  const u = db.exec('SELECT * FROM users WHERE email = ? OR phone = ?', [email || '', phone || '']);
  if (!u[0]?.values?.length) return res.status(401).json({ error: 'Неверный логин или пароль' });
  const user = u[0].values[0];
  if (!await bcrypt.compare(password, user[4])) return res.status(401).json({ error: 'Неверный логин или пароль' });
  res.json({ token: jwt.sign({ userId: user[0] }, JWT_SECRET), user: { id: user[0], name: user[1], email: user[2], phone: user[3] } });
});

// ПРОФИЛЬ
app.get('/api/profile', (req, res) => {
  const userId = getUserId(req); if (!userId) return res.status(401).json({ error: '!' });
  const u = db.exec('SELECT * FROM users WHERE id = ?', [userId])[0]?.values?.[0];
  if (!u) return res.status(404).json({ error: 'Не найден' });
  res.json({ id: u[0], name: u[1], email: u[2], phone: u[3], city: u[5] || '', address: u[6] || '', bonus: u[7] || 0, level: u[8] || 'Silver', balance: 1250 });
});
app.patch('/api/profile/name', (req, res) => { const u = getUserId(req); if (!u) return res.status(401).json({ error: '!' }); db.run('UPDATE users SET name = ? WHERE id = ?', [req.body.name, u]); saveDb(); res.json({ success: true }); });
app.patch('/api/profile/phone', (req, res) => { const u = getUserId(req); if (!u) return res.status(401).json({ error: '!' }); db.run('UPDATE users SET phone = ? WHERE id = ?', [req.body.phone, u]); saveDb(); res.json({ success: true }); });
app.patch('/api/profile/email', (req, res) => { const u = getUserId(req); if (!u) return res.status(401).json({ error: '!' }); db.run('UPDATE users SET email = ? WHERE id = ?', [req.body.email || '', u]); saveDb(); res.json({ success: true }); });
app.patch('/api/profile/address', (req, res) => { const u = getUserId(req); if (!u) return res.status(401).json({ error: '!' }); db.run('UPDATE users SET city = ?, address = ? WHERE id = ?', [req.body.city || '', req.body.address || '', u]); saveDb(); res.json({ success: true }); });

// КАТАЛОГ
app.get('/api/products', async (req, res) => {
  const { category, search, sort } = req.query;
  const key = 'p:' + (category||'all') + ':' + (search||'') + ':' + (sort||'') + ':' + (req.query.price_min||'') + ':' + (req.query.price_max||'');
  const cached = await redis.get(key); if (cached) return res.json(JSON.parse(cached));
  let q = 'SELECT * FROM products WHERE inStock = 1'; const p = [];
  if (category && category !== 'all') { q += ' AND category = ?'; p.push(category); }
  if (search) { q += ' AND name LIKE ?'; p.push('%' + search + '%'); }
  if (req.query.price_min) { q += ' AND price >= ?'; p.push(parseInt(req.query.price_min)); }
  if (req.query.price_max) { q += ' AND price <= ?'; p.push(parseInt(req.query.price_max)); }
  if (sort === 'price_asc') q += ' ORDER BY price ASC'; else if (sort === 'price_desc') q += ' ORDER BY price DESC'; else if (sort === 'rating') q += ' ORDER BY rating DESC'; else q += ' ORDER BY reviews DESC';
  const r = db.exec(q, p);
  const prods = r[0] ? r[0].values.map(v => ({ id:v[0], name:v[1], price:v[2], oldPrice:v[3], image:v[4], rating:v[5], reviews:v[6], category:v[7], tag: ({1:"Хит",2:"Новинка",3:"Акция",4:"Хит",6:"Новинка",8:"Акция",9:"Хит",11:"Новинка",13:"Акция",15:"Хит",16:"Новинка",18:"Акция",20:"Хит",21:"Новинка",23:"Акция"})[v[0]] || v[8] })) : [];
  await redis.setex(key, 300, JSON.stringify(prods)); res.json(prods);
});

app.get('/api/products/:id', (req, res) => {
  const r = db.exec('SELECT id, name, price, oldPrice, image, rating, reviews, category, tag FROM products WHERE id = ?', [req.params.id]);
  if (!r[0]?.values?.[0]) return res.status(404).json({ error: 'Не найден' });
  const v = r[0].values[0];
  const base = v[4].replace('/photos/', '').replace('.jpg', '');
  const photos = [v[4], '/photos/' + base + '_2.jpg', '/photos/' + base + '_3.jpg'];
  res.json({ id: v[0], name: v[1], price: v[2], oldPrice: v[3], image: v[4], rating: v[5], reviews: v[6], category: v[7], tag: v[8], photos, description: 'Премиум качество. Оригинальный товар. Гарантия 1 год.', specs: { 'Бренд': 'Apple', 'Модель': '2024', 'Цвет': 'Черный', 'Вес': '200 г', 'Гарантия': '1 год' } });
});

app.get('/api/categories', async (req, res) => {
  const cached = await redis.get('cats'); if (cached) return res.json(JSON.parse(cached));
  const r = db.exec('SELECT DISTINCT category FROM products');
  const names = { electronics: 'Электроника', clothing: 'Одежда', sports: 'Спорт', home: 'Дом' };
  res.json((r[0]?.values||[]).map(v => ({ id: v[0], name: names[v[0]]||v[0] })));
});

// КОРЗИНА
app.get('/api/cart', (req, res) => { const u = getUserId(req) || 0; const r = db.exec('SELECT ci.productId, ci.quantity, p.name, p.price, p.oldPrice, p.image FROM cart_items ci JOIN products p ON ci.productId = p.id WHERE ci.userId = ?', [u]); res.json(r[0] ? r[0].values.map(v => ({ productId:v[0], quantity:v[1], product:{ name:v[2], price:v[3], oldPrice:v[4], image:v[5] } })) : []); });
app.post('/api/cart', (req, res) => { const u = getUserId(req) || 0; const { productId, quantity = 1 } = req.body; const ex = db.exec('SELECT id, quantity FROM cart_items WHERE userId = ? AND productId = ?', [u, productId]); if (ex[0]?.values?.length) db.run('UPDATE cart_items SET quantity = ? WHERE id = ?', [ex[0].values[0][1] + quantity, ex[0].values[0][0]]); else db.run('INSERT INTO cart_items (userId, productId, quantity) VALUES (?, ?, ?)', [u, productId, quantity]); saveDb(); res.json({ success: true, count: db.exec('SELECT COUNT(*) FROM cart_items WHERE userId = ?', [u])[0].values[0][0] }); });
app.delete('/api/cart/:pid', (req, res) => { const u = getUserId(req) || 0; db.run('DELETE FROM cart_items WHERE userId = ? AND productId = ?', [u, req.params.pid]); saveDb(); res.json({ success: true }); });
app.patch('/api/cart/:pid', (req, res) => { const u = getUserId(req) || 0; db.run('UPDATE cart_items SET quantity = ? WHERE userId = ? AND productId = ?', [Math.max(1, req.body.quantity), u, req.params.pid]); saveDb(); res.json({ success: true }); });

// ИЗБРАННОЕ
app.get('/api/favorites', (req, res) => { const u = getUserId(req) || 0; const r = db.exec('SELECT productId FROM favorites WHERE userId = ?', [u]); res.json(r[0] ? r[0].values.map(v => v[0]) : []); });
app.post('/api/favorites/:id', (req, res) => { const u = getUserId(req) || 0; const pid = parseInt(req.params.id); const ex = db.exec('SELECT id FROM favorites WHERE userId = ? AND productId = ?', [u, pid]); if (ex[0]?.values?.length) db.run('DELETE FROM favorites WHERE userId = ? AND productId = ?', [u, pid]); else db.run('INSERT INTO favorites (userId, productId) VALUES (?, ?)', [u, pid]); saveDb(); res.json({ favorites: db.exec('SELECT productId FROM favorites WHERE userId = ?', [u])[0]?.values.map(v => v[0]) || [] }); });

// ЗАКАЗЫ
app.post('/api/checkout', (req, res) => { const u = getUserId(req) || 0; const r = db.exec('SELECT ci.productId, ci.quantity, p.price FROM cart_items ci JOIN products p ON ci.productId = p.id WHERE ci.userId = ?', [u]); if (!r[0]?.values?.length) return res.status(400).json({ error: 'Корзина пуста' }); const total = r[0].values.reduce((s, v) => s + v[2] * v[1], 0); db.run('INSERT INTO orders (userId, total, status, tracking, createdAt) VALUES (?, ?, ?, ?, ?)', [u, total, 'В обработке', '', new Date().toLocaleString('ru-RU')]); const orderId = db.exec('SELECT MAX(id) FROM orders')[0].values[0][0]; for (const v of r[0].values) db.run('INSERT INTO order_items (orderId, productId, quantity, price) VALUES (?, ?, ?, ?)', [orderId, v[0], v[1], v[2]]); db.run('UPDATE users SET bonus = bonus + ? WHERE id = ?', [Math.round(total * 0.05), u]); db.run('DELETE FROM cart_items WHERE userId = ?', [u]); saveDb(); res.json({ success: true, order: { id: orderId, total, status: 'В обработке' } }); });
app.get('/api/orders', (req, res) => { const u = getUserId(req) || 0; const r = db.exec('SELECT * FROM orders WHERE userId = ? ORDER BY id DESC', [u]); res.json(r[0]?.values.map(v => ({ id:v[0], total:v[2], status:v[3], tracking:v[4], date:v[5] })) || []); });
app.get('/api/orders/:id', (req, res) => { const r = db.exec('SELECT * FROM orders WHERE id = ?', [req.params.id]); if (!r[0]?.values?.[0]) return res.status(404).json({ error: 'Не найден' }); const v = r[0].values[0]; res.json({ id: v[0], total: v[2], status: v[3], tracking: v[4], date: v[5] }); });
app.patch('/api/orders/:id/status', (req, res) => { db.run('UPDATE orders SET status = ? WHERE id = ?', [req.body.status, req.params.id]); saveDb(); res.json({ success: true }); });

// ОТЗЫВЫ
app.get('/api/reviews/:productId', (req, res) => { const r = db.exec('SELECT * FROM reviews WHERE productId = ? ORDER BY id DESC LIMIT 20', [req.params.productId]); res.json(r[0]?.values.map(v => ({ id:v[0], rating:v[3], text:v[4], author:v[5] })) || []); });
app.post('/api/reviews', (req, res) => {
  const u = getUserId(req) || 0;
  const { productId, rating, text } = req.body;
  if (!productId || !rating || !text) return res.status(400).json({ error: '!' });
  const user = db.exec('SELECT name FROM users WHERE id = ?', [u]);
  const author = (user[0]?.values?.[0]?.[0]) || 'Пользователь';
  db.run('INSERT INTO reviews (productId, userId, rating, text, author) VALUES (?, ?, ?, ?, ?)', [req.body.productId, u, req.body.rating, req.body.text, author]);
  db.run('UPDATE products SET reviews = (SELECT COUNT(*) FROM reviews WHERE productId = ?) WHERE id = ?', [productId, productId]);
  db.run('UPDATE products SET rating = (SELECT ROUND(AVG(rating), 1) FROM reviews WHERE productId = ?) WHERE id = ?', [productId, productId]);
  saveDb();
  res.json({ success: true, author });
});

// НАСТРОЙКИ
app.get('/api/settings', (req, res) => { const u = getUserId(req) || 0; const s = db.exec('SELECT * FROM settings WHERE userId = ?', [u])[0]?.values?.[0]; res.json(s ? { notifications: s[2], darkMode: s[3] } : { notifications: 1, darkMode: 0 }); });
app.put('/api/settings', (req, res) => { const u = getUserId(req) || 0; const { notifications, darkMode } = req.body; const ex = db.exec('SELECT id FROM settings WHERE userId = ?', [u]); if (ex[0]?.values?.length) db.run('UPDATE settings SET notifications=?, darkMode=? WHERE userId=?', [notifications??1, darkMode??0, u]); else db.run('INSERT INTO settings (userId, notifications, darkMode) VALUES (?,?,?)', [u, notifications??1, darkMode??0]); saveDb(); res.json({ success: true }); });

// АВТОКОМПЛИТ
app.get('/api/address/suggest', async (req, res) => { const { query } = req.query; if (!query || query.length < 3) return res.json([]); try { const resp = await fetch('https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': 'Token 2e0e6a909b84b30024848a4c1c6ef60810de5ef0' }, body: JSON.stringify({ query, count: 5 }) }); const data = await resp.json(); res.json((data.suggestions || []).map(s => ({ value: s.value, city: s.data?.city || '', street: s.data?.street || '', house: s.data?.house || '' }))); } catch(e) { res.json([]); } });



// АДМИН API
app.post('/api/products', (req, res) => {
  const { name, price, oldPrice, category, image, tag } = req.body;
  db.run('INSERT INTO products (name, price, oldPrice, category, image, tag) VALUES (?, ?, ?, ?, ?, ?)', [name, price, oldPrice || null, category, image || '/photos/placeholder.jpg', tag || '']);
  saveDb();
  redis.del(redis.keys('p:*'));
  res.json({ success: true });
});

app.put('/api/products/:id', (req, res) => {
  const { name, price, oldPrice, category, tag } = req.body;
  db.run('UPDATE products SET name=?, price=?, oldPrice=?, category=?, tag=? WHERE id=?', [name, price, oldPrice || null, category, tag || '', req.params.id]);
  saveDb();
  redis.del(redis.keys('p:*'));
  res.json({ success: true });
});

app.delete('/api/products/:id', (req, res) => {
  db.run('DELETE FROM products WHERE id=?', [req.params.id]);
  saveDb();
  redis.del(redis.keys('p:*'));
  res.json({ success: true });
});


const multer = require('multer');
const upload = multer({ dest: 'photos/' });
app.post('/api/upload', upload.single('photo'), (req, res) => {
  res.json({ path: '/photos/' + req.file.filename });
});


app.post('/api/upload-base64', (req, res) => {
  const { image, filename } = req.body;
  const path = 'photos/' + filename;
  require('fs').writeFileSync(path, Buffer.from(image, 'base64'));
  res.json({ path: '/' + path });
});

app.listen(PORT, '0.0.0.0');
