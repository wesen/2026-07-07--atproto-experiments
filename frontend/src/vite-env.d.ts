/// <reference types="vite/client" />

// Vite ?raw imports return the file contents as a string.
declare module '*.vm.js?raw' {
  const source: string;
  export default source;
}

declare module '*?raw' {
  const source: string;
  export default source;
}
