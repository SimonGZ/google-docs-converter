/* eslint-disable max-len */

const assert = require('assert');
const sample = require('./sample-data.js');

const {parseParagraph} = require('../index.js');

describe('#parseParagraph', function() {
  it('should return plain text from object', function() {
    assert.equal(parseParagraph(sample.normalText), 'So a bit about us, we like happy endings. We like stories that remind us there’s still something good in the world. And I feel like that’s what people are desperate for right now. \n');
  });
});
