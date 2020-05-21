/**
 * Writer Class
 * Describes the functions that must be implemented to convert
 * Google Docs Document into plain text format.
 */
export interface Writer {
  bold(content: any): string;
  italicize(text: string): string;
  underline(text: string): string;
  strikethrough(text: string): string;
  addHeading(text: string, level: number): string;
  addLink(text: string, url: string): string;
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
   * Add link formatting to text
   * @param {string} text to wrap in link
   * @param {string} url to link to
   * @return {string}
   */
  addLink(text: string, url: string): string {
    return `[${text}](${url})`;
  }
  /**
   * Do final pass on array of markdown elements
   *  - Properly pad headings
   *  - Join array of strings into output string
   * @param {string[]} lines Array of converted strings
   * @return {string} Final output string
   */
  finalize(lines: string[]): string {
    const max: number = lines.length - 1;
    for (let i = 0; i < lines.length; i++) {
      let l: string = lines[i];
      if (i == 0 && i+1 <= max) {
        const next: string = lines[i+1];
        if (l.startsWith('#') && !next.startsWith('\n')) {
          l += '\n';
          lines[i] = l;
        }
      } else if (i > 0 && i < max) {
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
      } else if (i > 0 && i == max) { // Handle header on last line
        const prev: string = lines[i-1];
        if (l.startsWith('#') && (!prev.endsWith('\n\n') || prev == '\n')) {
          lines[i] = '\n' + l;
        }
      }
    }
    const joinedText = lines.join('');
    const cleanedText = joinedText.replace(/\u000b/g, '\n');
    return cleanedText;
  }
}
exports.MarkdownWriter = MarkdownWriter;

/**
 * Class to convert Github-Flavored Markdown
 * For now, this just means using their strikethroughs.
 */
class GithubMarkdownWriter extends MarkdownWriter {
  /**
   * strikethrough -- Overwriting inherited method
   * @param {string} text Text to process
   * @return {string}
   */
  strikethrough(text: string):string {
    return '~~' + text + '~~';
  }
}

exports.GithubMarkdownWriter = GithubMarkdownWriter;

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
exports.LooseMarkdownWriter = LooseMarkdownWriter;

/** Class implementing Org Mode Writer */
class OrgModeWriter implements Writer {
  /**
   * Wrap italic text with slashes
   * @param {string} text
   * @return {string}
   */
  italicize(text: string): string {
    return '/' + text + '/';
  }
  /**
   * Wrap bold text with asterisks
   * @param {string} text
   * @return {string}
   */
  bold(text: string): string {
    return '*' + text + '*';
  }
  /**
   * Wrap underline text with underscores
   * @param {string} text
   * @return {string}
   */
  underline(text: string): string {
    return '_' + text + '_';
  }
  /**
   * Wrap strikethrough text with pluses
   * @param {string} text
   * @return {string}
   */
  strikethrough(text: string): string {
    return '+' + text + '+';
  }
  /**
   * Add org-mode header to text
   * Don't add header if one already exists
   * @param {string} text to add header to
   * @param {number} level of ATX-heading to apply
   * @return {string}
   */
  addHeading(text: string, level: number): string {
    if (text.startsWith('*')) {
      return text;
    } else {
      return '*'.repeat(level) + ' ' + text;
    }
  }
  /**
   * Add link formatting to text
   * @param {string} text to wrap in link
   * @param {string} url to link to
   * @return {string}
   */
  addLink(text: string, url: string): string {
    return `[[${url}][${text}]]`;
  }
  /**
   * Do final pass on array of elements
   *  - Properly pad headings
   *  - Join array of strings into output string
   * @param {string[]} lines Array of converted strings
   * @return {string} Final output string
   */
  finalize(lines: string[]): string {
    const max: number = lines.length - 1;
    for (let i = 0; i < lines.length; i++) {
      let l: string = lines[i];
      if (i == 0 && i+1 <= max) {
        const next: string = lines[i+1];
        if (l.startsWith('*') && !next.startsWith('\n')) {
          l += '\n';
          lines[i] = l;
        }
      } else if (i > 0 && i < max) {
        const prev: string = lines[i-1];
        const next: string = lines[i+1];
        if (l.startsWith('*')) {
          if (!prev.startsWith('\n') && !prev.endsWith('\n\n')) {
            l = '\n' + l;
            lines[i] = l;
          }
          if (!next.startsWith('\n')) {
            l += '\n';
            lines[i] = l;
          }
        }
      } else if (i > 0 && i == max) { // Handle header on last line
        const prev: string = lines[i-1];
        if (l.startsWith('*') && (!prev.endsWith('\n\n') || prev == '\n')) {
          lines[i] = '\n' + l;
        }
      }
    }
    const joinedText = lines.join('');
    const cleanedText = joinedText.replace(/\u000b/g, '\n');
    return cleanedText;
  }
}

exports.OrgModeWriter = OrgModeWriter;
