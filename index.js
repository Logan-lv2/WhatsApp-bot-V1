const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const axios = require('axios');

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { headless: true }
});

// Config
const OWNERS = ['242067274660@c.us', '044148217@c.us']; // Sasaki & KingJr7
let botStatus = true;
const ongoingGames = {};
const groupSettings = {}; 

// 30 Jeux
const GAMES = {
    'devine': 'Devine le nombre entre 1 et 100 (!devine)',
    'pendu': 'Jeu du pendu (!pendu)',
    'pfc': 'Pierre-Feuille-Ciseaux (!pfc [pierre|feuille|ciseaux])',
    'quiz': 'Quiz (!quiz)',
    'dice': 'Lancer un dé (!dice)',
    // ... Ajoutez 25 autres jeux ici ...
};

// Démarrer le bot
client.on('qr', qr => {
    qrcode.generate(qr, { small: true });
    console.log('Scannez le QR code pour vous connecter');
});

client.on('ready', () => {
    console.log('✅ Bot WhatsApp prêt !');
});

// Gestion des messages
client.on('message', async msg => {
    if (!botStatus && !msg.body.startsWith('!open')) return;

    const command = msg.body.split(' ')[0].toLowerCase();
    const args = msg.body.split(' ').slice(1);

    // Commandes de base
    if (command === '!ping') {
        await msg.reply('🏓 Pong ! Le bot est actif.');
    }

    // Tagall (amélioré)
    else if (command === '!tagall') {
        if (msg.from.endsWith('@g.us')) {
            const chat = await msg.getChat();
            let text = "📢 **Mention de tous les membres** : ";
            const mentions = chat.participants.map(p => p.id._serialized);
            text += mentions.map(id => `@${id.split('@')[0]}`).join(' ');
            await chat.sendMessage(text, { mentions });
        }
    }

    // IA (GPT-3.5)
    else if (command === '!ia') {
        const prompt = args.join(' ');
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: prompt }]
        }, {
            headers: { 'Authorization': `Bearer ${process.env.OPENAI_KEY}` }
        });
        await msg.reply(response.data.choices[0].message.content);
    }

    // Jeux (exemple avec 5 jeux)
    else if (command === '!jeux') {
        let gamesList = "🎮 **30 Commandes de Jeux** :\n";
        gamesList += Object.entries(GAMES).map(([cmd, desc]) => `• ${desc}`).join('\n');
        await msg.reply(gamesList);
    }

    // Exemple : Jeu de dés
    else if (command === '!dice') {
        const roll = Math.floor(Math.random() * 6) + 1;
        await msg.reply(`🎲 Vous avez obtenu : ${roll}`);
    }

    // Admin : Clear
    else if (command === '!clear') {
        if (await isOwner(msg)) {
            await msg.reply('⚠️ Cette commande est en développement pour WhatsApp.');
        }
    }

    // Owner Only
    else if (command === '!owner') {
        if (await isOwner(msg)) {
            await msg.reply('👑 Vous êtes un propriétaire du bot !');
        }
    }
});

// Fonctions utiles
async function isOwner(msg) {
    return OWNERS.includes(msg.author);
}

client.initialize();