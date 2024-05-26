const { Client, IntentsBitField, Partials } = require('discord.js');
const config = require("./config.json");
const packageInfo = require("./package.json");

let fetch; // Will be dynamically imported

// Dynamically import node-fetch
(async () => {
    fetch = (await import('node-fetch')).default;
})();

// Initialize Discord client with intents and partials
const client = new Client({
    intents: [
        IntentsBitField.Flags.Guilds,
        IntentsBitField.Flags.GuildMembers,
        IntentsBitField.Flags.GuildMessages,
        IntentsBitField.Flags.MessageContent
    ],
    partials: [
        Partials.User,
        Partials.Channel,
        Partials.GuildMember,
        Partials.Message,
        Partials.Reaction
    ]
});

let state = {
    isLocked: false, // Track if the channel is locked
    hasStarted: false, // Track if the stream has started
    ready: false, // Track if the bot is ready
    firstCheck: true // Ensure functions run on first check
};

let channel; // Discord channel to lock/unlock
let readWriteRoles = []; // Roles with read/write permissions
let readOnlyRoles = []; // Roles with read-only permissions
let logChannel; // Log channel for bot messages
let twitchToken; // OAuth2 token for Twitch API

// Login to Discord
client.login(config.discordtoken);

// Event handler for when the bot is ready
client.once('ready', () => {
    const server = client.guilds.cache.get(config.serverID);
    logChannel = server.channels.cache.get(config.logChannelID);

    console.log(`${client.user.username} has started as ${client.user.tag} - Version: ${packageInfo.version}`);
    logChannel.send(`${client.user.username} has started as ${client.user.tag} - Version: ${packageInfo.version}`);

    // Get roles and channel from the server
    readWriteRoles = config.readWriteRoleIds.map(id => server.roles.cache.get(id));
    readOnlyRoles = config.readOnlyRoleIds.map(id => server.roles.cache.get(id));
    channel = server.channels.cache.get(config.channelID);

    state.ready = true; // Set bot to ready
    setInterval(TwitchCheck, config.checkTime); // Set interval for Twitch check
    getTwitchToken(); // Get Twitch OAuth2 token
});

// Event handler for when the bot disconnects
client.on('disconnect', (erMsg, code) => {
    console.log(`${client.user.username} disconnected from Discord with code ${code} for reason: ${erMsg}`);
    logChannel.send(`${client.user.username} disconnected from Discord with code ${code} for reason: ${erMsg}`);
    client.login(config.discordtoken); // Attempt to reconnect
});

// Fetch Twitch OAuth2 token
async function getTwitchToken() {
    try {
        const res = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${config.client_id}&client_secret=${config.client_secret}&grant_type=client_credentials`, {
            method: 'POST',
        });
        const data = await res.json();
        twitchToken = data.access_token;
    } catch (error) {
        console.error('Error fetching Twitch token:', error);
    }
}

// Check if the specified Twitch streamer is live
async function TwitchCheck() {
    try {
        const res = await fetch(`https://api.twitch.tv/helix/streams?user_login=${config.streamer}`, {
            method: 'GET',
            headers: {
                'Client-ID': config.client_id,
                'Authorization': `Bearer ${twitchToken}`
            }
        });
        const data = await res.json();
        const isLive = data.data.length > 0;
        if (isLive) {
            handleStreamStarted();
        } else {
            handleStreamEnded();
        }
        if (state.firstCheck) state.firstCheck = false; // Reset firstCheck after the first run
    } catch (error) {
        console.error('Error checking Twitch stream:', error);
    }
}

// Handle when the stream starts
function handleStreamStarted() {
    if (!state.ready || (!state.firstCheck && state.hasStarted)) return;
    lockChannel();
    changeBanner('./banners/Live.png');
    state.hasStarted = true;
}

// Handle when the stream ends
function handleStreamEnded() {
    if (!state.ready || (!state.firstCheck && !state.hasStarted)) return;
    unlockChannel();
    changeBanner('./banners/notLive.png');
    state.hasStarted = false;
}

// Change the Discord server banner
function changeBanner(path) {
    if (!state.ready) return;
    client.guilds.cache.get(config.serverID).setBanner(path)
        .then(() => {
            console.log(`Changed banner to ${path}`);
            logChannel.send(`Changed banner to ${path}`);
        })
        .catch(console.error);
}

// Lock the Discord channel
function lockChannel() {
    if (!state.ready || state.isLocked) return;
    modifyChannelPermissions(false);
    state.isLocked = true;
    console.log(`Locked ${channel.name}`);
    logChannel.send(`Locked ${channel.name}`);
}

// Unlock the Discord channel
function unlockChannel() {
    if (!state.ready || !state.isLocked) return;
    modifyChannelPermissions(true);
    state.isLocked = false;
    console.log(`Unlocked ${channel.name}`);
    logChannel.send(`Unlocked ${channel.name}`);
}

// Modify channel permissions to lock/unlock
function modifyChannelPermissions(viewChannel) {
    const permission = { ViewChannel: viewChannel };
    readWriteRoles.forEach(role => channel.permissionOverwrites.edit(role.id, permission));
    readOnlyRoles.forEach(role => channel.permissionOverwrites.edit(role.id, permission));
}