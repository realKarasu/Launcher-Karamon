package fr.karamon.launcher;

import fr.karamon.launcher.config.ConfigStore;
import fr.karamon.launcher.ui.LauncherFrame;

import javax.swing.SwingUtilities;
import javax.swing.UIManager;
import java.nio.file.Path;

public final class KaramonLauncher {
    private KaramonLauncher() {
    }

    public static void main(String[] args) {
        SwingUtilities.invokeLater(() -> {
            try {
                UIManager.setLookAndFeel(UIManager.getSystemLookAndFeelClassName());
                AppPaths paths = new AppPaths(Path.of("").toAbsolutePath());
                ConfigStore store = new ConfigStore(paths);
                store.ensureDefaults();
                LauncherFrame frame = new LauncherFrame(new LauncherController(paths, store));
                frame.setVisible(true);
            } catch (Exception e) {
                throw new RuntimeException(e);
            }
        });
    }
}
