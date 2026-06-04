import { Client, GatewayIntentBits, REST, Routes } from 'discord.js';
import cron from 'node-cron';
import dotenv from 'dotenv';
import { backupBot } from './src/modules/backup.js';
import { backupHandler } from '../shared/utils/backup_handler.js';

dotenv.config();

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;
const cronSchedule = process.env.BACKUP_CRON_SCHEDULE || '0 2 * * *'; // Default 2:00 AM UTC

console.log('==================================================');
console.log('       NSL BOT SYSTEM v3 - BLOBS PROCESS          ');
console.log('==================================================');

// 1. Cron Scheduler Setup (Always runs in UTC as per project standard)
console.log(`[Scheduler] Setting up cron job with UTC expression: "${cronSchedule}"`);
cron.schedule(cronSchedule, async () => {
  console.log('[Scheduler] Triggering scheduled automatic backup...');
  try {
    const record = await backupHandler.runBackup();
    console.log(`[Scheduler] Scheduled backup job completed. Success: ${record.success}`);
  } catch (err) {
    console.error('[Scheduler] Scheduled backup failed:', err.message);
  }
});

// 2. Validate Discord Credentials
const isDiscordConfigured = token && token !== 'placeholder_token' && clientId && clientId !== 'placeholder_client_id';

if (!isDiscordConfigured) {
  console.warn('⚠️  [Discord] Discord Token or Client ID is not configured (placeholder values found).');
  console.warn('👉  Please fill in your real credentials in `blobs/.env` to run the Discord client.');
  console.warn('👉  The background scheduler (cron job) will continue running normally.');
  console.warn('👉  To test the search and backup modules offline, run: npm run test:datalayer');
  console.log('==================================================');
} else {
  // Initialize Discord Client
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds
    ]
  });

  // Slash commands registry
  const registerSlashCommands = async () => {
    try {
      const rest = new REST({ version: '10' }).setToken(token);
      const commandData = backupBot.commands.map(cmd => cmd.toJSON());

      if (guildId && guildId !== 'placeholder_guild_id') {
        console.log(`[Discord] Deploying guild-specific commands to server: ${guildId}`);
        await rest.put(
          Routes.applicationGuildCommands(clientId, guildId),
          { body: commandData }
        );
      } else {
        console.log('[Discord] Deploying global application commands...');
        await rest.put(
          Routes.applicationCommands(clientId),
          { body: commandData }
        );
      }
      console.log('[Discord] Slash commands registered successfully!');
    } catch (err) {
      console.error('[Discord] Failed to register slash commands:', err.message);
    }
  };

  client.once('ready', async () => {
    console.log(`✅ [Discord] Bot online! Logged in as: ${client.user.tag}`);
    await registerSlashCommands();
  });

  client.on('interactionCreate', async (interaction) => {
    try {
      await backupBot.handleInteraction(interaction);
    } catch (err) {
      console.error('[Discord] Error routing interaction:', err);
    }
  });

  client.login(token).catch(err => {
    console.error('❌ [Discord] Login failed. Check your DISCORD_TOKEN in `blobs/.env`:', err.message);
  });
}
