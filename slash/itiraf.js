const discord = require("discord.js");
//const {ApplicationCommandOptionTypes, ApplicationCommandTypes} = require("discord.js/typings/enums")
const logger = require("../modules/logger")
exports.run = async (client, interaction) => { // eslint-disable-line no-unused-vars
  await interaction.deferReply({ ephemeral: true });
  const {db} = client

  // Check if the targetted channel is a confession channel
  let targettedChannel = interaction.channel.id
  let channels = await db.getConfessionChannels(interaction.guild.id)
  if(!channels.includes(targettedChannel)){
    let modifier = ""
    if(channels.length > 0){
      modifier = `<#${channels[0]}> kanalını kullanabilirsiniz.`
    }
    await interaction.editReply("Burası bir itiraf kanalı değil. "+modifier)
    return;
  }

  // Create a message and send it to channel
  let opts = interaction.options._hoistedOptions;
  let itiraf = opts[0].value
  let mahlas = opts.length > 1 ? opts[1].value : null;
  let msg = ""
  if(mahlas != null){
    msg += mahlas
    msg += ": "
  }
  msg += `${itiraf}`
  logger.log(`${interaction.user.tag} itiraf ${msg}`)
  interaction.channel.send(msg)
  await interaction.editReply("İtirafınız yollandı.")
};

exports.commandData = {
  name: "itiraf",
  description: "Belirlenmiş itiraf kanallarda anonim bi şekilde mesaj atmanızı sağlar.",
  descriptionLocalizations: "",
  options: [
    {
      "name": "itiraf",
      "description": "İtirafın içeriği.",
      "type": 3,
      "required": true
    },
    {
      "name": "mahlas",
      "description": "İtirafı yazarken kullanmak istediğin mahlas.",
      "type": 3,
      "required": false
    }
  ],
  defaultPermission: true,
  type: 1
};

// Set guildOnly to true if you want it to be available on guilds only.
// Otherwise false is global.
exports.conf = {
  permLevel: "User",
  guildOnly: true
};