import path from 'path';
import { KaramonApp } from './KaramonApp';
import { Screenshots } from './features/screenshots/Screenshots';

const distDir = __dirname;
const assetsDir = path.join(distDir, '..', 'assets');

Screenshots.registerPrivileged();
new KaramonApp(distDir, assetsDir).start();
