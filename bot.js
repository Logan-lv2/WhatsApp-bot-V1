const { makeWASocket, useSingleFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys')
const qrcode = require('qrcode-terminal')
const { OpenAI } = require('openai')
require('dotenv').config()

// Configuration de base
let botStatus = true
const BOT_PREFIX = '!'
const ongoingGames = {}
const groupSettings = {}

// Configuration OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_KEY || ""
})

// ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
// MENU DES COMMANDES
// ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
const commandMenu = `
╔════════════════════════╗
       *Manu-IA - Commandes*
╚════════════════════════╝

📌 *Basiques:*
${BOT_PREFIX}ping - Test du bot
${BOT_PREFIX}menu - Affiche ce menu

🤖 *IA:*
${BOT_PREFIX}ia [question] - Pose une question
${BOT_PREFIX}vu - Voir les médias à vue unique

🎮 *Jeux:*
${BOT_PREFIX}game - Jeu de devinette
${BOT_PREFIX}guess [nombre] - Devine le nombre

🖼️ *Stickers:*
${BOT_PREFIX}sticker [pack] [auteur] - Créer un sticker

🛡️ *Admin:*
${BOT_PREFIX}promote @user - Promouvoir
${BOT_PREFIX}demote @user - Rétrograder
${BOT_PREFIX}kick @user - Expulser
${BOT_PREFIX}kickall - Tout expulser
${BOT_PREFIX}welcome [texte] - Message de bienvenue
${BOT_PREFIX}goodbye [texte] - Message d'au revoir
${BOT_PREFIX}open - Activer le bot
${BOT_PREFIX}close - Désactiver le bot`

// ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
// FONCTIONS UTILITAIRES
// ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function isAdmin(msg, client) {
  if (!msg.key.remoteJid.endsWith('@g.us')) return true
  try {
    const groupMetadata = await client.groupMetadata(msg.key.remoteJid)
    const participant = groupMetadata.participants.find(p => p.id === (msg.key.participant || msg.key.remoteJid))
    return participant?.admin
  } catch (error) {
    console.error('Erreur isAdmin:', error)
    return false
  }
}

// ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
// CONNEXION WHATSAPP
// ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
const { state, saveState } = useSingleFileAuthState('./auth_info.json')
const client = makeWASocket({
  auth: state,
  printQRInTerminal: true,
})

client.ev.on('connection.update', (update) => {
  const { connection, lastDisconnect } = update
  if (connection === 'close') {
    const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut
    console.log(shouldReconnect ? '🔄 Reconnexion...' : '❌ Déconnecté')
    if (shouldReconnect) setTimeout(() => initializeClient(), 5000)
  } else if (connection === 'open') {
    console.log('✅ Manu-IA connecté !')
  }
})

// ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
// GESTION DES MESSAGES
// ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
client.ev.on('messages.upsert', async ({ messages }) => {
  const msg = messages[0]
  if (!msg.message || !botStatus) return

  const text = msg.message.conversation || msg.message.extendedTextMessage?.text || ''
  const command = text.startsWith(BOT_PREFIX) ? text.slice(BOT_PREFIX.length).split(' ')[0].toLowerCase() : ''
  const args = text.split(' ').slice(1)
  const isGroup = msg.key.remoteJid.endsWith('@g.us')

  try {
    // ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
    // COMMANDES BASIQUES
    // ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
    if (command === 'menu' || command === 'aide' || command === 'help') {
      await client.sendMessage(msg.key.remoteJid, { text: commandMenu })
    }
    else if (command === 'ping') {
      await client.sendMessage(msg.key.remoteJid, { text: '🏓 Pong ! Manu-IA actif' })
    }

    // ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
    // COMMANDE !vu (VUES UNIQUES)
    // ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
    else if (command === 'vu' && await isAdmin(msg, client)) {
      const messages = await client.loadMessages(msg.key.remoteJid, 100)
      const viewOnceMessages = messages.filter(m => 
        m.message?.viewOnceMessageV2 || 
        m.message?.viewOnceMessageV2Extension
      )

      if (viewOnceMessages.length === 0) {
        await client.sendMessage(msg.key.remoteJid, { text: "Aucun message à vue unique trouvé." })
        return
      }

      for (const m of viewOnceMessages) {
        const mediaType = m.message.imageMessage ? 'image' : 
                         m.message.videoMessage ? 'video' : 'fichier'
        
        const buffer = await client.downloadMediaMessage(m)
        await client.sendMessage(msg.key.remoteJid, {
          [mediaType]: buffer,
          mimetype: m.message[`${mediaType}Message`].mimetype,
          caption: `📌 ${mediaType} à vue unique (${new Date(m.messageTimestamp * 1000).toLocaleString()})`
        })
      }
    }

    // ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
    // COMMANDE !ia (IA OpenAI)
    // ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
    else if ((command === 'ia' || text.includes('@' + (client.user?.id?.split('@')[0] || 'bot'))) {
      const prompt = text.replace(command, '').trim()
      if (!prompt) {
        await client.sendMessage(msg.key.remoteJid, { 
          text: "🤖 *Manu-IA* : Posez-moi une question ! Ex:\n`!ia Quelle est la capitale de la France ?`" 
        })
        return
      }

      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 500
      })

      await client.sendMessage(msg.key.remoteJid, { 
        text: `🤖 *Manu-IA* : ${completion.choices[0].message.content}`,
        mentions: [msg.key.participant || msg.key.remoteJid]
      })
    }

    // ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
    // COMMANDE !sticker
    // ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
    else if ((command === 'sticker' || command === 's')) {
      const defaultConfig = {
        packName: "Team Développeur",
        authorName: "Créé par Manu-IA",
        categories: ["❤️", "😂", "✨"],
        quality: 100
      }

      const packName = args[0] || defaultConfig.packName
      const authorName = args[1] || defaultConfig.authorName

      let media
      if (msg.message?.imageMessage) {
        media = await client.downloadMediaMessage(msg)
      } else if (msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage) {
        media = await client.downloadMediaMessage({
          key: {
            remoteJid: msg.key.remoteJid,
            id: msg.message.extendedTextMessage.contextInfo.stanzaId
          },
          message: msg.message.extendedTextMessage.contextInfo.quotedMessage
        })
      } else {
        await client.sendMessage(msg.key.remoteJid, { 
          text: '❌ Envoyez ou répondez à une image avec la commande !sticker [NomPack] [Auteur]' 
        })
        return
      }

      await client.sendMessage(msg.key.remoteJid, {
        sticker: { 
          url: media,
          metadata: {
            pack: packName,
            author: authorName,
            categories: defaultConfig.categories,
            keepScale: true,
            quality: defaultConfig.quality
          }
        },
        mimetype: 'image/webp'
      })

      await client.sendMessage(msg.key.remoteJid, {
        text: `✨ Sticker créé avec succès!\nPack: *${packName}*\nAuteur: *${authorName}*`
      })
    }

    // ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
    // JEUX
    // ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
    else if (command === 'game') {
      ongoingGames[msg.key.remoteJid] = {
        number: Math.floor(Math.random() * 100) + 1,
        attempts: 0
      }
      await client.sendMessage(msg.key.remoteJid, { text: '🎮 Devinez le nombre entre 1 et 100 (!guess [nombre])' })
    }
    else if (command === 'guess' && ongoingGames[msg.key.remoteJid]) {
      const game = ongoingGames[msg.key.remoteJid]
      const guess = parseInt(args[0])
      if (isNaN(guess)) {
        await client.sendMessage(msg.key.remoteJid, { text: 'Nombre invalide' })
        return
      }
      game.attempts++
      if (guess === game.number) {
        await client.sendMessage(msg.key.remoteJid, { text: `🎉 Trouvé en ${game.attempts} tentatives !` })
        delete ongoingGames[msg.key.remoteJid]
      } else {
        await client.sendMessage(msg.key.remoteJid, { text: guess < game.number ? '📉 Plus grand' : '📈 Plus petit' })
      }
    }

    // ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
    // ADMINISTRATION
    // ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
    else if (isGroup && await isAdmin(msg, client)) {
      if ((command === 'promote' || command === 'promouvoir') && msg.message.extendedTextMessage?.contextInfo?.mentionedJid) {
        await client.groupParticipantsUpdate(msg.key.remoteJid, msg.message.extendedTextMessage.contextInfo.mentionedJid, 'promote')
        await client.sendMessage(msg.key.remoteJid, { text: '👑 Membre(s) promu(s)' })
      }
      else if ((command === 'demote' || command === 'retrograder') && msg.message.extendedTextMessage?.contextInfo?.mentionedJid) {
        await client.groupParticipantsUpdate(msg.key.remoteJid, msg.message.extendedTextMessage.contextInfo.mentionedJid, 'demote')
        await client.sendMessage(msg.key.remoteJid, { text: '🔻 Admin(s) rétrogradé(s)' })
      }
      else if ((command === 'kick' || command === 'expulser') && msg.message.extendedTextMessage?.contextInfo?.mentionedJid) {
        await client.groupParticipantsUpdate(msg.key.remoteJid, msg.message.extendedTextMessage.contextInfo.mentionedJid, 'remove')
        await client.sendMessage(msg.key.remoteJid, { text: '👢 Membre(s) expulsé(s)' })
      }
      else if (command === 'kickall' || command === 'expulsertous') {
        const groupMetadata = await client.groupMetadata(msg.key.remoteJid)
        const nonAdmins = groupMetadata.participants.filter(p => !p.admin).map(p => p.id)
        await client.groupParticipantsUpdate(msg.key.remoteJid, nonAdmins, 'remove')
        await client.sendMessage(msg.key.remoteJid, { text: `👢 ${nonAdmins.length} membres expulsés` })
      }
      else if (command === 'welcome' || command === 'bienvenue') {
        groupSettings[msg.key.remoteJid] = groupSettings[msg.key.remoteJid] || {}
        groupSettings[msg.key.remoteJid].welcome = args.join(' ') || 'Bienvenue {user} !'
        await client.sendMessage(msg.key.remoteJid, { text: '✅ Message de bienvenue mis à jour' })
      }
      else if (command === 'goodbye' || command === 'aurevoir') {
        groupSettings[msg.key.remoteJid] = groupSettings[msg.key.remoteJid] || {}
        groupSettings[msg.key.remoteJid].goodbye = args.join(' ') || 'Au revoir {user} !'
        await client.sendMessage(msg.key.remoteJid, { text: '✅ Message d\'au revoir mis à jour' })
      }
      else if (command === 'open') {
        botStatus = true
        await client.sendMessage(msg.key.remoteJid, { text: '🔓 Bot activé !' })
      }
      else if (command === 'close') {
        botStatus = false
        await client.sendMessage(msg.key.remoteJid, { text: '🔒 Bot désactivé' })
      }
    }

    // ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
    // MENTIONS
    // ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
    else if (command === 'tagall' && isGroup) {
      const groupMetadata = await client.groupMetadata(msg.key.remoteJid)
      let text = ""
      const mentions = groupMetadata.participants.map(p => p.id)
      mentions.forEach(id => {
        text += `@${id.split('@')[0]} `
      })
      await client.sendMessage(msg.key.remoteJid, { text, mentions })
    }

  } catch (error) {
    console.error('Erreur traitement message:', error)
    await client.sendMessage(msg.key.remoteJid, { 
      text: "❌ Erreur de traitement. Réessayez plus tard."
    })
  }
})

// ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
// GESTION DES ÉVÉNEMENTS DE GROUPE
// ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
client.ev.on('group-participants.update', async ({ id, participants, action }) => {
  if (!groupSettings[id]) return

  const user = participants[0]
  try {
    if (action === 'add' && groupSettings[id].welcome) {
      await client.sendMessage(id, {
        text: groupSettings[id].welcome.replace('{user}', `@${user.split('@')[0]}`),
        mentions: [user]
      })
    } else if (action === 'remove' && groupSettings[id].goodbye) {
      await client.sendMessage(id, {
        text: groupSettings[id].goodbye.replace('{user}', `@${user.split('@')[0]}`),
        mentions: [user]
      })
    }
  } catch (error) {
    console.error('Erreur gestion groupe:', error)
  }
})

// ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
// DÉMARRAGE DU BOT
// ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
client.ev.on('creds.update', saveState)

async function initializeClient() {
  await client.connect()
  console.log('🔄 Manu-IA en attente de connexion...')
}

initializeClient()