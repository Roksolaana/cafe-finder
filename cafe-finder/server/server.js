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
// CORS + JSON
// ----------------------------
app.use(cors({
  origin: '*',
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// ----------------------------
// Папка для збереження файлів (аватари)
// ----------------------------
const uploadRoot = path.join(__dirname, process.env.UPLOAD_DIR || 'uploads');
if (!fs.existsSync(uploadRoot)) {
  fs.mkdirSync(uploadRoot, { recursive: true });
}

app.use('/uploads', express.static(uploadRoot));

// ----------------------------
//  Логування всіх запитів
// ----------------------------
app.use((req, res, next) => {
  console.log(`[${req.method}] ${req.url}`);
  next();
});

// ----------------------------
// Підключення API-маршрутів
// ----------------------------
app.use('/api', authRoutes);
app.use('/api', profileRoutes);
app.use('/api', reviewRoutes);
app.use('/api', listRoutes);
app.use('/api', favoritesRoutes);

// ----------------------------
// Перевірка унікальності нікнейму
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
// Пошук користувачів (q=)
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
// Отримати всіх користувачів
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
// Отримати користувача за ID
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
// Видалити свій акаунт
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
// Тест зʼєднання з БД
// ----------------------------
app.get('/api/health', (req, res) => {
  db.query('SELECT 1 AS ok', (err, rows) => {
    if (err) return res.status(500).json({ ok: false, error: err.toString() });
    res.json({ ok: true, db: rows[0].ok === 1 });
  });
});

// ----------------------------
// 404 Middleware
// ----------------------------
app.use((req, res) => {
  res.status(404).json({ error: "Маршрут не знайдено" });
});

// ----------------------------
// Запуск сервера
// ----------------------------
const port = process.env.PORT || 3001;

// -- Startup checks: warn if JWT secret missing and ensure review_likes table exists
if(!process.env.JWT_SECRET) {
  console.warn('⚠️ WARNING: JWT_SECRET is not set. Using a default insecure secret. Set JWT_SECRET in your .env for production.');
}

const ensureReviewLikesSQL = `
CREATE TABLE IF NOT EXISTS ` + '`review_likes`' + ` (
  ` + '`id`' + ` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  ` + '`review_id`' + ` INT UNSIGNED NOT NULL,
  ` + '`user_id`' + ` INT UNSIGNED NOT NULL,
  ` + '`created_at`' + ` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (` + '`id`' + `),
  KEY ` + '`idx_review_likes_review_id`' + ` (` + '`review_id`' + `),
  KEY ` + '`idx_review_likes_user_id`' + ` (` + '`user_id`' + `),
  CONSTRAINT ` + '`fk_review_likes_review`' + ` FOREIGN KEY (` + '`review_id`' + `) REFERENCES ` + '`reviews`' + `(` + '`id`' + `) ON DELETE CASCADE,
  CONSTRAINT ` + '`fk_review_likes_user`' + ` FOREIGN KEY (` + '`user_id`' + `) REFERENCES ` + '`users`' + `(` + '`id`' + `) ON DELETE CASCADE,
  UNIQUE KEY ` + '`uq_review_likes_user_review`' + ` (` + '`user_id`' + `, ` + '`review_id`' + `)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`;

db.query(ensureReviewLikesSQL, (err) => {
  if(err) {
    console.error('❌ Помилка при перевірці/створенні таблиці review_likes:', err);
    console.error('Запустіть manual import schema.sql або server/create-review-likes.js, якщо помилка повторюється.');
    // Still start server — non-fatal for other features, but log prominently
  } else {
    console.log('✅ review_likes table exists or was created');
  }

  app.listen(port, () =>
    console.log(`✅ API running on http://localhost:${port}`)
  );
});
