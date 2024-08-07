const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: 'echelon' // Updated database name
});

// Function to initialize the database
const initializeDatabase = async () => {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD
    });

    try {
        // Create the database if it doesn't exist
        await connection.query('CREATE DATABASE IF NOT EXISTS echelon');
        console.log('Database created or already exists.');

        // Use the database
        await connection.query('USE echelon');

        // Create the table if it doesn't exist
        await connection.query(`
            CREATE TABLE IF NOT EXISTS twitch_settings (
                id INT AUTO_INCREMENT PRIMARY KEY,
                server_id VARCHAR(255) NOT NULL UNIQUE,
                twitch_username VARCHAR(255) NOT NULL,
                discord_channel_id VARCHAR(255) NOT NULL,
                last_stream_id VARCHAR(255)
            )
        `);
        console.log('Table created or already exists.');
    } catch (error) {
        console.error('Error initializing the database:', error);
    } finally {
        await connection.end();
    }
};

// Initialize the database when the module is loaded
initializeDatabase();

module.exports = pool;
