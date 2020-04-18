const {program} = require('commander');
const pjson = require('./package.json');
const util = require('./utilities');

program.version(pjson.version);
program.parse(process.argv);

interface Writer {
  bold(content: any): string;
  italicize(text: string): string;
  underline(text: string): string;
  strikethrough(text: string): string;
}

/** Class implementing markdown Writer */
class MarkdownWriter implements Writer {
  /**
   * Wrap italic text with asterisk
   * @param {string} text
   * @return {string}
   */
  italicize(text: string): string {
    return '*' + text + '*';
  }
  /**
   * Wrap bold text with 2 asterisks
   * @param {string} text
   * @return {string}
   */
  bold(text: string): string {
    return '**' + text + '**';
  }
  /**
   * Wrap underline text with <u> tags
   * @param {string} text
   * @return {string}
   */
  underline(text: string): string {
    return '<u>' + text + '</u>';
  }
  /**
   * Wrap strikethrough text with <s> tags
   * @param {string} text
   * @return {string}
   */
  strikethrough(text: string): string {
    return '<s>' + text + '</s>';
  }
}
exports.MarkdownWriter = MarkdownWriter;

/** Function to parse paragraph element and convert to Markdown
 * @param  {object} paragraph From 'paragraph' field
 * @param  {Writer} writer class to handle conversions, default is markdown
 * @return {string} Markdown as string
 */
function parseParagraph(
    paragraph: object,
    writer: Writer = new MarkdownWriter(),
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
  const content = elements.reduce(elementsReducer, '');
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

