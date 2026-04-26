const initSqlJs = require('sql.js');
const fs = require('fs');

async function setup() {
  const SQL = await initSqlJs();
  const db = new SQL.Database();

  db.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, email TEXT, phone TEXT, password TEXT, city TEXT DEFAULT '', address TEXT DEFAULT '', bonus INTEGER DEFAULT 0, level TEXT DEFAULT 'Silver')`);
  db.run(`CREATE TABLE IF NOT EXISTS cart_items (id INTEGER PRIMARY KEY AUTOINCREMENT, userId INTEGER, productId INTEGER, quantity INTEGER DEFAULT 1)`);
  db.run(`CREATE TABLE IF NOT EXISTS favorites (id INTEGER PRIMARY KEY AUTOINCREMENT, userId INTEGER, productId INTEGER, UNIQUE(userId, productId))`);
  db.run(`CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY AUTOINCREMENT, userId INTEGER, total INTEGER, status TEXT, tracking TEXT, createdAt TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS order_items (id INTEGER PRIMARY KEY AUTOINCREMENT, orderId INTEGER, productId INTEGER, quantity INTEGER, price INTEGER)`);
  db.run(`CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY AUTOINCREMENT, userId INTEGER UNIQUE, notifications INTEGER DEFAULT 1, darkMode INTEGER DEFAULT 0)`);
  db.run(`CREATE TABLE IF NOT EXISTS reviews (id INTEGER PRIMARY KEY AUTOINCREMENT, productId INTEGER, userId INTEGER, rating INTEGER, text TEXT, author TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, price INTEGER, oldPrice INTEGER, image TEXT, rating REAL, reviews INTEGER, category TEXT, inStock INTEGER DEFAULT 1, badge TEXT DEFAULT "")`);

  const products = [
    ['iPhone 15 128GB', 79990, 89990, '/photos/iphone.jpg', 4.8, 2341, 'electronics', 'Хит'],
    ['Samsung A55', 39990, 44990, '/photos/samsung.jpg', 4.7, 1567, 'electronics', 'Новинка'],
    ['MacBook Air M2', 89990, 99990, '/photos/macbook.jpg', 4.9, 876, 'electronics', 'Акция'],
    ['iPad 10.9"', 44990, 49990, '/photos/ipad.jpg', 4.7, 654, 'electronics', 'Хит'],
    ['AirPods Pro 2', 22990, 25990, '/photos/airpods.jpg', 4.8, 4567, 'electronics', ''],
    ['Samsung Watch 6', 29990, 34990, '/photos/watch.jpg', 4.6, 1234, 'electronics', 'Новинка'],
    ['Sony WH-1000XM4', 24990, 29990, '/photos/sony.jpg', 4.8, 2345, 'electronics', ''],
    ['Power Bank Xiaomi', 2990, 3990, '/photos/powerbank.jpg', 4.5, 5678, 'electronics', 'Акция'],
    ['JBL Flip 6', 9990, 12990, '/photos/jbl.jpg', 4.7, 3456, 'electronics', 'Хит'],
    ['Apple TV 4K', 16990, 18990, '/photos/appletv.jpg', 4.6, 890, 'electronics', ''],
    ['Пальто демисезонное', 8990, 12990, '/photos/palto.jpg', 4.5, 456, 'clothing', 'Новинка'],
    ['Кроссовки Nike', 7990, 9990, '/photos/nike.jpg', 4.7, 1234, 'clothing', ''],
    ['Джинсы классические', 4990, 6990, '/photos/jeans.jpg', 4.6, 789, 'clothing', 'Акция'],
    ['Худи утеплённое', 3990, 5490, '/photos/hoodie.jpg', 4.5, 567, 'clothing', ''],
    ['Футболка хлопок', 1490, 2490, '/photos/tshirt.jpg', 4.4, 2345, 'clothing', 'Хит'],
    ['Куртка осенняя', 6990, 8990, '/photos/jacket.jpg', 4.6, 678, 'clothing', 'Новинка'],
    ['Беговая дорожка', 49990, 59990, '/photos/treadmill.jpg', 4.5, 234, 'sports', ''],
    ['Гантели 10кг', 3990, 5490, '/photos/dumbbells.jpg', 4.7, 890, 'sports', 'Акция'],
    ['Коврик для йоги', 1990, 2990, '/photos/yoga.jpg', 4.4, 1567, 'sports', ''],
    ['Велосипед Stinger', 25990, 31990, '/photos/bike.jpg', 4.6, 432, 'sports', 'Хит'],
    ['Робот-пылесос', 24990, 32990, '/photos/robot.jpg', 4.8, 1234, 'home', 'Новинка'],
    ['Светильник LED', 2490, 3490, '/photos/lamp.jpg', 4.5, 456, 'home', ''],
    ['Подушка ортопед.', 2490, 3990, '/photos/pillow.jpg', 4.6, 890, 'home', 'Акция'],
    ['Кофемашина', 44990, 54990, '/photos/coffee.jpg', 4.7, 678, 'home', ''],
  ];

  for (const p of products) {
    db.run('INSERT INTO products (name, price, oldPrice, image, rating, reviews, category, badge) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', p);
  }

  fs.writeFileSync('kupi.db', Buffer.from(db.export()));
  db.close();
  console.log('✅ ' + products.length + ' товаров с бейджами');
}
setup();
