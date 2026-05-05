import type { LauncherApi } from '../../ipc/contract';
import { $ } from '../util/dom';

export class WindowControls {
  static attach(api: LauncherApi): void {
    $('btn-minimize').addEventListener('click', () => api.minimize());
    $('btn-maximize').addEventListener('click', () => api.maximize());
    $('btn-close').addEventListener('click', () => api.close());
    $('drag-region').addEventListener('dblclick', () => api.maximize());
  }
}
