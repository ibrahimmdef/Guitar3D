import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { Store } from './store.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const store = new Store(process.env.DATA_DIR ?? path.join(root, 'data'));
const port = Number(process.env.PORT ?? 3001);

createApp(store).listen(port, () => {
  console.log(`Guitar3d API http://localhost:${port}`);
});
