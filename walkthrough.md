# Google Docs Converter: Linear Code Walkthrough

*2026-03-05T22:40:39Z*

This walkthrough follows the exact runtime path from process start to final output.

Linear order: package entrypoints -> CLI parsing and writer selection -> local JSON vs API branch -> Google OAuth/fetch/export -> parser pipeline -> writer polymorphism -> tests.

## 1) Entry Points and Surface API

This project has two exposed entry surfaces. First is the CLI binary named `gconv`, and second is the library export surface in lib/index.ts for parseDocument and writers.

```typescript
const writers = require('./writers');
const parser = require('./parser');

exports.parseDocument = parser.parseDocument;
exports.writers = writers;
```

## 2) CLI Startup and Format Selection (lib/cli.ts)

When gconv runs, commander parses arguments, a writer implementation is selected from the format flag, and execution branches either to local JSON parsing or to Google API fetch/export.

```typescript
     1	#!/usr/bin/env node
     2	
     3	export {};
     4	const {program} = require('commander');
     5	const fs = require('fs');
     6	const pjson = require('../package.json');
     7	const writers = require('./writers');
     8	import {Writer} from './writers';
     9	const parser = require('./parser');
    10	const docs = require('./google');
    11	
    12	program.version(pjson.version);
    13	
    14	program
    15	    .argument('[url]', 'Google Docs URL')
    16	    .option('-f, --format <format>',
    17	        'Format for conversion: markdown, gfm, loose-markdown, org, google-markdown',
    18	        'loose-markdown')
    19	    .option('-j, --json <jsonFile>', 'Pass Google Docs JSON as file');
    20	
    21	program.parse(process.argv);
    22	
    23	const options = program.opts();
    24	
    25	/** Create Writer
    26	 * Based on -f flag, create the writer which will be used to
    27	 * convert the JSON. Default is LooseMarkdown.
    28	 *
    29	 * Writer types are defined in writers.ts
    30	 */
    31	const inputtedFormat: string = options.format;
    32	let writer: Writer;
    33	switch (inputtedFormat.toLowerCase()) {
    34	  case 'markdown':
    35	    writer = new writers.MarkdownWriter();
    36	    break;
    37	  case 'loose-markdown':
    38	    writer = new writers.LooseMarkdownWriter();
    39	    break;
    40	  case 'gfm':
    41	    writer = new writers.GithubMarkdownWriter();
    42	    break;
    43	  case 'org':
    44	    writer = new writers.OrgModeWriter();
    45	    break;
    46	  case 'org-mode':
    47	    writer = new writers.OrgModeWriter();
    48	    break;
    49	  case 'orgmode':
    50	    writer = new writers.OrgModeWriter();
    51	    break;
    52	  case 'fountain':
    53	    writer = new writers.FountainWriter();
    54	    break;
    55	  default:
    56	    writer = new writers.LooseMarkdownWriter();
    57	}
    58	
    59	if (inputtedFormat.toLowerCase() === 'google-markdown') {
    60	    // Do nothing here, we'll handle it below
    61	} else if (!writer && inputtedFormat.toLowerCase() !== 'google-markdown') {
    62	    // Fallback if writer wasn't set and it's not google-markdown (though default handles this)
    63	     writer = new writers.LooseMarkdownWriter();
    64	}
    65	
    66	/** If the -j flag is used, don't call the Google Docs API.
    67	 * Just use the local file that was passed and parse as JSON.
    68	 * Mostly for debugging purposes.
    69	 *
    70	 * Otherwise, begin the authorization routine to make a Google Docs request.
    71	*/
    72	if (options.json) {
    73	  const rawData = fs.readFileSync(options.json);
    74	  const json = JSON.parse(rawData);
    75	  console.log(parser.parseDocument(json, writer));
    76	} else {
    77	  /**
    78	   * Check if we're in a test environment. If we are, turn off some
    79	   * checks to allow tests to run.
    80	   */
    81	  if (process.env.NODE_ENV !== 'test') {
    82	    if (process.argv.length === 2) { // Make sure user passed an argument
    83	      console.error('Error: No Google Docs URL passed to program.');
    84	      program.help({error: true});
    85	    }
    86	    const inputtedId: string = program.args[0];
    87	    const docIdRegex = /\/document\/d\/([a-zA-Z0-9-_]+)/;
    88	    const matches = inputtedId.match(docIdRegex);
    89	    if (matches === null || matches.length < 2) {
    90	      console.error(`Error: Couldn't find docId in ${inputtedId}`);
    91	      program.help({error: true});
    92	    }
    93	    const docId = matches[1];
    94	    if (inputtedFormat.toLowerCase() === 'google-markdown') {
    95	        docs.exportDocument(docId, 'text/markdown');
    96	    } else {
    97	        docs.getDocument(docId);
    98	    }
    99	  }
   100	}
   101	
   102	/**
   103	 * Callback function to output results of API call
   104	 * @param {object} document JSON object representing document
   105	 */
   106	export function output(document: object) {
   107	  console.log(parser.parseDocument(document, writer));
   108	}
```

Walkthrough of this file in execution order:
1) Parse args and options (lines 12-23).
2) Choose writer by format string (31-57).
3) Special-case google-markdown so the parser/writer path is skipped (59-64, 94-97).
4) If json option is provided, parse local JSON and print conversion immediately (72-75).
5) Otherwise validate URL, extract docId via regex /document/d/<id>, and call docs.getDocument or docs.exportDocument (81-98).
6) The google.ts module later calls back into output() to run parser.parseDocument with the selected writer (106-107).

## 3) Google Auth and Remote Fetch/Export (lib/google.ts)

This module owns OAuth setup, token persistence, and API calls. The CLI only passes docId and desired mode; google.ts handles browser auth, callback server, and request execution.

```typescript
     1	/* eslint-disable camelcase */
     2	import { google } from 'googleapis';
     3	import ffs = require('fs');
     4	import * as main from './cli';
     5	import path from 'path';
     6	import os from 'os';
     7	import http from 'http';
     8	import url from 'url';
     9	import opn from 'open';
    10	import destroyer from 'server-destroy';
    11	const homedir = os.homedir();
    12	
    13	let docId: string | null = null;
    14	
    15	const keyPath = path.join(homedir, '.config', 'google-docs-converter', 'credentials.json');
    16	const tokenPath = path.join(homedir, '.config', 'google-docs-converter', 'tokens.json');
    17	
    18	interface ClientDetails {
    19	    client_id: string;
    20	    client_secret: string;
    21	    redirect_uris: string[];
    22	}
    23	
    24	interface Keys {
    25	    installed?: ClientDetails;
    26	    web?: ClientDetails;
    27	    redirect_uris?: string[];
    28	}
    29	
    30	let keys: Keys = { redirect_uris: [''] };
    31	let details: ClientDetails;
    32	if (ffs.existsSync(keyPath)) {
    33	    keys = require(keyPath);
    34	    if (keys.hasOwnProperty('web')) {
    35	        details = keys.web;
    36	    } else if (keys.hasOwnProperty('installed')) {
    37	        console.error("ERROR: Wrong kind of credentials file found (Desktop instead of Web application).\nThough it makes logical sense to use the 'Desktop' style of app in the Google\nCloud Console, unfortunately this causes problems with the authorization scheme\nused by this program.\n\nGet credentials for a web application with authorized redirect URI:\nhttp://localhost:3000/oauth2callback.\n\nhttps://console.developers.google.com/apis/credentials");
    38	        process.exit(1)
    39	    }
    40	} else {
    41	    console.error(`ERROR: credentials.json file was not found at\n${keyPath}\n\nHave you created the necessary credentials in Google Cloud Console?\nSee installation instructions for more details.`);
    42	    process.exit(1)
    43	}
    44	
    45	/**
    46	 * Create a new OAuth2 client with the configured keys.
    47	 */
    48	const oauth2Client = new google.auth.OAuth2(
    49	    details.client_id, details.client_secret, details.redirect_uris[0]);
    50	
    51	google.options({ auth: oauth2Client });
    52	
    53	/**
    54	 * Watch for refresh tokens and properly store them for future use.
    55	 */
    56	oauth2Client.on('tokens', (tokens) => {
    57	    if (tokens.refresh_token) {
    58	        // Store the token to disk for later program executions
    59	        ffs.writeFile(tokenPath, JSON.stringify(tokens), (err) => {
    60	            if (err) return console.error(err);
    61	        });
    62	    }
    63	});
    64	
    65	/**
    66	 * Open an http server to accept the oauth callback. The only request to webserver is to /callback?code=<code>
    67	 */
    68	async function authenticate() {
    69	    return new Promise((resolve, reject) => {
    70	        // First check if we have an existing token to use
    71	        if (ffs.existsSync(tokenPath)) {
    72	            const tokens = require(tokenPath);
    73	            oauth2Client.setCredentials(tokens)
    74	            resolve(oauth2Client);
    75	        } else {
    76	            // grab the url that will be used for authorization
    77	            const authorizeUrl = oauth2Client.generateAuthUrl({
    78	                access_type: 'offline',
    79	                scope: [
    80	                    'https://www.googleapis.com/auth/documents.readonly',
    81	                    'https://www.googleapis.com/auth/drive.readonly'
    82	                ]
    83	            });
    84	            const server = http
    85	                .createServer(async (req, res) => {
    86	                    try {
    87	                        if (req.url.indexOf('/oauth2callback') > -1) {
    88	                            const qs = new url.URL(req.url, 'http://localhost:3000')
    89	                                .searchParams;
    90	                            res.end('Authentication successful! Please return to the console.');
    91	                            server.destroy();
    92	                            const { tokens } = await oauth2Client.getToken(qs.get('code'));
    93	                            ffs.writeFileSync(tokenPath, JSON.stringify(tokens));
    94	                            oauth2Client.credentials = tokens;
    95	                            resolve(oauth2Client);
    96	                        }
    97	                    } catch (e) {
    98	                        reject(e);
    99	                    }
   100	                })
   101	                .listen(3000, () => {
   102	                    // open the browser to the authorize url to start the workflow
   103	                    opn(authorizeUrl, { wait: false }).then((cp) => cp.unref());
   104	                });
   105	            destroyer(server);
   106	        }
   107	    });
   108	}
   109	
   110	/**
   111	 * Get the JSON representation of a Google Doc
   112	 * Set the docId variable then call Google Auth
   113	 * @param {string} id The ID of the Google Doc being requested.
   114	 */
   115	async function getDocument(id: string) {
   116	    docId = id;
   117	    authenticate()
   118	        .then((client) => {
   119	            getDocumentWithAuth(client);
   120	        })
   121	        .catch((err) => {
   122	            deleteTokenError();
   123	        })
   124	}
   125	exports.getDocument = getDocument;
   126	
   127	/**
   128	 * Export a file from Google Drive
   129	 * @param {string} id The ID of the file to export
   130	 * @param {string} mimeType The MIME type to export as
   131	 */
   132	async function exportDocument(id: string, mimeType: string) {
   133	    docId = id;
   134	    authenticate()
   135	        .then((client) => {
   136	            exportDocumentWithAuth(client, mimeType);
   137	        })
   138	        .catch((err) => {
   139	            deleteTokenError();
   140	        })
   141	}
   142	exports.exportDocument = exportDocument;
   143	
   144	/**
   145	 * Connect to Google Docs API, retrieve the document
   146	 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
   147	 */
   148	async function getDocumentWithAuth(auth) {
   149	    if (process.env.NODE_ENV === 'test') return;
   150	    const docs = google.docs({
   151	        version: 'v1',
   152	        auth: auth,
   153	    });
   154	    if (docId === null) throw new Error('docId was never set.');
   155	    const params = { documentId: docId };
   156	    docs.documents.get(
   157	        params,
   158	        (err, res) => {
   159	            if (err) {
   160	                console.error('Google Docs API error:', err.message || err);
   161	                deleteTokenError();
   162	            }
   163	            main.output(res.data);
   164	        });
   165	}
   166	
   167	/**
   168	 * Connect to Google Drive API, export the document
   169	 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
   170	 * @param {string} mimeType The MIME type to export as
   171	 */
   172	async function exportDocumentWithAuth(auth, mimeType) {
   173	    if (process.env.NODE_ENV === 'test') return;
   174	    const drive = google.drive({
   175	        version: 'v3',
   176	        auth: auth,
   177	    });
   178	    if (docId === null) throw new Error('docId was never set.');
   179	    const params = { fileId: docId, mimeType: mimeType };
   180	    drive.files.export(
   181	        params,
   182	        (err, res) => {
   183	            if (err) {
   184	                console.error('Google Drive API error:', err.message || err);
   185	                deleteTokenError();
   186	            }
   187	            console.log(res.data);
   188	        });
   189	}
   190	
   191	/**
   192	 * Utility function to log error to console, delete current token
   193	 */
   194	function deleteTokenError() {
   195	    console.error("An error has triggered. Deleting the refresh token so the program can be reauthorized.");
   196	    ffs.unlink(tokenPath, console.error);
   197	    process.exit(1);
   198	}
```

Execution path details:
1) Module load immediately checks for credentials.json in ~/.config/google-docs-converter and exits early on missing or wrong type (web vs installed) credentials.
2) OAuth client is created once and globally configured for googleapis.
3) authenticate() first reuses tokens.json if present; otherwise it creates an auth URL, starts a localhost:3000 callback server, opens browser, exchanges code for tokens, persists token, and resolves.
4) getDocument() and exportDocument() set module-level docId then call authenticate and continue with authenticated API calls.
5) getDocumentWithAuth calls Docs API documents.get and hands response data back to cli.output for parser conversion.
6) exportDocumentWithAuth calls Drive API files.export and prints the returned markdown payload directly.
7) Any API/auth failure triggers deleteTokenError(), deleting token file and exiting so next run reauthorizes cleanly.

## 4) Parsing Pipeline (lib/parser.ts)

The parser converts Google Docs JSON into an array of paragraph strings, then asks the selected writer to finalize spacing and syntax.

```typescript
     1	const util = require('./utilities');
     2	const writers = require('./writers');
     3	import {Writer} from './writers';
     4	
     5	/**
     6	 * Function to parse Google Docs API Document
     7	 * @param {object} document JSON object representing document
     8	 * @param {Writer} writer Converter to appropriate text format
     9	 * @return {string}
    10	 */
    11	function parseDocument(
    12	    document: object,
    13	    writer: Writer = new writers.MarkdownWriter(),
    14	): string {
    15	  const body: object = document['body'];
    16	  const content: object[] = body['content'];
    17	  const lists: object = document['lists'];
    18	  const listTracker: object = {};
    19	  // fs.writeFileSync('test/list-sample.json', JSON.stringify(document));
    20	  const paragraphs: object[] = content
    21	      .filter((o) => o.hasOwnProperty('paragraph'))
    22	      .map((o) => o['paragraph']);
    23	
    24	  const parsed: string[] =
    25	    paragraphs.map((p) => parseParagraph(p, writer, lists, listTracker));
    26	  const convertedFinal: string = writer.finalize(parsed);
    27	  return convertedFinal;
    28	}
    29	
    30	exports.parseDocument = parseDocument;
    31	
    32	/** Function to parse paragraph element and convert to Markdown
    33	 * @param  {object} paragraph From 'paragraph' field
    34	 * @param  {Writer} writer class to handle conversions, default is markdown
    35	 * @param  {object} lists object to provide id's and details for lists
    36	 * @param  {object} listTracker object to track place in a list
    37	 * @return {string} Markdown as string
    38	 */
    39	function parseParagraph(
    40	    paragraph: object,
    41	    writer: Writer = new writers.MarkdownWriter(),
    42	    lists?: object,
    43	    listTracker?: object,
    44	): string {
    45	  const elements : object[] = paragraph['elements'];
    46	  /** Function to reduce elements/textRuns into single string
    47	   * @param {string} acc
    48	   * @param {object} element
    49	   * @return {string}
    50	  */
    51	  function elementsReducer(acc: string, element: object): string {
    52	    return acc + parseElement(element, writer);
    53	  }
    54	  let content = elements.reduce(elementsReducer, '');
    55	
    56	  // Handle Headers
    57	  const paragraphStyle = paragraph['paragraphStyle'];
    58	  const namedStyle: string = paragraphStyle['namedStyleType'];
    59	
    60	  if (namedStyle.startsWith('HEADING')) {
    61	    const levelString: string = namedStyle.substring(namedStyle.length - 1);
    62	    const level: number = parseInt(levelString);
    63	    content = writer.addHeading(content, level);
    64	  }
    65	
    66	  // Handle Lists
    67	  if (paragraph.hasOwnProperty('bullet')) { // Means it's a list-item
    68	    const bullet = paragraph['bullet'];
    69	    const listId = bullet['listId'];
    70	    const nestingLevel =
    71	      bullet['nestingLevel'] === undefined ? 0 : bullet['nestingLevel'];
    72	    const padding = '    '.repeat(nestingLevel);
    73	    const listDetails =
    74	      lists[listId]['listProperties']['nestingLevels'][nestingLevel];
    75	    if (listDetails.hasOwnProperty('glyphType')) { // means ordered list
    76	      if (listTracker.hasOwnProperty(listId) &&
    77	        listTracker[listId].hasOwnProperty(nestingLevel)) {
    78	        listTracker[listId][nestingLevel] += 1;
    79	      } else {
    80	        /** If no listId entry, create one... */
    81	        if (!listTracker.hasOwnProperty(listId)) {
    82	          listTracker[listId] = {};
    83	        }
    84	        listTracker[listId][nestingLevel] = 1;
    85	      }
    86	      content = listTracker[listId][nestingLevel].toString() + '. ' + content;
    87	    } else { // means unordered list
    88	      content = '- ' + content;
    89	    }
    90	    // Apply padding using nestingLevel
    91	    content = padding + content;
    92	    // Put newline at end of line, rather than within style text
    93	    content = content.replace('\n', '') + '\n';
    94	  }
    95	  return content;
    96	}
    97	
    98	exports.parseParagraph = parseParagraph;
    99	
   100	/** Function to parse individual element into appropriate format
   101	 * @param {object} element
   102	 * @param {Writer} writer to use for conversion (markdown, org, etc)
   103	 * @return {string}
   104	 */
   105	function parseElement(element: object, writer: Writer): string {
   106	  // Currently, parseElement only supports the textRun form of a 
   107	  // ParagraphElement 
   108	  // SEE: https://developers.google.com/docs/api/reference/rest/v1/documents#ParagraphElement
   109	  if (!element.hasOwnProperty('textRun')) { // means NOT regular paragraph
   110	    return ""
   111	  }
   112	  let content = element['textRun']['content'];
   113	  const textStyle = element['textRun']['textStyle'];
   114	  if (util.isEmpty(textStyle)) {
   115	    return content;
   116	  }
   117	
   118	  /* Note, the order of these conditionals matters.
   119	   * HTML tags on outside of markdown. */
   120	  if (textStyle.underline && !textStyle.link) { // Ignore underlining if a link
   121	    content = writer.underline(content);
   122	  }
   123	  if (textStyle.strikethrough) {
   124	    content = writer.strikethrough(content);
   125	  }
   126	  if (textStyle.italic) {
   127	    content = writer.italicize(content);
   128	  }
   129	  if (textStyle.bold) {
   130	    content = writer.bold(content);
   131	  }
   132	  if (textStyle.link) {
   133	    if (textStyle.link.url) {
   134	      content = writer.addLink(content, textStyle.link.url);
   135	    }
   136	  }
   137	  return content;
   138	}
```

Parser flow in detail:
1) parseDocument() narrows body.content down to paragraph entries only, skipping unsupported structural items like tables/images that are not paragraph nodes.
2) Each paragraph is converted by parseParagraph(), which first reduces paragraph elements by calling parseElement() for each textRun segment.
3) Heading conversion is style-driven: namedStyleType HEADING1..HEADING6 maps to writer.addHeading(content, level).
4) List conversion uses paragraph.bullet + document.lists metadata. Ordered lists are detected by glyphType and counted per listId + nestingLevel in listTracker. Unordered lists get a dash prefix.
5) Nested lists are indented using four spaces per nesting level.
6) parseElement() applies text styles in a fixed order: underline (unless link), strikethrough, italic, bold, then link wrapping. That order controls marker nesting in output.

## 5) Writer Implementations (lib/writers.ts)

Writers encapsulate output syntax. The parser is format-agnostic after it delegates style/link/heading/finalize operations to the active writer.

```typescript
     1	/**
     2	 * Writer Class
     3	 * Describes the functions that must be implemented to convert
     4	 * Google Docs Document into plain text format.
     5	 */
     6	export interface Writer {
     7	  bold(content: any): string;
     8	  italicize(text: string): string;
     9	  underline(text: string): string;
    10	  strikethrough(text: string): string;
    11	  addHeading(text: string, level: number): string;
    12	  addLink(text: string, url: string): string;
    13	  finalize(lines: string[]): string;
    14	}
    15	
    16	/** Class implementing markdown Writer */
    17	class MarkdownWriter implements Writer {
    18	  /**
    19	   * Wrap italic text with asterisk
    20	   * @param {string} text
    21	   * @return {string}
    22	   */
    23	  italicize(text: string): string {
    24	    return '*' + text + '*';
    25	  }
    26	  /**
    27	   * Wrap bold text with 2 asterisks
    28	   * @param {string} text
    29	   * @return {string}
    30	   */
    31	  bold(text: string): string {
    32	    return '**' + text + '**';
    33	  }
    34	  /**
    35	   * Wrap underline text with <u> tags
    36	   * @param {string} text
    37	   * @return {string}
    38	   */
    39	  underline(text: string): string {
    40	    return '<u>' + text + '</u>';
    41	  }
    42	  /**
    43	   * Wrap strikethrough text with <s> tags
    44	   * @param {string} text
    45	   * @return {string}
    46	   */
    47	  strikethrough(text: string): string {
    48	    return '<s>' + text + '</s>';
    49	  }
    50	  /**
    51	   * Add ATX-style header to text
    52	   * Don't add header if one already exists
    53	   * @param {string} text to add header to
    54	   * @param {number} level of ATX-heading to apply
    55	   * @return {string}
    56	   */
    57	  addHeading(text: string, level: number): string {
    58	    if (text.startsWith('#')) {
    59	      return text;
    60	    } else {
    61	      return '#'.repeat(level) + ' ' + text;
    62	    }
    63	  }
    64	  /**
    65	   * Add link formatting to text
    66	   * @param {string} text to wrap in link
    67	   * @param {string} url to link to
    68	   * @return {string}
    69	   */
    70	  addLink(text: string, url: string): string {
    71	    return `[${text}](${url})`;
    72	  }
    73	  /**
    74	   * Do final pass on array of markdown elements
    75	   *  - Properly pad headings
    76	   *  - Join array of strings into output string
    77	   * @param {string[]} lines Array of converted strings
    78	   * @return {string} Final output string
    79	   */
    80	  finalize(lines: string[]): string {
    81	    const max: number = lines.length - 1;
    82	    for (let i = 0; i < lines.length; i++) {
    83	      let l: string = lines[i];
    84	      if (i == 0 && i+1 <= max) {
    85	        const next: string = lines[i+1];
    86	        if (l.startsWith('#') && !next.startsWith('\n')) {
    87	          l += '\n';
    88	          lines[i] = l;
    89	        }
    90	      } else if (i > 0 && i < max) {
    91	        const prev: string = lines[i-1];
    92	        const next: string = lines[i+1];
    93	        if (l.startsWith('#')) {
    94	          if (!prev.startsWith('\n') && !prev.endsWith('\n\n')) {
    95	            l = '\n' + l;
    96	            lines[i] = l;
    97	          }
    98	          if (!next.startsWith('\n')) {
    99	            l += '\n';
   100	            lines[i] = l;
   101	          }
   102	        }
   103	      } else if (i > 0 && i == max) { // Handle header on last line
   104	        const prev: string = lines[i-1];
   105	        if (l.startsWith('#') && (!prev.endsWith('\n\n') || prev == '\n')) {
   106	          lines[i] = '\n' + l;
   107	        }
   108	      }
   109	    }
   110	    const joinedText = lines.join('');
   111	    const cleanedText = joinedText.replace(/\u000b/g, '\n');
   112	    return cleanedText;
   113	  }
   114	}
   115	exports.MarkdownWriter = MarkdownWriter;
   116	
   117	/**
   118	 * Class to convert Github-Flavored Markdown
   119	 * For now, this just means using their strikethroughs.
   120	 */
   121	class GithubMarkdownWriter extends MarkdownWriter {
   122	  /**
   123	   * strikethrough -- Overwriting inherited method
   124	   * @param {string} text Text to process
   125	   * @return {string}
   126	   */
   127	  strikethrough(text: string):string {
   128	    return '~~' + text + '~~';
   129	  }
   130	}
   131	
   132	exports.GithubMarkdownWriter = GithubMarkdownWriter;
   133	
   134	/**
   135	 * Class to convert markdown without html tags
   136	 */
   137	class LooseMarkdownWriter extends MarkdownWriter {
   138	  /**
   139	   * strikethrough -- Overwriting inherited method
   140	   * @param {string} text Text to process
   141	   * @return {string}
   142	   */
   143	  strikethrough(text: string):string {
   144	    return text;
   145	  }
   146	  /**
   147	   * underline -- Overwriting inherited method
   148	   * @param {string} text Text to star
   149	   * @return {string}
   150	   */
   151	  underline(text: string): string {
   152	    return '*' + text + '*';
   153	  }
   154	}
   155	exports.LooseMarkdownWriter = LooseMarkdownWriter;
   156	
   157	/** Class implementing Fountain Writer
   158	  * Don't handle styling at all, leave it to the text
   159	  */
   160	class FountainWriter extends LooseMarkdownWriter {
   161	  /** Ignore bold
   162	   * @param {string} text
   163	   * @return {string}
   164	   */
   165	  bold(text: string): string {
   166	    return text;
   167	  }
   168	  /** Ignore italic
   169	    * @param {string} text
   170	    * @return {string}
   171	    */
   172	  italicize(text: string): string {
   173	    return text;
   174	  }
   175	  /** Ignore underline
   176	   * @param {string} text
   177	   * @return {string}
   178	   */
   179	  underline(text: string): string {
   180	    return text;
   181	  }
   182	}
   183	exports.FountainWriter = FountainWriter;
   184	
   185	/** Class implementing Org Mode Writer */
   186	class OrgModeWriter implements Writer {
   187	  /**
   188	   * Wrap italic text with slashes
   189	   * @param {string} text
   190	   * @return {string}
   191	   */
   192	  italicize(text: string): string {
   193	    return '/' + text + '/';
   194	  }
   195	  /**
   196	   * Wrap bold text with asterisks
   197	   * @param {string} text
   198	   * @return {string}
   199	   */
   200	  bold(text: string): string {
   201	    return '*' + text + '*';
   202	  }
   203	  /**
   204	   * Wrap underline text with underscores
   205	   * @param {string} text
   206	   * @return {string}
   207	   */
   208	  underline(text: string): string {
   209	    return '_' + text + '_';
   210	  }
   211	  /**
   212	   * Wrap strikethrough text with pluses
   213	   * @param {string} text
   214	   * @return {string}
   215	   */
   216	  strikethrough(text: string): string {
   217	    return '+' + text + '+';
   218	  }
   219	  /**
   220	   * Add org-mode header to text
   221	   * Don't add header if one already exists
   222	   * @param {string} text to add header to
   223	   * @param {number} level of ATX-heading to apply
   224	   * @return {string}
   225	   */
   226	  addHeading(text: string, level: number): string {
   227	    if (text.startsWith('*')) {
   228	      return text;
   229	    } else {
   230	      return '*'.repeat(level) + ' ' + text;
   231	    }
   232	  }
   233	  /**
   234	   * Add link formatting to text
   235	   * @param {string} text to wrap in link
   236	   * @param {string} url to link to
   237	   * @return {string}
   238	   */
   239	  addLink(text: string, url: string): string {
   240	    return `[[${url}][${text}]]`;
   241	  }
   242	  /**
   243	   * Do final pass on array of elements
   244	   *  - Properly pad headings
   245	   *  - Join array of strings into output string
   246	   * @param {string[]} lines Array of converted strings
   247	   * @return {string} Final output string
   248	   */
   249	  finalize(lines: string[]): string {
   250	    const max: number = lines.length - 1;
   251	    for (let i = 0; i < lines.length; i++) {
   252	      let l: string = lines[i];
   253	      if (i == 0 && i+1 <= max) {
   254	        const next: string = lines[i+1];
   255	        if (l.startsWith('*') && !next.startsWith('\n')) {
   256	          l += '\n';
   257	          lines[i] = l;
   258	        }
   259	      } else if (i > 0 && i < max) {
   260	        const prev: string = lines[i-1];
   261	        const next: string = lines[i+1];
   262	        if (l.startsWith('*')) {
   263	          if (!prev.startsWith('\n') && !prev.endsWith('\n\n')) {
   264	            l = '\n' + l;
   265	            lines[i] = l;
   266	          }
   267	          if (!next.startsWith('\n')) {
   268	            l += '\n';
   269	            lines[i] = l;
   270	          }
   271	        }
   272	      } else if (i > 0 && i == max) { // Handle header on last line
   273	        const prev: string = lines[i-1];
   274	        if (l.startsWith('*') && (!prev.endsWith('\n\n') || prev == '\n')) {
   275	          lines[i] = '\n' + l;
   276	        }
   277	      }
   278	    }
   279	    const joinedText = lines.join('');
   280	    const cleanedText = joinedText.replace(/\u000b/g, '\n');
   281	    return cleanedText;
   282	  }
   283	}
   284	
   285	exports.OrgModeWriter = OrgModeWriter;
```

How writer polymorphism is used:
1) Writer interface defines operations the parser depends on: inline styles, heading transform, link transform, and finalize.
2) MarkdownWriter provides default markdown-ish behavior (including HTML tags for underline/strikethrough).
3) GithubMarkdownWriter only overrides strikethrough to use double-tilde.
4) LooseMarkdownWriter removes strikethrough and maps underline to italics, matching the default CLI format.
5) FountainWriter strips most emphasis styling entirely.
6) OrgModeWriter implements org syntax markers and org links.
7) finalize() in MarkdownWriter and OrgModeWriter inserts heading padding and normalizes Unicode vertical-tab (U+000B) to newline.

## 6) Utility and Test Coverage

A tiny utility helper supports style parsing, and tests validate most conversion behaviors: style markers, headings, links, list nesting, heading spacing, and unicode cleanup.

```typescript
     1	/** Utility function to check if object is empty
     2	 * @param {object} obj
     3	 * @return {boolean}
     4	 */
     5	function isEmpty(obj: object): boolean {
     6	  for (const key in obj) {
     7	    if (obj.hasOwnProperty(key)) {
     8	      return false;
     9	    }
    10	  }
    11	  return true;
    12	}
    13	
    14	exports.isEmpty = isEmpty;
```

```typescript
     1	/* eslint-disable max-len */
     2	
     3	process.env.NODE_ENV = 'test';
     4	
     5	const assert = require('assert');
     6	const sample = require('./test-data.js');
     7	const listSample = require('./list-sample.json');
     8	
     9	const {parseParagraph, parseDocument} = require('../dist/parser.js');
    10	const writers = require('../dist/writers.js');
    11	const looseWriter = new writers.LooseMarkdownWriter();
    12	const markdownWriter = new writers.MarkdownWriter();
    13	const githubWriter = new writers.GithubMarkdownWriter();
    14	const orgmodeWriter = new writers.OrgModeWriter();
    15	const lists = sample.lists;
    16	
    17	describe('#parseParagraph', function() {
    18	  it('should return plain text from object', function() {
    19	    assert.equal(parseParagraph(sample.normalText), 'So a bit about us, we like happy endings. We like stories that remind us there’s still something good in the world. And I feel like that’s what people are desperate for right now. \n');
    20	  });
    21	
    22	  describe('with markdown writer', function() {
    23	    describe('text styling', function() {
    24	      it('should returnf markdown italics', function() {
    25	        assert.equal(parseParagraph(sample.italicText, markdownWriter), 'So let’s talk about that young woman. *When We Were Vikings* is unique\n');
    26	      });
    27	      it('should return markdown bold', function() {
    28	        assert.equal(parseParagraph(sample.boldText, markdownWriter), 'So let’s talk about that young woman. **When We Were Vikings** is unique\n');
    29	      });
    30	      it('should return markdown underline', function() {
    31	        assert.equal(parseParagraph(sample.underlineText, markdownWriter), 'So let’s talk about that young woman. <u>When We Were Vikings</u> is unique\n');
    32	      });
    33	      it('should return markdown strikethrough', function() {
    34	        assert.equal(parseParagraph(sample.strikethroughText, markdownWriter), 'So let’s talk about that young woman. <s>When We Were Vikings</s> is unique\n');
    35	      });
    36	    });
    37	    describe('headings', function() {
    38	      it('should convert headings', function() {
    39	        assert.equal(parseParagraph(sample.heading1, markdownWriter), '# The Story\n');
    40	        assert.equal(parseParagraph(sample.heading2, markdownWriter), '## The Story\n');
    41	        assert.equal(parseParagraph(sample.heading3, markdownWriter), '### The Story\n');
    42	        assert.equal(parseParagraph(sample.heading4, markdownWriter), '#### The Story\n');
    43	        assert.equal(parseParagraph(sample.heading5, markdownWriter), '##### The Story\n');
    44	        assert.equal(parseParagraph(sample.heading6, markdownWriter), '###### The Story\n');
    45	      });
    46	      it('should honor existing hashmarks', function() {
    47	        assert.equal(parseParagraph(sample.headingHashed, markdownWriter), '## Robbery Aftermath\n');
    48	      });
    49	    });
    50	    describe('lists', function() {
    51	      it('should handle an unordered list', function() {
    52	        assert.equal(parseParagraph(sample.unordered, markdownWriter, lists), '- Unordered\n');
    53	      });
    54	      it('should handle an ordered list', function() {
    55	        assert.equal(parseParagraph(sample.ordered, markdownWriter, lists, {}), '1. Numbered\n');
    56	        assert.equal(parseParagraph(sample.ordered, markdownWriter, lists, {'kix.hqmt8p2434fi': {'0': 1}}), '2. Numbered\n');
    57	      });
    58	      it('should handle a nested unordered element', function() {
    59	        assert.equal(parseParagraph(sample.unorderedNested, markdownWriter, lists, {}), '    - Unordered\n');
    60	      });
    61	    });
    62	    describe('links', function() {
    63	      it('should handle an external link', function() {
    64	        assert.equal(parseParagraph(sample.externalLink, markdownWriter, lists, {}), '[Add a link](http://simonganz.com) to an external site\n');
    65	      });
    66	    });
    67	  });
    68	  describe('github writer', function() {
    69	    describe('text styling', function() {
    70	      it('should use github strikethroughs', function() {
    71	        assert.equal(parseParagraph(sample.strikethroughText, githubWriter, lists, {}), 'So let’s talk about that young woman. ~~When We Were Vikings~~ is unique\n');
    72	      });
    73	    });
    74	  });
    75	  describe('orgmode writer', function() {
    76	    describe('text styling', function() {
    77	      it('should return markdown italics', function() {
    78	        assert.equal(parseParagraph(sample.italicText, orgmodeWriter), 'So let’s talk about that young woman. /When We Were Vikings/ is unique\n');
    79	      });
    80	      it('should return markdown bold', function() {
    81	        assert.equal(parseParagraph(sample.boldText, orgmodeWriter), 'So let’s talk about that young woman. *When We Were Vikings* is unique\n');
    82	      });
    83	      it('should return markdown underline', function() {
    84	        assert.equal(parseParagraph(sample.underlineText, orgmodeWriter), 'So let’s talk about that young woman. _When We Were Vikings_ is unique\n');
    85	      });
    86	      it('should return markdown strikethrough', function() {
    87	        assert.equal(parseParagraph(sample.strikethroughText, orgmodeWriter), 'So let’s talk about that young woman. +When We Were Vikings+ is unique\n');
    88	      });
    89	    });
    90	    describe('headings', function() {
    91	      it('should convert headings', function() {
    92	        assert.equal(parseParagraph(sample.heading1, orgmodeWriter), '* The Story\n');
    93	        assert.equal(parseParagraph(sample.heading2, orgmodeWriter), '** The Story\n');
    94	        assert.equal(parseParagraph(sample.heading3, orgmodeWriter), '*** The Story\n');
    95	        assert.equal(parseParagraph(sample.heading4, orgmodeWriter), '**** The Story\n');
    96	        assert.equal(parseParagraph(sample.heading5, orgmodeWriter), '***** The Story\n');
    97	        assert.equal(parseParagraph(sample.heading6, orgmodeWriter), '****** The Story\n');
    98	      });
    99	      it('should honor existing hashmarks', function() {
   100	        assert.equal(parseParagraph(sample.headingOrgHashed, orgmodeWriter), '** Robbery Aftermath\n');
   101	      });
   102	    });
   103	    describe('links', function() {
   104	      it('should handle an external link', function() {
   105	        assert.equal(parseParagraph(sample.externalLink, orgmodeWriter, lists, {}), '[[http://simonganz.com][Add a link]] to an external site\n');
   106	      });
   107	    });
   108	  });
   109	});
   110	
   111	describe('#parseDocument', function() {
   112	  describe('with markdown writer', function() {
   113	    it('should handle a complex mix of ordered and unordered lists', function() {
   114	      assert.equal(parseDocument(listSample, markdownWriter),
   115	          '1. I am a numbered list.\n    1. Nested.\n        1. Deeply.\n' +
   116	      '            - Strangely\n            - Switching\n2. Back to basics\n' +
   117	      '\n- Unordered\n    - deeper\n');
   118	    });
   119	    it('should nicely pad headings', function() {
   120	      assert.equal(parseDocument(sample.headingPadding, markdownWriter), 'She wants to lose her virginity to Marxy. \n\n## Routine\n\nShe brushes her teeth at exactly the same time every day. \n');
   121	      assert.equal(parseDocument(sample.headingPaddingPileUp, markdownWriter), '# Big Heading\n\n## Smaller Heading\n\nShe brushes her teeth at exactly the same time every day. \n');
   122	    });
   123	    it('Replace \\u000b with newline', function() {
   124	      assert.equal(parseDocument(sample.unicodeTab, markdownWriter), '\nWhen Zelda announces herself...\n');
   125	      assert.equal(parseDocument(sample.unicodeTab2, markdownWriter), 'LITTLE GIRL\nWhat’s wrong with your brother?\n\nMIKE\nWell, he’s an idiot who thinks he’s a genius, which is the worst kind of idiot. And he’s married to this smoking hot alien chick who is way out of his league and obviously cheating on him. And they’ve got this kid I’ve barely met but I’ve heard is just super weird and creepy and shit she’s you, right?\n');
   126	    });
   127	  });
   128	});
```

Tests target compiled dist modules and assert concrete output strings for each feature branch. This makes expected formatting behavior explicit and acts as regression protection.


## 7) End-to-End Control Flow Summary

Path A (local JSON): gconv -> cli.ts option parsing -> writer selection -> read JSON file -> parser.parseDocument -> parseParagraph/parseElement -> writer.finalize -> print text.

Path B (Docs API conversion): gconv URL -> cli.ts docId extraction -> google.getDocument -> authenticate/token handling -> docs.documents.get -> cli.output -> parser + writer pipeline -> print text.

Path C (Google markdown export): gconv -f google-markdown URL -> cli.ts export branch -> google.exportDocument -> authenticate/token handling -> drive.files.export(text/markdown) -> print exported markdown directly (parser bypassed).

Design-wise, the key separation is: CLI chooses the path, google.ts acquires remote data, parser.ts transforms Google JSON structure, and writers.ts defines output dialect syntax.
