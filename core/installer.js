const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const AdmZip = require('adm-zip');
const dl = require('./downloader');
const paths = require('./paths');

const VERSION_MANIFEST = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
const FABRIC_PROFILE   = (mcVer, loaderVer) =>
  `https://meta.fabricmc.net/v2/versions/loader/${mcVer}/${loaderVer}/profile/json`;

// ── Rule evaluation ───────────────────────────────────────────────────────────

function osName() {
  const p = process.platform;
  if (p === 'win32')  return 'windows';
  if (p === 'darwin') return 'osx';
  return 'linux';
}

function evaluateRules(rules) {
  if (!rules || rules.length === 0) return true;
  let result = false;
  for (const rule of rules) {
    const matches = !rule.os || (rule.os.name ? rule.os.name === osName() : true);
    if (rule.action === 'allow' && matches)  result = true;
    if (rule.action === 'disallow' && matches) result = false;
  }
  return result;
}

// ── Maven coordinates ─────────────────────────────────────────────────────────

function mavenPath(name) {
  const parts = name.split(':');
  const group = parts[0].replace(/\./g, '/');
  const artifact = parts[1];
  const rest = parts.slice(2).join(':');
  const versionMatch = rest.match(/^([^:@]+)(?::([^@]+))?(?:@(.+))?$/);
  const version = versionMatch[1];
  const classifier = versionMatch[2];
  const ext = versionMatch[3] || 'jar';
  const file = classifier
    ? `${artifact}-${version}-${classifier}.${ext}`
    : `${artifact}-${version}.${ext}`;
  return `${group}/${artifact}/${version}/${file}`;
}

function mavenUrl(name, base) {
  return (base.endsWith('/') ? base : base + '/') + mavenPath(name);
}

// ── Natives extraction ────────────────────────────────────────────────────────

function extractNatives(jarPath, nativesDir) {
  try {
    const zip = new AdmZip(jarPath);
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory) continue;
      const name = entry.entryName;
      if (name.startsWith('META-INF/') || name.endsWith('.sha1') || name.endsWith('.git')) continue;
      const dest = path.join(nativesDir, path.basename(name));
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      zip.extractEntryTo(entry, path.dirname(dest), false, true);
    }
  } catch (_) { /* best effort */ }
}

// ── Main installer ────────────────────────────────────────────────────────────

async function install(mcVersion, fabricLoaderVersion, onStatus, onProgress) {
  fs.mkdirSync(paths.versionsDir,  { recursive: true });
  fs.mkdirSync(paths.librariesDir, { recursive: true });
  fs.mkdirSync(paths.assetsDir,    { recursive: true });

  // 1. Vanilla version profile
  onStatus(`Vérification du profil Minecraft ${mcVersion}...`);
  const manifest = await dl.getJson(VERSION_MANIFEST);
  const versionEntry = manifest.versions.find((v) => v.id === mcVersion);
  if (!versionEntry) throw new Error(`Version Minecraft inconnue: ${mcVersion}`);

  const vDir = path.join(paths.versionsDir, mcVersion);
  const vJson = path.join(vDir, `${mcVersion}.json`);
  await dl.download(versionEntry.url, vJson, versionEntry.sha1, null, `version ${mcVersion}`);
  const vanilla = JSON.parse(fs.readFileSync(vJson, 'utf8'));

  // 2. Fabric profile
  onStatus(`Vérification du profil Fabric ${fabricLoaderVersion}...`);
  const fabricId = `fabric-loader-${fabricLoaderVersion}-${mcVersion}`;
  const fDir = path.join(paths.versionsDir, fabricId);
  const fJson = path.join(fDir, `${fabricId}.json`);
  await dl.download(FABRIC_PROFILE(mcVersion, fabricLoaderVersion), fJson, '', null, `Fabric ${fabricLoaderVersion}`);
  const fabric = JSON.parse(fs.readFileSync(fJson, 'utf8'));

  const nativesDir = path.join(paths.versionsDir, fabricId, 'natives');
  fs.mkdirSync(nativesDir, { recursive: true });

  const classpath = new Set();

  // 3. Libraries (vanilla + fabric)
  const allLibs = [...(vanilla.libraries || []), ...(fabric.libraries || [])];
  for (let i = 0; i < allLibs.length; i++) {
    const lib = allLibs[i];
    if (!evaluateRules(lib.rules)) continue;
    onStatus(`Bibliothèque (${i + 1}/${allLibs.length}): ${lib.name || ''}`);
    onProgress(i / allLibs.length * 0.6);

    const artifact = lib.downloads?.artifact;
    if (artifact?.url) {
      const dest = path.join(paths.librariesDir, artifact.path);
      await dl.download(artifact.url, dest, artifact.sha1, null, lib.name);
      classpath.add(dest);
    } else if (lib.name) {
      const base = lib.url || 'https://libraries.minecraft.net/';
      const dest = path.join(paths.librariesDir, mavenPath(lib.name));
      await dl.download(mavenUrl(lib.name, base), dest, lib.sha1 || '', null, lib.name);
      classpath.add(dest);
    }

    // Natives
    const classifier = lib.natives?.windows || lib.natives?.[osName()];
    if (classifier) {
      const resolved = classifier.replace('${arch}', process.arch === 'x64' ? '64' : '32');
      const nativeArtifact = lib.downloads?.classifiers?.[resolved];
      if (nativeArtifact?.url) {
        const dest = path.join(paths.librariesDir, nativeArtifact.path);
        await dl.download(nativeArtifact.url, dest, nativeArtifact.sha1, null, lib.name + ' native');
        extractNatives(dest, nativesDir);
      }
    }
  }

  // 4. Client JAR
  onStatus('Vérification du client Minecraft...');
  onProgress(0.65);
  const clientInfo = vanilla.downloads?.client;
  const clientJar  = path.join(paths.versionsDir, mcVersion, `${mcVersion}.jar`);
  await dl.download(clientInfo.url, clientJar, clientInfo.sha1, null, 'client Minecraft');
  classpath.add(clientJar);

  // 5. Assets
  onStatus('Vérification de l\'index des assets...');
  onProgress(0.7);
  const assetIndex  = vanilla.assetIndex;
  const indexFile   = path.join(paths.assetsDir, 'indexes', `${assetIndex.id}.json`);
  await dl.download(assetIndex.url, indexFile, assetIndex.sha1, null, 'asset index');
  const index = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
  const objects = Object.values(index.objects || {});
  let done = 0;
  for (const obj of objects) {
    done++;
    const hash = obj.hash;
    const dest = path.join(paths.assetsDir, 'objects', hash.slice(0, 2), hash);
    if (!fs.existsSync(dest)) {
      await dl.download(
        `https://resources.download.minecraft.net/${hash.slice(0, 2)}/${hash}`,
        dest, hash, null, `asset ${hash.slice(0, 8)}`
      );
    }
    if (done % 50 === 0) {
      onStatus(`Assets Minecraft ${done}/${objects.length}`);
      onProgress(0.7 + (done / objects.length) * 0.25);
    }
  }
  onProgress(0.98);

  const mainClass = fabric.mainClass || vanilla.mainClass;
  const versionName = fabric.id || mcVersion;

  return {
    instanceDir: null, // set by caller
    assetsDir:   paths.assetsDir,
    nativesDir,
    classpath:   [...classpath],
    mainClass,
    versionName,
    assetIndexId: assetIndex.id,
    vanillaVersion: vanilla,
    loaderVersion:  fabric,
  };
}

// ── JVM / game argument resolution ───────────────────────────────────────────

function resolveArgs(argList, placeholders) {
  const result = [];
  if (!argList) return result;
  for (const arg of argList) {
    if (typeof arg === 'string') {
      result.push(replacePlaceholders(arg, placeholders));
    } else if (arg && typeof arg === 'object') {
      if (!evaluateRules(arg.rules)) continue;
      const values = Array.isArray(arg.value) ? arg.value : [arg.value];
      for (const v of values) result.push(replacePlaceholders(v, placeholders));
    }
  }
  return result;
}

function replacePlaceholders(str, ph) {
  return str.replace(/\$\{([^}]+)\}/g, (_, key) => ph[key] ?? '');
}

function buildArguments(context, session, config) {
  const sep = process.platform === 'win32' ? ';' : ':';
  const classpath = context.classpath.join(sep);

  const ph = {
    natives_directory: context.nativesDir,
    launcher_name: 'KaramonLauncher',
    launcher_version: '1.0.0',
    classpath,
    classpath_separator: sep,
    auth_player_name: session.profileName,
    version_name: context.versionName,
    game_directory: context.instanceDir,
    assets_root: context.assetsDir,
    assets_index_name: context.assetIndexId,
    auth_uuid: session.uuid,
    auth_access_token: session.accessToken,
    clientid: config.microsoftClientId,
    auth_xuid: session.xuid || '',
    user_type: 'msa',
    version_type: 'Karamon',
    user_properties: '{}',
    game_assets: path.join(context.assetsDir, 'virtual', 'legacy'),
  };

  const jvmArgs = [
    '-Xms512M',
    `-Xmx${Math.max(1024, config.memoryMb)}M`,
    ...resolveArgs(context.vanillaVersion?.arguments?.jvm, ph),
    ...resolveArgs(context.loaderVersion?.arguments?.jvm, ph),
  ];

  if (config.jvmArgs) {
    jvmArgs.push(...config.jvmArgs.split(' ').filter(Boolean));
  }

  const gameArgs = [
    ...resolveArgs(context.vanillaVersion?.arguments?.game, ph),
    ...resolveArgs(context.loaderVersion?.arguments?.game, ph),
  ];

  if (config.server?.autoJoin && config.server?.host) {
    gameArgs.push('--server', config.server.host, '--port', String(config.server.port || 25565));
  }

  return { jvmArgs, gameArgs };
}

module.exports = { install, buildArguments };
