/**
 * `with { type: 'text' }` imports resolve at bundle time (Bun) but have no type
 * on their own. Markdown is never a TypeScript module, so declare the wildcard.
 */
declare module '*.md' {
  const content: string
  export default content
}
