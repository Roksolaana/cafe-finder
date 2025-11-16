require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const db = require('./db');
const authRoutes = require('./auth');
const profileRoutes = require('./profile');
const reviewRoutes = require('./reviews');
const listRoutes = require('./lists');
const favoritesRoutes = require('./favorites');
const { authenticateToken } = require('./auth');

const app = express();

// ----------------------------
// 🌐 CORS + JSON
// ----------------------------
app.use(cors({
  origin: '*',
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// ----------------------------
// 📁 Папка для збереження файлів (аватари)
// ----------------------------
const uploadRoot = path.join(__dirname, process.env.UPLOAD_DIR || 'uploads');
if (!fs.existsSync(uploadRoot)) {
  fs.mkdirSync(uploadRoot, { recursive: true });
}

app.use('/uploads', express.static(uploadRoot));

// ----------------------------
// 📌 Логування всіх запитів
// ----------------------------
app.use((req, res, next) => {
  console.log(`[${req.method}] ${req.url}`);
  next();
});

// ----------------------------
// 🔗 Підключення API-маршрутів
// ----------------------------
app.use('/api', authRoutes);
app.use('/api', profileRoutes);
app.use('/api', reviewRoutes);
app.use('/api', listRoutes);
app.use('/api', favoritesRoutes);

// ----------------------------
// 🔎 Перевірка унікальності нікнейму
// ----------------------------
app.get('/api/check-nickname', (req, res) => {
  const { nickname } = req.query;
  if (!nickname) return res.status(400).json({ error: 'Нікнейм не надано' });

  db.query('SELECT id FROM users WHERE nickname = ?', [nickname], (err, rows) => {
    if (err) {
      console.error('Помилка перевірки нікнейму:', err);
      return res.status(500).json({ error: 'Помилка сервера', available: false });
    }
    res.json({ available: rows.length === 0 });
  });
});


// ----------------------------
// 🔍 Пошук користувачів (q=)
// ----------------------------
app.get('/api/users/search', (req, res) => {
  const { q } = req.query;

  if (!q || !q.trim()) {
    return res.status(400).json({ error: "Параметр q обов'язковий" });
  }

  const t = `%${q.trim()}%`;

  db.query(
    `SELECT id, name, surname, nickname, email, avatar_url, created_at, updated_at
     FROM users
     WHERE name LIKE ? OR surname LIKE ? OR nickname LIKE ? OR email LIKE ?
     ORDER BY id ASC`,
    [t, t, t, t],
    (err, rows) => {
      if (err) {
        console.error("Помилка пошуку:", err);
        return res.status(500).json({ error: "Помилка сервера під час пошуку" });
      }
      res.json({ results: rows });
    }
  );
});

// ----------------------------
// 🧑‍🤝‍🧑 Отримати всіх користувачів
// ----------------------------
app.get('/api/users', (req, res) => {
  db.query(
    'SELECT id, name, surname, nickname, email, avatar_url, created_at, updated_at FROM users ORDER BY id ASC',
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.toString() });

      const formatted = rows.map(u => ({
        ...u,
        avatar_url: u.avatar_url ? `/uploads/${path.basename(u.avatar_url)}` : null
      }));

      res.json({ users: formatted });
    }
  );
});

// ----------------------------
// 🧑 Отримати користувача за ID
// ----------------------------
app.get('/api/users/:id', (req, res) => {
  const { id } = req.params;

  db.query(
    'SELECT id, name, surname, nickname, email, avatar_url, created_at, updated_at FROM users WHERE id = ?',
    [id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.toString() });
      if (!rows.length) return res.status(404).json({ error: 'Користувача не знайдено' });

      const u = rows[0];
      res.json({
        user: {
          ...u,
          avatar_url: u.avatar_url ? `/uploads/${path.basename(u.avatar_url)}` : null
        }
      });
    }
  );
});

// ----------------------------
// ❌ Видалити свій акаунт
// ----------------------------
app.delete('/api/users/:id', authenticateToken, (req, res) => {
  const { id } = req.params;

  if (req.user.id != id) {
    return res.status(403).json({ error: "Ти не можеш видалити чужий акаунт" });
  }

  db.query('DELETE FROM users WHERE id = ?', [id], (err) => {
    if (err) return res.status(500).json({ error: err.toString() });
    res.json({ message: 'Акаунт видалено' });
  });
});

// ----------------------------
// 🩺 Тест зʼєднання з БД
// ----------------------------
app.get('/api/health', (req, res) => {
  db.query('SELECT 1 AS ok', (err, rows) => {
    if (err) return res.status(500).json({ ok: false, error: err.toString() });
    res.json({ ok: true, db: rows[0].ok === 1 });
  });
});

// ----------------------------
// ❌ 404 Middleware
// ----------------------------
app.use((req, res) => {
  res.status(404).json({ error: "Маршрут не знайдено" });
});

// ----------------------------
// 🚀 Запуск сервера
// ----------------------------
const port = process.env.PORT || 3001;
app.listen(port, () =>
  console.log(`✅ API running on http://localhost:${port}`)
);
