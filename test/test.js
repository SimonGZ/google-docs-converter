/* eslint-disable max-len */

process.env.NODE_ENV = 'test';

const assert = require('assert');
const sample = require('./test-data.js');
const listSample = require('./list-sample.json');

const {parseParagraph, parseDocument} = require('../dist/parser.js');
const writers = require('../dist/writers.js');
const markdownWriter = new writers.MarkdownWriter();
const githubWriter = new writers.GithubMarkdownWriter();
const orgmodeWriter = new writers.OrgModeWriter();
const lists = sample.lists;

describe('#parseParagraph', function() {
  it('should return plain text from object', function() {
    assert.equal(parseParagraph(sample.normalText), 'So a bit about us, we like happy endings. We like stories that remind us there’s still something good in the world. And I feel like that’s what people are desperate for right now. \n');
  });

  describe('with markdown writer', function() {
    describe('text styling', function() {
      it('should returnf markdown italics', function() {
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
      it('should honor existing hashmarks', function() {
        assert.equal(parseParagraph(sample.headingHashed, markdownWriter), '## Robbery Aftermath\n');
      });
    });
    describe('lists', function() {
      it('should handle an unordered list', function() {
        assert.equal(parseParagraph(sample.unordered, markdownWriter, lists), '- Unordered\n');
      });
      it('should handle an ordered list', function() {
        assert.equal(parseParagraph(sample.ordered, markdownWriter, lists, {}), '1. Numbered\n');
        assert.equal(parseParagraph(sample.ordered, markdownWriter, lists, {'kix.hqmt8p2434fi': {'0': 1}}), '2. Numbered\n');
      });
      it('should handle a nested unordered element', function() {
        assert.equal(parseParagraph(sample.unorderedNested, markdownWriter, lists, {}), '    - Unordered\n');
      });
    });
    describe('links', function() {
      it('should handle an external link', function() {
        assert.equal(parseParagraph(sample.externalLink, markdownWriter, lists, {}), '[Add a link](http://simonganz.com) to an external site\n');
      });
    });
  });
  describe('github writer', function() {
    describe('text styling', function() {
      it('should use github strikethroughs', function() {
        assert.equal(parseParagraph(sample.strikethroughText, githubWriter, lists, {}), 'So let’s talk about that young woman. ~~When We Were Vikings~~ is unique\n');
      });
    });
  });
  describe('orgmode writer', function() {
    describe('text styling', function() {
      it('should return markdown italics', function() {
        assert.equal(parseParagraph(sample.italicText, orgmodeWriter), 'So let’s talk about that young woman. /When We Were Vikings/ is unique\n');
      });
      it('should return markdown bold', function() {
        assert.equal(parseParagraph(sample.boldText, orgmodeWriter), 'So let’s talk about that young woman. *When We Were Vikings* is unique\n');
      });
      it('should return markdown underline', function() {
        assert.equal(parseParagraph(sample.underlineText, orgmodeWriter), 'So let’s talk about that young woman. _When We Were Vikings_ is unique\n');
      });
      it('should return markdown strikethrough', function() {
        assert.equal(parseParagraph(sample.strikethroughText, orgmodeWriter), 'So let’s talk about that young woman. +When We Were Vikings+ is unique\n');
      });
    });
    describe('headings', function() {
      it('should convert headings', function() {
        assert.equal(parseParagraph(sample.heading1, orgmodeWriter), '* The Story\n');
        assert.equal(parseParagraph(sample.heading2, orgmodeWriter), '** The Story\n');
        assert.equal(parseParagraph(sample.heading3, orgmodeWriter), '*** The Story\n');
        assert.equal(parseParagraph(sample.heading4, orgmodeWriter), '**** The Story\n');
        assert.equal(parseParagraph(sample.heading5, orgmodeWriter), '***** The Story\n');
        assert.equal(parseParagraph(sample.heading6, orgmodeWriter), '****** The Story\n');
      });
      it('should honor existing hashmarks', function() {
        assert.equal(parseParagraph(sample.headingOrgHashed, orgmodeWriter), '** Robbery Aftermath\n');
      });
    });
    describe('links', function() {
      it('should handle an external link', function() {
        assert.equal(parseParagraph(sample.externalLink, orgmodeWriter, lists, {}), '[[http://simonganz.com][Add a link]] to an external site\n');
      });
    });
  });
});

describe('#parseDocument', function() {
  describe('with markdown writer', function() {
    it('should handle a complex mix of ordered and unordered lists', function() {
      assert.equal(parseDocument(listSample, markdownWriter),
          '1. I am a numbered list.\n    1. Nested.\n        1. Deeply.\n' +
      '            - Strangely\n            - Switching\n2. Back to basics\n' +
      '\n- Unordered\n    - deeper\n');
    });
    it('should nicely pad headings', function() {
      assert.equal(parseDocument(sample.headingPadding, markdownWriter), 'She wants to lose her virginity to Marxy. \n\n## Routine\n\nShe brushes her teeth at exactly the same time every day. \n');
      assert.equal(parseDocument(sample.headingPaddingPileUp, markdownWriter), '# Big Heading\n\n## Smaller Heading\n\nShe brushes her teeth at exactly the same time every day. \n');
    });
    it('Replace \\u000b with newline', function() {
      assert.equal(parseDocument(sample.unicodeTab, markdownWriter), '\nWhen Zelda announces herself...\n');
    });
  });
});
