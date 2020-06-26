const util = require('./utilities');
const writers = require('./writers');
import {Writer} from './writers';

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
    // Put newline at end of line, rather than within style text
    content = content.replace('\n', '') + '\n';
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
  // Currently, parseElement only supports the textRun form of a 
  // ParagraphElement 
  // SEE: https://developers.google.com/docs/api/reference/rest/v1/documents#ParagraphElement
  if (!element.hasOwnProperty('textRun')) { // means NOT regular paragraph
    return ""
  }
  let content = element['textRun']['content'];
  const textStyle = element['textRun']['textStyle'];
  if (util.isEmpty(textStyle)) {
    return content;
  }

  /* Note, the order of these conditionals matters.
   * HTML tags on outside of markdown. */
  if (textStyle.underline && !textStyle.link) { // Ignore underlining if a link
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
  if (textStyle.link) {
    if (textStyle.link.url) {
      content = writer.addLink(content, textStyle.link.url);
    }
  }
  return content;
}
