require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { initDB } = require('./db/init');

const authRoutes = require('./routes/auth');
const projectRoutes = require('./routes/projects');
const plotRoutes = require('./routes/plots');
const userRoutes = require('./routes/users');
const publicRoutes = require('./routes/public');

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/plots', plotRoutes);
app.use('/api/users', userRoutes);
app.use('/api/public', publicRoutes);

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 4000;

initDB().then(() => {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}).catch(err => {
  console.error('Failed to init DB:', err);
  process.exit(1);
});
