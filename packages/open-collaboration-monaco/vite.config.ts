import { defineConfig } from 'vite';
import * as path from 'path';

export default defineConfig(() => {
    const config = {
        build: {
            target: 'esnext',
            rollupOptions: {
                input: {
                    index: path.resolve(__dirname, 'index.html'),
                }
            },
            commonjsOptions: {
                include: [/open-collaboration-protocol/, /open-collaboration-yjs/],
            }
        },
        optimizeDeps: {
            include: ['open-collaboration-protocol', 'open-collaboration-yjs'],
        }
    };
    return config;
});
