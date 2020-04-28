/* eslint-disable camelcase */
const {google} = require('googleapis');
const ffs = require('fs');
const readline = require('readline');
const main = require('./cli');

const SCOPES = ['https://www.googleapis.com/auth/documents.readonly'];

// The token.json stores user access/refresh tokens
const TOKEN_PATH = 'token.json';

let docId: string | null = null;

/**
 * Get the JSON representation of a Google Doc
 * Set the docId variable then call Google Auth
 * @param {string} id The ID of the Google Doc being requested.
 */
async function getDocument(id) {
  docId = id;
  // Load client secrets from a local file
  ffs.readFile('credentials.json', (err, content) => {
    if (err) return console.log('Error loading client secret file:', err);
    // Authorize client then run callback
    authorize(JSON.parse(content), getDocumentWithAuth);
  });
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
  const params = {documentId: docId};
  await docs.documents.get(
      params,
      (err, res) => {
        if (err) {
          console.error(err);
          throw err;
        }
        main.output(res.data);
      } );
}


/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
function authorize(credentials, callback) {
  const {client_secret, client_id, redirect_uris} = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(
      client_id, client_secret, redirect_uris[0]);

  // Check if we have previously stored a token.
  ffs.readFile(TOKEN_PATH, (err, token) => {
    if (err) return getNewToken(oAuth2Client, callback);
    oAuth2Client.setCredentials(JSON.parse(token));
    callback(oAuth2Client);
  });
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback for the authorized client.
 */
function getNewToken(oAuth2Client, callback) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
  console.log('Authorize this app by visiting this url:', authUrl);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  rl.question('Enter the code from that page here: ', (code) => {
    rl.close();
    oAuth2Client.getToken(code, (err, token) => {
      if (err) return console.error('Error retrieving access token', err);
      oAuth2Client.setCredentials(token);
      // Store the token to disk for later program executions
      ffs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
        if (err) return console.error(err);
        console.log('Token stored to', TOKEN_PATH);
      });
      callback(oAuth2Client);
    });
  });
}

