const {program} = require('commander');
const fs = require('fs');
const pjson = require('./package.json');
const util = require('./utilities');

program.version(pjson.version);

program
    .option('-f, --format <format>',
        'Format for conversion: markdown, loose-markdown, fountain, org.',
        'loose-markdown')
    .option('-j, --json <jsonFile>', 'Pass Google Docs JSON as file');

program.parse(process.argv);

interface Writer {
  bold(content: any): string;
  italicize(text: string): string;
  underline(text: string): string;
  strikethrough(text: string): string;
  addHeading(text: string, level: number): string;
  finalize(lines: string[]): string;
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
  /**
   * Add ATX-style header to text
   * Don't add header if one already exists
   * @param {string} text to add header to
   * @param {number} level of ATX-heading to apply
   * @return {string}
   */
  addHeading(text: string, level: number): string {
    if (text.startsWith('#')) {
      return text;
    } else {
      return '#'.repeat(level) + ' ' + text;
    }
  }
  /**
   * Do final pass on array of markdown elements
   * In particular: Properly pad headings
   * @param {string[]} lines
   * @return {string}
   */
  finalize(lines: string[]): string {
    const zero: number = 0;
    const max: number = lines.length - 1;
    for (let i = 0; i < lines.length; i++) {
      let l: string = lines[i];
      if (i == 0 && i+1 <= max) {
        const next: string = lines[i+1];
        if (l.startsWith('#') && !next.startsWith('\n')) {
          l += '\n';
          lines[i] = l;
        }
      } else if (i > zero && i < max) {
        const prev: string = lines[i-1];
        const next: string = lines[i+1];
        if (l.startsWith('#')) {
          if (!prev.startsWith('\n') && !prev.endsWith('\n\n')) {
            l = '\n' + l;
            lines[i] = l;
          }
          if (!next.startsWith('\n')) {
            l += '\n';
            lines[i] = l;
          }
        }
      } else if (i > zero && i == max) { // Handle header on last line
        const prev: string = lines[i-1];
        if (l.startsWith('#') && (!prev.endsWith('\n\n') || prev == '\n')) {
          lines[i] = '\n' + l;
        }
      }
    }
    const joinedText = lines.join('');
    const cleanedText = joinedText.replace('\u000b', '\n');
    return cleanedText;
  }
}
exports.MarkdownWriter = MarkdownWriter;

/**
 * Class to convert markdown without html tags
 */
class LooseMarkdownWriter extends MarkdownWriter {
  /**
   * strikethrough -- Overwriting inherited method
   * @param {string} text Text to process
   * @return {string}
   */
  strikethrough(text: string):string {
    return text;
  }
  /**
   * underline -- Overwriting inherited method
   * @param {string} text Text to star
   * @return {string}
   */
  underline(text: string): string {
    return '*' + text + '*';
  }
}

const inputtedFormat: string = program.format;
let writer: Writer;
switch (inputtedFormat.toLowerCase()) {
  case 'markdown':
    writer = new MarkdownWriter();
    break;
  case 'loose-markdown':
    writer = new LooseMarkdownWriter();
    break;
  default:
    writer = new LooseMarkdownWriter();
}

if (program.json) {
  const rawData = fs.readFileSync(program.json);
  const json = JSON.parse(rawData);
  console.log(parseDocument(json, writer));
}

/**
 * Function to parse Google Docs API Document
 * @param {object} document JSON object representing document
 * @param {Writer} writer Converter to appropriate text format
 * @return {string}
 */
function parseDocument(
    document: object,
    writer: Writer = new MarkdownWriter(),
): string {
  const body: object = document['body'];
  const content: object[] = body['content'];
  const paragraphs: object[] = content
      .filter((o) => o.hasOwnProperty('paragraph'))
      .map((o) => o['paragraph']);

  const parsed: string[] = paragraphs.map((p) => parseParagraph(p, writer));
  const convertedFinal: string = writer.finalize(parsed);
  return convertedFinal;
}

exports.parseDocument = parseDocument;

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
  let content = elements.reduce(elementsReducer, '');

  // Handle Headers
  const paragraphStyle = paragraph['paragraphStyle'];
  const namedStyle: string = paragraphStyle['namedStyleType'];

  if (namedStyle.startsWith('HEADING')) {
    const levelString: string = namedStyle.substring(namedStyle.length - 1);
    const level: number = parseInt(levelString);
    content = writer.addHeading(content, level);
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

