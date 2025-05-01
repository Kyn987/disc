const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, Routes } = require('discord.js');
const { REST } = require('@discordjs/rest');
const express = require('express');
const config = require('./config');

// Initialize config
const { spammer, general, safety } = config;
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMembers
    ]
});

// Spam state
const state = {
    active: false,
    target: null,
    count: 0,
    lastBlock: 0,
    interval: null,
    startTime: null
};

// Uptime monitor
const app = express();
app.get('/', (req, res) => res.json({
    status: 'online',
    target: state.target?.tag || 'none',
    messages: state.count,
    active: state.active,
    runningFor: state.startTime ? Date.now() - state.startTime : 0
}));
app.listen(general.uptimePort + 1, () => console.log(`Spammer monitor on port ${general.uptimePort + 1}`));

// =====================
// OPTIMIZED SPAM FUNCTIONS
// =====================
function getRandomizedDelay() {
    const base = spammer.timing.betweenMessages;
    if (!spammer.behavior.randomizeDelays) return base;
    const jitter = base * 0.2; // ±20% variation
    return base - jitter + Math.random() * jitter * 2;
}

function generateSpamMessage(target) {
    if (spammer.bypass.rotateMessages) {
        let msg = spammer.bypass.messageVariants[
            Math.floor(Math.random() * spammer.bypass.messageVariants.length)
        ].replace('{user}', target?.toString() || '');

        if (spammer.bypass.addRandomText) {
            msg += ' ' + Math.random().toString(36).substring(2, 8);
        }
        return msg;
    }
    return spammer.defaultSpamMessage;
}

async function sendSpam(target, customMsg = null) {
    if (!state.active) return false;

    // Check safety limits
    if (state.startTime && (Date.now() - state.startTime) > safety.maxOperationTime) {
        stopSpam();
        return false;
    }

    try {
        // Typing indicator
        if (spammer.behavior.sendTyping) {
            await target.sendTyping();
            await sleep(spammer.timing.typingDelay);
        }

        // Prepare message
        let content = customMsg || generateSpamMessage(target);
        if (spammer.behavior.mentionUser && state.count === 0) {
            content = `${target.toString()} ${content}`;
        }

        // Send message (with embed if enabled)
        if (spammer.bypass.useEmbeds && Math.random() > 0.5) {
            await target.send({
                embeds: [new EmbedBuilder()
                    .setDescription(content)
                    .setColor('#FF0000')
                ]
            });
        } else {
            await target.send(content);
        }

        state.count++;

        // Auto-delete if enabled
        if (spammer.behavior.deleteMessages) {
            setTimeout(async () => {
                try {
                    const messages = await target.dmChannel?.messages.fetch({ limit: 1 });
                    if (messages?.first()?.author.id === client.user.id) {
                        await messages.first().delete();
                    }
                } catch (e) {}
            }, spammer.dm.deleteAfter);
        }

        return true;
    } catch (error) {
        console.error('Spam failed:', error);
        if (error.code === 50007) { // Blocked
            state.lastBlock = Date.now();
            if (spammer.behavior.autoRestart) {
                setTimeout(() => startSpam(target, customMsg), spammer.dm.cooldown);
            }
        }
        return false;
    }
}

function startSpam(target, customMsg = null) {
    if (state.active) return { success: false, message: '❌ Spam already running' };
    if (Date.now() - state.lastBlock < spammer.dm.cooldown) {
        return {
            success: false,
            message: `❌ Recently blocked. Wait ${Math.ceil((spammer.dm.cooldown - (Date.now() - state.lastBlock))/1000)}s`
        };
    }
    if (spammer.whitelistedIds.includes(target.id)) {
        return { success: false, message: '❌ Target is whitelisted' };
    }

    state.active = true;
    state.target = target;
    state.count = 0;
    state.startTime = Date.now();

    // Initial message with delay
    setTimeout(async () => {
        const success = await sendSpam(target, customMsg);
        if (!success) {
            state.active = false;
            return;
        }

        // Start spam loop
        state.interval = setInterval(async () => {
            if (!state.active || state.count >= spammer.dm.maxAttempts) {
                stopSpam();
                return;
            }
            await sendSpam(target, customMsg);
        }, getRandomizedDelay());
    }, spammer.timing.initialDelay);

    return { success: true, message: `✅ Spamming ${target.tag}` };
}

function stopSpam() {
    clearInterval(state.interval);
    state.active = false;
    state.target = null;
    state.count = 0;
    state.startTime = null;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// =====================
// COMMAND HANDLERS
// =====================
async function registerSlashCommands(token) {
    try {
        await new REST({ version: '10' }).setToken(token).put(
            Routes.applicationCommands(client.user.id),
            { body: [
                new SlashCommandBuilder()
                    .setName('dmspam')
                    .setDescription('Start spamming a user')
                    .addUserOption(o => o
                        .setName('user')
                        .setDescription('Target user')
                        .setRequired(true))
                    .addStringOption(o => o
                        .setName('message')
                        .setDescription('Custom message (optional)'))
                    .toJSON(),
                new SlashCommandBuilder()
                    .setName('dmstop')
                    .setDescription('Stop current spam')
                    .toJSON(),
                new SlashCommandBuilder()
                    .setName('dmstatus')
                    .setDescription('Show spam status')
                    .toJSON(),
                new SlashCommandBuilder()
                    .setName('dmhelp')
                    .setDescription('Show help menu')
                    .toJSON()
            ] }
        );
        console.log('Slash commands registered successfully.');
    } catch (error) {
        console.error('Failed to register slash commands:', error);
    }
}

client.on('ready', async () => {
    console.log(`Spammer logged in as ${client.user.tag}`);
    await registerSlashCommands(client.token); // Use the active token
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand() || !spammer.authorizedIds.includes(interaction.user.id)) return;

    try {
        await interaction.deferReply({ ephemeral: true });

        switch (interaction.commandName) {
            case 'dmspam':
                if (state.active) {
                    return interaction.editReply('❌ Spam already running');
                }

                const target = interaction.options.getUser('user');
                const customMsg = interaction.options.getString('message');

                const result = startSpam(target, customMsg || undefined);
                await interaction.editReply(result.message);
                break;

            case 'dmstop':
                stopSpam();
                await interaction.editReply('🛑 Spam stopped');
                break;

            case 'dmstatus':
                await interaction.editReply({
                    embeds: [new EmbedBuilder()
                        .setTitle('Spam Status')
                        .addFields(
                            { name: 'Active', value: state.active ? 'Yes' : 'No', inline: true },
                            { name: 'Target', value: state.target?.tag || 'None', inline: true },
                            { name: 'Messages Sent', value: state.count.toString(), inline: true },
                            { name: 'Running Time', value: state.startTime ?
                                `${Math.floor((Date.now() - state.startTime)/1000)}s` : 'Not running', inline: true }
                        )
                        .setColor(state.active ? '#FF0000' : '#00FF00')
                    ]
                });
                break;

            case 'dmhelp':
                const helpEmbed = new EmbedBuilder()
                    .setTitle('💣 KYN Spammer Commands')
                    .setDescription('**DM Spammer Tool**')
                    .addFields(
                        { name: '/dmspam [user] [message]', value: 'Start spamming a user' },
                        { name: '/dmstop', value: 'Stop current spam' },
                        { name: '/dmstatus', value: 'Show current spam status' },
                        { name: 'Chat Command', value: `\`${general.commandPrefix}dmspam @user [message]\`` }
                    )
                    .setFooter({ text: 'Spammer by KYN | GoldSociety' });

                await interaction.user.send({ embeds: [helpEmbed] })
                    .catch(() => interaction.followUp("❌ Couldn't send DM. Enable DMs!"));
                await interaction.editReply('✅ Check your DMs for help!');
                break;
        }
    } catch (error) {
        console.error('Command error:', error);
        await interaction.editReply('❌ Command failed').catch(console.error);
    }
});

// Legacy chat commands
client.on('messageCreate', async message => {
    if (!message.content.startsWith(general.commandPrefix) ||
        message.author.bot ||
        !spammer.authorizedIds.includes(message.author.id)) return;

    const args = message.content.slice(general.commandPrefix.length).trim().split(/ +/);
    const cmd = args.shift().toLowerCase();

    // !dmspam @user [message]
    if (cmd === 'dmspam') {
        const target = message.mentions.users.first() ||
                      (args[0]?.match(/^\d+$/) ? await client.users.fetch(args[0]).catch(() => null) : null);

        if (!target) {
            return message.reply(`Usage: ${general.commandPrefix}dmspam @user [message]`);
        }
        if (spammer.whitelistedIds.includes(target.id)) {
            return message.reply('❌ Cannot spam whitelisted user');
        }

        const customMsg = message.content.includes(target.id)
            ? message.content.slice(message.content.indexOf(target.id) + target.id.length)
            : null;

        const result = startSpam(target, customMsg);
        await message.reply(result.message);
    }

    // !dmstop
    if (cmd === 'dmstop') {
        stopSpam();
        await message.reply('🛑 Spam stopped');
    }

    // !dmhelp
    if (cmd === 'dmhelp') {
        const helpEmbed = new EmbedBuilder()
            .setTitle('💣 KYN Spammer Help')
            .setDescription(`**Command Prefix:** \`${general.commandPrefix}\``)
            .addFields(
                { name: `${general.commandPrefix}dmspam @user`, value: 'Start spamming' },
                { name: `${general.commandPrefix}dmstop`, value: 'Stop spam' },
                { name: 'Slash Commands', value: 'Also available as `/dmspam`, `/dmstop`' }
            );

        await message.author.send({ embeds: [helpEmbed] })
            .catch(() => message.reply("❌ Enable DMs to see help!"));
    }
});

// =====================
// MULTI-TOKEN SUPPORT (FIXED)
// =====================
let currentTokenIndex = 0;
async function rotateToken() {
    if (!config.spammer.tokens || config.spammer.tokens.length <= 1) return;
    currentTokenIndex = (currentTokenIndex + 1) % config.spammer.tokens.length;
    console.log(`[TOKEN] Switched to token ${currentTokenIndex + 1}`);
    await client.login(config.spammer.tokens[currentTokenIndex]).catch(console.error);
}

// Patch sendSpam() to handle token rotation
const originalSendSpam = sendSpam;
sendSpam = async function(target, customMsg) {
    try {
        return await originalSendSpam(target, customMsg);
    } catch (error) {
        if (error.code === 50007 || error.code === 40001) { // Blocked or unauthorized
            await rotateToken();
        }
        throw error;
    }
};

// Initialize with first token
if (config.spammer.tokens?.length > 0) {
    client.login(config.spammer.tokens[0])
        .then(() => console.log(`Logged in with token 1`))
        .catch(console.error);
} else {
    client.login(config.spammer.token)
        .then(() => console.log(`Logged in with single token`))
        .catch(console.error);
}

// =====================
// ERROR HANDLING
// =====================
process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', error => {
    console.error('Uncaught exception:', error);
});