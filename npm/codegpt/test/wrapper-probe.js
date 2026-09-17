"use strict";
process.env.CODEGPT_TEST_EXIT = "23";
const { runNative } = require("../bin/wrapper");
runNative({ target: process.argv[2], argv: process.argv.slice(3) });
