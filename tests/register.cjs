// Use the installed TypeScript compiler to run pure TS helpers under node:test.
const fs = require("node:fs");
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => {
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  });
  module._compile(outputText, filename);
};

// Resolve the same project alias used by Next.js without replacing dependency mocks.
const Module = require("node:module");
const path = require("node:path");
const resolve = Module._resolveFilename;
Module._resolveFilename = function(id, ...args) {
  return resolve.call(this, id.startsWith("@/") ? path.join(__dirname, "..", id.slice(2)) : id, ...args);
};
