import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import axios from 'axios';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dataLayer } from '../data/data_layer.js';

dotenv.config();

class BackupHandler {
  constructor() {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    
    const repoRoot = path.resolve(__dirname, '../../');
    this.sourceDir = process.env.BACKUP_SOURCE_DIR || repoRoot;
    this.destDir = process.env.BACKUP_DEST_DIR || path.join(this.sourceDir, 'backups');
    this.historyFilePath = path.join(this.destDir, 'backup_history.json');
  }

  async runRcloneCmd(cmdArgs) {
    return new Promise((resolve, reject) => {
      const rclonePath = fs.existsSync('./rclone') ? './rclone' : 'rclone';
      const child = spawn(rclonePath, cmdArgs);
      let errorLog = '';

      child.stdout.on('data', (data) => {
        console.log(`[rclone] ${data.toString().trim()}`);
      });

      child.stderr.on('data', (data) => {
        const str = data.toString().trim();
        console.error(`[rclone log] ${str}`);
        errorLog += str + '\n';
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve(true);
        } else {
          reject(new Error(`rclone exited with code ${code}. Last logs: ${errorLog.slice(-500)}`));
        }
      });
      
      child.on('error', (err) => {
        reject(new Error(`Failed to start rclone process: ${err.message}`));
      });
    });
  }

  /**
   * Runs backup process: Executes rclone cloud-to-cloud sync
   */
  async runBackup(jobIds = null) {
    console.log(`[BackupHandler] Starting Cloud-to-Cloud Backup via rclone...`);
    const startTime = new Date();
    
    // Ensure destination directory exists for config and history
    if (!fs.existsSync(this.destDir)) {
      fs.mkdirSync(this.destDir, { recursive: true });
    }

    // 1. Setup Config
    const rcloneConfigData = process.env.RCLONE_CONFIG_DATA;
    if (!rcloneConfigData || rcloneConfigData === 'placeholder_config') {
      const errMessage = 'RCLONE_CONFIG_DATA environment variable is missing. Cannot perform cloud-to-cloud backup.';
      console.error('[BackupHandler]', errMessage);
      return { success: false, error: errMessage };
    }
    
    const configPath = path.join(this.destDir, 'rclone.conf');
    fs.writeFileSync(configPath, rcloneConfigData, 'utf8');

    // 2. Load Sync Jobs from ENV
    const jobs = [];
    for (let i = 1; i <= 5; i++) {
      const source = process.env[`RCLONE_SYNC_SOURCE_${i}`];
      const dest = process.env[`RCLONE_SYNC_DEST_${i}`];
      const mode = process.env[`RCLONE_JOB_MODE_${i}`] || 'sync';
      if (source && dest && source !== 'placeholder' && dest !== 'placeholder') {
        if (jobIds && !jobIds.includes(i)) continue;
        jobs.push({ id: i, source, dest, mode, name: `Sync Job ${i} (${mode.toUpperCase()})` });
      }
    }

    if (jobs.length === 0) {
      const errMessage = 'No sync jobs configured. Please set RCLONE_SYNC_SOURCE_1 and RCLONE_SYNC_DEST_1 in your .env / Railway variables.';
      console.error('[BackupHandler]', errMessage);
      fs.unlinkSync(configPath);
      return { success: false, error: errMessage };
    }

    const timestampStr = startTime.toISOString().replace(/[:.]/g, '-');
    let totalLogs = '';
    let hasError = false;

    // 3. Execute Jobs
    for (const job of jobs) {
      console.log(`[BackupHandler] Executing ${job.name}: ${job.source} -> ${job.dest}`);
      
      // Determine exclusions to prevent recursive backups
      const excludeArgs = [];
      const rootLevelDests = jobs
        .filter(j => j.source.endsWith(':') || j.source.endsWith(':/'))
        .map(j => {
          const parts = j.dest.split(':');
          return parts.length > 1 ? parts.slice(1).join(':') : j.dest;
        })
        .map(p => {
          const cleanP = p.startsWith('/') ? p.substring(1) : p;
          return cleanP.split('/')[0];
        })
        .filter(ex => ex !== '' && ex !== '/');
      
      const uniqueExcludes = [...new Set(rootLevelDests)];
      for (const ex of uniqueExcludes) {
        excludeArgs.push('--exclude', `/${ex}/**`);
      }
      excludeArgs.push('--exclude', `*_archive/**`);

      const cmdArgs = [
        job.mode,
        job.source,
        job.dest,
        ...excludeArgs,
        '--config', configPath,
        '--drive-server-side-across-configs',
        '--drive-skip-dangling-shortcuts',
        '--stats', '30s',
        '--tpslimit', '8',
        '--transfers', '8',
        '--checkers', '16',
        '--drive-chunk-size', '64M',
        '-v'
      ];

      try {
        await this.runRcloneCmd(cmdArgs);
        console.log(`[BackupHandler] ${job.name} success.`);
        totalLogs += `[${job.name}] SUCCESS\n`;
      } catch (err) {
        console.error(`[BackupHandler] ${job.name} failed:`, err.message);
        hasError = true;
        totalLogs += `[${job.name}] FAILED: ${err.message}\n`;
      }
    }

    // Cleanup config file for security
    try { fs.unlinkSync(configPath); } catch (e) {}

    const durationSec = ((new Date() - startTime) / 1000).toFixed(2);
    
    const backupRecord = {
      success: !hasError,
      fileName: 'Cloud-to-Cloud Sync',
      filePath: `${jobs.length} Jobs Executed`,
      sizeMb: 0, 
      durationSeconds: parseFloat(durationSec),
      timestamp: startTime.toISOString(),
      error: hasError ? totalLogs : null,
      downloadUrl: null
    };

    await this.saveHistory(backupRecord);
    return backupRecord;
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
