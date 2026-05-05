import path from 'path';
import { KaramonApp } from './KaramonApp';

const distDir = __dirname;
const assetsDir = path.join(distDir, '..', 'assets');

new KaramonApp(distDir, assetsDir).start();
