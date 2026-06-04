import { dataLayer } from '../shared/data/data_layer.js';
import { llmHelper } from '../shared/ai/llm_helper.js';
import { backupHandler } from '../shared/utils/backup_handler.js';

async function runLocalTests() {
  console.log('\n======================================================');
  console.log('    RUNNING BLOBS LOCAL INTEGRATION & MOCK TESTS      ');
  console.log('======================================================');

  // Test 1: Keyword Extraction
  console.log('\n[TEST 1] Keyword Extraction via LLM Helper:');
  const userQuery = 'Where can I find the document related to Visa Khoi?';
  console.log(`- Original Query: "${userQuery}"`);
  const keywords = await llmHelper.extractSearchKeywords(userQuery);
  console.log(`- Extracted Keywords: "${keywords}"`);

  // Test 2: Dual-Source Search
  console.log('\n[TEST 2] Dual-Source File Search (Google + Microsoft):');
  const searchResults = await dataLayer.searchFiles(keywords);
  console.log(`- Results Found: ${searchResults.length} file(s)`);
  console.log(JSON.stringify(searchResults, null, 2));

  // Test 3: RAG Generation
  console.log('\n[TEST 3] AI RAG Answer Formulation (in English):');
  const answer = await llmHelper.generateRAGAnswer(userQuery, searchResults);
  console.log('------------- AI BOT RESPONSE -------------');
  console.log(answer);
  console.log('-------------------------------------------');

  // Test 4: Workspace Backup
  console.log('\n[TEST 4] Backup Zipping Service:');
  try {
    const backupRecord = await backupHandler.runBackup();
    console.log('✅ Backup operation completed successfully!');
    console.log(JSON.stringify(backupRecord, null, 2));

    // Verify history status retrieval
    console.log('\n[TEST 5] Reading latest backup status history logs:');
    const latestStatus = await backupHandler.getLatestStatus();
    console.log('- Latest Log Entry:', latestStatus);
  } catch (err) {
    console.error('❌ Backup operation failed:', err.message);
  }

  console.log('\n======================================================');
  console.log('             TEST RUN COMPLETED SUCCESSFULLY          ');
  console.log('======================================================');
}

runLocalTests().catch(err => {
  console.error('Test run failed with error:', err);
});
