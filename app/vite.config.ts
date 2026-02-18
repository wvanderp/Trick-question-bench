import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const repository = process.env.GITHUB_REPOSITORY;
const repositoryName = repository ? repository.split('/')[1] : '';
const base = repositoryName ? `/${repositoryName}/` : '/';

export default defineConfig({
  plugins: [react()],
  base,
});
