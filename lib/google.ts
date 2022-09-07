/* eslint-disable camelcase */
import { google } from 'googleapis';
import ffs = require('fs');
import * as main from './cli';
import path from 'path';
import os from 'os';
import http from 'http';
import url from 'url';
import opn from 'open';
import destroyer from 'server-destroy';
const homedir = os.homedir();

let docId: string | null = null;

const keyPath = path.join(homedir, '.config', 'google-docs-converter', 'credentials.json');
const tokenPath = path.join(homedir, '.config', 'google-docs-converter', 'tokens.json');

interface ClientDetails {
    client_id: string;
    client_secret: string;
    redirect_uris: string[];
}

interface Keys {
    installed?: ClientDetails;
    web?: ClientDetails;
    redirect_uris?: string[];
}

let keys: Keys = { redirect_uris: [''] };
let details: ClientDetails;
if (ffs.existsSync(keyPath)) {
    keys = require(keyPath);
    if (keys.hasOwnProperty('web')) {
        details = keys.web;
    } else if (keys.hasOwnProperty('installed')) {
        console.error("ERROR: Wrong kind of credentials file found (Desktop instead of Web application).\nThough it makes logical sense to use the 'Desktop' style of app in the Google\nCloud Console, unfortunately this causes problems with the authorization scheme\nused by this program.\n\nGet credentials for a web application with authorized redirect URI:\nhttp://localhost:3000/oauth2callback.\n\nhttps://console.developers.google.com/apis/credentials");
        process.exit(1)
    }
} else {
    console.error(`ERROR: credentials.json file was not found at\n${keyPath}\n\nHave you created the necessary credentials in Google Cloud Console?\nSee installation instructions for more details.`);
    process.exit(1)
}

/**
 * Create a new OAuth2 client with the configured keys.
 */
const oauth2Client = new google.auth.OAuth2(
    details.client_id, details.client_secret, details.redirect_uris[0]);

google.options({ auth: oauth2Client });

/**
 * Watch for refresh tokens and properly store them for future use.
 */
oauth2Client.on('tokens', (tokens) => {
    if (tokens.refresh_token) {
        // Store the token to disk for later program executions
        ffs.writeFile(tokenPath, JSON.stringify(tokens), (err) => {
            if (err) return console.error(err);
        });
    }
});

/**
 * Open an http server to accept the oauth callback. The only request to webserver is to /callback?code=<code>
 */
async function authenticate() {
    return new Promise((resolve, reject) => {
        // First check if we have an existing token to use
        if (ffs.existsSync(tokenPath)) {
            const tokens = require(tokenPath);
            oauth2Client.setCredentials(tokens)
            resolve(oauth2Client);
        } else {
            // grab the url that will be used for authorization
            const authorizeUrl = oauth2Client.generateAuthUrl({
                access_type: 'offline',
                scope: 'https://www.googleapis.com/auth/documents.readonly',
            });
            const server = http
                .createServer(async (req, res) => {
                    try {
                        if (req.url.indexOf('/oauth2callback') > -1) {
                            const qs = new url.URL(req.url, 'http://localhost:3000')
                                .searchParams;
                            res.end('Authentication successful! Please return to the console.');
                            server.destroy();
                            const { tokens } = await oauth2Client.getToken(qs.get('code'));
                            oauth2Client.credentials = tokens;
                            resolve(oauth2Client);
                        }
                    } catch (e) {
                        reject(e);
                    }
                })
                .listen(3000, () => {
                    // open the browser to the authorize url to start the workflow
                    opn(authorizeUrl, { wait: false }).then((cp) => cp.unref());
                });
            destroyer(server);
        }
    });
}

/**
 * Get the JSON representation of a Google Doc
 * Set the docId variable then call Google Auth
 * @param {string} id The ID of the Google Doc being requested.
 */
async function getDocument(id: string) {
    docId = id;
    authenticate()
        .then((client) => {
            getDocumentWithAuth(client);
        })
        .catch((err) => {
            deleteTokenError();
        })
}
exports.getDocument = getDocument;

/**
 * Connect to Google Docs API, retrieve the document
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
async function getDocumentWithAuth(auth) {
    if (process.env.NODE_ENV === 'test') return;
    const docs = google.docs({
        version: 'v1',
        auth: auth,
    });
    if (docId === null) throw new Error('docId was never set.');
    const params = { documentId: docId };
    docs.documents.get(
        params,
        (err, res) => {
            if (err) {
                deleteTokenError();
            }
            main.output(res.data);
        });
}

/**
 * Utility function to log error to console, delete current token
 */
function deleteTokenError() {
    console.error("An error has triggered. Deleting the refresh token so the program can be reauthorized.");
    ffs.unlink(tokenPath, console.error);
    process.exit(1);
}
