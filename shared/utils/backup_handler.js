import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import axios from 'axios';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dataLayer } from '../data/data_layer.js';

dotenv.config();

class BackupHandler {
  constructor() {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    
    // Resolve the repository root: shared/utils/backup_handler.js -> ../../ -> backup_bot/
    const repoRoot = path.resolve(__dirname, '../../');
    this.sourceDir = process.env.BACKUP_SOURCE_DIR || repoRoot;
    this.destDir = process.env.BACKUP_DEST_DIR || path.join(this.sourceDir, 'backups');
    this.historyFilePath = path.join(this.destDir, 'backup_history.json');
  }

  /**
   * Fetch Airtable base data and dump to a local JSON file for backup inclusion
   */
  async backupAirtable() {
    const apiKey = process.env.AIRTABLE_API_KEY;
    const baseId = process.env.AIRTABLE_BASE_ID;
    const tableName = process.env.AIRTABLE_TABLE_NAME;
    const targetFile = path.join(this.sourceDir, 'airtable_backup.json');

    const isAirtableConfigured = apiKey && apiKey !== 'placeholder_airtable_key' &&
                                 baseId && baseId !== 'placeholder_airtable_base' &&
                                 tableName && tableName !== 'placeholder_airtable_table';

    if (!isAirtableConfigured) {
      console.warn('[BackupHandler] Airtable credentials missing. Generating Mock Airtable Backup File...');
      const mockAirtableData = {
        backupTimestamp: new Date().toISOString(),
        isMockData: true,
        tables: {
          Tasks: [
            { id: 'rec1', fields: { Task_Name: 'Review payroll hours', Status: 'Completed', Assignee: 'Sharkie' } },
            { id: 'rec2', fields: { Task_Name: 'Port reminder bot to Discord', Status: 'In Progress', Assignee: 'KhoiNguyen' } },
            { id: 'rec3', fields: { Task_Name: 'Configure SharePoint backup', Status: 'Todo', Assignee: 'Blobs' } }
          ],
          Payroll: [
            { id: 'rec4', fields: { Employee_Name: 'Sharkie', Monthly_Rate: 15.00, Hours_Worked: 160 } },
            { id: 'rec5', fields: { Employee_Name: 'Blobs', Monthly_Rate: 15.00, Hours_Worked: 155 } }
          ]
        }
      };
      fs.writeFileSync(targetFile, JSON.stringify(mockAirtableData, null, 2), 'utf8');
      console.log(`[BackupHandler] Mock Airtable data written to "${targetFile}"`);
      return { success: true, isMock: true };
    }

    console.log(`[BackupHandler] Fetching Airtable data from base "${baseId}", table "${tableName}"...`);
    try {
      const response = await axios.get(`https://api.airtable.com/v0/${baseId}/${tableName}`, {
        headers: {
          Authorization: `Bearer ${apiKey}`
        }
      });

      const airtableData = {
        backupTimestamp: new Date().toISOString(),
        isMockData: false,
        records: response.data.records
      };

      fs.writeFileSync(targetFile, JSON.stringify(airtableData, null, 2), 'utf8');
      console.log(`[BackupHandler] Airtable backup saved to "${targetFile}"`);
      return { success: true, isMock: false };
    } catch (err) {
      console.error('[BackupHandler] Airtable backup API call failed:', err.response?.data || err.message);
      // Fail gracefully, write error details but don't block the file backup
      fs.writeFileSync(targetFile, JSON.stringify({
        backupTimestamp: new Date().toISOString(),
        success: false,
        error: err.message
      }, null, 2), 'utf8');
      return { success: false, error: err.message };
    }
  }

  /**
   * Runs backup process: zips source directory and writes log records
   */
  async runBackup() {
    console.log(`[BackupHandler] Starting backup from "${this.sourceDir}" to "${this.destDir}"...`);
    
    // 1. Backup Airtable data first so it gets included in the zip archive
    try {
      await this.backupAirtable();
    } catch (err) {
      console.error('[BackupHandler] Pre-backup Airtable hook failed:', err.message);
    }

    const startTime = new Date();
    
    // Ensure destination directory exists
    if (!fs.existsSync(this.destDir)) {
      fs.mkdirSync(this.destDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const zipName = `backup_${timestamp}.zip`;
    const zipPath = path.join(this.destDir, zipName);

    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(zipPath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', async () => {
        const stats = fs.statSync(zipPath);
        const durationSec = ((new Date() - startTime) / 1000).toFixed(2);
        const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);

        console.log(`[BackupHandler] Backup completed. File: ${zipName} (${sizeMb} MB) in ${durationSec}s`);
        
        const backupRecord = {
          success: true,
          fileName: zipName,
          filePath: zipPath,
          sizeMb: parseFloat(sizeMb),
          durationSeconds: parseFloat(durationSec),
          timestamp: startTime.toISOString(),
          error: null,
          downloadUrl: null
        };

        const folderId = process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID;
        if (folderId && folderId !== 'placeholder_folder_id') {
          try {
            console.log(`[BackupHandler] Uploading zip to Google Drive...`);
            const driveUrl = await dataLayer.uploadBackupToDrive(zipPath, folderId);
            backupRecord.downloadUrl = driveUrl;
            
            // Delete local zip to save space
            if (fs.existsSync(zipPath)) {
              fs.unlinkSync(zipPath);
              console.log(`[BackupHandler] Deleted local zip file to save space: ${zipPath}`);
            }
          } catch (uploadErr) {
            console.error('[BackupHandler] Failed to upload to Google Drive:', uploadErr.message);
            backupRecord.error = `Local backup success, but Drive upload failed: ${uploadErr.message}`;
          }
        }

        await this.saveHistory(backupRecord);
        resolve(backupRecord);
      });

      archive.on('error', async (err) => {
        console.error('[BackupHandler] Archive compression error:', err.message);
        
        const backupRecord = {
          success: false,
          fileName: zipName,
          filePath: zipPath,
          sizeMb: 0,
          durationSeconds: ((new Date() - startTime) / 1000).toFixed(2),
          timestamp: startTime.toISOString(),
          error: err.message
        };

        await this.saveHistory(backupRecord);
        
        if (fs.existsSync(zipPath)) {
          try { fs.unlinkSync(zipPath); } catch (e) {}
        }
        
        reject(err);
      });

      archive.pipe(output);

      const backupsFolderBase = path.basename(this.destDir);
      
      // Filter entries to prevent infinite recursion
      fs.readdirSync(this.sourceDir).forEach(file => {
        const fullPath = path.join(this.sourceDir, file);
        const isDir = fs.statSync(fullPath).isDirectory();

        if (isDir) {
          // Exclude backups, node_modules, and git directories
          if (file !== backupsFolderBase && file !== 'node_modules' && file !== '.git') {
            archive.directory(fullPath, file);
          }
        } else {
          // Exclude direct zip files in source root
          if (!file.endsWith('.zip')) {
            archive.file(fullPath, { name: file });
          }
        }
      });

      archive.finalize();
    });
  }

  /**
   * Save backup record to a local JSON file history
   */
  async saveHistory(record) {
    let history = [];
    try {
      if (fs.existsSync(this.historyFilePath)) {
        const rawData = fs.readFileSync(this.historyFilePath, 'utf8');
        history = JSON.parse(rawData);
      }
    } catch (err) {
      console.warn('[BackupHandler] Failed to read backup history, resetting:', err.message);
    }

    history.unshift(record);
    
    // Keep last 10 records
    if (history.length > 10) {
      history = history.slice(0, 10);
    }

    try {
      fs.writeFileSync(this.historyFilePath, JSON.stringify(history, null, 2), 'utf8');
    } catch (err) {
      console.error('[BackupHandler] Failed to write backup history file:', err.message);
    }
  }

  /**
   * Get the latest backup status
   */
  async getLatestStatus() {
    try {
      if (fs.existsSync(this.historyFilePath)) {
        const rawData = fs.readFileSync(this.historyFilePath, 'utf8');
        const history = JSON.parse(rawData);
        if (history.length > 0) {
          return history[0];
        }
      }
    } catch (err) {
      console.error('[BackupHandler] Error getting latest backup status:', err.message);
    }
    return null;
  }

  /**
   * Get full backup history list
   */
  async getHistory() {
    try {
      if (fs.existsSync(this.historyFilePath)) {
        const rawData = fs.readFileSync(this.historyFilePath, 'utf8');
        return JSON.parse(rawData);
      }
    } catch (err) {
      console.error('[BackupHandler] Error reading backup history:', err.message);
    }
    return [];
  }
}

export const backupHandler = new BackupHandler();
