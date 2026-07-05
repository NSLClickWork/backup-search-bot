import { 
  SlashCommandBuilder, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ModalBuilder, 
  TextInputBuilder, 
  TextInputStyle,
  AttachmentBuilder
} from 'discord.js';
import { dataLayer } from '../../../shared/data/data_layer.js';
import { llmHelper } from '../../../shared/ai/llm_helper.js';
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
      .setName('search_dashboard')
      .setDescription('Render the Pinned Control Dashboard for Search bot'),

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
    const dashboardEmbed = new EmbedBuilder()
      .setColor(0x00A2FF) // Sleek Premium Blue HSL
      .setTitle('⚙️ OPERATIONS | Search Dashboard')
      .setDescription('Search across Google Drive & Microsoft 365. Use the buttons below to interact without remembering slash commands.')
      .setFooter({ text: 'NSL Bot System • Designed by Blobs' })
      .setTimestamp();

    // Button layout
    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('btn_search_files_modal')
        .setLabel('🔍 Search Files')
        .setStyle(ButtonStyle.Primary),
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

    if (commandName === 'search_dashboard') {
      const payload = await this.getDashboardPayload();
      await interaction.reply(payload);
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

    if (customId === 'btn_system_status') {
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x7F8C8D)
            .setTitle('💻 System Integration Details')
            .setDescription('Current credentials states for connected sources:')
            .addFields(
              { name: 'Google Drive Auth', value: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL !== 'placeholder_google_email' ? '✅ Service Account JWT' : '❌ Placeholder / Missing', inline: true },
              { name: 'Microsoft Graph Auth', value: process.env.MS_TENANT_ID !== 'placeholder_ms_tenant' ? '✅ Client Credentials' : '❌ Placeholder / Missing', inline: true },
              { name: 'AI Service Provider', value: process.env.GROQ_API_KEY !== 'placeholder_groq_key' ? '✅ Groq API' : (process.env.OPENAI_API_KEY !== 'placeholder_openai_key' ? '✅ OpenAI API' : '⚠️ Fallback Local Mode'), inline: false }
            )
        ],
        ephemeral: true
      });
    }

    else if (customId === 'btn_search_help') {
      await interaction.reply({
        content: `🔍 **NSL Search Bot Help Guide**\n\n` +
                 `• **Search Files**: Click the primary blue "Search Files" button to trigger a popup form. Enter your query (e.g. "Visa Khoi" or "Hợp đồng") and submit. The AI will pull matching documents from Google Drive and OneDrive, merging them and providing an answer with direct links.\n`,
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
