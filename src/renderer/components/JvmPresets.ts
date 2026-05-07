import { $input, $opt } from '../util/dom';

export interface JvmPreset {
  id: string;
  label: string;
  args: string;
}

export const JVM_PRESETS: JvmPreset[] = [
  {
    id: 'custom',
    label: 'Personnalisé',
    args: '',
  },
  {
    id: 'recommended',
    label: 'Recommandé (G1GC)',
    args: '-XX:+UseG1GC -XX:MaxGCPauseMillis=50 -XX:+ParallelRefProcEnabled -XX:+UnlockExperimentalVMOptions',
  },
  {
    id: 'aikar',
    label: "Aikar's Flags (modpacks lourds)",
    args: '-XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200 -XX:+UnlockExperimentalVMOptions -XX:+DisableExplicitGC -XX:+AlwaysPreTouch -XX:G1HeapWastePercent=5 -XX:G1MixedGCCountTarget=4 -XX:G1MixedGCLiveThresholdPercent=90 -XX:G1RSetUpdatingPauseTimePercent=5 -XX:SurvivorRatio=32 -XX:+PerfDisableSharedMem -XX:MaxTenuringThreshold=1',
  },
  {
    id: 'lowmem',
    label: 'Faible mémoire (<8 Go)',
    args: '-XX:+UseSerialGC -XX:TieredStopAtLevel=1',
  },
  {
    id: 'zgc',
    label: 'ZGC (Java 21+, latence ultra-basse)',
    args: '-XX:+UseZGC -XX:+ZGenerational -XX:+UnlockExperimentalVMOptions',
  },
];

export class JvmPresets {
  static attach(): void {
    const select = $opt('cfg-jvm-preset');
    if (!(select instanceof HTMLSelectElement)) return;
    select.innerHTML = '';
    for (const preset of JVM_PRESETS) {
      const opt = document.createElement('option');
      opt.value = preset.id;
      opt.textContent = preset.label;
      select.appendChild(opt);
    }
    select.addEventListener('change', () => {
      const preset = JVM_PRESETS.find((p) => p.id === select.value);
      if (!preset) return;
      const input = $input('cfg-jvm-args');
      if (preset.id === 'custom') {
        input.disabled = false;
        return;
      }
      input.value = preset.args;
      input.disabled = false;
    });
    JvmPresets.syncFromArgs();
    $input('cfg-jvm-args').addEventListener('input', () => JvmPresets.syncFromArgs());
  }

  static syncFromArgs(): void {
    const select = $opt('cfg-jvm-preset');
    if (!(select instanceof HTMLSelectElement)) return;
    const args = $input('cfg-jvm-args').value.trim();
    const match = JVM_PRESETS.find((p) => p.id !== 'custom' && p.args === args);
    select.value = match ? match.id : 'custom';
  }
}
