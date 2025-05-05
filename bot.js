const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { headless: true }
});

let botStatus = true;
const ongoingGames = {};
const groupSettings = {}; // Pour stocker les paramètres de bienvenue et aussi d'au revoir 

client.on('qr', qr => {
    qrcode.generate(qr, { small: true });
    console.log('Scannez le QR code pour vous connecter');
});

client.on('ready', () => {
    console.log('Bot WhatsApp prêt !');
});

client.on('message', async msg => {
    if (msg.from.endsWith('@g.us') && !msg.mentionedIds.includes(client.info.wid._serialized)) {
        return;
    }

    const command = msg.body.split(' ')[0].toLowerCase();
    const args = msg.body.split(' ').slice(1);

    // Commande !ping
    if (command === '!ping' && botStatus) {
        await msg.reply('🏓 Pong!');
    }

    // Commande !tagall 
    else if (command === '!tagall' && botStatus) {
        if (msg.from.endsWith('@g.us')) {
            const chat = await msg.getChat();
            let text = "";
            const mentions = [];

            for (const participant of chat.participants) {
                const contact = await client.getContactById(participant.id._serialized);
                mentions.push(contact.id._serialized);
                text += `@${participant.id.user} `;
            }

            await chat.sendMessage(text, { mentions });
        } else {
            await msg.reply('Cette commande ne fonctionne que dans les groupes');
        }
    }

    // Commande !close
    else if (command === '!close') {
        if (await isAdmin(msg)) {
            botStatus = false;
            await msg.reply('🔒 Bot fermé. Seul !open fonctionnera maintenant.');
        } else {
            await msg.reply('❌ Vous n\'avez pas la permission d\'utiliser cette commande');
        }
    }

    // Commande !open
    else if (command === '!open') {
        if (await isAdmin(msg)) {
            botStatus = true;
            await msg.reply('🔓 Bot ouvert ! Toutes les commandes sont disponibles.');
        } else {
            await msg.reply('❌ Vous n\'avez pas la permission d\'utiliser cette commande');
        }
    }

    // Commande !game
    else if (command === '!game' && botStatus) {
        if (ongoingGames[msg.from]) {
            await msg.reply('Une partie est déjà en cours ! Devinez le nombre entre 1 et 100 avec !guess [nombre]');
            return;
        }

        ongoingGames[msg.from] = {
            number: Math.floor(Math.random() * 100) + 1,
            attempts: 0
        };

        await msg.reply('🎮 Nouveau jeu ! Devinez le nombre entre 1 et 100. Utilisez !guess [nombre]');
    }

    // Commande !guess
    else if (command === '!guess' && botStatus && ongoingGames[msg.from]) {
        const game = ongoingGames[msg.from];
        const guess = parseInt(args[0]);

        if (isNaN(guess)) {
            await msg.reply('Veuillez entrer un nombre valide');
            return;
        }

        game.attempts++;

        if (guess === game.number) {
            await msg.reply(`🎉 Bravo ! Vous avez trouvé en ${game.attempts} tentatives !`);
            delete ongoingGames[msg.from];
        } else if (guess < game.number) {
            await msg.reply('📉 Plus grand !');
        } else {
            await msg.reply('📈 Plus petit !');
        }
    }

    // Commande !promote
    else if (command === '!promote' && botStatus && msg.from.endsWith('@g.us')) {
        if (!await isAdmin(msg)) {
            await msg.reply('❌ Vous n\'avez pas la permission d\'utiliser cette commande');
            return;
        }

        if (!msg.mentionedIds || msg.mentionedIds.length === 0) {
            await msg.reply('Veuillez mentionner un ou plusieurs utilisateurs à promouvoir');
            return;
        }

        const chat = await msg.getChat();
        for (const userId of msg.mentionedIds) {
            try {
                await chat.promoteParticipants([userId]);
                const contact = await client.getContactById(userId);
                await msg.reply(`👑 ${contact.pushname || contact.number} a été promu admin !`);
            } catch (error) {
                console.error(error);
                await msg.reply(`❌ Impossible de promouvoir ${userId.split('@')[0]}`);
            }
        }
    }

    // Commande !demote
    else if (command === '!demote' && botStatus && msg.from.endsWith('@g.us')) {
        if (!await isAdmin(msg)) {
            await msg.reply('❌ Vous n\'avez pas la permission d\'utiliser cette commande');
            return;
        }

        if (!msg.mentionedIds || msg.mentionedIds.length === 0) {
            await msg.reply('Veuillez mentionner un ou plusieurs utilisateurs à rétrograder');
            return;
        }

        const chat = await msg.getChat();
        for (const userId of msg.mentionedIds) {
            try {
                await chat.demoteParticipants([userId]);
                const contact = await client.getContactById(userId);
                await msg.reply(`🔻 ${contact.pushname || contact.number} a été rétrogradé !`);
            } catch (error) {
                console.error(error);
                await msg.reply(`❌ Impossible de rétrograder ${userId.split('@')[0]}`);
            }
        }
    }

    // Commande !kick
    else if (command === '!kick' && botStatus && msg.from.endsWith('@g.us')) {
        if (!await isAdmin(msg)) {
            await msg.reply('❌ Vous n\'avez pas la permission d\'utiliser cette commande');
            return;
        }

        if (!msg.mentionedIds || msg.mentionedIds.length === 0) {
            await msg.reply('Veuillez mentionner un ou plusieurs utilisateurs à expulser');
            return;
        }

        const chat = await msg.getChat();
        for (const userId of msg.mentionedIds) {
            try {
                await chat.removeParticipants([userId]);
                const contact = await client.getContactById(userId);
                await msg.reply(`👢 ${contact.pushname || contact.number} a été expulsé du groupe !`);
            } catch (error) {
                console.error(error);
                await msg.reply(`❌ Impossible d'expulser ${userId.split('@')[0]}`);
            }
        }
    }

    // Commande !kickall
    else if (command === '!kickall' && botStatus && msg.from.endsWith('@g.us')) {
        if (!await isAdmin(msg)) {
            await msg.reply('❌ Vous n\'avez pas la permission d\'utiliser cette commande');
            return;
        }

        const chat = await msg.getChat();
        const participants = chat.participants.filter(p => !p.isAdmin && p.id._serialized !== client.info.wid._serialized);
        const participantIds = participants.map(p => p.id._serialized);

        if (participantIds.length === 0) {
            await msg.reply('Aucun membre à expulser (seuls les admins restent)');
            return;
        }

        try {
            await chat.removeParticipants(participantIds);
            await msg.reply(`👢 ${participantIds.length} membres ont été expulsés du groupe !`);
        } catch (error) {
            console.error(error);
            await msg.reply('❌ Une erreur est survenue lors de l\'expulsion des membres');
        }
    }

    // Commande !tag
    else if (command === '!tag' && botStatus) {
        if (!msg.mentionedIds || msg.mentionedIds.length === 0) {
            await msg.reply('Veuillez mentionner un ou plusieurs utilisateurs');
            return;
        }

        const mentions = [];
        let text = args.join(' ') + ' ';

        for (const userId of msg.mentionedIds) {
            mentions.push(userId);
            text += `@${userId.split('@')[0]} `;
        }

        await msg.reply(text, { mentions });
    }

    // Commande !welcome
    else if (command === '!welcome' && botStatus && msg.from.endsWith('@g.us')) {
        if (!await isAdmin(msg)) {
            await msg.reply('❌ Vous n\'avez pas la permission d\'utiliser cette commande');
            return;
        }

        if (args.length === 0) {
           
            const currentWelcome = groupSettings[msg.from]?.welcome || 'Aucun message de bienvenue défini';
            await msg.reply(`Message de bienvenue actuel :\n${currentWelcome}\n\nUtilisez !welcome [message] pour le changer`);
            return;
        }

    
        if (!groupSettings[msg.from]) groupSettings[msg.from] = {};
        groupSettings[msg.from].welcome = args.join(' ');
        await msg.reply('✅ Message de bienvenue mis à jour !');
    }

    // Commande !goodbye
    else if (command === '!goodbye' && botStatus && msg.from.endsWith('@g.us')) {
        if (!await isAdmin(msg)) {
            await msg.reply('❌ Vous n\'avez pas la permission d\'utiliser cette commande');
            return;
        }

        if (args.length === 0) {
          
            const currentGoodbye = groupSettings[msg.from]?.goodbye || 'Aucun message d\'au revoir défini';
            await msg.reply(`Message d'au revoir actuel :\n${currentGoodbye}\n\nUtilisez !goodbye [message] pour le changer`);
            return;
        }

        if (!groupSettings[msg.from]) groupSettings[msg.from] = {};
        groupSettings[msg.from].goodbye = args.join(' ');
        await msg.reply('✅ Message d\'au revoir mis à jour !');
    }
});


client.on('group_join', async (notification) => {
    const chatId = notification.chatId;
    if (groupSettings[chatId]?.welcome) {
        const chat = await client.getChatById(chatId);
        const contact = await client.getContactById(notification.recipientIds[0]);
        const welcomeMessage = groupSettings[chatId].welcome.replace('{user}', `@${contact.id.user}`);
        await chat.sendMessage(welcomeMessage, { mentions: [contact.id._serialized] });
    }
});

client.on('group_leave', async (notification) => {
    const chatId = notification.chatId;
    if (groupSettings[chatId]?.goodbye) {
        const chat = await client.getChatById(chatId);
        const contact = await client.getContactById(notification.recipientIds[0]);
        const goodbyeMessage = groupSettings[chatId].goodbye.replace('{user}', `@${contact.id.user}`);
        await chat.sendMessage(goodbyeMessage, { mentions: [contact.id._serialized] });
    }
});

async function isAdmin(msg) {
    if (msg.from.endsWith('@g.us')) {
        const chat = await msg.getChat();
        const participant = chat.participants.find(p => p.id._serialized === msg.author);
        return participant && participant.isAdmin;
    }
   
    return true;
}

client.initialize();