const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('./db');
const auth = require('./auth');
const authenticateToken = auth.authenticateToken;

const router = express.Router();

// Налаштування multer для завантаження файлів
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, process.env.UPLOAD_DIR || 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'avatar-' + req.user.id + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Дозволені тільки зображення (jpeg, jpg, png, gif, webp)'));
  }
});

// Отримати профіль поточного користувача
router.get('/profile', authenticateToken, (req, res) => {
  db.query('SELECT id, name, surname, nickname, email, avatar_url, created_at FROM users WHERE id = ?', [req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.toString() });
    if (!rows.length) return res.status(404).json({ error: 'Користувача не знайдено' });
    
    const user = rows[0];
    let avatarPath = null;
    if (user.avatar_url) {
      const fileName = path.basename(user.avatar_url);
      avatarPath = `/uploads/${fileName}`;
    }
    res.json({
      user: {
        ...user,
        avatar_url: avatarPath
      }
    });
  });
});

// Оновити профіль
router.put('/profile', authenticateToken, (req, res) => {
  const { name, surname, nickname, email } = req.body;
  
  // Перевіряємо, чи є дані для оновлення
  if (name === undefined && surname === undefined && nickname === undefined && email === undefined) {
    return res.status(400).json({ error: 'Немає даних для оновлення' });
  }

  // Спочатку отримуємо поточні дані користувача
  db.query('SELECT nickname, email FROM users WHERE id = ?', [req.user.id], (err, userRows) => {
    if (err) return res.status(500).json({ error: err.toString() });
    if (!userRows.length) return res.status(404).json({ error: 'Користувача не знайдено' });
    
    const currentUser = userRows[0];
    const updates = [];
    const values = [];

    // Додаємо поля для оновлення (окрім nickname та email, які потребують перевірки)
    // ВАЖЛИВО: created_at НЕ повинно оновлюватися - воно залишається незмінним
    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name || null);
    }
    if (surname !== undefined) {
      updates.push('surname = ?');
      values.push(surname || null);
    }

    // Функція для виконання оновлення
    const processUpdate = () => {
      if (updates.length === 0) {
        return res.status(400).json({ error: 'Немає даних для оновлення' });
      }

      const finalValues = [...values];
      finalValues.push(req.user.id);

      // Переконуємося, що created_at не оновлюється
      // (воно не повинно бути в updates, але для впевненості перевіряємо)
      const updateQuery = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
      
      db.query(
        updateQuery,
        finalValues,
        (err) => {
          if (err) {
            if (err.code === 'ER_DUP_ENTRY') {
              if (err.message.includes('nickname')) {
                return res.status(400).json({ error: 'Нікнейм вже зайнятий. Оберіть інший.' });
              }
              if (err.message.includes('email')) {
                return res.status(400).json({ error: 'Email вже використовується' });
              }
            }
            return res.status(500).json({ error: err.toString() });
          }
          
          // Повертаємо оновлені дані
          db.query('SELECT id, name, surname, nickname, email, avatar_url, created_at FROM users WHERE id = ?', [req.user.id], (err, rows) => {
            if (err) return res.status(500).json({ error: err.toString() });
            const user = rows[0];
            let avatarPath = null;
            if (user.avatar_url) {
              const fileName = path.basename(user.avatar_url);
              avatarPath = `/uploads/${fileName}`;
            }
            res.json({
              user: {
                ...user,
                avatar_url: avatarPath
              }
            });
          });
        }
      );
    };

    // Перевіряємо нікнейм, якщо він переданий
    if (nickname !== undefined) {
      // Якщо нікнейм не змінився, просто додаємо його
      if (currentUser.nickname === nickname) {
        updates.push('nickname = ?');
        values.push(nickname);
        // Перевіряємо email, якщо він переданий
        if (email !== undefined) {
          if (currentUser.email === email) {
            updates.push('email = ?');
            values.push(email);
            processUpdate();
          } else {
            // Перевіряємо унікальність email
            db.query('SELECT id FROM users WHERE email = ? AND id != ?', [email, req.user.id], (err, emailRows) => {
              if (err) return res.status(500).json({ error: err.toString() });
              if (emailRows.length > 0) {
                return res.status(400).json({ error: 'Email вже використовується' });
              }
              updates.push('email = ?');
              values.push(email);
              processUpdate();
            });
          }
        } else {
          processUpdate();
        }
      } else {
        // Перевіряємо унікальність нікнейму
        db.query('SELECT id FROM users WHERE nickname = ? AND id != ?', [nickname, req.user.id], (err, nicknameRows) => {
          if (err) return res.status(500).json({ error: err.toString() });
          if (nicknameRows.length > 0) {
            return res.status(400).json({ error: 'Нікнейм вже зайнятий. Оберіть інший.' });
          }
          
          updates.push('nickname = ?');
          values.push(nickname);
          
          // Перевіряємо email, якщо він переданий
          if (email !== undefined) {
            if (currentUser.email === email) {
              updates.push('email = ?');
              values.push(email);
              processUpdate();
            } else {
              // Перевіряємо унікальність email
              db.query('SELECT id FROM users WHERE email = ? AND id != ?', [email, req.user.id], (err, emailRows) => {
                if (err) return res.status(500).json({ error: err.toString() });
                if (emailRows.length > 0) {
                  return res.status(400).json({ error: 'Email вже використовується' });
                }
                updates.push('email = ?');
                values.push(email);
                processUpdate();
              });
            }
          } else {
            processUpdate();
          }
        });
      }
    } else {
      // Нікнейм не переданий, перевіряємо тільки email
      if (email !== undefined) {
        if (currentUser.email === email) {
          updates.push('email = ?');
          values.push(email);
          processUpdate();
        } else {
          // Перевіряємо унікальність email
          db.query('SELECT id FROM users WHERE email = ? AND id != ?', [email, req.user.id], (err, emailRows) => {
            if (err) return res.status(500).json({ error: err.toString() });
            if (emailRows.length > 0) {
              return res.status(400).json({ error: 'Email вже використовується' });
            }
            updates.push('email = ?');
            values.push(email);
            processUpdate();
          });
        }
      } else {
        processUpdate();
      }
    }
  });
});

// Завантажити аватар
router.post('/profile/avatar', authenticateToken, upload.single('avatar'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Файл не завантажено' });
  }

  const avatarFileName = req.file.filename;
  const avatarUrl = path.join(process.env.UPLOAD_DIR || 'uploads', avatarFileName);

  // Видаляємо старий аватар якщо він є
  db.query('SELECT avatar_url FROM users WHERE id = ?', [req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.toString() });

    const oldAvatar = rows[0]?.avatar_url;
    if (oldAvatar) {
      const oldFileName = path.basename(oldAvatar);
      const oldPath = path.join(__dirname, process.env.UPLOAD_DIR || 'uploads', oldFileName);
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }

    // Оновлюємо БД - зберігаємо тільки ім'я файла
    db.query('UPDATE users SET avatar_url = ? WHERE id = ?', [avatarUrl, req.user.id], (err) => {
      if (err) return res.status(500).json({ error: err.toString() });

      res.json({
        avatar_url: `/uploads/${avatarFileName}`
      });
    });
  });
});

module.exports = router;

