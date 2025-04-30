const { Client, GatewayIntentBits, SlashCommandBuilder, Routes } = require('discord.js');
const { REST } = require('@discordjs/rest');
const config = require('./config');
require('dotenv').config();

const spammerConfig = config.spammer;
const generalConfig = config.general;
const allBots = [];

function createBot(token, isMain = false) {
  const bot = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.GuildMembers
    ]
  });

  bot.spamActive = false;
  bot.spamTarget = null;
  bot.spamCount = 0;

  bot.once('ready', () => {
    console.log(`[SPAMMER] Logged in as ${bot.user.tag}`);
    if (isMain) registerSlashCommands(bot);
  });

  bot.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    if (!spammerConfig.authorizedIds.includes(interaction.user.id)) {
      return await interaction.reply({ content: 'Not authorized.', ephemeral: true });
    }
    const user = interaction.options.getUser('user');
    const customMessage = interaction.options.getString('message') || null;
    const count = interaction.options.getInteger('count') || null;
    if (interaction.commandName === 'dmspam') {
      allBots.forEach(b => startSpam(user, customMessage, count, b));
      await interaction.reply(`Started spamming ${user.username}`);
    } else if (interaction.commandName === 'dmstop') {
      stopSpam();
      await interaction.reply('Stopped all spam.');
    }
  });

  bot.on('messageCreate', async msg => {
    if (!msg.content.startsWith(generalConfig.commandPrefix)) return;
    if (!spammerConfig.authorizedIds.includes(msg.author.id)) return;
    const args = msg.content.slice(generalConfig.commandPrefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    if (command === 'dmspam') {
      const user = msg.mentions.users.first();
      if (!user) return msg.reply('Mention a user.');
      allBots.forEach(b => startSpam(user, null, null, b));
      msg.reply(`Started spamming ${user.username}`);
    } else if (command === 'dmstop') {
      stopSpam();
      msg.reply('Stopped all spam.');
    }
  });

  bot.login(token);
  allBots.push(bot);
}

function registerSlashCommands(bot) {
  const commands = [
    new SlashCommandBuilder().setName('dmspam').setDescription('Start spamming a user').addUserOption(o => o.setName('user').setDescription('Target').setRequired(true)).addStringOption(o => o.setName('message').setDescription('Optional message')).addIntegerOption(o => o.setName('count').setDescription('Optional message count')),
    new SlashCommandBuilder().setName('dmstop').setDescription('Stop all spam')
  ];
  const rest = new REST({ version: '10' }).setToken(spammerConfig.token);
  rest.put(Routes.applicationCommands(bot.user.id), { body: commands }).then(() => console.log('[SPAMMER] Slash commands registered.')).catch(console.error);
}

async function sendSpamMessage(target, customMessage, bot) {
  try {
    if (spammerConfig.behavior.sendTyping) await target.sendTyping();
    let msg = customMessage || spammerConfig.defaultSpamMessage;
    if (spammerConfig.bypass.rotateMessages && spammerConfig.bypass.messageVariants.length) {
      msg = spammerConfig.bypass.messageVariants[Math.floor(Math.random() * spammerConfig.bypass.messageVariants.length)];
    }
    if (spammerConfig.behavior.mentionUser) {
      msg = msg.replace('{user}', `<@${target.id}>`);
    }
    await target.send(msg);
  } catch (err) {
    console.error(`[SPAMMER] DM error: ${err.message}`);
    bot.spamActive = false;
  }
}

function startSpam(target, message, count, bot) {
  if (bot.spamActive) return;
  bot.spamActive = true;
  bot.spamTarget = target;
  bot.spamCount = 0;
  bot.spamInterval = setInterval(async () => {
    if (!bot.spamActive) return;
    if (count && bot.spamCount >= count) return stopSpam();
    await sendSpamMessage(bot.spamTarget, message, bot);
    bot.spamCount++;
  }, spammerConfig.spamDelay || 700);
}

function stopSpam() {
  allBots.forEach(bot => {
    clearInterval(bot.spamInterval);
    bot.spamActive = false;
    bot.spamTarget = null;
    bot.spamCount = 0;
  });
}

createBot(spammerConfig.token, true);
spammerConfig.backupTokens.forEach(token => createBot(token));
