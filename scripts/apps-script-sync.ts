import ts from "typescript";

/** Apps Script services and the bundled economy handlers are synchronous. Compile only
 * this deployment target without Promise scheduling; reject unexpected async dependencies.
 * Browser/Node builds retain their original async implementations and re-entry guards. */
export function compileAppsScriptSync(source: string, fileName: string): string {
  const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
    const f = context.factory;
    const call = (name: string, args: readonly ts.Expression[]) => f.createCallExpression(f.createIdentifier(name), undefined, args);
    const visit: ts.Visitor = (node) => {
      if (ts.isMethodDeclaration(node) && node.name.getText() === "advancePhase" && node.body) {
        const statements = node.body.statements;
        if (!statements[0]?.getText().includes("this.advancingPromise") ||
            !statements.at(-2)?.getText().includes("run().catch")) {
          throw new Error("Review Apps Script advancePhase adapter after GameSession changes");
        }
        // ScriptLock serializes requests. Remove only the Promise re-entry guard;
        // the shared run() body still performs all phase bookkeeping and persistence.
        const body = f.updateBlock(node.body, [...statements.slice(1, -2),
          f.createReturnStatement(f.createCallExpression(f.createIdentifier("run"), undefined, []))]);
        return ts.visitEachChild(f.updateMethodDeclaration(node, node.modifiers, node.asteriskToken,
          node.name, node.questionToken, node.typeParameters, node.parameters, node.type, body), visit, context);
      }
      if (node.kind === ts.SyntaxKind.AsyncKeyword) return undefined;
      if (ts.isAwaitExpression(node)) return call("__gasSync", [ts.visitNode(node.expression, visit) as ts.Expression]);
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        const receiver = node.expression.expression;
        const name = node.expression.name.text;
        const args = node.arguments.map((arg) => ts.visitNode(arg, visit) as ts.Expression);
        if (ts.isIdentifier(receiver) && receiver.text === "Promise") {
          if (name === "resolve") return call("__gasSync", args.length ? args : [f.createIdentifier("undefined")]);
          if (name === "reject") return call("__gasThrow", args);
        }
      }
      return ts.visitEachChild(node, visit, context);
    };
    return (root) => ts.visitNode(root, visit) as ts.SourceFile;
  };
  const helpers = `
function __gasSync(value) { if (value && typeof value.then === 'function') throw new Error('Unexpected asynchronous dependency in Apps Script'); return value; }
function __gasThrow(error) { throw error; }
`;
  return helpers + ts.transpileModule(source, {
    fileName,
    compilerOptions: { target: ts.ScriptTarget.ES2019, module: ts.ModuleKind.ESNext },
    transformers: { before: [transformer] },
  }).outputText;
}
