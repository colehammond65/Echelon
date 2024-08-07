const { SlashCommandBuilder } = require("@discordjs/builders");
const { PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName("clear")
        .setDescription("Delete all messages in the current channel"),
    execute: async ({ interaction }) => {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return interaction.reply("You do not have permission to manage messages in this channel.");
        }

        const channel = interaction.channel;
        let fetchedMessages;

        try {
            // Fetch messages in batches and delete them
            do {
                fetchedMessages = await channel.messages.fetch({ limit: 100 });

                // Filter messages older than 14 days
                const oldMessages = fetchedMessages.filter(msg => (Date.now() - msg.createdTimestamp) > 14 * 24 * 60 * 60 * 1000);
                const recentMessages = fetchedMessages.filter(msg => (Date.now() - msg.createdTimestamp) <= 14 * 24 * 60 * 60 * 1000);

                // Bulk delete recent messages
                if (recentMessages.size > 0) {
                    await channel.bulkDelete(recentMessages, true);
                }

                // Delete old messages one by one
                for (const msg of oldMessages.values()) {
                    await msg.delete();
                }

            } while (fetchedMessages.size >= 100);

            interaction.reply("All messages in this channel have been deleted.");
        } catch (error) {
            console.error(error);
            interaction.reply("An error occurred while trying to delete messages.");
        }
    }
};
