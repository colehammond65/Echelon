(async () => {
    const fetch = await import('node-fetch').then(mod => mod.default);

    const { getSettings, updateSettings } = require('../utils/db');

    module.exports = {
        interval: 10000, // 10 seconds
        async execute(client) {
            const guilds = client.guilds.cache;

            for (const [guildId, guild] of guilds) {
                const settings = await getSettings(guildId);

                if (!settings) continue;

                const { twitch_username, discord_channel_id, last_stream_id } = settings;
                if (!twitch_username || !discord_channel_id) continue;

                try {
                    const response = await fetch(`https://api.twitch.tv/helix/streams?user_login=${twitch_username}`, {
                        headers: {
                            'Client-ID': process.env.TWITCH_CLIENT_ID,
                            'Authorization': `Bearer ${process.env.TWITCH_ACCESS_TOKEN}`
                        }
                    });

                    const data = await response.json();
                    console.log("Twitch API Response:", data);

                    if (!response.ok) {
                        console.error("Twitch API Error:", data);
                        continue;
                    }

                    if (data.data && data.data.length > 0) {
                        const stream = data.data[0];
                        if (stream.id !== last_stream_id) {
                            const channel = await client.channels.fetch(discord_channel_id);
                            const embed = new MessageEmbed()
                                .setTitle(`${stream.user_name} is now live on Twitch!`)
                                .setURL(`https://twitch.tv/${stream.user_name}`)
                                .setDescription(stream.title)
                                .addField('Game', stream.game_name, true)
                                .addField('Viewers', stream.viewer_count.toString(), true)
                                .setTimestamp(stream.started_at)
                                .setColor(0x9146FF)
                                .setThumbnail(stream.thumbnail_url.replace('{width}', '320').replace('{height}', '180'));

                            channel.send({ content: `@everyone ${stream.user_name} is now live!`, embeds: [embed] });

                            await updateSettings(guildId, { ...settings, last_stream_id: stream.id });
                        }
                    }
                } catch (error) {
                    console.error('Error fetching Twitch stream data:', error);
                }
            }
        }
    };
})();
