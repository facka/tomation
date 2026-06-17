const ts = require('typescript')

/**
 * Strip TypeScript type annotations from source, producing plain JavaScript.
 * Uses ts.transpileModule with isolatedModules for fast per-file stripping.
 *
 * @param {string} source - The TypeScript source code
 * @param {string} filePath - The file path (used to determine JSX handling for .tsx)
 * @returns {{ code: string } | { error: { message: string, line: number } }}
 */
function stripTypes(source, filePath) {
  try {
    const result = ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.ESNext,
        jsx: filePath.endsWith('.tsx') ? ts.JsxEmit.Preserve : undefined,
        removeComments: false,
        isolatedModules: true,
      },
      fileName: filePath,
    })

    // Check for diagnostics (transpilation errors)
    if (result.diagnostics && result.diagnostics.length > 0) {
      const diag = result.diagnostics[0]
      const line = diag.file
        ? ts.getLineAndCharacterOfPosition(diag.file, diag.start).line + 1
        : 1
      const message = ts.flattenDiagnosticMessageText(diag.messageText, '\n')
      return { error: { message, line } }
    }

    return { code: result.outputText }
  } catch (err) {
    return { error: { message: err.message, line: 1 } }
  }
}

module.exports = { stripTypes }
