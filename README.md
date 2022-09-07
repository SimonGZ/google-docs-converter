# Google Docs Converter
> Command Line app to convert Google Docs documents into Markdown or Org plain text formats.

Google Docs Converter (gconv) is a command line utility that takes a Google Docs URL and converts the document into either [Markdown][] or [Org Mode][] formats. It's written in Typescript for Node.js and requires a credentials.json file from your Google Developer account.

![](screenshot.png)

## Installation

### OS X & Linux

```sh
npm install -g google-docs-converter
```

You'll also need to place a `credentials.json` file from your Google Developer Account in the folder `~/.config/google-docs-converter/`.

You can generate the correct credentials using the [Google Cloud Console][]. Create a project, enable the Google Docs API (readonly is fine), and create OAUTH credentials for a **Web application** with the authorized URI redirect `http://localhost:3000`. You may also want to put the project into "Testing" mode and authorize your own email address to cut down on warnings from Google about using an unverified project. Then download those credentials, rename the file to `credentials.json` and move it to `~/.config/google-docs-converter/`.

After you have the credentials, when you try to use the CLI for the first time, a web browser window will open and ask you to authorize read-only access to your Google Docs. 

### Windows

` ¯\_(ツ)_/¯ `

## Usage

This app was created because I often work in Google Docs with a partner, but when I'm writing alone, I prefer to write in plain text markup formats like Markdown and Org Mode. This utility makes it easy for me to quickly convert a Google Doc into one of those formats and start editing.

```
Usage: gconv [options] <Google Docs URL>

Options:
  -V, --version          output the version number
  -f, --format <format>  Format for conversion: markdown, loose-markdown, org, fountain
                         (default: "loose-markdown")
  -j, --json <jsonFile>  Pass Google Docs JSON as file
  -h, --help             display help for command
```

Google Docs Converter will output the conversion into the console, where you can then pipe it into another utility or redirect it into a file.

Example:
```
gconv -f org http://docs.google.com/blahblah > my-file.org
```

NOTE: Google Docs URLs can sometimes include ampersands, question marks, and other characters that may trigger unwanted behavior in your terminal. You may want to surround the URL with quote marks `''` to protect against this. 

For debugging purposes, you can use the -j flag to pass a local JSON file representing the Google Docs file you wish to convert. The [Google Docs JSON format is documented here][Google Docs JSON].

## Features

### Markdown

Google Docs Converter supports a subset of Markdown reflecting the basic elements of a document: headers, lists, links, and styled text (bold, italic, etc.). 

There are three Markdown flavors currently offered: 

- Regular Markdown (`markdown`) tries to follow the [original John Gruber Markdown spec][Markdown]. It will attempt to use HTML tags to reflect things like strikethroughs and underlines in a Google Doc.
- Github Flavored Markdown (`gfm`) is identical to Regular Markdown except it supports Github's strikethrough markup (`~~struck text~~`).
- Loose Markdown (`loose-markdown`) is less faithful to the original Google Doc, ignoring strikethroughs and converting underlines into italics. It's the default because this is usually what I want.
- Fountain (`fountain`) ignores bold, italic, and underline, bringing in only headings and links. It's useful if you'd rather write out markdown styles in Google Docs rather than use rich text.

### Org Mode

Google Docs Converter currently supports the following Org Mode elements: headings, lists, links, bold text, italic text, underline text, and strikethrough text.

## Not Currently Supported

- Images
- Tables
- Centered text
- Horizontal Rules (e.g. `<hr>`)
- Complex, overlapping styled text (bold text inside italic, etc)

## Release History

- Version 2.0.0: Updating dependencies and Google Auth code to current best practices.
- Version 1.2.2: Updating dependencies to include bugfixes.
- Version 1.2.1: Fixed bug where documents with images or footnotes wouldn't parse. Images and footnotes are not currently supported and are now just skipped.
- Version 1.2.0: Adding Fountain output option which doesn't translate bold, italic, and underline rich text.
- Version 1.1.5: Exporting Parser and Markdown so they can be imported into other Node projects. Fixing bugs introduced by that change.
- Version 1.0.2: Fixing bug with command line argument parser.
- Version 1.0.0: Initial release.

## Dependencies

This app uses the [Google Docs API v1][Docs API].

It depends on the [googleapis][] package to handle authorization and the [commander][] package to interpret command line arguments.

It was written in [Typescript][] with [ESLint][] and uses [Mocha][] for tests.

<!-- Markdown Reference Links -->
[Markdown]: https://daringfireball.net/projects/markdown/syntax
[Org Mode]: https://orgmode.org
[quickstart]: https://developers.google.com/docs/api/quickstart/nodejs
[Docs API]: https://developers.google.com/docs/api
[Google Cloud Console]: https://console.cloud.google.com
[Google Docs JSON]: https://developers.google.com/docs/api/reference/rest/v1/documents
[commander]: https://www.npmjs.com/package/commander
[googleapis]: https://www.npmjs.com/package/googleapis
[Typescript]: https://www.typescriptlang.org
[ESLint]: https://eslint.org
[Mocha]: https://mochajs.org
[StackOverflow]: https://stackoverflow.com/questions/71779189/google-sheets-api-localhost-refused-to-connect-when-authorizing
