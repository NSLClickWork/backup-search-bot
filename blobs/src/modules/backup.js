import { 
  SlashCommandBuilder, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ModalBuilder, 
  TextInputBuilder, 
  TextInputStyle 
} from 'discord.js';
import { dataLayer } from '../../../shared/data/data_layer.js';
import { llmHelper } from '../../../shared/ai/llm_helper.js';
import { backupHandler } from '../../../shared/utils/backup_handler.js';

/**
 * Helper to send long replies by splitting them into chunks to bypass Discord's 4096 character limit using Embeds
 */
async function sendSplitReply(interaction, text) {
  const embedColor = 0x5865F2; // Discord Blurple
  if (text.length <= 4096) {
    const embed = new EmbedBuilder()
      .setColor(embedColor)
      .setDescription(text);
    return interaction.editReply({ embeds: [embed] });
  }
  const chunks = [];
  let currentChunk = '';
  const lines = text.split('\n');
  for (const line of lines) {
    if (currentChunk.length + line.length > 4000) {
      if (currentChunk) chunks.push(currentChunk);
      currentChunk = line + '\n';
    } else {
      currentChunk += line + '\n';
    }
  }
  if (currentChunk.trim().length > 0) chunks.push(currentChunk);

  const firstEmbed = new EmbedBuilder().setColor(embedColor).setDescription(chunks[0]);
  await interaction.editReply({ embeds: [firstEmbed] });
  
  for (let i = 1; i < chunks.length; i++) {
    const nextEmbed = new EmbedBuilder().setColor(embedColor).setDescription(chunks[i]);
    await interaction.followUp({ embeds: [nextEmbed], ephemeral: interaction.ephemeral });
  }
}

export const backupBot = {
  // Command registration schema
  commands: [
    new SlashCommandBuilder()
      .setName('backup_dashboard')
      .setDescription('Render the Pinned Control Dashboard for Backup & Search bot'),
      
    new SlashCommandBuilder()
      .setName('backup_status')
      .setDescription('Check the current backup system status'),

    new SlashCommandBuilder()
      .setName('ask')
      .setDescription('Search files on Google Drive & OneDrive/SharePoint via AI')
      .addStringOption(option => 
        option.setName('query')
          .setDescription('What file are you looking for?')
          .setRequired(true)
      )
  ],

  /**
   * Helper to construct the premium Pinned Dashboard embed and buttons
   */
  async getDashboardPayload() {
    const latestBackup = await backupHandler.getLatestStatus();
    
    const dashboardEmbed = new EmbedBuilder()
      .setColor(0x00A2FF) // Sleek Premium Blue HSL
      .setTitle('⚙️ OPERATIONS | Backup & Search Dashboard')
      .setDescription('Manage your company backups and search across Google Drive & Microsoft 365. Use the buttons below to interact without remembering slash commands.')
      .addFields(
        { 
          name: '☁️ Latest Cloud Sync', 
          value: latestBackup 
            ? `• **Type:** \`${latestBackup.fileName}\`\n• **Status:** ${latestBackup.success ? '✅ SUCCESS' : '❌ FAILED'}\n• **Jobs:** ${latestBackup.filePath}\n• **Time:** <t:${Math.floor(new Date(latestBackup.timestamp).getTime() / 1000)}:R>`
            : '• **Status:** No backups performed yet.',
          inline: false 
        }
      )
      .setFooter({ text: 'NSL Bot System • Designed by Blobs' })
      .setTimestamp();

    // Button layout
    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('btn_search_files_modal')
        .setLabel('🔍 Search Files')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('btn_run_backup_now')
        .setLabel('🚀 Run Backup Now')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('btn_view_history')
        .setLabel('📊 View History')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('btn_search_help')
        .setLabel('❓ Help Guide')
        .setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [dashboardEmbed], components: [row1] };
  },

  /**
   * Main interaction router
   */
  async handleInteraction(interaction) {
    if (interaction.isChatInputCommand()) {
      await this.handleSlashCommand(interaction);
    } else if (interaction.isButton()) {
      await this.handleButtonClick(interaction);
    } else if (interaction.isModalSubmit()) {
      await this.handleModalSubmit(interaction);
    }
  },

  /**
   * Handle Slash commands (mainly for dev shortcut/setup)
   */
  async handleSlashCommand(interaction) {
    const { commandName } = interaction;

    if (commandName === 'backup_dashboard') {
      const payload = await this.getDashboardPayload();
      await interaction.reply(payload);
    } 
    
    else if (commandName === 'backup_status') {
      await interaction.deferReply({ ephemeral: true });
      const lastBackup = await backupHandler.getLatestStatus();
      if (!lastBackup) {
        return interaction.editReply('ℹ️ No backup records found. Trigger one from the dashboard.');
      }
      
      const embed = new EmbedBuilder()
        .setColor(lastBackup.success ? 0x00FF66 : 0xFF3333)
        .setTitle(lastBackup.success ? '☁️ Sync Status: Healthy' : '☁️ Sync Status: Failed')
        .addFields(
          { name: 'Sync Type', value: `\`${lastBackup.fileName}\`` },
          { name: 'Details', value: `${lastBackup.filePath}`, inline: true },
          { name: 'Sync Time', value: `${lastBackup.durationSeconds}s`, inline: true },
          { name: 'Timestamp', value: `<t:${Math.floor(new Date(lastBackup.timestamp).getTime() / 1000)}:F>`, inline: false }
        );

      await interaction.editReply({ embeds: [embed] });
    }

    else if (commandName === 'ask') {
      const queryText = interaction.options.getString('query');
      await interaction.deferReply();
      try {
        const keywords = await llmHelper.extractSearchKeywords(queryText);
        const files = await dataLayer.searchFiles(keywords);
        const answer = await llmHelper.generateRAGAnswer(queryText, files);
        await sendSplitReply(interaction, answer);
      } catch (err) {
        console.error('[BackupBot] Ask command error:', err);
        await interaction.editReply(`❌ Error executing search query: \`${err.message}\``);
      }
    }
  },

  /**
   * Handle Interactive Button clicks
   */
  async handleButtonClick(interaction) {
    const { customId } = interaction;

    if (customId === 'btn_run_backup_now') {
      await interaction.reply({ content: '⚙️ Manual backup job has been started in the background! Since syncing cloud data can take a long time, I will send you a direct message (DM) when it finishes. You can safely close this message.', ephemeral: true });
      
      // Run asynchronously so we don't block or timeout Discord's 15m interaction limit
      backupHandler.runBackup().then(async (record) => {
        try {
            const user = await interaction.client.users.fetch(interaction.user.id);
            if (record.success) {
              await user.send(
                `✅ **Cloud Sync Successful!**\n• Type: \`${record.fileName}\`\n• Jobs: ${record.filePath}\n• Elapsed Time: ${record.durationSeconds}s${record.error ? `\n⚠️ **Sync Warning:**\n${record.error}` : ''}`
              );
              // Try updating the dashboard message if it's still accessible
              try {
                const payload = await this.getDashboardPayload();
                await interaction.message.edit(payload);
              } catch (e) {
                console.error("Could not update dashboard message:", e);
              }
            } else {
              await user.send(`❌ **Backup Failed:** \`${record.error}\``);
            }
        } catch (dmErr) {
            console.error("Failed to DM user after backup:", dmErr);
        }
      }).catch(async (err) => {
        try {
            const user = await interaction.client.users.fetch(interaction.user.id);
            await user.send(`❌ **Critical Backup Error:** \`${err.message}\``);
        } catch (dmErr) {
            console.error("Failed to DM user after critical backup error:", dmErr);
        }
      });
    }

    else if (customId === 'btn_view_history') {
      await interaction.deferReply({ ephemeral: true });
      const history = await backupHandler.getHistory();
      if (history.length === 0) {
        return interaction.editReply('ℹ️ No backup history available.');
      }

      let historyText = '';
      history.slice(0, 5).forEach((h, i) => {
        historyText += `${i + 1}. **${h.fileName}**\n   - Status: ${h.success ? '✅ SUCCESS' : '❌ FAILED'}\n   - Jobs: ${h.filePath} | Time: ${h.durationSeconds}s | Date: <t:${Math.floor(new Date(h.timestamp).getTime() / 1000)}:d>\n\n`;
      });

      const embed = new EmbedBuilder()
        .setColor(0x00A2FF)
        .setTitle('📊 Last 5 Backup Logs')
        .setDescription(historyText);

      await interaction.editReply({ embeds: [embed] });
    }

    else if (customId === 'btn_system_status') {
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x7F8C8D)
            .setTitle('💻 System Integration Details')
            .setDescription('Current credentials states for connected sources:')
            .addFields(
              { name: 'Google Drive Auth', value: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL !== 'placeholder_google_email' ? '✅ Service Account JWT' : '❌ Placeholder / Missing', inline: true },
              { name: 'Microsoft Graph Auth', value: process.env.MS_TENANT_ID !== 'placeholder_ms_tenant' ? '✅ Client Credentials' : '❌ Placeholder / Missing', inline: true },
              { name: 'AI Service Provider', value: process.env.GROQ_API_KEY !== 'placeholder_groq_key' ? '✅ Groq API' : (process.env.OPENAI_API_KEY !== 'placeholder_openai_key' ? '✅ OpenAI API' : '⚠️ Fallback Local Mode'), inline: false },
              { name: 'Paths Config', value: `• Source: \`${backupHandler.sourceDir}\`\n• Backup Target: \`${backupHandler.destDir}\`` }
            )
        ],
        ephemeral: true
      });
    }

    else if (customId === 'btn_search_help') {
      await interaction.reply({
        content: `🔍 **NSL Backup & Search Bot Help Guide**\n\n` +
                 `• **Search Files**: Click the primary blue "Search Files" button to trigger a popup form. Enter your query (e.g. "Visa Khoi" or "Hợp đồng") and submit. The AI will pull matching documents from Google Drive and OneDrive, merging them and providing an answer with direct links.\n` +
                 `• **Run Backup**: Performs a Cloud-to-Cloud sync using rclone to securely backup company data directly to Google Drive 2TB without consuming bot storage.\n` +
                 `• **Automation**: Backups run automatically every night at 02:00 AM UTC (\`0 2 * * *\`).`,
        ephemeral: true
      });
    }

    else if (customId === 'btn_search_files_modal') {
      // Create and open search modal popup
      const modal = new ModalBuilder()
        .setCustomId('modal_search_files')
        .setTitle('Search Files (Google & Microsoft)');

      const searchInput = new TextInputBuilder()
        .setCustomId('txt_search_query')
        .setLabel('What are you looking for?')
        .setPlaceholder('e.g. Visa Khoi, Hợp đồng thuê nhà, etc.')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const actionRow = new ActionRowBuilder().addComponents(searchInput);
      modal.addComponents(actionRow);

      await interaction.showModal(modal);
    }
  },

  /**
   * Handle Search Modal submission
   */
  async handleModalSubmit(interaction) {
    if (interaction.customId === 'modal_search_files') {
      const queryText = interaction.fields.getTextInputValue('txt_search_query');
      
      await interaction.deferReply({ ephemeral: true });

      try {
        // 1. Keyword extraction using helper
        const keywords = await llmHelper.extractSearchKeywords(queryText);

        // 2. Dual-source file searching
        const files = await dataLayer.searchFiles(keywords);

        // 3. RAG generation response
        const answer = await llmHelper.generateRAGAnswer(queryText, files);

        // 4. Return results securely to the user (ephemeral to keep channels clutter-free)
        await sendSplitReply(interaction, answer);
      } catch (err) {
        console.error('[BackupBot] Modal submit search failed:', err);
        await interaction.editReply(`❌ Search execution failed: \`${err.message}\``);
      }
    }
  }
};
