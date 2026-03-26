const router = require('express').Router();
const { pool } = require('../db/init');
const { authenticate, requireAdmin } = require('../middleware/auth');

// Get all users (admin only)
router.get('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id,name,email,role,created_at FROM users ORDER BY created_at DESC');
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Update user role (admin only)
router.put('/:id/role', authenticate, requireAdmin, async (req, res) => {
  const { role } = req.body;
  if (!['admin','viewer'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  try {
    await pool.query('UPDATE users SET role=? WHERE id=?', [role, req.params.id]);
    const [rows] = await pool.query('SELECT id,name,email,role FROM users WHERE id=?', [req.params.id]);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
