import { google } from 'googleapis';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

// Mock database to fallback to when actual credentials are not configured or are placeholders
const MOCK_FILES = [
  {
    name: 'Hợp đồng thuê văn phòng NSL 2026.pdf',
    source: 'SharePoint',
    path: '/Operations/Contracts/Hợp đồng thuê văn phòng NSL 2026.pdf',
    webUrl: 'https://nsl.sharepoint.com/:b:/r/personal/admin/Documents/Operations/Contracts/HopDongThueVanPhong2026.pdf',
    lastModified: '2026-03-01T10:00:00Z',
    snippet: 'Office lease contract for NSL Click & Work located in District 1, Ho Chi Minh City.'
  },
  {
    name: 'Visa Khoi.pdf',
    source: 'GoogleDrive',
    path: '/Human Resources/Visas/Visa Khoi.pdf',
    webUrl: 'https://drive.google.com/file/d/1a2b3c4d5e6f7g8h9i0j_visa_khoi/view',
    lastModified: '2026-05-15T14:30:00Z',
    snippet: 'Scan copy of entry visa to Germany for Mr. Nguyen Van Khoi, valid from June 2026.'
  },
  {
    name: 'Báo cáo tài chính Q1 2026.xlsx',
    source: 'GoogleDrive',
    path: '/Finance/Reports/Báo cáo tài chính Q1 2026.xlsx',
    webUrl: 'https://docs.google.com/spreadsheets/d/spreadsheet_id_finance_q1/edit',
    lastModified: '2026-04-10T08:15:00Z',
    snippet: 'Financial report detailing revenues, operational costs, and net profits of NSL for Q1 2026.'
  },
  {
    name: 'Quy chế làm việc nội bộ NSL.docx',
    source: 'SharePoint',
    path: '/Operations/Policies/Quy chế làm việc nội bộ NSL.docx',
    webUrl: 'https://nsl.sharepoint.com/:w:/r/personal/admin/Documents/Operations/Policies/QuyCheLamViecNoiBoNSL.docx',
    lastModified: '2026-01-05T09:00:00Z',
    snippet: 'Internal working regulations regarding working hours, check-in/check-out, reporting guidelines.'
  },
  {
    name: 'NSL_Bot_Plan_DualSource.docx',
    source: 'GoogleDrive',
    path: '/Engineering/Plans/NSL_Bot_Plan_DualSource.docx',
    webUrl: 'https://docs.google.com/document/d/document_id_nsl_bot_plan/edit',
    lastModified: '2026-06-03T12:00:00Z',
    snippet: 'Detailed specifications for bot system v3 implementing dual-source reading (Google + MS365).'
  }
];

class DataLayer {
  constructor() {
    this.isGoogleConfigured = false;
    this.isMicrosoftConfigured = false;
    this.initializeClients();
  }

  initializeClients() {
    // 1. Google Workspace Auth Initialization
    const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
    const googleRefreshToken = process.env.GOOGLE_REFRESH_TOKEN;

    if (
      (serviceAccountEmail && serviceAccountEmail !== 'placeholder_google_email') &&
      (privateKey && privateKey !== 'placeholder_google_key')
    ) {
      try {
        const formattedKey = privateKey.replace(/\\n/g, '\n');
        this.googleAuth = new google.auth.JWT(
          serviceAccountEmail,
          null,
          formattedKey,
          ['https://www.googleapis.com/auth/drive']
        );
        this.googleDrive = google.drive({ version: 'v3', auth: this.googleAuth });
        this.isGoogleConfigured = true;
        console.log('[DataLayer] Google API configured using Service Account JWT.');
      } catch (err) {
        console.error('[DataLayer] Failed to initialize Google Service Account JWT Client:', err.message);
      }
    } else if (
      googleRefreshToken && googleRefreshToken !== 'placeholder_google_token' &&
      process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ) {
      try {
        this.googleAuth = new google.auth.OAuth2(
          process.env.GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET
        );
        this.googleAuth.setCredentials({ refresh_token: googleRefreshToken });
        this.googleDrive = google.drive({ version: 'v3', auth: this.googleAuth });
        this.isGoogleConfigured = true;
        console.log('[DataLayer] Google API configured using OAuth2 Client.');
      } catch (err) {
        console.error('[DataLayer] Failed to initialize Google OAuth2 Client:', err.message);
      }
    } else {
      console.warn('[DataLayer] Google Drive credentials missing/placeholders. Running in Mock Mode for Google.');
    }

    // 2. Microsoft Graph Auth Initialization
    const tenantId = process.env.MS_TENANT_ID;
    const clientId = process.env.MS_CLIENT_ID;
    const clientSecret = process.env.MS_CLIENT_SECRET;

    if (
      tenantId && tenantId !== 'placeholder_ms_tenant' &&
      clientId && clientId !== 'placeholder_ms_client' &&
      clientSecret && clientSecret !== 'placeholder_ms_secret'
    ) {
      this.isMicrosoftConfigured = true;
      console.log('[DataLayer] Microsoft Graph API credentials configured.');
    } else {
      console.warn('[DataLayer] Microsoft Graph credentials missing/placeholders. Running in Mock Mode for Microsoft.');
    }
  }

  /**
   * Fetches an access token from Microsoft Identity Platform (Client Credentials Grant)
   */
  async getMicrosoftAccessToken() {
    if (!this.isMicrosoftConfigured) return null;

    const tenantId = process.env.MS_TENANT_ID;
    const clientId = process.env.MS_CLIENT_ID;
    const clientSecret = process.env.MS_CLIENT_SECRET;
    const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

    const params = new URLSearchParams();
    params.append('client_id', clientId);
    params.append('scope', 'https://graph.microsoft.com/.default');
    params.append('client_secret', clientSecret);
    params.append('grant_type', 'client_credentials');

    try {
      const response = await axios.post(url, params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });
      return response.data.access_token;
    } catch (err) {
      console.error('[DataLayer] Error fetching Microsoft Graph access token:', err.response?.data || err.message);
      return null;
    }
  }

  /**
   * Search files in Google Drive
   */
  async searchGoogleDrive(queryText) {
    if (!this.isGoogleConfigured) {
      return MOCK_FILES.filter(
        file => file.source === 'GoogleDrive' &&
        (file.name.toLowerCase().includes(queryText.toLowerCase()) ||
         file.snippet.toLowerCase().includes(queryText.toLowerCase()))
      );
    }

    try {
      const escapedQuery = queryText.replace(/'/g, "\\'");
      const words = escapedQuery.split(/\s+/).filter(w => w.length > 0);
      const nameContainsFuzzy = words.map(w => `name contains '${w.toLowerCase()}'`).join(' and ');
      const qString = `(name contains '${escapedQuery}' or (${nameContainsFuzzy}) or fullText contains '${escapedQuery}') and trashed = false`;

      const response = await this.googleDrive.files.list({
        q: qString,
        fields: 'files(id, name, mimeType, webViewLink, modifiedTime, description)',
        pageSize: 200
      });

      return (response.data.files || []).map(file => ({
        name: file.name,
        source: 'GoogleDrive',
        path: `ID: ${file.id}`,
        webUrl: file.webViewLink || '',
        lastModified: file.modifiedTime || new Date().toISOString(),
        snippet: (file.mimeType === 'application/vnd.google-apps.folder' ? '📂 [FOLDER] ' : '📄 [FILE] ') + 
                 (file.description || `File inside Google Drive`)
      }));
    } catch (err) {
      console.error('[DataLayer] Google Drive search failed, falling back to mock results:', err.message);
      return MOCK_FILES.filter(
        file => file.source === 'GoogleDrive' &&
        (file.name.toLowerCase().includes(queryText.toLowerCase()) ||
         file.snippet.toLowerCase().includes(queryText.toLowerCase()))
      );
    }
  }

  /**
   * Search files in Microsoft OneDrive / SharePoint
   */
  async searchMicrosoft(queryText) {
    if (!this.isMicrosoftConfigured) {
      return MOCK_FILES.filter(
        file => file.source === 'SharePoint' &&
        (file.name.toLowerCase().includes(queryText.toLowerCase()) ||
         file.snippet.toLowerCase().includes(queryText.toLowerCase()))
      );
    }

    const token = await this.getMicrosoftAccessToken();
    if (!token) {
      console.warn('[DataLayer] MS Token acquisition failed. Falling back to Microsoft Mock Search.');
      return MOCK_FILES.filter(
        file => file.source === 'SharePoint' &&
        (file.name.toLowerCase().includes(queryText.toLowerCase()) ||
         file.snippet.toLowerCase().includes(queryText.toLowerCase()))
      );
    }

    try {
      const words = queryText.split(/\s+/).filter(w => w.length > 0);
      const fuzzyMsQuery = words.map(w => `${w}*`).join(' AND ');
      const finalMsQuery = `"${queryText}" OR (${fuzzyMsQuery})`;

      // Use Microsoft Graph Search API to scan ALL documents across the tenant
      const url = 'https://graph.microsoft.com/v1.0/search/query';
      const body = {
        requests: [
          {
            entityTypes: ['driveItem'],
            query: {
              queryString: finalMsQuery
            },
            sortProperties: [
              {
                name: 'lastModifiedDateTime',
                isDescending: true
              }
            ],
            size: 200,
            region: 'DEU'
          }
        ]
      };

      const response = await axios.post(url, body, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const hits = response.data?.value?.[0]?.hitsContainers?.[0]?.hits || [];
      return hits.map(hit => {
        const resource = hit.resource;
        // MS Graph /search/query sometimes omits 'folder' facet and returns mimeType application/octet-stream with size 0
        const isFolder = !!resource.folder || 
                         (resource.file?.mimeType === 'application/octet-stream' && 
                          resource.size === 0 && 
                          (!resource.name || !resource.name.includes('.')));
        // Clean up the snippet if it contains HTML from Microsoft Graph
        let cleanSnippet = hit.summary ? hit.summary.replace(/<[^>]*>?/gm, '') : 'Found in Microsoft 365';
        
        return {
          name: resource.name || 'Unknown',
          source: 'SharePoint',
          path: resource.parentReference?.path || '/root',
          webUrl: resource.webUrl || '',
          lastModified: resource.lastModifiedDateTime || new Date().toISOString(),
          snippet: (isFolder ? '📂 [FOLDER] ' : '📄 [FILE] ') + cleanSnippet
        };
      });
    } catch (err) {
      console.error('[DataLayer] Microsoft Graph search failed, falling back to mock results:', err.response?.data || err.message);
      return MOCK_FILES.filter(
        file => file.source === 'SharePoint' &&
        (file.name.toLowerCase().includes(queryText.toLowerCase()) ||
         file.snippet.toLowerCase().includes(queryText.toLowerCase()))
      );
    }
  }

  /**
   * Combined Dual-Source Search with De-duplication
   */
  async searchFiles(queryText) {
    console.log(`[DataLayer] Searching both Google & MS for query: "${queryText}"`);

    const [googleResults, msResults] = await Promise.all([
      this.searchGoogleDrive(queryText),
      this.searchMicrosoft(queryText)
    ]);

    const combinedResults = [...googleResults, ...msResults];
    const uniqueResults = [];
    const nameMap = new Map();

    for (const file of combinedResults) {
      const normalizedName = file.name.toLowerCase().trim();
      if (nameMap.has(normalizedName)) {
        const existingFile = nameMap.get(normalizedName);
        if (existingFile.source !== file.source) {
          existingFile.isDuplicateOnOtherSource = true;
          file.isDuplicateOnOtherSource = true;
          uniqueResults.push(file);
        }
      } else {
        nameMap.set(normalizedName, file);
        uniqueResults.push(file);
      }
    }

    return uniqueResults;
  }

  /**
   * Uploads a file to Google Drive and returns the webViewLink
   */
  async uploadBackupToDrive(filePath, folderId) {
    if (!this.isGoogleConfigured) {
      throw new Error('Google Drive is not configured');
    }

    // Auto-sanitize the folder ID in case the user pasted the full URL or added parameters
    let cleanFolderId = folderId.trim();
    if (cleanFolderId.includes('?')) {
      cleanFolderId = cleanFolderId.split('?')[0];
    }
    const idMatch = cleanFolderId.match(/([a-zA-Z0-9_-]{25,})/);
    if (idMatch) {
      cleanFolderId = idMatch[1];
    }

    try {
      console.log(`[DataLayer] Uploading ${filePath} to Google Drive folder ${cleanFolderId}...`);
      const fileName = path.basename(filePath);
      
      const fileMetadata = {
        name: fileName,
        parents: [cleanFolderId]
      };
      
      const media = {
        mimeType: 'application/zip',
        body: fs.createReadStream(filePath)
      };

      const response = await this.googleDrive.files.create({
        resource: fileMetadata,
        media: media,
        fields: 'id, webViewLink'
      });

      console.log(`[DataLayer] File uploaded successfully. File ID: ${response.data.id}`);
      return response.data.webViewLink;
    } catch (err) {
      console.error('[DataLayer] Failed to upload backup to Google Drive:', err.message);
      throw err;
    }
  }
}

export const dataLayer = new DataLayer();
