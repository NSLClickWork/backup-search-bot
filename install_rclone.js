import fs from 'fs';
import https from 'https';
import path from 'path';
import extract from 'extract-zip';

const url = 'https://downloads.rclone.org/rclone-current-linux-amd64.zip';
const zipPath = path.resolve('rclone.zip');

if (!fs.existsSync('./rclone')) {
    console.log('Downloading rclone...');
    const file = fs.createWriteStream(zipPath);
    await new Promise((resolve, reject) => {
        https.get(url, (response) => {
            response.pipe(file);
            file.on('finish', async () => {
                file.close();
                console.log('Download complete. Extracting...');
                try {
                    await extract(zipPath, { dir: process.cwd() });
                    const files = fs.readdirSync(process.cwd());
                    const rcloneFolder = files.find(f => f.startsWith('rclone-v') && fs.statSync(f).isDirectory());
                    if (rcloneFolder) {
                        fs.copyFileSync(path.join(rcloneFolder, 'rclone'), './rclone');
                        fs.chmodSync('./rclone', 0o755);
                        console.log('rclone successfully installed to ./rclone');
                    } else {
                        console.error('Extracted folder not found.');
                    }
                } catch (err) {
                    console.error('Error extracting:', err);
                }
                resolve();
            });
        }).on('error', (err) => {
            fs.unlinkSync(zipPath);
            console.error('Error downloading:', err.message);
            reject(err);
        });
    });
} else {
    console.log('rclone already installed.');
}
