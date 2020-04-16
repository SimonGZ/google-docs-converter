const {program} = require('commander');
const pjson = require('./package.json');
program.version(pjson.version);
