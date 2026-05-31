declare module "vite-plugin-importmap";
// src/vite-env.d.ts
/// <reference types="vite/client" />

// Декларация для CSS Modules
declare module "*.module.css" {
  const classes: { readonly [key: string]: string };
  export default classes;
}
