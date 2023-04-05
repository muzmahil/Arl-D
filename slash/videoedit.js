const discord = require("discord.js");
//const {ApplicationCommandOptionTypes, ApplicationCommandTypes} = require("discord.js/typings/enums")
const logger = require("../modules/logger")
const videoedit = require("../modules/videoedit")
exports.run = async (client, interaction) => { // eslint-disable-line no-unused-vars
  await interaction.deferReply({ ephemeral: true });

  let opts=interaction.options._hoistedOptions
  const videoURL=opts[0].value
  const audioURL=opts[1].value
  const videoStartSec=opts[2].value
  const videoEndSec=opts[3].value
  const audioStartSec=opts[4].value
  const audioEndSec=opts[5].value

  await interaction.editReply("video düzenleniyor");
  await videoedit.downloadVideoAndAudio(videoURL, audioURL, videoStartSec, videoEndSec, audioStartSec, audioEndSec, async (videoPath)=>{
    // Open a read stream for your video file
    const videoStream = fs.createReadStream(videoPath);

    // Create a MessageAttachment object with the stream
    const videoAttachment = new discord.MessageAttachment(videoStream, 'videoedit.mp4');

    // Send the attachment as a reply to the message
    await interaction.editReply(videoAttachment)
    interaction.reply(videoAttachment);
  })

  // await interaction.editReply("Video düzenlendi.")
};

exports.commandData = {
  name: "videoedit",
  description: "İlk videonun görüntüsüyle ikinci videonun sesini birleştirir. Sadece youtube linkleri çalışır.",
  descriptionLocalizations: {},
  options: [
    {
      "name": "video link",
      "description": "Videonun linki. (sadece youtube)",
      "type": 3, 
      "required": true
    },
    {
      "name": "ses link",
      "description": "Sesin linki. (sadece youtube)",
      "type": 3,
      "required": true
    },
    {
      "name": "video baslangic saniyesi",
      "description": "videoda kesilmeye baslanacak noktanin saniyesi",
      "type": 4,
      "required": true,
      "min_value": 0,
      "max_value": 7200
    },
    {
      "name": "video bitis saniyesi",
      "description": "videoda kesilmenin biteceği noktanin saniyesi",
      "type": 4,
      "required": true,
      "min_value": 0,
      "max_value": 7200
    },
    {
      "name": "ses baslangic saniyesi",
      "description": "sesde kesilmeye baslanacak noktanin saniyesi",
      "type": 4,
      "required": true,
      "min_value": 0,
      "max_value": 7200
    },
    {
      "name": "ses bitis saniyesi",
      "description": "sesde kesilmenin biteceği noktanin saniyesi",
      "type": 4,
      "required": true,
      "min_value": 0,
      "max_value": 7200
    }
  ],
  defaultPermission: true,
  type: 1
};

// Set guildOnly to true if you want it to be available on guilds only.
// Otherwise false is global.
exports.conf = {
  permLevel: "Moderator",
  guildOnly: false
};