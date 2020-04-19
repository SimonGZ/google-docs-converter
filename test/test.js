/* eslint-disable max-len */

const assert = require('assert');
const sample = require('./sample-data.js');

const {parseParagraph, parseDocument, MarkdownWriter} = require('../index.js');
const markdownWriter = new MarkdownWriter();

describe('#parseParagraph', function() {
  it('should return plain text from object', function() {
    assert.equal(parseParagraph(sample.normalText), 'So a bit about us, we like happy endings. We like stories that remind us there’s still something good in the world. And I feel like that’s what people are desperate for right now. \n');
  });

  describe('with markdown writer', function() {
    describe('text styling', function() {
      it('should return markdown italics', function() {
        assert.equal(parseParagraph(sample.italicText, markdownWriter), 'So let’s talk about that young woman. *When We Were Vikings* is unique\n');
      });
      it('should return markdown bold', function() {
        assert.equal(parseParagraph(sample.boldText, markdownWriter), 'So let’s talk about that young woman. **When We Were Vikings** is unique\n');
      });
      it('should return markdown underline', function() {
        assert.equal(parseParagraph(sample.underlineText, markdownWriter), 'So let’s talk about that young woman. <u>When We Were Vikings</u> is unique\n');
      });
      it('should return markdown strikethrough', function() {
        assert.equal(parseParagraph(sample.strikethroughText, markdownWriter), 'So let’s talk about that young woman. <s>When We Were Vikings</s> is unique\n');
      });
    });
    describe('headings', function() {
      it('should convert headings', function() {
        assert.equal(parseParagraph(sample.heading1, markdownWriter), '# The Story\n');
        assert.equal(parseParagraph(sample.heading2, markdownWriter), '## The Story\n');
        assert.equal(parseParagraph(sample.heading3, markdownWriter), '### The Story\n');
        assert.equal(parseParagraph(sample.heading4, markdownWriter), '#### The Story\n');
        assert.equal(parseParagraph(sample.heading5, markdownWriter), '##### The Story\n');
        assert.equal(parseParagraph(sample.heading6, markdownWriter), '###### The Story\n');
      });
    });
  });
});

describe('#parseDcoument', function() {
  describe('with markdown writer', function() {
    it('should nicely pad headings', function() {
      assert.equal(parseDocument(sample.headingPadding, markdownWriter), 'She wants to lose her virginity to Marxy. \n\n## Routine\n\nShe brushes her teeth at exactly the same time every day. \n');
      assert.equal(parseDocument(sample.headingPaddingPileUp, markdownWriter), '# Big Heading\n\n## Smaller Heading\n\nShe brushes her teeth at exactly the same time every day. \n');
    });
  });
});
