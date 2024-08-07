require('dotenv').config();

const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const { Client, IntentsBitField, Collection } = require('discord.js');

const fs = require('fs');
const path = require('path');

const client = new Client({
    intents: [
        IntentsBitField.Flags.Guilds,
        IntentsBitField.Flags.GuildMembers,
        IntentsBitField.Flags.GuildModeration,
        IntentsBitField.Flags.GuildEmojisAndStickers,
        IntentsBitField.Flags.GuildIntegrations,
        IntentsBitField.Flags.GuildWebhooks,
        IntentsBitField.Flags.GuildInvites,
        IntentsBitField.Flags.GuildVoiceStates,
        IntentsBitField.Flags.GuildPresences,
        IntentsBitField.Flags.GuildMessages,
        IntentsBitField.Flags.GuildMessageReactions,
        IntentsBitField.Flags.GuildMessageTyping,
        IntentsBitField.Flags.DirectMessages,
        IntentsBitField.Flags.DirectMessageReactions,
        IntentsBitField.Flags.DirectMessageTyping,
        IntentsBitField.Flags.MessageContent,
        IntentsBitField.Flags.GuildScheduledEvents,
        IntentsBitField.Flags.AutoModerationConfiguration,
        IntentsBitField.Flags.AutoModerationExecution,
        IntentsBitField.Flags.GuildMessagePolls,
        IntentsBitField.Flags.DirectMessagePolls
    ],
});

client.login(process.env.TOKEN);

client.on('ready', async (c) => {
    console.log(`✅ ${c.user.tag} is online`);

    // Get all ids of the servers
    const guild_ids = client.guilds.cache.map(guild => guild.id);

    const rest = new REST({ version: '9' }).setToken(process.env.TOKEN);
    for (const guildId of guild_ids) {
        try {
            await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId), {
                body: commands,
            });
            console.log('Successfully updated commands for guild ' + guildId);
        } catch (error) {
            console.error('Error updating commands for guild ' + guildId, error);
        }
    }

    // Load and run functions
    const functionsPath = path.join(__dirname, '..', 'functions');
    const functionFiles = fs.readdirSync(functionsPath).filter(file => file.endsWith('.js'));

    for (const file of functionFiles) {
        const filePath = path.join(functionsPath, file);
        const func = require(filePath);

        if (func.interval && func.execute) {
            setInterval(() => func.execute(client), func.interval);
            console.log(`Scheduled task ${file} set to run every ${func.interval / 1000} seconds`);
        } else {
            console.warn(`Function file ${file} is missing an interval or execute function.`);
        }
    }
});

// List of all commands
const commands = [];
client.commands = new Collection();

const commandsPath = path.join(__dirname, '..', 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);

    client.commands.set(command.data.name, command);
    commands.push(command.data.toJSON());
}

client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
        await command.execute({ client, interaction });
    } catch (error) {
        console.error(error);
        await interaction.reply({ content: 'There was an error executing this command', ephemeral: true });
    }
});
