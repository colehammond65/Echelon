const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const axios = require('axios');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
const db = require('./utils/db'); // Ensure this path is correct
require('dotenv').config();

const app = express();
const port = 3000;

// OAuth2 Configuration
const clientID = process.env.DISCORD_CLIENT_ID;
const clientSecret = process.env.DISCORD_CLIENT_SECRET;
const redirectURI = process.env.DISCORD_REDIRECT_URI;
const discordAPI = 'https://discord.com/api/v10'; // Base URL for Discord API
const discordToken = process.env.DISCORD_TOKEN;

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

    // Routes
    app.get('/', (req, res) => {
      res.render('index.ejs'); // Render the 'index' view (index.pug or index.ejs)
    });

    app.get('/login', (req, res) => {
      const authURL = `https://discord.com/oauth2/authorize?client_id=1195951352615018516&permissions=8&response_type=code&redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fcallback&integration_type=0&scope=identify+guilds+guilds.join+guilds.members.read+bothttps://discord.com/oauth2/authorize?client_id=1195951352615018516&permissions=191488&response_type=code&redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fcallback&integration_type=0&scope=identify+guilds+guilds.join+guilds.members.read+bot`;
      res.redirect(authURL);
    });

    app.get('/callback', async (req, res) => {
      const code = req.query.code;
      const guildId = req.query.guild_id; // This will be present if the bot was added to a server

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
        if (guildId) {
          // Save the guild ID if the bot was added to a server
          await db.saveUserGuild(user.id, guildId);
        }

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
              <a href="/invite-bot">Click here to add the bot to your server</a> <!-- Add the bot link -->
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
        
        // Redirect to login on 401 Unauthorized errors
        if (error.httpStatus === 401) {
          return res.redirect('/login');
        }
    
        res.status(500).send('Internal Server Error');
      }
    });

    // Bot Invitation Route
    app.get('/invite-bot', (req, res) => {
      const botInviteURL = `https://discord.com/oauth2/authorize?client_id=1195951352615018516&permissions=8&response_type=code&redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fcallback&integration_type=0&scope=identify+guilds+gdm.join+rpc.notifications.read+rpc.video.read+rpc.screenshare.write+messages.read+applications.commands+activities.read+relationships.write+role_connections.write+openid+gateway.connect+applications.commands.permissions.update+dm_channels.messages.read+presences.read+voice+applications.store.update+activities.write+applications.builds.upload+rpc.activities.write+rpc.video.write+rpc.voice.read+bot+email+connections+guilds.join+guilds.members.read+rpc+rpc.voice.write+rpc.screenshare.read+webhook.incoming+applications.builds.read+applications.entitlements+relationships.read+dm_channels.read+presences.write+dm_channels.messages.write+payment_sources.country_code`;
      res.redirect(botInviteURL);
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
