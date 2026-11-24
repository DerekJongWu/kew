// Markdown templates are bundled as text (Vite / electron-vite and Vitest support `?raw`).
declare module '*.md?raw' {
  const text: string
  export default text
}
