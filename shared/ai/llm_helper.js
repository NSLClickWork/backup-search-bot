import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

class LLMHelper {
  constructor() {
    this.groqApiKey = process.env.GROQ_API_KEY || process.env.AI_API_KEY;
    this.openaiApiKey = process.env.OPENAI_API_KEY;
    this.isGroqConfigured = this.groqApiKey && this.groqApiKey !== 'placeholder_groq_key';
    this.isOpenAIConfigured = this.openaiApiKey && this.openaiApiKey !== 'placeholder_openai_key';
    
    // Custom OpenAI-compatible / Groq settings from env
    this.aiBaseUrl = process.env.AI_BASE_URL || 'https://api.groq.com/openai/v1';
    this.aiModelName = process.env.AI_MODEL_NAME || 'llama-3.3-70b-versatile';
  }

  /**
   * Helper to clean Vietnamese stop words for rule-based keyword extraction in Mock Mode
   */
  extractMockKeywords(queryText) {
    let text = queryText.toLowerCase();
    const stopWords = [
      'cho tôi hỏi', 'tôi muốn hỏi', 'tìm giúp tôi', 'tìm file', 'tìm tài liệu', 
      'tìm kiếm', 'ở đâu', 'nằm ở đâu', 'có không', 'có file', 'có tài liệu',
      'cho hỏi', 'hỏi về', 'kiểm tra', 'tập tin', 'bản', 'cái', 'tài liệu về'
    ];
    
    for (const word of stopWords) {
      text = text.replace(new RegExp(word, 'g'), '');
    }
    
    return text.replace(/[?.,!]/g, '').trim();
  }

  /**
   * Extracts search keywords from natural language queries
   */
  async extractSearchKeywords(queryText) {
    if (!this.isGroqConfigured && !this.isOpenAIConfigured) {
      const mockKeyword = this.extractMockKeywords(queryText);
      console.log(`[LLMHelper] (Mock Mode) Extracted keywords: "${mockKeyword}" from "${queryText}"`);
      return mockKeyword || queryText;
    }

    try {
      if (this.isGroqConfigured) {
        return await this.callGroqForKeywords(queryText);
      } else {
        return await this.callOpenAIForKeywords(queryText);
      }
    } catch (err) {
      console.error('[LLMHelper] API Error extracting keywords, falling back to local extraction:', err.message);
      return this.extractMockKeywords(queryText);
    }
  }

  async callGroqForKeywords(queryText) {
    const model = process.env.AI_MODEL_NAME || 'llama3-8b-8192';
    const response = await axios.post(
      `${this.aiBaseUrl}/chat/completions`,
      {
        model: model,
        messages: [
          {
            role: 'system',
            content: 'You are a search keyword extraction expert. Analyze the user query (Vietnamese/English) and return ONLY the core keywords to search in Drive/SharePoint. Exclude question words or fillers. Return 3-4 keywords max, separated by spaces. Do not explain, return ONLY the keywords.'
          },
          {
            role: 'user',
            content: `Extract keywords for: "${queryText}"`
          }
        ],
        temperature: 0.1
      },
      {
        headers: {
          Authorization: `Bearer ${this.groqApiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data.choices[0].message.content.trim();
  }

  async callOpenAIForKeywords(queryText) {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'Return only core search keywords from user query. No explanations.'
          },
          {
            role: 'user',
            content: queryText
          }
        ],
        temperature: 0.1
      },
      {
        headers: {
          Authorization: `Bearer ${this.openaiApiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data.choices[0].message.content.trim();
  }

  /**
   * Generates RAG answer based on query and search results (output MUST be in English as per ONBOARDING.md)
   */
  async generateRAGAnswer(queryText, files) {
    if (files.length === 0) {
      return `❌ **No files found** matching your request on either **Google Drive** or **OneDrive/SharePoint**.\n\n*Tip: Try searching with shorter or more specific keywords.*`;
    }

    if (!this.isGroqConfigured && !this.isOpenAIConfigured) {
      // Mock AI RAG response in English
      let answer = `🔍 **[Mock AI] Search Results for:** "${queryText}"\n\n`;
      answer += `I found **${files.length} relevant files**:\n\n`;
      
      files.forEach((file, index) => {
        const sourceEmoji = file.source === 'GoogleDrive' ? '🟢 Google Drive' : '🔵 SharePoint';
        const typeEmoji = file.snippet.includes('FOLDER') ? '📂' : '📄';
        answer += `${index + 1}. ${typeEmoji} **[${file.name}](${file.webUrl})**\n`;
        answer += `   - **Source:** ${sourceEmoji} | **Last Modified:** ${new Date(file.lastModified).toLocaleDateString('en-US')}\n`;
        answer += `   - **Path:** \`${file.path}\`\n`;
        answer += `   - **Content Summary:** *${file.snippet}*\n\n`;
      });
      
      answer += `💡 *Note: The system is running in **Mock Mode** because API Keys are not configured in `.env`. Fill in real credentials to test live AI extraction.*`;
      return answer;
    }

    try {
      const context = files.map((f, i) => 
        `File ${i+1}: Name: "${f.name}", Source: "${f.source}", Link: "${f.webUrl}", LastModified: "${f.lastModified}", SummaryContent: "${f.snippet}"`
      ).join('\n');

      const systemPrompt = `You are a smart Backup & Search Bot for NSL Click & Work.
Based on the file list below, answer the user's search query accurately, concisely, and with a clean layout.
CRITICAL: You must answer in ENGLISH (since all system and user outputs of the bot must be in English).
You MUST include a markdown link for each file found ([File Name](File Link)) and state whether it is in Google Drive or SharePoint.
You MUST prefix each file name with its corresponding emoji (📂 for FOLDER, 📄 for FILE) as indicated in the SummaryContent.
If the files do not directly answer the user query, list the most relevant files so they can inspect them.

Files found:
${context}`;

      if (this.isGroqConfigured) {
        return await this.callGroqRAG(systemPrompt, queryText);
      } else {
        return await this.callOpenAIRAG(systemPrompt, queryText);
      }
    } catch (err) {
      console.error('[LLMHelper] RAG generation API failed, falling back to manual formatter:', err.message);
      // Fallback in English
      let fallbackAnswer = `⚠️ **Search Results (AI API Error - Listing Files):**\n\n`;
      files.forEach((file, index) => {
        const sourceEmoji = file.source === 'GoogleDrive' ? '🟢 Google Drive' : '🔵 SharePoint';
        const typeEmoji = file.snippet.includes('FOLDER') ? '📂' : '📄';
        fallbackAnswer += `${index + 1}. ${typeEmoji} **[${file.name}](${file.webUrl})**\n`;
        fallbackAnswer += `   - **Source:** ${sourceEmoji} | **Path:** \`${file.path}\`\n`;
      });
      return fallbackAnswer;
    }
  }

  async callGroqRAG(systemPrompt, queryText) {
    const model = process.env.AI_MODEL_NAME || 'llama3-70b-8192';
    const response = await axios.post(
      `${this.aiBaseUrl}/chat/completions`,
      {
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: queryText }
        ],
        temperature: 0.3
      },
      {
        headers: {
          Authorization: `Bearer ${this.groqApiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data.choices[0].message.content;
  }

  async callOpenAIRAG(systemPrompt, queryText) {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: queryText }
        ],
        temperature: 0.3
      },
      {
        headers: {
          Authorization: `Bearer ${this.openaiApiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data.choices[0].message.content;
  }
}

export const llmHelper = new LLMHelper();
