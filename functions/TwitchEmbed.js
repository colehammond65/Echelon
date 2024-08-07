const pool = require('../utils/db'); // Updated path

module.exports = {
    interval: 10000, // Check every 10 seconds
    execute: async (client) => {
        // Dynamically import node-fetch
        const fetch = (await import('node-fetch')).default;

        const twitchClientId = process.env.TWITCH_CLIENT_ID;
        const twitchAccessToken = process.env.TWITCH_ACCESS_TOKEN;

        client.guilds.cache.forEach(async (guild) => {
            // Fetch settings for this guild
            const [rows] = await pool.query('SELECT * FROM twitch_settings WHERE server_id = ?', [guild.id]);
            if (rows.length === 0) {
                console.error(`No settings found in the database for server ${guild.id}.`);
                return;
            }

            const settings = rows[0];
            const twitchUsername = settings.twitch_username;
            const discordChannelId = settings.discord_channel_id;
            let lastStreamId = settings.last_stream_id;

            // Define the Twitch API endpoint and headers
            const url = new URL('https://api.twitch.tv/helix/streams');
            url.searchParams.append('user_login', twitchUsername);

            const headers = {
                'Client-ID': twitchClientId,
                'Authorization': `Bearer ${twitchAccessToken}`,
                'Accept': 'application/vnd.twitch.v5+json'
            };

            try {
                // Fetch the stream information from the Twitch API
                const response = await fetch(url, { headers });
                const data = await response.json();

                // Check if the response contains data
                if (data.error) {
                    console.error(`Twitch API Error for server ${guild.id}:`, data);
                    return;
                }

                // Check if the stream is live
                const isLive = data.data && data.data.length > 0;
                console.log(`Is live for server ${guild.id}:`, isLive);

                // Update the last stream ID in the database
                const newStreamId = isLive ? data.data[0].id : null;
                if (lastStreamId !== newStreamId) {
                    if (isLive) {
                        const streamData = data.data[0];
                        const { EmbedBuilder } = require('discord.js');

                        const embed = new EmbedBuilder()
                            .setTitle(`${streamData.user_name} is now live on Twitch!`)
                            .setURL(`https://www.twitch.tv/${twitchUsername}`)
                            .setDescription(streamData.title)
                            .setImage(streamData.thumbnail_url.replace('{width}', '320').replace('{height}', '180'))
                            .setTimestamp(new Date(streamData.started_at))
                            .setColor('#9146FF');

                        const channel = await client.channels.fetch(discordChannelId);
                        if (channel && channel.isTextBased()) {
                            await channel.send(`@everyone ${streamData.user_name} is now live!`);
                            await channel.send({ embeds: [embed] });
                            console.log(`Embed and announcement sent to channel ${discordChannelId} in server ${guild.id}`);
                        } else {
                            console.error(`Failed to fetch channel or channel is not text-based for server ${guild.id}.`);
                        }
                    }

                    // Update lastStreamId in the database
                    await pool.query('UPDATE twitch_settings SET last_stream_id = ? WHERE server_id = ?', [newStreamId, guild.id]);
                } else {
                    console.log(`No change in stream state or stream is not live for server ${guild.id}.`);
                }
            } catch (error) {
                console.error(`Error checking Twitch stream for server ${guild.id}:`, error);
            }
        });
    },
};

// Use this function to start checking the stream at the specified interval
const startChecking = (client) => {
    setInterval(() => {
        module.exports.execute(client);
    }, module.exports.interval);
};

module.exports.startChecking = startChecking;
