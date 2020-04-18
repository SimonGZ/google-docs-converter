/* eslint-disable max-len */

const assert = require('assert');
const sample = require('./sample-data.js');

const {parseParagraph, MarkdownWriter} = require('../index.js');
const markdownWriter = new MarkdownWriter();

describe('#parseParagraph', function() {
  it('should return plain text from object', function() {
    assert.equal(parseParagraph(sample.normalText), 'So a bit about us, we like happy endings. We like stories that remind us there’s still something good in the world. And I feel like that’s what people are desperate for right now. \n');
  });

  describe('with markdown writer', function() {
    it('should return markdown italics', function() {
      assert.equal(parseParagraph(sample.italicText, markdownWriter), 'So let’s talk about that young woman. *When We Were Vikings* is unique\n');
    });
    it('should return markdown bold', function() {
      assert.equal(parseParagraph(sample.boldText, markdownWriter), 'So let’s talk about that young woman. **When We Were Vikings** is unique\n');
    });
  });
});
