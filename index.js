require('dotenv').config();
const { Client, GatewayIntentBits, PermissionFlagsBits } = require('discord.js');
const cron = require('node-cron');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
    ]
});

client.once('ready', () => {
    console.log(`Zalogowano jako ${client.user.tag}!`);
    
    // Generowanie linku zaproszenia
    const inviteLink = client.generateInvite({
        scopes: ['bot'],
        permissions: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.MentionEveryone,
        ],
    });
    console.log(`🔗 Link do zaproszenia bota na serwer:\n${inviteLink}\n`);

    console.log('Harmonogram metinów uruchomiony: xx:00, xx:15, xx:30, xx:45');
    console.log('Harmonogram ostrzeżeń uruchomiony: xx:13, xx:28, xx:43, xx:58');

    // Funkcja pomocnicza do wysyłania wiadomości
    const sendMessage = (message) => {
        const channelId = process.env.CHANNEL_ID;
        if (!channelId) {
            console.error('Błąd: Brak CHANNEL_ID w pliku .env');
            return;
        }
        const channel = client.channels.cache.get(channelId);
        if (channel) {
            channel.send(message);
            console.log(`[${new Date().toLocaleTimeString()}] Wysłano wiadomość: "${message.substring(0, 20)}..."`);
        } else {
            console.error(`Błąd: Nie mogę znaleźć kanału o ID: ${channelId}. Sprawdź czy bot ma do niego dostęp.`);
        }
    };

    // 2 minuty przed respem: 13, 28, 43, 58
    cron.schedule('13,28,43,58 * * * *', () => {
        sendMessage('⏳ **Za 2 minuty zrespią się metiny!** Szykujcie się!');
    });

    // Resp: 0, 15, 30, 45 minuta każdej godziny
    cron.schedule('0,15,30,45 * * * *', () => {
        sendMessage('⚔️ **Uwaga! Respią się metiny!** ⚔️\nPowodzenia w dropieniu! @here');
    });
});

// Obsługa błędów logowania
if (!process.env.DISCORD_TOKEN) {
    console.error('Błąd: Brak DISCORD_TOKEN w pliku .env');
} else {
    client.login(process.env.DISCORD_TOKEN);
}
