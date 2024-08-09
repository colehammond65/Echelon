require('dotenv').config();
const mariadb = require('mariadb');
const util = require('util');

// Database connection configuration
const pool = mariadb.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectionLimit: 20, // Increase if needed
  acquireTimeout: 5000 // Increase if necessary
});

// Utility function to run SQL queries
async function query(sql, params) {
  let conn;
  try {
    conn = await pool.getConnection();
    const rows = await conn.query(sql, params);
    return rows;
  } catch (err) {
    console.error('Database query error:', err);
    throw err;
  } finally {
    if (conn) conn.end();
  }
}

// Function to initialize the database
async function initializeDatabase() {
  try {
    // Create the database if it doesn't exist
    await query(`CREATE DATABASE IF NOT EXISTS ${process.env.DB_NAME}`);
    await query(`USE ${process.env.DB_NAME}`);

    // Create tables if they don't exist
    await query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(255) PRIMARY KEY,
        username VARCHAR(255),
        avatar VARCHAR(255)
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS settings (
        id VARCHAR(255) PRIMARY KEY,
        server VARCHAR(255),
        twitch_channel VARCHAR(255),
        notification_channel VARCHAR(255)
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS user_guilds (
        user_id VARCHAR(255),
        guild_id VARCHAR(255),
        PRIMARY KEY (user_id, guild_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    console.log('Database setup completed.');
  } catch (err) {
    console.error('Error initializing database:', err);
    throw err;
  }
}

// Function to add or update a user
async function addOrUpdateUser(id, username, avatar) {
  await query('INSERT INTO users (id, username, avatar) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE username = VALUES(username), avatar = VALUES(avatar)', [id, username, avatar]);
}

// Function to get settings for a user
async function getSettings(userId) {
  const rows = await query('SELECT * FROM settings WHERE id = ?', [userId]);
  return rows[0] || {};
}

// Function to update settings for a user
async function updateSettings(userId, server, twitchChannel, notificationChannel) {
  await query('INSERT INTO settings (id, server, twitch_channel, notification_channel) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE server = VALUES(server), twitch_channel = VALUES(twitch_channel), notification_channel = VALUES(notification_channel)', [userId, server, twitchChannel, notificationChannel]);
}

// Function to save a user's guild association
async function saveUserGuild(userId, guildId) {
  await query('INSERT INTO user_guilds (user_id, guild_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE guild_id = VALUES(guild_id)', [userId, guildId]);
}

module.exports = {
  initializeDatabase,
  addOrUpdateUser,
  getSettings,
  updateSettings,
  saveUserGuild // Export the new function
};
