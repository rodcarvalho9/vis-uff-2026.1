import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  publicDir: path.resolve(__dirname, '../data'), // Serve the parent folder as public assets
});