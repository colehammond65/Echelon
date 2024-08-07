const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql2/promise');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: 'echelon',
    port: process.env.DB_PORT
});

app.use(bodyParser.json());
app.use(express.static('public'));

// Get settings for a server
app.get('/api/settings/:serverId', async (req, res) => {
    const { serverId } = req.params;
    try {
        const [rows] = await pool.query('SELECT * FROM twitch_settings WHERE server_id = ?', [serverId]);
        res.json(rows[0] || {});
    } catch (err) {
        res.status(500).json({ error: 'Error fetching settings' });
    }
});

// Update settings for a server
app.post('/api/settings/:serverId', async (req, res) => {
    const { serverId } = req.params;
    const { twitchUsername, discordChannelId, lastStreamId } = req.body;
    try {
        await pool.query(
            `INSERT INTO twitch_settings (server_id, twitch_username, discord_channel_id, last_stream_id)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
             twitch_username = VALUES(twitch_username),
             discord_channel_id = VALUES(discord_channel_id),
             last_stream_id = VALUES(last_stream_id)`,
            [serverId, twitchUsername, discordChannelId, lastStreamId]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Error updating settings' });
    }
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
