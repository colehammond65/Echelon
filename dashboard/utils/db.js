const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Database file location
const dbPath = path.resolve(__dirname, 'database.db');

// Open a database connection
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        // Initialize database schema
        initializeDatabase();
    }
});

// Function to add a new user
async function addUser(email, hashedPassword) {
    const sql = 'INSERT INTO users (email, password) VALUES (?, ?)';
    return new Promise((resolve, reject) => {
        db.run(sql, [email, hashedPassword], function (err) {
            if (err) {
                console.error('Error adding user:', err.message);
                reject(err);
            } else {
                resolve(this.lastID);
            }
        });
    });
}

// Function to find a user by email
async function findUserByEmail(email) {
    const sql = 'SELECT * FROM users WHERE email = ?';
    return new Promise((resolve, reject) => {
        db.get(sql, [email], (err, row) => {
            if (err) {
                console.error('Error finding user by email:', err.message);
                reject(err);
            } else {
                resolve(row);
            }
        });
    });
}

// Function to get user by ID (for Passport)
async function findUserById(id) {
    const sql = 'SELECT * FROM users WHERE id = ?';
    return new Promise((resolve, reject) => {
        db.get(sql, [id], (err, row) => {
            if (err) {
                console.error('Error finding user by ID:', err.message);
                reject(err);
            } else {
                resolve(row);
            }
        });
    });
}

// Function to initialize the database schema
async function initializeDatabase() {
    const createUsersTable = `
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL
        )
    `;
    return new Promise((resolve, reject) => {
        db.run(createUsersTable, (err) => {
            if (err) {
                console.error('Error initializing database:', err.message);
                reject(err);
            } else {
                resolve();
            }
        });
    });
}

// Close the database connection when the process exits
process.on('exit', () => {
    db.close((err) => {
        if (err) {
            console.error('Error closing database:', err.message);
        } else {
            console.log('Database connection closed.');
        }
    });
});

module.exports = {
    addUser,
    findUserByEmail,
    findUserById
};
