require('dotenv').config();
const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const axios = require('axios');
const bcrypt = require('bcrypt');
const { REST, Routes } = require('discord.js');
const db = require('./utils/db');

const saltRounds = 10;
const app = express();
const port = process.env.PORT || 3000;

// Initialize the database
db.initializeDatabase()
  .then(() => {
    console.log('Database setup completed.');

    // Middleware for sessions
    const sessionStore = new MySQLStore({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME
    });

    app.use(session({
      secret: process.env.SESSION_SECRET,
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

    // Registration Route
    app.get('/register', (req, res) => {
      res.send(`
        <html>
          <body>
            <h1>Register</h1>
            <form action="/register" method="post">
              <label for="username">Username:</label>
              <input type="text" id="username" name="username" required>
              <label for="password">Password:</label>
              <input type="password" id="password" name="password" required>
              <button type="submit">Register</button>
            </form>
          </body>
        </html>
      `);
    });

    app.post('/register', async (req, res) => {
      const { username, password } = req.body;
      try {
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        const id = username.toLowerCase();
        await db.addOrUpdateUser(id, username, hashedPassword, null); // Initial registration without access token
        res.redirect('/login');
      } catch (error) {
        console.error('Error registering user:', error);
        res.status(500).send('Internal Server Error');
      }
    });

    // Login Route
    app.get('/login', (req, res) => {
      res.send(`
        <html>
          <body>
            <h1>Login</h1>
            <form action="/login" method="post">
              <label for="username">Username:</label>
              <input type="text" id="username" name="username" required>
              <label for="password">Password:</label>
              <input type="password" id="password" name="password" required>
              <button type="submit">Login</button>
            </form>
          </body>
        </html>
      `);
    });

    app.post('/login', async (req, res) => {
      const { username, password } = req.body;
      try {
        // Fetch user from the database
        const user = await db.getUserByUsername(username);
        console.log('User from DB:', user); // Debugging line
    
        if (!user) {
          console.log('User not found');
          return res.status(401).send('Invalid credentials');
        }
    
        if (!password || !user.password) {
          console.log('Password is missing');
          return res.status(401).send('Invalid credentials');
        }
    
        const match = await bcrypt.compare(password, user.password);
        if (!match) {
          console.log('Password does not match');
          return res.status(401).send('Invalid credentials');
        }
    
        // Set session
        req.session.user = {
          id: user.id,
          username: user.username,
          avatar: user.avatar
        };
    
        // Check if access token is available in user data
        const accessToken = user.access_token;
        if (accessToken) {
          req.session.access_token = accessToken;
          console.log('Access token set:', req.session.access_token);
        } else {
          console.log('No access token found in user data');
          // Optionally, you might want to redirect the user to reauthenticate
          return res.redirect('/auth/callback');
        }
    
        res.redirect('/dashboard');
      } catch (error) {
        console.error('Error logging in:', error);
        res.status(500).send('Internal Server Error');
      }
    });

    // Auth Callback Route
    app.get('/auth/callback', async (req, res) => {
      const code = req.query.code;
      const redirectUri = process.env.DISCORD_REDIRECT_URI;
    
      try {
        const response = await axios.post('https://discord.com/api/v10/oauth2/token', new URLSearchParams({
          client_id: process.env.DISCORD_CLIENT_ID,
          client_secret: process.env.DISCORD_CLIENT_SECRET,
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
          scope: 'identify guilds'
        }), {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        });
    
        const { access_token } = response.data;
        req.session.access_token = access_token; // Store access token in session
    
        // Update or add user with the new access token
        if (req.session.user) {
          await db.addOrUpdateUser(req.session.user.id, req.session.user.username, req.session.user.password, access_token);
        }
    
        console.log('Access token obtained and stored:', access_token);
        res.redirect('/dashboard'); // Redirect to a protected route
      } catch (error) {
        console.error('Error exchanging code for access token:', error);
        res.status(500).send('Internal Server Error');
      }
    });

    // Dashboard Route
    app.get('/dashboard', async (req, res) => {
      if (!req.session.user) {
        console.log('User not authenticated, redirecting to login');
        return res.redirect('/login');
      }

      try {
        const settings = await db.getSettings(req.session.user.id);
        const accessToken = req.session.access_token;

        if (!accessToken) {
          console.log('Access token not found, redirecting to login');
          return res.redirect('/login');
        }

        const guildsResponse = await axios.get('https://discord.com/api/v10/users/@me/guilds', {
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        });

        const guilds = guildsResponse.data.filter(guild => guild.permissions & 8); // ADMINISTRATOR permission bit is 8
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
                    
                    console.log('Channels data:', channels);
                    
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
                    console.error('Error fetching channels:', error);
                  }
                });
              </script>
              <a href="/invite-bot">Click here to add the bot to your server</a>
            </body>
          </html>
        `);
      } catch (error) {
        console.error('Error loading dashboard:', error);
        res.status(500).send('Internal Server Error');
      }
    });

    // Channels API Route
    app.get('/channels/:guildId', async (req, res) => {
      const guildId = req.params.guildId;
      const accessToken = req.session.access_token;

      if (!accessToken) {
        console.error('No access token found');
        return res.redirect('/login');
      }

      const rest = new REST({ version: '10' }).setToken(accessToken);

      try {
        console.log('Fetching channels for guild:', guildId);
        const data = await rest.get(Routes.guildChannels(guildId));
        console.log('Channels data:', data);
        res.json(data);
      } catch (error) {
        console.error('Error fetching channels:', {
          message: error.message,
          response: error.response ? error.response.data : 'No response data',
          statusCode: error.httpStatus || 'Unknown Status Code'
        });

        if (error.httpStatus === 401) {
          return res.redirect('/login');
        }

        res.status(500).send('Internal Server Error');
      }
    });

    // Bot Invitation Route
    app.get('/invite-bot', (req, res) => {
      const botInviteURL = `https://discord.com/oauth2/authorize?client_id=${process.env.DISCORD_CLIENT_ID}&permissions=8&response_type=code&redirect_uri=${encodeURIComponent(process.env.DISCORD_REDIRECT_URI)}&scope=identify+guilds+bot`;
      res.redirect(botInviteURL);
    });

    // Update settings Route
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

    // Start server
    app.listen(port, () => {
      console.log(`Server running on http://localhost:${port}`);
    });

  })
  .catch(err => {
    console.error('Database initialization failed:', err);
  });
