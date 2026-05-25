import http from 'http';
import url from 'url';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { google } from 'googleapis';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.log('\n❌ Error: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in your .env file before running this script.');
  console.log('Please open your backend/.env file and append these lines first:\n');
  console.log('GOOGLE_CLIENT_ID=your-oauth-client-id.apps.googleusercontent.com');
  console.log('GOOGLE_CLIENT_SECRET=your-oauth-client-secret\n');
  process.exit(1);
}

const REDIRECT_PORT = 3000;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/oauth2callback`;

const oauth2Client = new google.auth.OAuth2(
  clientId,
  clientSecret,
  REDIRECT_URI
);

// Scopes required for Drive folder/file creation and Sheets writing
const scopes = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/spreadsheets',
];

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline', // Forces retrieval of a refresh token
  prompt: 'consent',     // Forces consent screen to ensure refresh token is returned
  scope: scopes,
});

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url || '', true);
  if (parsedUrl.pathname === '/oauth2callback') {
    const code = parsedUrl.query.code as string;
    if (code) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`
        <html>
          <body style="font-family: sans-serif; text-align: center; padding-top: 50px; background-color: #f7f9fa; color: #2d3748;">
            <div style="display: inline-block; padding: 30px; border-radius: 12px; background: white; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
              <h1 style="color: #48bb78; margin-top: 0;">Authorization Success!</h1>
              <p style="font-size: 1.1em;">You can now close this tab and return to your terminal.</p>
            </div>
          </body>
        </html>
      `);
      
      // Close HTTP server socket
      server.close();
      
      console.log('\n⏳ Code received! Exchanging code for tokens...');
      try {
        const { tokens } = await oauth2Client.getToken(code);
        console.log('\n================================================================');
        console.log('🎉 SUCCESS! Refresh Token generated successfully.');
        console.log('================================================================\n');
        console.log('Copy and paste the following line into your backend/.env file:\n');
        console.log(`\x1b[32mGOOGLE_REFRESH_TOKEN=${tokens.refresh_token}\x1b[0m`);
        console.log('\n================================================================');
        process.exit(0);
      } catch (err) {
        console.error('\n❌ Failed to exchange code for tokens:', err);
        process.exit(1);
      }
    } else {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('No authorization code found in URL query.');
    }
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

server.listen(REDIRECT_PORT, () => {
  console.log('================================================================');
  console.log('🔑 Google OAuth2 Refresh Token Generator');
  console.log('================================================================\n');
  console.log('1. Open the following link in your web browser:\n');
  console.log(`🔗 \x1b[36m${authUrl}\x1b[0m\n`);
  console.log('2. Log in with your personal Google account, click "Advanced" and proceed if you see a warning.');
  console.log('3. Grant full permissions, and complete the flow.');
  console.log(`4. This script is listening on port ${REDIRECT_PORT} and will print the token when done.\n`);
});
