const { SlashCommandBuilder } = require('@discordjs/builders');
const { PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unlock')
        .setDescription('Unlocks the channel for everyone to read and send messages'),
    execute: async ({ interaction }) => {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return interaction.reply("You do not have permission to manage channels.");
        }

        const channel = interaction.channel;

        try {
            // Update channel permissions for everyone
            await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
                [PermissionFlagsBits.SendMessages]: true,
                [PermissionFlagsBits.ViewChannel]: true,
            });

            // Reset permissions for administrators to default (inherit from everyone)
            const members = await interaction.guild.members.fetch();

            for (const member of members.values()) {
                if (member.permissions.has(PermissionFlagsBits.Administrator)) {
                    await channel.permissionOverwrites.delete(member.id);
                }
            }

            interaction.reply(`Channel unlocked. Everyone can read and send messages.`);
        } catch (error) {
            console.error(error);
            interaction.reply("An error occurred while trying to unlock the channel.");
        }
    },
};
