const router = require('express').Router();
const { pool } = require('../db/init');
const { authenticate, requireAdmin } = require('../middleware/auth');

// Get all projects for current user
router.get('/', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT p.*, u.name AS owner_name,
        (SELECT COUNT(*) FROM plots WHERE project_id=p.id) AS plot_count
      FROM projects p
      LEFT JOIN users u ON u.id=p.owner_id
      WHERE p.owner_id=?
        OR p.id IN (SELECT project_id FROM project_members WHERE user_id=?)
      ORDER BY p.updated_at DESC
    `, [req.user.id, req.user.id]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Get single project with full data
router.get('/:id', authenticate, async (req, res) => {
  try {
    const [proj] = await pool.query(`
      SELECT p.*, u.name AS owner_name FROM projects p
      LEFT JOIN users u ON u.id=p.owner_id
      WHERE p.id=? AND (p.owner_id=? OR p.id IN (SELECT project_id FROM project_members WHERE user_id=?))
    `, [req.params.id, req.user.id, req.user.id]);
    if (!proj.length) return res.status(404).json({ error: 'Project not found' });

    const [plots]   = await pool.query('SELECT * FROM plots WHERE project_id=? ORDER BY id', [req.params.id]);
    const [roads]   = await pool.query('SELECT * FROM roads WHERE project_id=? ORDER BY id', [req.params.id]);
    const [members] = await pool.query(`
      SELECT u.id,u.name,u.email,pm.role FROM project_members pm
      JOIN users u ON u.id=pm.user_id WHERE pm.project_id=?
    `, [req.params.id]);

    res.json({ ...proj[0], plots, roads, members });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Create project
router.post('/', authenticate, async (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  try {
    const [result] = await pool.query(
      'INSERT INTO projects (name,description,owner_id) VALUES (?,?,?)',
      [name, description || '', req.user.id]
    );
    const [rows] = await pool.query('SELECT * FROM projects WHERE id=?', [result.insertId]);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Update project
router.put('/:id', authenticate, async (req, res) => {
  const { name, description, boundary } = req.body;
  try {
    const [result] = await pool.query(`
      UPDATE projects SET
        name=COALESCE(?,name),
        description=COALESCE(?,description),
        boundary=COALESCE(?,boundary),
        updated_at=NOW()
      WHERE id=? AND owner_id=?
    `, [name, description, boundary ? JSON.stringify(boundary) : null, req.params.id, req.user.id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Not found or not authorized' });
    const [rows] = await pool.query('SELECT * FROM projects WHERE id=?', [req.params.id]);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Delete project
router.delete('/:id', authenticate, async (req, res) => {
  try {
    await pool.query('DELETE FROM projects WHERE id=? AND owner_id=?', [req.params.id, req.user.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Save full layout (bulk upsert plots + roads + boundary)
router.post('/:id/save-layout', authenticate, async (req, res) => {
  const { boundary, plots, roads } = req.body;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('UPDATE projects SET boundary=?, updated_at=NOW() WHERE id=?',
      [JSON.stringify(boundary), req.params.id]);
    await conn.query('DELETE FROM roads WHERE project_id=?', [req.params.id]);
    for (const r of (roads || [])) {
      await conn.query('INSERT INTO roads (project_id,pts,width) VALUES (?,?,?)',
        [req.params.id, JSON.stringify(r.pts), r.width || 8]);
    }
    await conn.query('DELETE FROM plots WHERE project_id=?', [req.params.id]);
    for (const p of (plots || [])) {
      await conn.query(`
        INSERT INTO plots (project_id,plot_number,pts,area,facing,customer_name,status,price,notes)
        VALUES (?,?,?,?,?,?,?,?,?)
      `, [req.params.id, p.num, JSON.stringify(p.pts), p.area, p.facing,
          p.customer || '', p.status || 'Available', p.price || null, p.notes || '']);
    }
    await conn.commit();
    res.json({ success: true, plotCount: (plots||[]).length });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: e.message });
  } finally { conn.release(); }
});

// Add member
router.post('/:id/members', authenticate, async (req, res) => {
  const { email, role = 'viewer' } = req.body;
  try {
    const [proj] = await pool.query('SELECT id FROM projects WHERE id=? AND owner_id=?', [req.params.id, req.user.id]);
    if (!proj.length) return res.status(403).json({ error: 'Not authorized' });
    const [user] = await pool.query('SELECT id FROM users WHERE email=?', [email]);
    if (!user.length) return res.status(404).json({ error: 'User not found' });
    await pool.query(
      'INSERT INTO project_members (project_id,user_id,role) VALUES (?,?,?) ON DUPLICATE KEY UPDATE role=?',
      [req.params.id, user[0].id, role, role]
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

// Generate / get share token
router.post('/:id/share-link', authenticate, async (req, res) => {
  try {
    const [proj] = await pool.query('SELECT id, owner_id, share_token FROM projects WHERE id=?', [req.params.id]);
    if (!proj.length) return res.status(404).json({ error: 'Project not found' });
    if (proj[0].owner_id !== req.user.id && req.user.role !== 'admin')
      return res.status(403).json({ error: 'Not authorized' });

    // Reuse existing token or generate new one
    let token = proj[0].share_token;
    if (!token) {
      token = require('crypto').randomBytes(20).toString('hex');
      await pool.query('UPDATE projects SET share_token=? WHERE id=?', [token, req.params.id]);
    }
    res.json({ token });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Revoke share token
router.delete('/:id/share-link', authenticate, async (req, res) => {
  try {
    await pool.query('UPDATE projects SET share_token=NULL WHERE id=? AND owner_id=?',
      [req.params.id, req.user.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
