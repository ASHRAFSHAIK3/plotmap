const router = require('express').Router();
const { pool } = require('../db/init');

// Get project by share token (no auth needed)
router.get('/:token', async (req, res) => {
  try {
    const [proj] = await pool.query(
      'SELECT * FROM projects WHERE share_token=?',
      [req.params.token]
    );
    if (!proj.length) return res.status(404).json({ error: 'Project not found or link expired' });

    const project = proj[0];
    const [plots] = await pool.query('SELECT * FROM plots WHERE project_id=? ORDER BY id', [project.id]);
    const [roads] = await pool.query('SELECT * FROM roads WHERE project_id=? ORDER BY id', [project.id]);

    res.json({ ...project, plots, roads });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
