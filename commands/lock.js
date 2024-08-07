const { SlashCommandBuilder } = require('@discordjs/builders');
const { PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lock')
        .setDescription('Locks the channel so only administrators can read and send messages'),
    execute: async ({ interaction }) => {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return interaction.reply("You do not have permission to manage channels.");
        }

        const channel = interaction.channel;

        try {
            // Update channel permissions for everyone
            await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
                [PermissionFlagsBits.SendMessages]: false,
                [PermissionFlagsBits.ViewChannel]: false,
            });

            // Allow administrators to read and send messages
            const members = await interaction.guild.members.fetch();

            for (const member of members.values()) {
                if (member.permissions.has(PermissionFlagsBits.Administrator)) {
                    await channel.permissionOverwrites.edit(member.id, {
                        [PermissionFlagsBits.SendMessages]: true,
                        [PermissionFlagsBits.ViewChannel]: true,
                    });
                }
            }

            interaction.reply(`Channel locked. Only administrators can read and send messages.`);
        } catch (error) {
            console.error(error);
            interaction.reply("An error occurred while trying to lock the channel.");
        }
    },
};
