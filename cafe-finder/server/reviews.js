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

// Отримати всі відгуки (з опціональними фільтрами)
router.get('/reviews', (req, res) => {
  const { place_id, user_id } = req.query;
  let query = `SELECT r.*, u.id as user_id, u.name as user_name, u.avatar_url 
               FROM reviews r 
               JOIN users u ON r.user_id = u.id 
               WHERE 1=1`;
  const params = [];

  if (place_id) {
    query += ' AND r.place_id = ?';
    params.push(place_id);
  }
  if (user_id) {
    query += ' AND r.user_id = ?';
    params.push(user_id);
  }

  query += ' ORDER BY r.created_at DESC';

  db.query(query, params, (err, rows) => {
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
      res.json({ message: 'Відгук видалено' });
    });
  });
});

module.exports = router;

