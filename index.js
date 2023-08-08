const { Client, IntentsBitField, Partials } = require('discord.js');

const config = require("./config.json");
const package = require("./package.json");

var client_id = config.client_id;
var isLocked;
var hasStarted;
var ready = false;
var readWriteRoles = new Array();
var readOnlyRoles = new Array();

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

//#region Discord setup stuff
client.login(config.discordtoken);

client.on('ready', (c) => {
    //Set vars
    server = client.guilds.cache.get(config.serverID);
    logChannel = server.channels.cache.get(config.logChannelID);

    //log ready
    console.log(`${c.user.username} has started as ${c.user.tag} - Version: ${package.version}`);
    logChannel.send(`${c.user.username} has started as ${c.user.tag} - Version: ${package.version}`);

    readWriteRoles = config.readWriteRoleIds.map(id => server.roles.cache.find(role => role.id === id));
    readOnlyRoles = config.readOnlyRoleIds.map(id => server.roles.cache.find(role => role.id === id));

    ready = true;
})

client.on('disconnect', function(erMsg, code) {
    //Log disconnects and reconnect
    client.connect();
    console.log(`${c.user.username} disconnected from Discord with code ${code} for reason: ${erMsg}`);
    logChannel.send(`${c.user.username} disconnected from Discord with code ${code} for reason: ${erMsg}`);
    //Log startup
    console.log(`${c.user.username} has started as ${c.user.tag} - Version: ${package.version}`);
    logChannel.send(`${c.user.username} has started as ${c.user.tag} - Version: ${package.version}`);
});
//#endregion

//#region Twitch Checker
//Set TwitchCheck to fire every checkTime ms
setInterval(TwitchCheck, config.checkTime)

//Login to Twitch API and get oauth2 token
fetch(`https://id.twitch.tv/oauth2/token?client_id=${client_id}&client_secret=${config.client_secret}&grant_type=client_credentials`, {
    method: 'POST',
})
.then(res => res.json())
.then(res => { twitch_token = res.access_token; });

//Check if streamer is live
function TwitchCheck() {
    //Get user data from Twitch API
    fetch(`https://api.twitch.tv/helix/streams?user_login=${config.streamer}`, {
        method: 'GET',
        headers: {
            'Client-ID': config.client_id,
            'Authorization': 'Bearer ' + twitch_token
        }
    })
    //Convert to json
    .then(res => res.json())
    //trigger channel lock/unlock if needed. '{"data":[],"pagination":{}}' returned when streamer isnt live
    .then(res => {
        //Streamer is live, lock
        if(JSON.stringify(res) !== '{"data":[],"pagination":{}}') StreamStarted(res);
        //Streamer isnt live, unlock
        else StreamEnded();
    });
}

//Stream is live
function StreamStarted(json) {
    if (!ready || hasStarted) return;

    lock();
    changeToLiveBanner();
    hasStarted = true;

    const LiveString = '{"live":true}';
    fs.writeFileSync("./live.json", LiveString);
    console.log("LiveJson updated to true");
}

//Lock the discord channel
function changeToLiveBanner() {
    if (!ready || isLocked) return;

    server.setBanner('./banners/Live.png')
        
    console.log(`Changed banner`);
    logChannel.send(`Changed banner`);
}

//Lock the discord channel
function lock() {
    if (!ready || isLocked) return;
    if (!Array.isArray(readWriteRoles) || !readWriteRoles.length) return;
    if (!Array.isArray(readOnlyRoles) || !readOnlyRoles.length) return;

    //Edit permissions to lock the channel
    readWriteRoles.forEach(role => {
        channel.permissionOverwrites.edit(role.id, { ViewChannel: false });
    });
    readOnlyRoles.forEach(role => {
        channel.permissionOverwrites.edit(role.id, { ViewChannel: false });
    });

    //Set isLocked and log channel changes
    isLocked = true;
    console.log(`Locked ${channel.name}`);
    logChannel.send(`Locked ${channel.name}`);
}

//Streamer isnt live
function StreamEnded() {
    if (!ready || !hasStarted) return;
    unlock();
    changeToNotLiveBanner();
    hasStarted = false;
    console.log("Streamer offline");
        
    const LiveString = '{"live":false}';
    fs.writeFileSync("./live.json", LiveString);
    console.log("LiveJson updated to false");
}

//Unlock the discord channel
function changeToNotLiveBanner() {
    if (!ready || isLocked) return;

    server.setBanner('./banners/notLive.png')
        
    console.log(`Changed banner`);
    logChannel.send(`Changed banner`);
}

//Unlock the discord channel
function unlock() {
    if (!ready || !isLocked) return;
    if (!Array.isArray(readWriteRoles) || !readWriteRoles.length) return;
    if (!Array.isArray(readOnlyRoles) || !readOnlyRoles.length) return;

    //Edit permissions to unlock the channel
    readWriteRoles.forEach(role => {
        channel.permissionOverwrites.edit(role.id, { ViewChannel: true });
    });
    readOnlyRoles.forEach(role => {
        channel.permissionOverwrites.edit(role.id, { ViewChannel: true });
    });

    //Set isLocked and log channel changes
    isLocked = false;
    console.log(`Unlocked ${channel.name}`);
    logChannel.send(`Unlocked ${channel.name}`);
}
//#endregion