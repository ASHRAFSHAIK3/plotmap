const router = require('express').Router();
const { pool } = require('../db/init');
const { authenticate } = require('../middleware/auth');

// Update single plot
router.put('/:id', authenticate, async (req, res) => {
  const { plot_number, area, facing, customer_name, status, price, notes, pts } = req.body;
  try {
    await pool.query(`
      UPDATE plots SET
        plot_number=COALESCE(?,plot_number),
        area=COALESCE(?,area),
        facing=COALESCE(?,facing),
        customer_name=COALESCE(?,customer_name),
        status=COALESCE(?,status),
        price=COALESCE(?,price),
        notes=COALESCE(?,notes),
        pts=COALESCE(?,pts),
        updated_at=NOW()
      WHERE id=?
    `, [plot_number, area, facing, customer_name, status, price, notes,
        pts ? JSON.stringify(pts) : null, req.params.id]);
    const [rows] = await pool.query('SELECT * FROM plots WHERE id=?', [req.params.id]);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Get plots summary for export
router.get('/project/:projectId/export', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM plots WHERE project_id=? ORDER BY plot_number',
      [req.params.projectId]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
