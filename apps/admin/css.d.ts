// TS 6 resolves side-effect imports (TS2882), so the `import "./globals.css"` in app/layout.tsx
// needs a module declaration — Next.js compiles the CSS itself; this only satisfies the checker.
declare module "*.css";
