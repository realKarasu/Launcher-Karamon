import path from 'path';
import { RuleEvaluator } from './RuleEvaluator';
import type { RawArgument, MojangVersion } from './VersionResolver';

export interface ArgumentVars {
  authPlayerName: string;
  authUuid: string;
  authAccessToken: string;
  authXuid: string;
  clientId: string;
  userType: string;
  versionName: string;
  versionType: string;
  gameDir: string;
  assetsRoot: string;
  assetsIndexName: string;
  classpath: string;
  nativesDir: string;
  launcherName: string;
  launcherVersion: string;
}

export class ArgumentResolver {
  static resolve(version: MojangVersion, vars: ArgumentVars): { jvm: string[]; game: string[] } {
    const ctx = RuleEvaluator.currentContext({ has_custom_resolution: false, is_demo_user: false });

    if (version.minecraftArguments) {
      const jvm = ArgumentResolver.legacyJvm(vars);
      const game = version.minecraftArguments
        .split(/\s+/)
        .map((a) => ArgumentResolver.substitute(a, vars));
      return { jvm, game };
    }

    const jvmRaw = version.arguments?.jvm ?? ArgumentResolver.defaultJvm();
    const gameRaw = version.arguments?.game ?? [];

    const jvm = ArgumentResolver.flatten(jvmRaw, ctx)
      .map((a) => ArgumentResolver.substitute(a, vars));
    const game = ArgumentResolver.flatten(gameRaw, ctx)
      .map((a) => ArgumentResolver.substitute(a, vars));

    return { jvm, game };
  }

  private static flatten(args: RawArgument[], ctx: ReturnType<typeof RuleEvaluator.currentContext>): string[] {
    const out: string[] = [];
    for (const a of args) {
      if (typeof a === 'string') {
        out.push(a);
      } else if (RuleEvaluator.evaluate(a.rules, ctx)) {
        if (Array.isArray(a.value)) out.push(...a.value);
        else out.push(a.value);
      }
    }
    return out;
  }

  private static substitute(arg: string, vars: ArgumentVars): string {
    return arg.replace(/\$\{([a-zA-Z_]+)\}/g, (_, name: string) => {
      switch (name) {
        case 'auth_player_name': return vars.authPlayerName;
        case 'auth_uuid': return vars.authUuid;
        case 'auth_access_token': return vars.authAccessToken;
        case 'auth_session': return vars.authAccessToken;
        case 'auth_xuid': return vars.authXuid;
        case 'clientid': return vars.clientId;
        case 'user_type': return vars.userType;
        case 'user_properties': return '{}';
        case 'version_name': return vars.versionName;
        case 'version_type': return vars.versionType;
        case 'game_directory': return vars.gameDir;
        case 'assets_root': return vars.assetsRoot;
        case 'game_assets': return vars.assetsRoot;
        case 'assets_index_name': return vars.assetsIndexName;
        case 'classpath': return vars.classpath;
        case 'natives_directory': return vars.nativesDir;
        case 'launcher_name': return vars.launcherName;
        case 'launcher_version': return vars.launcherVersion;
        case 'classpath_separator': return path.delimiter;
        case 'library_directory': return vars.assetsRoot;
        case 'resolution_width': return '1280';
        case 'resolution_height': return '720';
        default: return '';
      }
    });
  }

  private static defaultJvm(): RawArgument[] {
    return [
      '-Djava.library.path=${natives_directory}',
      '-Djna.tmpdir=${natives_directory}',
      '-Dorg.lwjgl.system.SharedLibraryExtractPath=${natives_directory}',
      '-Dio.netty.native.workdir=${natives_directory}',
      '-cp',
      '${classpath}',
    ];
  }

  private static legacyJvm(vars: ArgumentVars): string[] {
    return [
      `-Djava.library.path=${vars.nativesDir}`,
      '-cp',
      vars.classpath,
    ];
  }
}
