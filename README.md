# Launcher Karamon

Launcher Minecraft Java personnalise pour ton serveur modde Karamon.

Il cree et met toujours a jour la meme instance locale: `Karamon`.
L'instance est stockee dans `%APPDATA%\.karamon-launcher\instances\Karamon`, donc elle ne pollue pas le dossier `.minecraft` officiel.

## Lancer

Prerequis: Java 21.

Double-clique `Start-Karamon.bat`, ou lance:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run.ps1
```

Pour generer un `.jar` distribuable:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\package.ps1
```

Le fichier sort dans `dist\KaramonLauncher.jar`.

## Configuration obligatoire Microsoft

Le launcher utilise la connexion Microsoft et verifie que le compte possede Minecraft Java avant de lancer le jeu.

Dans `config/launcher.json`, remplace:

```json
"microsoftClientId": "PUT_YOUR_AZURE_APP_CLIENT_ID_HERE"
```

par l'ID client d'une application Microsoft/Azure configuree comme application publique avec le flow device code et le scope `XboxLive.signin offline_access`.

## Mods du serveur

Tout se gere dans `config/modpack.json`.

Pour tout automatiser cote joueurs, tu peux aussi heberger ce fichier en ligne et mettre son URL brute dans `config/launcher.json`:

```json
"modpackManifestUrl": "https://ton-site.fr/karamon/modpack.json"
```

Si cette valeur est remplie, le launcher retelcharge la liste avant chaque synchro/lancement, puis met a jour la copie locale `config/modpack.json`.

Ajoute une entree par mod:

```json
{
  "name": "Cobblemon",
  "fileName": "cobblemon.jar",
  "url": "https://url-directe-vers-le-fichier.jar",
  "sha1": "sha1-optionnel-mais-recommande",
  "enabled": true
}
```

Notes:

- `removeUnlistedMods: true` retire automatiquement les anciens `.jar` qui ne sont plus dans la liste.
- Si `sha1` est vide, le launcher retelecharge le mod a chaque synchro.
- Si `sha1` est renseigne, le launcher garde le fichier local tant que le hash correspond.

## Version Minecraft / Fabric

Les valeurs par defaut sont dans `config/launcher.json`:

- Minecraft `1.21.1`
- Fabric Loader `0.19.2`

Change-les si ton modpack Karamon utilise une autre version.
