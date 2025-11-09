const express = require('express');
const db = require('./db');
const { authenticateToken } = require('./auth');

const router = express.Router();

// Helpers
function mapListRow(row) {
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    description: row.description,
    is_public: !!row.is_public,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

// Create a new list
router.post('/lists', authenticateToken, (req, res) => {
  const { name, description, is_public } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'Назва списку обов\'язкова' });

  db.query(
    'INSERT INTO lists (user_id, name, description, is_public) VALUES (?, ?, ?, ?)',
    [req.user.id, name.trim(), description || null, is_public === undefined ? true : !!is_public],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.toString() });
      const id = result.insertId;
      db.query('SELECT * FROM lists WHERE id = ?', [id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.toString() });
        res.status(201).json({ list: mapListRow(rows[0]) });
      });
    }
  );
});

// Get current user's lists
router.get('/lists', authenticateToken, (req, res) => {
  db.query('SELECT * FROM lists WHERE user_id = ? ORDER BY created_at DESC', [req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.toString() });
    res.json({ lists: rows.map(mapListRow) });
  });
});

// Get public lists for a given user
router.get('/users/:userId/lists', (req, res) => {
  const { userId } = req.params;
  db.query('SELECT * FROM lists WHERE user_id = ? AND is_public = true ORDER BY created_at DESC', [userId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.toString() });
    res.json({ lists: rows.map(mapListRow) });
  });
});

// Get a list with items (if owner or public)
router.get('/lists/:id', authenticateTokenOptional, (req, res) => {
  const { id } = req.params;
  db.query('SELECT * FROM lists WHERE id = ?', [id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.toString() });
    if (!rows.length) return res.status(404).json({ error: 'Список не знайдено' });
    const list = rows[0];

    const isOwner = req.user && req.user.id === list.user_id;
    if (!list.is_public && !isOwner) {
      return res.status(403).json({ error: 'Цей список приватний' });
    }

    db.query('SELECT * FROM list_places WHERE list_id = ? ORDER BY added_at DESC', [id], (err, places) => {
      if (err) return res.status(500).json({ error: err.toString() });
      res.json({
        list: mapListRow(list),
        items: places.map(p => ({
          id: p.id,
          list_id: p.list_id,
          place_id: p.place_id,
          place_name: p.place_name,
          place_photo: p.place_photo,
          place_rating: p.place_rating,
          place_vicinity: p.place_vicinity,
          added_at: p.added_at
        }))
      });
    });
  });
});

// Update list (owner only)
router.put('/lists/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { name, description, is_public } = req.body || {};

  db.query('SELECT user_id FROM lists WHERE id = ?', [id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.toString() });
    if (!rows.length) return res.status(404).json({ error: 'Список не знайдено' });
    if (rows[0].user_id !== req.user.id) return res.status(403).json({ error: 'Немає прав' });

    const fields = [];
    const values = [];
    if (name !== undefined) { fields.push('name = ?'); values.push(name); }
    if (description !== undefined) { fields.push('description = ?'); values.push(description); }
    if (is_public !== undefined) { fields.push('is_public = ?'); values.push(!!is_public); }

    if (!fields.length) return res.status(400).json({ error: 'Немає даних для оновлення' });

    values.push(id);
    db.query(`UPDATE lists SET ${fields.join(', ')} WHERE id = ?`, values, (err) => {
      if (err) return res.status(500).json({ error: err.toString() });
      db.query('SELECT * FROM lists WHERE id = ?', [id], (err, rows2) => {
        if (err) return res.status(500).json({ error: err.toString() });
        res.json({ list: mapListRow(rows2[0]) });
      });
    });
  });
});

// Delete list (owner only)
router.delete('/lists/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  db.query('SELECT user_id FROM lists WHERE id = ?', [id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.toString() });
    if (!rows.length) return res.status(404).json({ error: 'Список не знайдено' });
    if (rows[0].user_id !== req.user.id) return res.status(403).json({ error: 'Немає прав' });

    db.query('DELETE FROM lists WHERE id = ?', [id], (err) => {
      if (err) return res.status(500).json({ error: err.toString() });
      res.json({ message: 'Список видалено' });
    });
  });
});

// Add place to list (owner only)
router.post('/lists/:id/items', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { place_id, place_name, place_photo, place_rating, place_vicinity } = req.body || {};
  if (!place_id) return res.status(400).json({ error: 'place_id обов\'язковий' });

  db.query('SELECT user_id FROM lists WHERE id = ?', [id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.toString() });
    if (!rows.length) return res.status(404).json({ error: 'Список не знайдено' });
    if (rows[0].user_id !== req.user.id) return res.status(403).json({ error: 'Немає прав' });

    db.query(
      'INSERT INTO list_places (list_id, place_id, place_name, place_photo, place_rating, place_vicinity) VALUES (?, ?, ?, ?, ?, ?)',
      [id, place_id, place_name || null, place_photo || null, place_rating || null, place_vicinity || null],
      (err, result) => {
        if (err) {
          if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: 'Це місце вже є у списку' });
          }
          return res.status(500).json({ error: err.toString() });
        }
        db.query('SELECT * FROM list_places WHERE id = ?', [result.insertId], (err, rows2) => {
          if (err) return res.status(500).json({ error: err.toString() });
          res.status(201).json({ item: rows2[0] });
        });
      }
    );
  });
});

// Remove place from list (owner only)
router.delete('/lists/:id/items/:placeId', authenticateToken, (req, res) => {
  const { id, placeId } = req.params;
  db.query('SELECT user_id FROM lists WHERE id = ?', [id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.toString() });
    if (!rows.length) return res.status(404).json({ error: 'Список не знайдено' });
    if (rows[0].user_id !== req.user.id) return res.status(403).json({ error: 'Немає прав' });

    db.query('DELETE FROM list_places WHERE list_id = ? AND place_id = ?', [id, placeId], (err, result) => {
      if (err) return res.status(500).json({ error: err.toString() });
      if (result.affectedRows === 0) return res.status(404).json({ error: 'Місце не знайдено у списку' });
      res.json({ message: 'Місце видалено зі списку' });
    });
  });
});

// Optional auth that does not fail when no token is provided
function authenticateTokenOptional(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return next();
  const token = authHeader.split(' ')[1];
  if (!token) return next();

  const jwt = require('jsonwebtoken');
  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production', (err, user) => {
    if (!err) req.user = user;
    next();
  });
}

module.exports = router;
