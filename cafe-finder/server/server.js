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

const app = express();
app.use(cors());
app.use(express.json());

// 📌 Папка для збереження файлів (аватари)
const uploadRoot = path.join(__dirname, process.env.UPLOAD_DIR || 'uploads');
if (!fs.existsSync(uploadRoot)) {
  fs.mkdirSync(uploadRoot, { recursive: true });
}

// ✅ Роздача завантажених файлів
app.use('/uploads', express.static(uploadRoot));

// ✅ Підключаємо маршрути
app.use('/api', authRoutes);
app.use('/api', profileRoutes);
app.use('/api', reviewRoutes);
app.use('/api', listRoutes);


// ✅ Перевірка унікальності нікнейму
app.get('/api/check-nickname', (req, res) => {
  const { nickname } = req.query;
  if (!nickname) return res.status(400).json({ error: 'Нікнейм не надано' });
  
  db.query('SELECT id FROM users WHERE nickname = ?', [nickname], (err, rows) => {
    if (err) return res.status(500).json({ error: err.toString() });
    res.json({ available: rows.length === 0 });
  });
});

// ✅ Тестовий маршрут — перевірка з'єднання з БД
app.get('/api/health', (req, res) => {
  db.query('SELECT 1 AS ok', (err, rows) => {
    if (err) return res.status(500).json({ ok: false, error: err.toString() });
    res.json({ ok: true, db: rows[0].ok === 1 });
  });
});


// ✅ Запуск сервера
const port = process.env.PORT || 3001;
app.listen(port, () =>
  console.log(`✅ API running on http://localhost:${port}`)
);
