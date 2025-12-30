require('dotenv').config();
const { Client, GatewayIntentBits, PermissionFlagsBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const cron = require('node-cron');
const fs = require('fs');

// --- ZARZĄDZANIE KONFIGURACJĄ I ZADANIAMI ---

const CONFIG_FILE = './config.json';
let config = [];
const activeJobs = new Map(); // Przechowuje aktywne zadania cron: { 'nazwa': [job1, job2] }

// Funkcja ładowania konfiguracji
function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const rawConfig = fs.readFileSync(CONFIG_FILE);
            config = JSON.parse(rawConfig);
        } else {
            config = [];
            saveConfig();
        }
    } catch (error) {
        console.error('Błąd podczas ładowania config.json:', error);
        config = [];
    }
}

// Funkcja zapisywania konfiguracji
function saveConfig() {
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 4));
    } catch (error) {
        console.error('Błąd podczas zapisywania config.json:', error);
    }
}

// Funkcja uruchamiająca pojedynczy timer
function startTimer(timer) {
    // Zatrzymaj stare zadania jeśli istnieją (np. przy aktualizacji)
    stopTimer(timer.name);

    const jobs = [];

    // Funkcja pomocnicza do wysyłania wiadomości
    const sendMessage = (message) => {
        const channel = client.channels.cache.get(timer.channelId);
        if (channel) {
            channel.send(message).catch(err => console.error(`Błąd wysyłania wiadomości na kanał ${timer.channelId}:`, err));
            console.log(`[${new Date().toLocaleTimeString()}] [${timer.name}] Wysłano: "${message.substring(0, 20)}..."`);
        } else {
            console.error(`Błąd: Nie znaleziono kanału ${timer.channelId} dla timera ${timer.name}`);
        }
    };

    // Główny timer
    if (timer.cron && timer.message && cron.validate(timer.cron)) {
        const job = cron.schedule(timer.cron, () => sendMessage(timer.message));
        jobs.push(job);
    }

    // Ostrzeżenie
    if (timer.warningCron && timer.warningMessage && cron.validate(timer.warningCron)) {
        const warningJob = cron.schedule(timer.warningCron, () => sendMessage(timer.warningMessage));
        jobs.push(warningJob);
    }

    if (jobs.length > 0) {
        activeJobs.set(timer.name, jobs);
        console.log(`✅ Uruchomiono timer: ${timer.name}`);
    } else {
        console.log(`⚠️ Timer ${timer.name} nie został uruchomiony (błędny CRON lub brak danych).`);
    }
}

// Funkcja zatrzymująca timer
function stopTimer(name) {
    if (activeJobs.has(name)) {
        const jobs = activeJobs.get(name);
        jobs.forEach(job => job.stop());
        activeJobs.delete(name);
        console.log(`⏹️ Zatrzymano timer: ${name}`);
    }
}

// Funkcja przeładowująca wszystkie timery
function reloadAllTimers() {
    // Zatrzymaj wszystkie
    activeJobs.forEach((jobs) => jobs.forEach(j => j.stop()));
    activeJobs.clear();

    // Uruchom ponownie
    config.forEach(timer => {
        if (timer.channelId && timer.channelId !== 'TU_WPISZ_ID_KANALU_BOSSA') {
            startTimer(timer);
        }
    });
}

// --- KLIENT DISCORD ---

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
    ]
});

// Definicja komendy /config
const configCommand = new SlashCommandBuilder()
    .setName('config')
    .setDescription('Zarządzanie timerami bota')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
        subcommand
            .setName('list')
            .setDescription('Wyświetla listę aktywnych timerów'))
    .addSubcommand(subcommand =>
        subcommand
            .setName('add')
            .setDescription('Dodaje nowy timer')
            .addStringOption(option => option.setName('nazwa').setDescription('Unikalna nazwa timera').setRequired(true))
            .addStringOption(option => option.setName('czas').setDescription('CRON (np. "0,15,30,45 * * * *")').setRequired(true))
            .addStringOption(option => option.setName('wiadomosc').setDescription('Treść wiadomości').setRequired(true))
            .addChannelOption(option => option.setName('kanal').setDescription('Kanał (domyślnie ten sam)').setRequired(false))
            .addStringOption(option => option.setName('ostrzezenie_czas').setDescription('CRON ostrzeżenia (np. "13,28 * * * *")').setRequired(false))
            .addStringOption(option => option.setName('ostrzezenie_wiadomosc').setDescription('Treść ostrzeżenia').setRequired(false)))
    .addSubcommand(subcommand =>
        subcommand
            .setName('remove')
            .setDescription('Usuwa timer')
            .addStringOption(option => option.setName('nazwa').setDescription('Nazwa timera do usunięcia').setRequired(true)));

client.once('ready', async () => {
    console.log(`Zalogowano jako ${client.user.tag}!`);
    
    // Ładowanie configu i start zadań
    loadConfig();
    reloadAllTimers();

    // Rejestracja komend (dla wszystkich serwerów - może zająć do godziny, dla testów można użyć ID gildii)
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    try {
        console.log('Odświeżanie komend aplikacji (/) ...');
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: [configCommand.toJSON()] },
        );
        console.log('Pomyślnie zarejestrowano komendy (/)!');
    } catch (error) {
        console.error(error);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'config') {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'list') {
            if (config.length === 0) {
                await interaction.reply('📭 Lista timerów jest pusta.');
                return;
            }

            const list = config.map(t => `**${t.name}**\n🕒 Czas: \`${t.cron}\`\n📢 Kanał: <#${t.channelId}>\n`).join('\n');
            await interaction.reply({ content: `📋 **Lista aktywnych timerów:**\n\n${list}`, ephemeral: true });
        } 
        
        else if (subcommand === 'add') {
            const name = interaction.options.getString('nazwa');
            const cronTime = interaction.options.getString('czas');
            const message = interaction.options.getString('wiadomosc');
            const channel = interaction.options.getChannel('kanal') || interaction.channel;
            const warningCron = interaction.options.getString('ostrzezenie_czas');
            const warningMessage = interaction.options.getString('ostrzezenie_wiadomosc');

            // Walidacja CRON
            if (!cron.validate(cronTime)) {
                await interaction.reply({ content: `❌ Błąd: Nieprawidłowy format czasu CRON: \`${cronTime}\``, ephemeral: true });
                return;
            }
            if (warningCron && !cron.validate(warningCron)) {
                await interaction.reply({ content: `❌ Błąd: Nieprawidłowy format czasu CRON ostrzeżenia: \`${warningCron}\``, ephemeral: true });
                return;
            }

            // Sprawdzenie czy nazwa już istnieje
            const existingIndex = config.findIndex(t => t.name === name);
            if (existingIndex !== -1) {
                // Nadpisz istniejący
                config[existingIndex] = {
                    name,
                    cron: cronTime,
                    message,
                    channelId: channel.id,
                    warningCron,
                    warningMessage
                };
                stopTimer(name); // Zatrzymaj stary
            } else {
                // Dodaj nowy
                config.push({
                    name,
                    cron: cronTime,
                    message,
                    channelId: channel.id,
                    warningCron,
                    warningMessage
                });
            }

            saveConfig();
            startTimer(config.find(t => t.name === name)); // Uruchom nowy

            await interaction.reply(`✅ Timer **${name}** został ${existingIndex !== -1 ? 'zaktualizowany' : 'dodany'}!`);
        } 
        
        else if (subcommand === 'remove') {
            const name = interaction.options.getString('nazwa');
            const index = config.findIndex(t => t.name === name);

            if (index === -1) {
                await interaction.reply({ content: `❌ Nie znaleziono timera o nazwie: **${name}**`, ephemeral: true });
                return;
            }

            stopTimer(name);
            config.splice(index, 1);
            saveConfig();

            await interaction.reply(`🗑️ Timer **${name}** został usunięty.`);
        }
    }
});

// Obsługa błędów logowania
if (!process.env.DISCORD_TOKEN) {
    console.error('Błąd: Brak DISCORD_TOKEN w pliku .env');
} else {
    client.login(process.env.DISCORD_TOKEN);
}

// --- SERWER HTTP DLA RENDER.COM (Keep-Alive) ---
const http = require('http');
const port = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Metin Bot is alive!');
});

server.listen(port, () => {
    console.log(`Serwer HTTP nasłuchuje na porcie ${port}`);
});

