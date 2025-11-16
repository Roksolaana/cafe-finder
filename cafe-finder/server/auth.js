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
  try {
    const { name, surname, nickname, email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email і пароль обовʼязкові' });
    if (!nickname) return res.status(400).json({ error: 'Нікнейм обовʼязковий' });

    // Перевіряємо унікальність нікнейму
    db.query('SELECT id FROM users WHERE nickname = ?', [nickname], async (err, rows) => {
      if (err) {
        console.error('Помилка перевірки нікнейму:', err);
        return res.status(500).json({ error: 'Помилка сервера при перевірці нікнейму' });
      }
      if (rows.length > 0) {
        return res.status(400).json({ error: 'Нікнейм вже зайнятий. Оберіть інший.' });
      }

      // Перевіряємо унікальність email
      db.query('SELECT id FROM users WHERE email = ?', [email], async (err, emailRows) => {
        if (err) {
          console.error('Помилка перевірки email:', err);
          return res.status(500).json({ error: 'Помилка сервера при перевірці email' });
        }
        if (emailRows.length > 0) {
          return res.status(400).json({ error: 'Email вже використовується' });
        }

        try {
          const hash = await bcrypt.hash(password, 10);
          db.query(
            'INSERT INTO users (name, surname, nickname, email, password_hash) VALUES (?,?,?,?,?)',
            [name || null, surname || null, nickname, email, hash],
            (err, result) => {
              if (err) {
                console.error('Помилка створення користувача:', err);
                if (err.code === 'ER_DUP_ENTRY') {
                  if (err.message.includes('nickname')) {
                    return res.status(400).json({ error: 'Нікнейм вже зайнятий. Оберіть інший.' });
                  }
                  return res.status(400).json({ error: 'Email вже використовується' });
                }
                return res.status(500).json({ error: 'Помилка сервера при створенні користувача' });
              }
              const id = result.insertId;
              const token = signToken({ id });
              res.json({ token, user: { id, name, surname, nickname, email } });
            }
          );
        } catch (hashError) {
          console.error('Помилка хешування пароля:', hashError);
          return res.status(500).json({ error: 'Помилка сервера при обробці пароля' });
        }
      });
    });
  } catch (error) {
    console.error('Помилка реєстрації:', error);
    return res.status(500).json({ error: 'Внутрішня помилка сервера' });
  }
});

// ✅ Вхід (по email або нікнейму)
router.post('/login', (req, res) => {
  try {
    const { email, nickname, password } = req.body;
    const identifier = email || nickname; // Може бути email або nickname
    
    if (!identifier || !password) {
      return res.status(400).json({ error: 'Email/нікнейм і пароль обовʼязкові' });
    }
    
    // Шукаємо користувача по email або нікнейму
    db.query('SELECT * FROM users WHERE email=? OR nickname=?', [identifier, identifier], async (err, rows) => {
      if (err) {
        console.error('Помилка пошуку користувача:', err);
        return res.status(500).json({ error: 'Помилка сервера при пошуку користувача' });
      }
      
      if (!rows.length) return res.status(401).json({ error: 'Користувача не знайдено' });

      try {
        const user = rows[0];
        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) return res.status(401).json({ error: 'Невірний пароль' });

        const token = signToken({ id: user.id });
        res.json({ token, user: { id: user.id, name: user.name, surname: user.surname, nickname: user.nickname, email: user.email } });
      } catch (compareError) {
        console.error('Помилка порівняння пароля:', compareError);
        return res.status(500).json({ error: 'Помилка сервера при перевірці пароля' });
      }
    });
  } catch (error) {
    console.error('Помилка входу:', error);
    return res.status(500).json({ error: 'Внутрішня помилка сервера' });
  }
});

module.exports = router;
module.exports.authenticateToken = authenticateToken;
