const {program} = require('commander');
const fs = require('fs');
const pjson = require('./package.json');
const util = require('./utilities');
const docs = require('./google');
const writers = require('./writers');

program.version(pjson.version);

program
    .usage('[options] <Google Docs URL>')
    .option('-f, --format <format>',
        'Format for conversion: markdown, loose-markdown, fountain, org.',
        'loose-markdown')
    .option('-j, --json <jsonFile>', 'Pass Google Docs JSON as file');

program.parse(process.argv);

/** Create Writer
 * Based on -f flag, create the writer which will be used to
 * convert the JSON. Default is LooseMarkdown.
 *
 * Writer types are defined in writers.ts
 */
const inputtedFormat: string = program.format;
let writer: Writer;
switch (inputtedFormat.toLowerCase()) {
  case 'markdown':
    writer = new writers.MarkdownWriter();
    break;
  case 'loose-markdown':
    writer = new writers.LooseMarkdownWriter();
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
  default:
    writer = new writers.LooseMarkdownWriter();
}

/** If the -j flag is used, don't call the Google Docs API.
 * Just use the local file that was passed and parse as JSON.
 * Mostly for debugging purposes.
 *
 * Otherwise, begin the authorization routine to make a Google Docs request.
*/
if (program.json) {
  const rawData = fs.readFileSync(program.json);
  const json = JSON.parse(rawData);
  console.log(parseDocument(json, writer));
} else {
  /**
   * Check if we're in a test environment. If we are, turn off some
   * checks to allow tests to run.
   */
  if (process.env.NODE_ENV !== 'test') {
    if (process.argv.length < 3) { // Make sure user passed an argument
      console.error('Error: No Google Docs URL passed to program.');
      process.exit(-1);
    }
    const inputtedId: string = process.argv[2];
    const docIdRegex = /\/document\/d\/([a-zA-Z0-9-_]+)/;
    const matches = inputtedId.match(docIdRegex);
    if (matches === null || matches.length < 2) {
      console.error(`Error: Couldn't find docId in ${inputtedId}`);
      process.exit(-1);
    }
    const docId = matches[1];
    docs.getDocument(docId);
  }
}

/**
 * Callback function to output results of API call
 * @param {object} document JSON object representing document
 */
function output(document: object) {
  console.log(parseDocument(document, writer));
}

exports.output = output;

/**
 * Function to parse Google Docs API Document
 * @param {object} document JSON object representing document
 * @param {Writer} writer Converter to appropriate text format
 * @return {string}
 */
function parseDocument(
    document: object,
    writer: Writer = new writers.MarkdownWriter(),
): string {
  const body: object = document['body'];
  const content: object[] = body['content'];
  const lists: object = document['lists'];
  const listTracker: object = {};
  // fs.writeFileSync('test/list-sample.json', JSON.stringify(document));
  const paragraphs: object[] = content
      .filter((o) => o.hasOwnProperty('paragraph'))
      .map((o) => o['paragraph']);

  const parsed: string[] =
    paragraphs.map((p) => parseParagraph(p, writer, lists, listTracker));
  const convertedFinal: string = writer.finalize(parsed);
  return convertedFinal;
}

exports.parseDocument = parseDocument;

/** Function to parse paragraph element and convert to Markdown
 * @param  {object} paragraph From 'paragraph' field
 * @param  {Writer} writer class to handle conversions, default is markdown
 * @param  {object} lists object to provide id's and details for lists
 * @param  {object} listTracker object to track place in a list
 * @return {string} Markdown as string
 */
function parseParagraph(
    paragraph: object,
    writer: Writer = new writers.MarkdownWriter(),
    lists?: object,
    listTracker?: object,
): string {
  const elements : object[] = paragraph['elements'];
  /** Function to reduce elements/textRuns into single string
   * @param {string} acc
   * @param {object} element
   * @return {string}
  */
  function elementsReducer(acc: string, element: object): string {
    return acc + parseElement(element, writer);
  }
  let content = elements.reduce(elementsReducer, '');

  // Handle Headers
  const paragraphStyle = paragraph['paragraphStyle'];
  const namedStyle: string = paragraphStyle['namedStyleType'];

  if (namedStyle.startsWith('HEADING')) {
    const levelString: string = namedStyle.substring(namedStyle.length - 1);
    const level: number = parseInt(levelString);
    content = writer.addHeading(content, level);
  }

  // Handle Lists
  if (paragraph.hasOwnProperty('bullet')) { // Means it's a list-item
    const bullet = paragraph['bullet'];
    const listId = bullet['listId'];
    const nestingLevel =
      bullet['nestingLevel'] === undefined ? 0 : bullet['nestingLevel'];
    const padding = '    '.repeat(nestingLevel);
    const listDetails =
      lists[listId]['listProperties']['nestingLevels'][nestingLevel];
    if (listDetails.hasOwnProperty('glyphType')) { // means ordered list
      if (listTracker.hasOwnProperty(listId) &&
        listTracker[listId].hasOwnProperty(nestingLevel)) {
        listTracker[listId][nestingLevel] += 1;
      } else {
        /** If no listId entry, create one... */
        if (!listTracker.hasOwnProperty(listId)) {
          listTracker[listId] = {};
        }
        listTracker[listId][nestingLevel] = 1;
      }
      content = listTracker[listId][nestingLevel].toString() + '. ' + content;
    } else { // means unordered list
      content = '- ' + content;
    }
    // Apply padding using nestingLevel
    content = padding + content;
  }
  return content;
}

exports.parseParagraph = parseParagraph;

/** Function to parse individual element into appropriate format
 * @param {object} element
 * @param {Writer} writer to use for conversion (markdown, org, etc)
 * @return {string}
 */
function parseElement(element: object, writer: Writer): string {
  let content = element['textRun']['content'];
  const textStyle = element['textRun']['textStyle'];
  if (util.isEmpty(textStyle)) {
    return content;
  }

  /* Note, the order of these conditionals matters.
   * HTML tags on outside of markdown. */
  if (textStyle.underline) {
    content = writer.underline(content);
  }
  if (textStyle.strikethrough) {
    content = writer.strikethrough(content);
  }
  if (textStyle.italic) {
    content = writer.italicize(content);
  }
  if (textStyle.bold) {
    content = writer.bold(content);
  }
  return content;
}
