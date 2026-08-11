/**
 * Pull a single named component out of a mock file (the journey/restaurant `.jsx` bundles are big
 * IIFEs full of unrelated components + `window.*` globals), and hand back just that component's
 * source so the transpiler works on one screen at a time.
 */
import { Babel } from "./babel-load.mjs";

const parser = Babel.packages.parser;
const generator = Babel.packages.generator.default || Babel.packages.generator;
const traverse = Babel.packages.traverse.default || Babel.packages.traverse;

/** Parse a source string to a File AST (JSX enabled). */
export function parse(src) {
  return parser.parse(src, { sourceType: "module", plugins: ["jsx"] });
}

/** Generate code from an AST node deterministically (no retained line noise). */
export function generate(node) {
  return (generator(node, { compact: false, jsescOption: { minimal: true } }).code);
}

/**
 * Return the source of the component named `name` in `fileSrc`, as a standalone
 * `function name(...) {...}` (arrow consts are rewritten to a function declaration so the transpiler
 * and binder see one canonical shape).
 */
export function extractComponent(fileSrc, name) {
  const ast = parse(fileSrc);
  let found = null;
  traverse(ast, {
    FunctionDeclaration(path) {
      if (path.node.id && path.node.id.name === name) found = path.node;
    },
    VariableDeclarator(path) {
      if (path.node.id.type === "Identifier" && path.node.id.name === name) {
        const init = path.node.init;
        if (init && (init.type === "ArrowFunctionExpression" || init.type === "FunctionExpression")) {
          // normalise to a function declaration
          const body = init.body.type === "BlockStatement" ? init.body : { type: "BlockStatement", body: [{ type: "ReturnStatement", argument: init.body }], directives: [] };
          found = { type: "FunctionDeclaration", id: { type: "Identifier", name }, params: init.params, body, async: false, generator: false };
        }
      }
    },
  });
  if (!found) throw new Error(`component ${name} not found`);
  return generate(found);
}

export { traverse };
