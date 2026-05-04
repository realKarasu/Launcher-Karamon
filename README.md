<div align="center">
  <img src="assets/banner.png" alt="Karamon" width="420" />
  <br/><br/>
  <p>Launcher Minecraft personnalisé pour le serveur <strong>karamon.fr</strong></p>

  ![Version](https://img.shields.io/badge/version-1.0.0-blue?style=flat-square)
  ![Minecraft](https://img.shields.io/badge/Minecraft-1.21.1-green?style=flat-square)
  ![Fabric](https://img.shields.io/badge/Fabric-0.19.2-orange?style=flat-square)
  ![Platform](https://img.shields.io/badge/platform-Windows-lightgrey?style=flat-square)
</div>

---

## Téléchargement

Récupère le dernier installeur sur la page [**Releases**](https://github.com/realKarasu/Launcher-Karamon/releases/latest).

```
Karamon Launcher Setup x.x.x.exe
```

> Tu peux vérifier l'intégrité du fichier avec le `checksums.txt` joint à chaque release.

---

## Fonctionnalités

- **Synchronisation des mods** — télécharge et met à jour automatiquement le modpack Karamon
- **Profil Fabric dédié** — crée un profil isolé dans le launcher Minecraft officiel, sans toucher à ta config existante
- **Serveur pré-configuré** — `karamon.fr` ajouté automatiquement dans ta liste de serveurs
- **Mises à jour automatiques** — le launcher se met à jour en arrière-plan et te notifie quand c'est prêt
- **Paramètres avancés** — RAM, arguments JVM, chemin Java, dossier `.minecraft` personnalisable

---

## Utilisation

1. Lance **Karamon Launcher**
2. Clique sur **Mettre à jour les mods** lors de ta première connexion (ou après une mise à jour du modpack)
3. Clique sur **JOUER** — le launcher Minecraft officiel s'ouvre avec le profil Karamon prêt

---

## Développement

**Prérequis :** [Node.js](https://nodejs.org) 18+

```bash
git clone https://github.com/realKarasu/Launcher-Karamon.git
cd Launcher-Karamon
npm install
npm start
```

### Build

```bash
npm run build
```

L'installeur et les checksums sont générés dans `dist/`.

---

## Stack

| Composant | Technologie |
|-----------|-------------|
| Shell | [Electron](https://www.electronjs.org/) 33 |
| Mods sync | GitHub Releases + adm-zip |
| Auto-updater | [electron-updater](https://www.electron.build/auto-update) |
| Build | [electron-builder](https://www.electron.build/) |

---

<div align="center">
  <sub>Karamon — karamon.fr</sub>
</div>
