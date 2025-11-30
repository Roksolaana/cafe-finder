const express = require('express');
const db = require('./db');
const auth = require('./auth');
const authenticateToken = auth.authenticateToken;

const router = express.Router();

// Отримати всі улюблені користувача
router.get('/favorites', authenticateToken, (req, res) => {
  db.query(
    `SELECT id, place_id, place_name, place_photo, place_rating, place_vicinity, 
            place_geometry_lat, place_geometry_lng, added_at
     FROM user_favorites 
     WHERE user_id = ? 
     ORDER BY added_at DESC`,
    [req.user.id],
    (err, rows) => {
      if (err) {
        console.error('Помилка завантаження улюблених:', err);
        return res.status(500).json({ error: err.toString() });
      }

      const favorites = rows.map(row => ({
        id: row.place_id,
        place_id: row.place_id,
        name: row.place_name,
        rating: row.place_rating ? parseFloat(row.place_rating) : null,
        vicinity: row.place_vicinity,
        photo: row.place_photo,
        geometry: (row.place_geometry_lat && row.place_geometry_lng) ? {
          location: {
            lat: parseFloat(row.place_geometry_lat),
            lng: parseFloat(row.place_geometry_lng)
          }
        } : null,
        added_at: row.added_at
      }));

      res.json({ favorites });
    }
  );
});

// Додати до улюблених
router.post('/favorites', authenticateToken, (req, res) => {
  const { place_id, place_name, place_photo, place_rating, place_vicinity, geometry } = req.body;

  if (!place_id || !place_name) {
    return res.status(400).json({ error: 'place_id та place_name обов\'язкові' });
  }

  // Перевіряємо, чи вже є в улюблених
  db.query(
    'SELECT id FROM user_favorites WHERE user_id = ? AND place_id = ?',
    [req.user.id, place_id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.toString() });
      
      if (rows.length > 0) {
        return res.status(400).json({ error: 'Це місце вже в улюблених' });
      }

      // Додаємо до улюблених
      let lat = null;
      let lng = null;
      
      if(geometry && geometry.location) {
        // Може бути функція lat()/lng() або число
        if(typeof geometry.location.lat === 'function') {
          lat = geometry.location.lat();
          lng = geometry.location.lng();
        } else {
          lat = geometry.location.lat;
          lng = geometry.location.lng;
        }
      }

      let normalizedPhoto = place_photo || null;
      if (normalizedPhoto && typeof normalizedPhoto === 'string') {
        if (normalizedPhoto.startsWith('data:') || normalizedPhoto.length > 4000) {
          normalizedPhoto = null; // Google data URLs можуть бути дуже довгими
        }
      }

      db.query(
        `INSERT INTO user_favorites 
         (user_id, place_id, place_name, place_photo, place_rating, place_vicinity, place_geometry_lat, place_geometry_lng)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.user.id, place_id, place_name, normalizedPhoto, place_rating || null, place_vicinity || null, lat, lng],
        (err, result) => {
          if (err) {
            console.error('Помилка додавання до улюблених:', err);
            return res.status(500).json({ error: err.toString() });
          }

          res.status(201).json({
            message: 'Додано до улюблених',
            favorite: {
              id: place_id,
              place_id: place_id,
              name: place_name,
              rating: place_rating,
              vicinity: place_vicinity,
              photo: place_photo,
              geometry: geometry
            }
          });
        }
      );
    }
  );
});

// Видалити з улюблених
router.delete('/favorites/:place_id', authenticateToken, (req, res) => {
  const { place_id } = req.params;

  db.query(
    'DELETE FROM user_favorites WHERE user_id = ? AND place_id = ?',
    [req.user.id, place_id],
    (err, result) => {
      if (err) {
        console.error('Помилка видалення з улюблених:', err);
        return res.status(500).json({ error: err.toString() });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Місце не знайдено в улюблених' });
      }

      res.json({ message: 'Видалено з улюблених' });
    }
  );
});

// Перевірити, чи місце в улюблених
router.get('/favorites/check/:place_id', authenticateToken, (req, res) => {
  const { place_id } = req.params;

  db.query(
    'SELECT id FROM user_favorites WHERE user_id = ? AND place_id = ?',
    [req.user.id, place_id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.toString() });
      res.json({ isFavorite: rows.length > 0 });
    }
  );
});

module.exports = router;

