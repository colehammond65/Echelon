const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const axios = require('axios');
const db = require('./utils/db'); // Ensure this path is correct
require('dotenv').config();

const app = express();
const port = 3000;

// Initialize the database
db.initializeDatabase()
  .then(() => {
    console.log('Database initialized.');

    // Middleware for sessions
    const sessionStore = new MySQLStore({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME
    });

    app.use(session({
      secret: process.env.SESSION_SECRET, // Ensure you set this in your .env file
      resave: false,
      saveUninitialized: true,
      store: sessionStore,
      cookie: {
        secure: false, // Set to true if using HTTPS
        maxAge: 3600000 // 1 hour
      }
    }));

    app.use(express.urlencoded({ extended: true }));
    app.use(express.json());

    // OAuth2 Configuration
    const clientID = process.env.DISCORD_CLIENT_ID;
    const clientSecret = process.env.DISCORD_CLIENT_SECRET;
    const redirectURI = process.env.DISCORD_REDIRECT_URI;
    const discordAPI = 'https://discord.com/api/v10'; // Base URL for Discord API

    // Routes
    app.get('/', (req, res) => {
      res.render('index.ejs'); // Render the 'index' view (index.pug or index.ejs)
    });

    app.get('/login', (req, res) => {
      const authURL = `${discordAPI}/oauth2/authorize?client_id=${clientID}&redirect_uri=${encodeURIComponent(redirectURI)}&response_type=code&scope=identify%20guilds`;
      res.redirect(authURL);
    });

    app.get('/callback', async (req, res) => {
      const code = req.query.code;
      if (!code) {
        console.error('Authorization code is missing');
        return res.redirect('/login');
      }

      try {
        console.log('Requesting token with code:', code);
        const response = await axios.post(`${discordAPI}/oauth2/token`, new URLSearchParams({
          client_id: clientID,
          client_secret: clientSecret,
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectURI,
          scope: 'identify guilds'
        }), {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        });

        const { access_token } = response.data;
        const userResponse = await axios.get(`${discordAPI}/users/@me`, {
          headers: {
            Authorization: `Bearer ${access_token}`
          }
        });

        console.log('User response:', userResponse.data);
        const user = userResponse.data;
        req.session.user = {
          id: user.id,
          username: user.username,
          avatar: user.avatar
        };
        req.session.access_token = access_token; // Store the access_token in the session

        // Save user to the database if not already present
        await db.addOrUpdateUser(user.id, user.username, user.avatar);

        res.redirect('/dashboard');
      } catch (error) {
        console.error('Error during OAuth2 callback:', {
          message: error.message,
          response: error.response ? error.response.data : 'No response data'
        });
        res.redirect('/login');
      }
    });

    app.get('/dashboard', async (req, res) => {
      if (!req.session.user) {
        return res.redirect('/login');
      }
    
      try {
        const settings = await db.getSettings(req.session.user.id);
    
        // Fetch the user's guilds from Discord API
        const accessToken = req.session.access_token;
        const guildsResponse = await axios.get(`${discordAPI}/users/@me/guilds`, {
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        });
    
        // Filter guilds to include only those where the user has ADMINISTRATOR permission
        const guilds = guildsResponse.data.filter(guild => guild.permissions & 8); // ADMINISTRATOR permission bit is 8
    
        // Generate options for the server dropdown
        const guildOptions = guilds.map(guild => `<option value="${guild.id}">${guild.name}</option>`).join('');
    
        res.send(`
          <html>
            <body>
              <h1>Dashboard</h1>
              <form action="/update-settings" method="post">
                <label for="server">Select Server:</label>
                <select id="server" name="server">
                  ${guildOptions}
                </select>
                <label for="notification-channel">Notification Channel:</label>
                <select id="notification-channel" name="notification-channel">
                  <!-- Channels will be populated here -->
                </select>
                <label for="twitch-channel">Twitch Channel:</label>
                <input type="text" id="twitch-channel" name="twitch-channel" value="${settings.twitch_channel || ''}">
                <button type="submit">Save</button>
              </form>
              <script>
                document.getElementById('server').addEventListener('change', async function() {
                  const guildId = this.value;
                  if (!guildId) {
                    return;
                  }
                  try {
                    const response = await fetch('/channels/' + guildId);
                    const channels = await response.json();
                    
                    console.log('Channels data:', channels); // Debugging line
                    
                    const channelSelect = document.getElementById('notification-channel');
                    channelSelect.innerHTML = '';
                    
                    channels.forEach(channel => {
                      if (channel.type === 0) { // Only text channels
                        const option = document.createElement('option');
                        option.value = channel.id;
                        option.textContent = channel.name;
                        channelSelect.appendChild(option);
                      }
                    });
                  } catch (error) {
                    console.error('Error fetching channels:', error); // Debugging line
                  }
                });
              </script>
            </body>
          </html>
        `);
      } catch (error) {
        console.error('Error loading dashboard:', error);
        res.status(500).send('Internal Server Error');
      }
    });

    app.get('/channels/:guildId', async (req, res) => {
      const guildId = req.params.guildId;
      const accessToken = req.session.access_token;

      try {
        console.log(accessToken);
        const response = await axios.get(`${discordAPI}/guilds/${guildId}/channels`, {
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        });
        res.json(response.data);
      } catch (error) {
        console.error('Error fetching channels:');
        console.error(error);
        res.status(500).send('Internal Server Error');
      }
    });

    app.post('/update-settings', async (req, res) => {
      if (!req.session.user) {
        return res.redirect('/login');
      }

      try {
        const { server, twitchChannel, notificationChannel } = req.body;
        await db.updateSettings(req.session.user.id, server, twitchChannel, notificationChannel);
        res.redirect('/dashboard');
      } catch (error) {
        console.error('Error updating settings:', error);
        res.status(500).send('Internal Server Error');
      }
    });

    app.listen(port, () => {
      console.log(`Server running on http://localhost:${port}`);
    });

  })
  .catch(err => {
    console.error('Database initialization failed:', err);
  });
