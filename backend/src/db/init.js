const mysql = require('mysql2/promise');

const pool = mysql.createPool(process.env.DATABASE_URL);;

async function initDB() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS users (
        id            INT AUTO_INCREMENT PRIMARY KEY,
        name          VARCHAR(100)  NOT NULL,
        email         VARCHAR(255)  UNIQUE NOT NULL,
        password_hash VARCHAR(255)  NOT NULL,
        role          VARCHAR(20)   NOT NULL DEFAULT 'viewer',
        created_at    DATETIME      DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        name        VARCHAR(255) NOT NULL,
        description TEXT,
        owner_id    INT,
        boundary    JSON,
        share_token VARCHAR(64) UNIQUE DEFAULT NULL,
        created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS project_members (
        project_id INT NOT NULL,
        user_id    INT NOT NULL,
        role       VARCHAR(20) DEFAULT 'viewer',
        PRIMARY KEY (project_id, user_id),
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE
      )
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS roads (
        id         INT AUTO_INCREMENT PRIMARY KEY,
        project_id INT NOT NULL,
        pts        JSON NOT NULL,
        width      INT  DEFAULT 8,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      )
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS plots (
        id            INT AUTO_INCREMENT PRIMARY KEY,
        project_id    INT           NOT NULL,
        plot_number   VARCHAR(50)   NOT NULL,
        pts           JSON          NOT NULL,
        area          DECIMAL(10,2),
        facing        VARCHAR(20),
        customer_name VARCHAR(255),
        status        VARCHAR(30)   DEFAULT 'Available',
        price         DECIMAL(12,2),
        notes         TEXT,
        created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      )
    `);
    console.log('Database initialized');
  } finally {
    conn.release();
  }
}

module.exports = { pool, initDB };

// Migration: add share_token to existing databases
async function migrateDB() {
  const conn = await pool.getConnection();
  try {
    const [cols] = await conn.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'projects' AND COLUMN_NAME = 'share_token'
    `);
    if (!cols.length) {
      await conn.query('ALTER TABLE projects ADD COLUMN share_token VARCHAR(64) UNIQUE DEFAULT NULL');
      console.log('Migration: added share_token column');
    }
  } finally {
    conn.release();
  }
}

const _origInitDB = module.exports.initDB;
module.exports.initDB = async function() {
  await initDB();
  await migrateDB();
};
