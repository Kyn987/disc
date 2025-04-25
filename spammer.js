const { Client, GatewayIntentBits, SlashCommandBuilder, Routes, EmbedBuilder } = require('discord.js');
const { REST } = require('@discordjs/rest');
const express = require('express');
const axios = require('axios');
const config = require('./config');

// Initialize configurations
const spammerConfig = config.spammer;
const generalConfig = config.general;
const safetyConfig = config.safety;

// Bot initialization
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMembers
    ]
});

// State variables
let spamActive = false;
let spamTarget = null;
let spamInterval = null;
let spamCount = 0;
let lastBlockedTime = 0;
let operationStartTime = null;

// =====================
// UPTIME MONITOR SETUP
// =====================
const monitor = express();
const MONITOR_PORT = generalConfig.uptimePort + 1; // Different port from nuker

monitor.get('/', (req, res) => {
    res.status(200).json({
        status: 'online',
        bot: client?.user?.tag || 'not ready',
        uptime: process.uptime(),
        spamActive: spamActive,
        target: spamTarget?.tag || 'none',
        messagesSent: spamCount,
        runningFor: operationStartTime ? Date.now() - operationStartTime : 0
    });
});

monitor.listen(MONITOR_PORT, () => {
    console.log(`Spammer uptime monitor running on port ${MONITOR_PORT}`);
});

// =====================
// SLASH COMMANDS SETUP
// =====================
const commands = [
    new SlashCommandBuilder()
        .setName('dmspam')
        .setDescription('Start spamming a user in DMs')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to spam')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('message')
                .setDescription('Custom message to send (optional)'))
        .addIntegerOption(option =>
            option.setName('count')
                .setDescription('Number of messages to send (default: unlimited)')),
    new SlashCommandBuilder()
        .setName('dmstop')
        .setDescription('Stop the current spam'),
    new SlashCommandBuilder()
        .setName('dmstatus')
        .setDescription('Show current spam status')
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(spammerConfig.token);

// =====================
// HELPER FUNCTIONS
// =====================
function stopSpam() {
    if (spamInterval) clearInterval(spamInterval);
    spamActive = false;
    spamTarget = null;
    spamCount = 0;
    operationStartTime = null;
}

function getRandomMessage(target) {
    if (!spammerConfig.bypass.rotateMessages) {
        return spammerConfig.defaultSpamMessage.replace('{user}', target?.toString() || '');
    }

    const message = spammerConfig.bypass.messageVariants[
        Math.floor(Math.random() * spammerConfig.bypass.messageVariants.length)
    ].replace('{user}', target?.toString() || '');

    if (spammerConfig.bypass.addRandomText) {
        return message + ' ' + Math.random().toString(36).substring(2, 8);
    }
    return message;
}

async function sendSpamMessage(target, customMessage = null) {
    if (!spamActive || !target) return;

    try {
        // Show typing indicator if enabled
        if (spammerConfig.behavior.sendTyping) {
            await target.sendTyping();
            await new Promise(resolve => setTimeout(resolve, spammerConfig.timing.typingDelay));
        }

        // Prepare message
        let messageContent;
        if (customMessage) {
            messageContent = customMessage;
        } else {
            messageContent = getRandomMessage(target);
        }

        // Mention user in first message if enabled
        if (spammerConfig.behavior.mentionUser && spamCount === 0) {
            messageContent = `${target.toString()} ${messageContent}`;
        }

        // Send message
        await target.send(messageContent);
        spamCount++;

        // Delete message after delay if enabled
        if (spammerConfig.behavior.deleteMessages) {
            setTimeout(async () => {
                try {
                    const messages = await target.dmChannel?.messages.fetch({ limit: 1 });
                    if (messages?.first()?.author.id === client.user.id) {
                        await messages.first().delete();
                    }
                } catch (error) {
                    console.error('Could not delete message:', error);
                }
            }, spammerConfig.dm.deleteAfter);
        }

    } catch (error) {
        console.error('DM failed:', error);
        if (error.code === 50007) { // Cannot send messages to this user
            lastBlockedTime = Date.now();
            if (spammerConfig.behavior.autoRestart) {
                setTimeout(() => startSpam(target, customMessage), spammerConfig.dm.cooldown);
            }
        }
        stopSpam();
        return false;
    }
    return true;
}

async function startSpam(target, customMessage = null, maxCount = null) {
    if (spamActive) return false;

    // Check if recently blocked
    if (Date.now() - lastBlockedTime < spammerConfig.dm.cooldown) {
        const remaining = Math.ceil((spammerConfig.dm.cooldown - (Date.now() - lastBlockedTime)) / 1000);
        return { success: false, message: `❌ Recently blocked. Wait ${remaining}s before retrying.` };
    }

    // Check whitelist
    if (spammerConfig.whitelistedIds.includes(target.id)) {
        return { success: false, message: '❌ Cannot spam whitelisted user.' };
    }

    spamActive = true;
    spamTarget = target;
    spamCount = 0;
    operationStartTime = Date.now();

    // Send initial message
    const initialSuccess = await sendSpamMessage(target, customMessage);
    if (!initialSuccess) {
        return { success: false, message: '❌ Initial message failed. User may have DMs disabled.' };
    }

    // Setup spam interval
    spamInterval = setInterval(async () => {
        if (!spamActive) return;

        // Check max count
        if (maxCount && spamCount >= maxCount) {
            stopSpam();
            return;
        }

        // Check safety limits
        if (operationStartTime && (Date.now() - operationStartTime) > safetyConfig.maxOperationTime) {
            stopSpam();
            return;
        }

        await sendSpamMessage(target, customMessage);
    }, spammerConfig.timing.betweenMessages);

    return { success: true, message: `✅ Started spamming ${target.tag}` };
}

// =====================
// UPTIME FEATURES
// =====================
function startSelfPing() {
    if (process.env.REPLIT_URL) {
        setInterval(() => {
            axios.get(process.env.REPLIT_URL)
                .catch(() => console.log('Self-ping failed'));
        }, generalConfig.selfPingInterval);
    }
}

function setupAutoReconnect() {
    setInterval(() => {
        if (!client.isReady()) {
            console.log('Attempting reconnect...');
            client.login(spammerConfig.token).catch(console.error);
        }
    }, generalConfig.reconnectInterval);
}

// =====================
// COMMAND HANDLERS
// =====================
client.on('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    client.user.setActivity('DM Spammer', { type: 'PLAYING' });
    startSelfPing();
    setupAutoReconnect();

    try {
        console.log('Started refreshing application (/) commands.');
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands }
        );
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error('Error refreshing slash commands:', error);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    // Permission check
    if (!spammerConfig.authorizedIds.includes(interaction.user.id)) {
        return interaction.reply({ content: '❌ You are not authorized to use this command.', ephemeral: true });
    }

    try {
        await interaction.deferReply({ ephemeral: true });

        // Command: /dmstop
        if (interaction.commandName === 'dmstop') {
            if (spamActive) {
                stopSpam();
                return interaction.editReply('🛑 Stopped spam successfully');
            } else {
                return interaction.editReply('⚠️ No active spam to stop');
            }
        }

        // Command: /dmstatus
        if (interaction.commandName === 'dmstatus') {
            const statusEmbed = new EmbedBuilder()
                .setTitle('📩 Spam Status')
                .addFields(
                    { name: 'Active', value: spamActive ? 'Yes' : 'No', inline: true },
                    { name: 'Target', value: spamTarget?.tag || 'None', inline: true },
                    { name: 'Messages Sent', value: spamCount.toString(), inline: true },
                    { name: 'Running Time', value: operationStartTime ? 
                        `${Math.floor((Date.now() - operationStartTime)/1000)}s` : 'Not running', inline: true },
                    { name: 'Last Blocked', value: lastBlockedTime ? 
                        `${Math.floor((Date.now() - lastBlockedTime)/1000)}s ago` : 'Never', inline: true }
                )
                .setColor(spamActive ? '#FF0000' : '#00FF00');

            return interaction.editReply({ embeds: [statusEmbed] });
        }

        // Command: /dmspam
        if (interaction.commandName === 'dmspam') {
            if (spamActive) {
                return interaction.editReply('❌ A spam is already running. Use /dmstop first.');
            }

            const targetUser = interaction.options.getUser('user');
            const customMessage = interaction.options.getString('message');
            const maxCount = interaction.options.getInteger('count');

            // Check whitelist
            if (spammerConfig.whitelistedIds.includes(targetUser.id)) {
                return interaction.editReply('❌ I cannot spam this user (whitelisted).');
            }

            // Start spam
            const result = await startSpam(targetUser, customMessage, maxCount);
            if (result.success) {
                await interaction.editReply(`✅ Started spamming ${targetUser.tag}${maxCount ? ` (max ${maxCount} messages)` : ''}`);

                // Send initial embed if custom message
                if (customMessage) {
                    const embed = new EmbedBuilder()
                        .setTitle('📩 Custom Spam Started')
                        .setDescription(`Target: ${targetUser.toString()}\nMessage: ${customMessage}`)
                        .setColor('#FF0000');
                    await interaction.followUp({ embeds: [embed], ephemeral: true });
                }
            } else {
                await interaction.editReply(result.message);
            }
        }
    } catch (error) {
        console.error('Error handling interaction:', error);
        await interaction.editReply('❌ An error occurred while processing your command.').catch(console.error);
    }
});

// Handle legacy text commands
client.on('messageCreate', async message => {
    if (!message.content.startsWith(generalConfig.commandPrefix) || message.author.bot) return;

    const args = message.content.slice(generalConfig.commandPrefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // Permission check
    if (!spammerConfig.authorizedIds.includes(message.author.id)) return;

    // Command: !dmstop
    if (command === 'dmstop') {
        if (spamActive) {
            stopSpam();
            return message.reply('🛑 Stopped spam successfully').catch(console.error);
        } else {
            return message.reply('⚠️ No active spam to stop').catch(console.error);
        }
    }

    // Command: !dmspam
    if (command === 'dmspam') {
        if (spamActive) {
            return message.reply('❌ A spam is already running. Use !dmstop first.').catch(console.error);
        }

        let targetUser;
        let customMessage = null;
        let maxCount = null;

        // Parse target user (mention or ID)
        if (message.mentions.users.first()) {
            targetUser = message.mentions.users.first();
            const mentionIndex = message.content.indexOf(targetUser.id) + targetUser.id.length;
            customMessage = message.content.slice(mentionIndex).trim();
        } else if (/^\d{17,19}$/.test(args[0])) {
            try {
                targetUser = await client.users.fetch(args[0]);
                const idIndex = message.content.indexOf(args[0]) + args[0].length;
                customMessage = message.content.slice(idIndex).trim();
            } catch (error) {
                return message.reply('❌ Invalid user ID or user not found').catch(console.error);
            }
        } else {
            return message.reply(`❌ Usage: ${generalConfig.commandPrefix}dmspam @user|id [message] [count]`).catch(console.error);
        }

        // Parse max count if provided
        const countMatch = customMessage?.match(/\d+$/);
        if (countMatch) {
            maxCount = parseInt(countMatch[0]);
            customMessage = customMessage.slice(0, -countMatch[0].length).trim();
        }

        // Check whitelist
        if (spammerConfig.whitelistedIds.includes(targetUser.id)) {
            return message.reply('❌ I cannot spam this user (whitelisted).').catch(console.error);
        }

        // Start spam
        const result = await startSpam(targetUser, customMessage || undefined, maxCount);
        return message.reply(result.message).catch(console.error);
    }
});

// =====================
// ERROR HANDLING
// =====================
process.on('unhandledRejection', error => {
    console.error('Unhandled rejection:', error);
});

process.on('uncaughtException', error => {
    console.error('Uncaught exception:', error);
});

// =====================
// START THE BOT
// =====================
client.login(spammerConfig.token)
    .then(() => console.log('Spammer bot login successful'))
    .catch(err => {
        console.error('Login failed:', err);
        process.exit(1);
    });