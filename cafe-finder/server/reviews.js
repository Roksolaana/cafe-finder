const express = require('express');
const db = require('./db');
const auth = require('./auth');
const authenticateToken = auth.authenticateToken;

const router = express.Router();

// Створити відгук
router.post('/reviews', authenticateToken, (req, res) => {
  const { place_id, place_name, rating, comment } = req.body;

  if (!place_id || !rating) {
    return res.status(400).json({ error: 'place_id та rating обов\'язкові' });
  }

  if (rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'Рейтинг повинен бути від 1 до 5' });
  }

  // Перевіряємо, чи користувач вже залишив відгук для цього місця
  db.query(
    'SELECT id FROM reviews WHERE user_id = ? AND place_id = ?',
    [req.user.id, place_id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.toString() });

      if (rows.length > 0) {
        // Оновлюємо існуючий відгук
        db.query(
          'UPDATE reviews SET rating = ?, comment = ?, place_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [rating, comment || null, place_name || null, rows[0].id],
          (err) => {
            if (err) return res.status(500).json({ error: err.toString() });
            
            db.query('SELECT * FROM reviews WHERE id = ?', [rows[0].id], (err, reviewRows) => {
              if (err) return res.status(500).json({ error: err.toString() });
              
              // Отримуємо дані користувача
              db.query('SELECT id, name, avatar_url FROM users WHERE id = ?', [req.user.id], (err, userRows) => {
                if (err) return res.status(500).json({ error: err.toString() });
                const user = userRows[0];
                
                res.json({
                  review: {
                    ...reviewRows[0],
                    user: {
                      id: user.id,
                      name: user.name,
                      avatar_url: user.avatar_url
                    }
                  }
                });
              });
            });
          }
        );
      } else {
        // Створюємо новий відгук
        db.query(
          'INSERT INTO reviews (user_id, place_id, place_name, rating, comment) VALUES (?, ?, ?, ?, ?)',
          [req.user.id, place_id, place_name || null, rating, comment || null],
          (err, result) => {
            if (err) return res.status(500).json({ error: err.toString() });

            const reviewId = result.insertId;
            db.query('SELECT * FROM reviews WHERE id = ?', [reviewId], (err, reviewRows) => {
              if (err) return res.status(500).json({ error: err.toString() });

              // Отримуємо дані користувача
              db.query('SELECT id, name, avatar_url FROM users WHERE id = ?', [req.user.id], (err, userRows) => {
                if (err) return res.status(500).json({ error: err.toString() });
                const user = userRows[0];

                res.status(201).json({
                  review: {
                    ...reviewRows[0],
                    user: {
                      id: user.id,
                      name: user.name,
                      avatar_url: user.avatar_url
                    }
                  }
                });
              });
            });
          }
        );
      }
    }
  );
});

// Отримати відгуки для конкретного місця
router.get('/reviews/place/:place_id', (req, res) => {
  const { place_id } = req.params;

  db.query(
    `SELECT r.*, u.id as user_id, u.name as user_name, u.avatar_url 
     FROM reviews r 
     JOIN users u ON r.user_id = u.id 
     WHERE r.place_id = ? 
     ORDER BY r.created_at DESC`,
    [place_id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.toString() });

      res.json({
        reviews: rows.map(row => ({
          id: row.id,
          place_id: row.place_id,
          place_name: row.place_name,
          rating: row.rating,
          comment: row.comment,
          created_at: row.created_at,
          updated_at: row.updated_at,
          user: {
            id: row.user_id,
            name: row.user_name,
            avatar_url: row.avatar_url
          }
        }))
      });
    }
  );
});

// Middleware для опціональної автентифікації
function authenticateTokenOptional(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return next();
  
  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production');
    req.user = decoded;
    next();
  } catch (err) {
    next();
  }
}

// Отримати всі відгуки (з опціональними фільтрами) - ВИПРАВЛЕНО
router.get('/reviews', authenticateTokenOptional, (req, res) => {
  const { place_id, user_id } = req.query;
  const currentUserId = req.user?.id || null;
  
  const params = [];
  
  // Будуємо запит - ВИПРАВЛЕНО GROUP BY
  let query = `
    SELECT 
      r.id,
      r.user_id,
      r.place_id,
      r.place_name,
      r.rating,
      r.comment,
      r.created_at,
      r.updated_at,
      u.id as user_id,
      u.name as user_name,
      u.avatar_url,
      COUNT(DISTINCT rl.id) as likes_count`;
  
  if (currentUserId) {
    query += `, MAX(CASE WHEN rl.user_id = ? THEN 1 ELSE 0 END) as is_liked`;
    params.push(currentUserId);
  } else {
    query += `, 0 as is_liked`;
  }
  
  query += `
    FROM reviews r 
    JOIN users u ON r.user_id = u.id 
    LEFT JOIN review_likes rl ON r.id = rl.review_id
    WHERE 1=1`;

  if (place_id) {
    query += ' AND r.place_id = ?';
    params.push(place_id);
  }
  if (user_id) {
    query += ' AND r.user_id = ?';
    params.push(user_id);
  }

  query += ` GROUP BY r.id, r.user_id, r.place_id, r.place_name, r.rating, 
             r.comment, r.created_at, r.updated_at, u.id, u.name, u.avatar_url
             ORDER BY r.created_at DESC`;

  db.query(query, params, (err, rows) => {
    if (err) {
      console.error('Помилка завантаження відгуків:', err);
      return res.status(500).json({ error: err.toString() });
    }

    res.json({
      reviews: rows.map(row => ({
        id: row.id,
        place_id: row.place_id,
        place_name: row.place_name,
        rating: row.rating,
        comment: row.comment,
        created_at: row.created_at,
        updated_at: row.updated_at,
        likes_count: parseInt(row.likes_count) || 0,
        is_liked: row.is_liked === 1 || row.is_liked === true,
        user: {
          id: row.user_id,
          name: row.user_name,
          avatar_url: row.avatar_url
        }
      }))
    });
  });
});

// Видалити свій відгук
router.delete('/reviews/:id', authenticateToken, (req, res) => {
  const { id } = req.params;

  db.query('SELECT user_id FROM reviews WHERE id = ?', [id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.toString() });
    if (!rows.length) return res.status(404).json({ error: 'Відгук не знайдено' });
    if (rows[0].user_id !== req.user.id) {
      return res.status(403).json({ error: 'Ви не можете видалити чужий відгук' });
    }

    db.query('DELETE FROM reviews WHERE id = ?', [id], (err) => {
      if (err) return res.status(500).json({ error: err.toString() });
      res.json({ message: '✅ Відгук видалено' });
    });
  });
});

// Поставити/прибрати лайк відгуку
router.post('/reviews/:id/like', authenticateToken, (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  // Перевіряємо, чи існує відгук
  db.query('SELECT id FROM reviews WHERE id = ?', [id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.toString() });
    if (!rows.length) return res.status(404).json({ error: 'Відгук не знайдено' });

    // Перевіряємо, чи вже є лайк
    db.query('SELECT id FROM review_likes WHERE review_id = ? AND user_id = ?', [id, userId], (err, likeRows) => {
      if (err) return res.status(500).json({ error: err.toString() });

      if (likeRows.length > 0) {
        // Прибираємо лайк
        db.query('DELETE FROM review_likes WHERE review_id = ? AND user_id = ?', [id, userId], (err) => {
          if (err) return res.status(500).json({ error: err.toString() });
          
          // Отримуємо оновлену кількість лайків
          db.query('SELECT COUNT(*) as count FROM review_likes WHERE review_id = ?', [id], (err, countRows) => {
            if (err) return res.status(500).json({ error: err.toString() });
            res.json({ liked: false, likes_count: countRows[0].count });
          });
        });
      } else {
        // Додаємо лайк
        db.query('INSERT INTO review_likes (review_id, user_id) VALUES (?, ?)', [id, userId], (err) => {
          if (err) return res.status(500).json({ error: err.toString() });
          
          // Отримуємо оновлену кількість лайків
          db.query('SELECT COUNT(*) as count FROM review_likes WHERE review_id = ?', [id], (err, countRows) => {
            if (err) return res.status(500).json({ error: err.toString() });
            res.json({ liked: true, likes_count: countRows[0].count });
          });
        });
      }
    });
  });
});

module.exports = router;