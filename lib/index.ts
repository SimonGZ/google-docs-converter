const writers = require('./writers');
import {Writer} from './writers';
const parser = require('./parser');

exports = {
    parseDocument: parser.parseDocument,
    writers: writers
}
