const {program} = require('commander');
const pjson = require('./package.json');
program.version(pjson.version);

program.parse(process.argv);

/** Function to parse paragraph element and convert to Markdown
 * @param  {object} jsonElement From "paragraph" field
 * @return {string} Markdown as string
 */
function parseParagraph(jsonElement: object): string {
  return '## Heading';
}
