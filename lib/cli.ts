#!/usr/bin/env node

export {};
const {program} = require('commander');
const fs = require('fs');
const pjson = require('../package.json');
const writers = require('./writers');
import {Writer} from './writers';
const parser = require('./parser');
const docs = require('./google');

program.version(pjson.version);

program
    .usage('[options] <Google Docs URL>')
    .option('-f, --format <format>',
        'Format for conversion: markdown, gfm, loose-markdown, org',
        'loose-markdown')
    .option('-j, --json <jsonFile>', 'Pass Google Docs JSON as file');

program.parse(process.argv);

const options = program.opts();

/** Create Writer
 * Based on -f flag, create the writer which will be used to
 * convert the JSON. Default is LooseMarkdown.
 *
 * Writer types are defined in writers.ts
 */
const inputtedFormat: string = options.format;
let writer: Writer;
switch (inputtedFormat.toLowerCase()) {
  case 'markdown':
    writer = new writers.MarkdownWriter();
    break;
  case 'loose-markdown':
    writer = new writers.LooseMarkdownWriter();
    break;
  case 'gfm':
    writer = new writers.GithubMarkdownWriter();
    break;
  case 'org':
    writer = new writers.OrgModeWriter();
    break;
  case 'org-mode':
    writer = new writers.OrgModeWriter();
    break;
  case 'orgmode':
    writer = new writers.OrgModeWriter();
    break;
  case 'fountain':
    writer = new writers.FountainWriter();
    break;
  default:
    writer = new writers.LooseMarkdownWriter();
}

/** If the -j flag is used, don't call the Google Docs API.
 * Just use the local file that was passed and parse as JSON.
 * Mostly for debugging purposes.
 *
 * Otherwise, begin the authorization routine to make a Google Docs request.
*/
if (options.json) {
  const rawData = fs.readFileSync(options.json);
  const json = JSON.parse(rawData);
  console.log(parser.parseDocument(json, writer));
} else {
  /**
   * Check if we're in a test environment. If we are, turn off some
   * checks to allow tests to run.
   */
  if (process.env.NODE_ENV !== 'test') {
    if (process.argv.length === 2) { // Make sure user passed an argument
      console.error('Error: No Google Docs URL passed to program.');
      program.help({error: true});
    }
    const inputtedId: string = program.args[0];
    const docIdRegex = /\/document\/d\/([a-zA-Z0-9-_]+)/;
    const matches = inputtedId.match(docIdRegex);
    if (matches === null || matches.length < 2) {
      console.error(`Error: Couldn't find docId in ${inputtedId}`);
      program.help({error: true});
    }
    const docId = matches[1];
    docs.getDocument(docId);
  }
}

/**
 * Callback function to output results of API call
 * @param {object} document JSON object representing document
 */
export function output(document: object) {
  console.log(parser.parseDocument(document, writer));
}