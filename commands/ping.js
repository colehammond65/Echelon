const { SlashCommandBuilder } = require("@discordjs/builders")

module.exports = {
	data: new SlashCommandBuilder()
        .setName("ping")
        .setDescription("ping the server"),
	execute: async ({ interaction }) => {

        await interaction.reply("Pong")
    }
}