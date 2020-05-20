const writers = require('./writers');
const parser = require('./parser');

exports = {
  parseDocument: parser.parseDocument,
  writers: writers,
};
