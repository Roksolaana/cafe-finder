const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('./db');

const router = express.Router();

function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET || 'your-secret-key-change-in-production', { expiresIn: '1d' });
}

// Middleware для перевірки JWT токена
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Токен не надано' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production', (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Невірний або прострочений токен' });
    }
    req.user = user;
    next();
  });
}

// ✅ Реєстрація
router.post('/register', async (req, res) => {
  const { name, surname, nickname, email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email і пароль обовʼязкові' });
  if (!nickname) return res.status(400).json({ error: 'Нікнейм обовʼязковий' });

  // Перевіряємо унікальність нікнейму
  db.query('SELECT id FROM users WHERE nickname = ?', [nickname], async (err, rows) => {
    if (err) return res.status(500).json({ error: err.toString() });
    if (rows.length > 0) {
      return res.status(400).json({ error: 'Нікнейм вже зайнятий. Оберіть інший.' });
    }

    // Перевіряємо унікальність email
    db.query('SELECT id FROM users WHERE email = ?', [email], async (err, emailRows) => {
      if (err) return res.status(500).json({ error: err.toString() });
      if (emailRows.length > 0) {
        return res.status(400).json({ error: 'Email вже використовується' });
      }

      const hash = await bcrypt.hash(password, 10);
      db.query(
        'INSERT INTO users (name, surname, nickname, email, password_hash) VALUES (?,?,?,?,?)',
        [name || null, surname || null, nickname, email, hash],
        (err, result) => {
          if (err) {
            if (err.code === 'ER_DUP_ENTRY') {
              if (err.message.includes('nickname')) {
                return res.status(400).json({ error: 'Нікнейм вже зайнятий. Оберіть інший.' });
              }
              return res.status(400).json({ error: 'Email вже використовується' });
            }
            return res.status(400).json({ error: err.toString() });
          }
          const id = result.insertId;
          const token = signToken({ id });
          res.json({ token, user: { id, name, surname, nickname, email } });
        }
      );
    });
  });
});

// ✅ Вхід
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  db.query('SELECT * FROM users WHERE email=?', [email], async (err, rows) => {
    if (!rows.length) return res.status(401).json({ error: 'Користувача не знайдено' });

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Невірний пароль' });

    const token = signToken({ id: user.id });
    res.json({ token, user: { id: user.id, name: user.name, surname: user.surname, nickname: user.nickname, email: user.email } });
  });
});

module.exports = router;
module.exports.authenticateToken = authenticateToken;
