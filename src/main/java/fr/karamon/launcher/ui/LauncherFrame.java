package fr.karamon.launcher.ui;

import fr.karamon.launcher.LauncherController;
import fr.karamon.launcher.util.ProgressListener;

import javax.swing.BorderFactory;
import javax.swing.JButton;
import javax.swing.JFrame;
import javax.swing.JLabel;
import javax.swing.JPanel;
import javax.swing.JProgressBar;
import javax.swing.JScrollPane;
import javax.swing.JTextArea;
import javax.swing.SwingConstants;
import javax.swing.SwingUtilities;
import javax.swing.UIManager;
import java.awt.BasicStroke;
import java.awt.BorderLayout;
import java.awt.Color;
import java.awt.Cursor;
import java.awt.Desktop;
import java.awt.Dimension;
import java.awt.Font;
import java.awt.GradientPaint;
import java.awt.Graphics;
import java.awt.Graphics2D;
import java.awt.GridBagConstraints;
import java.awt.GridBagLayout;
import java.awt.Insets;
import java.awt.RenderingHints;
import java.awt.geom.RoundRectangle2D;
import java.nio.file.Path;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.Map;

public final class LauncherFrame extends JFrame implements ProgressListener {
    private static final Color INK = new Color(235, 247, 239);
    private static final Color MUTED = new Color(158, 181, 174);
    private static final Color PANEL = new Color(13, 28, 27, 218);
    private static final Color PANEL_LIGHT = new Color(22, 49, 46, 232);
    private static final Color MINT = new Color(80, 231, 176);
    private static final Color RED = new Color(236, 88, 92);
    private static final Color GOLD = new Color(245, 188, 82);

    private final LauncherController controller;
    private final JTextArea log = new JTextArea();
    private final JProgressBar progress = new JProgressBar(0, 1000);
    private final JLabel account = smallLabel("Compte: ...");
    private final JLabel instance = smallLabel("Instance: ...");
    private final JLabel version = smallLabel("Version: ...");
    private final JLabel mods = smallLabel("Mods: ...");
    private final JButton login = button("Connexion Microsoft", MINT, new Color(6, 43, 35));
    private final JButton play = button("Jouer", RED, new Color(56, 10, 15));
    private final JButton sync = button("Sync mods", GOLD, new Color(48, 31, 6));
    private final JButton openInstance = ghostButton("Instance");
    private final JButton openMods = ghostButton("Mods JSON");
    private final JButton openConfig = ghostButton("Config");
    private final JButton logout = ghostButton("Deconnexion");

    public LauncherFrame(LauncherController controller) {
        super("Karamon Launcher");
        this.controller = controller;
        setDefaultCloseOperation(EXIT_ON_CLOSE);
        setMinimumSize(new Dimension(1040, 680));
        setLocationByPlatform(true);
        setContentPane(build());
        wireActions();
        refreshSummary();
    }

    @Override
    public void status(String message) {
        SwingUtilities.invokeLater(() -> {
            String time = LocalTime.now().format(DateTimeFormatter.ofPattern("HH:mm:ss"));
            log.append("[" + time + "] " + message + "\n");
            log.setCaretPosition(log.getDocument().getLength());
        });
    }

    @Override
    public void progress(double value) {
        SwingUtilities.invokeLater(() -> progress.setValue((int) Math.round(Math.max(0, Math.min(1, value)) * 1000)));
    }

    private JPanel build() {
        BackgroundPanel root = new BackgroundPanel();
        root.setLayout(new GridBagLayout());
        root.setBorder(BorderFactory.createEmptyBorder(28, 28, 28, 28));

        JPanel hero = heroPanel();
        JPanel controls = controlsPanel();
        JPanel console = consolePanel();

        GridBagConstraints gbc = new GridBagConstraints();
        gbc.insets = new Insets(0, 0, 18, 0);
        gbc.fill = GridBagConstraints.BOTH;
        gbc.gridx = 0;
        gbc.gridy = 0;
        gbc.weightx = 1;
        gbc.weighty = 0.38;
        root.add(hero, gbc);

        gbc.gridy = 1;
        gbc.weighty = 0.18;
        root.add(controls, gbc);

        gbc.gridy = 2;
        gbc.insets = new Insets(0, 0, 0, 0);
        gbc.weighty = 0.44;
        root.add(console, gbc);
        return root;
    }

    private JPanel heroPanel() {
        JPanel panel = translucentPanel(PANEL);
        panel.setLayout(new BorderLayout(28, 0));
        panel.setBorder(BorderFactory.createEmptyBorder(24, 28, 24, 28));

        PixelBadge badge = new PixelBadge();
        badge.setPreferredSize(new Dimension(260, 210));
        panel.add(badge, BorderLayout.WEST);

        JPanel text = new JPanel(new GridBagLayout());
        text.setOpaque(false);
        GridBagConstraints gbc = new GridBagConstraints();
        gbc.gridx = 0;
        gbc.anchor = GridBagConstraints.WEST;
        gbc.fill = GridBagConstraints.HORIZONTAL;
        gbc.weightx = 1;

        JLabel title = new JLabel("KARAMON");
        title.setForeground(INK);
        title.setFont(new Font("Segoe UI Black", Font.BOLD, 58));
        text.add(title, gbc);

        JLabel subtitle = new JLabel("Launcher Cobblemon prive");
        subtitle.setForeground(MINT);
        subtitle.setFont(new Font("Segoe UI Semibold", Font.PLAIN, 20));
        gbc.gridy = 1;
        gbc.insets = new Insets(2, 0, 20, 0);
        text.add(subtitle, gbc);

        JPanel chips = new JPanel(new GridBagLayout());
        chips.setOpaque(false);
        addChip(chips, account, 0);
        addChip(chips, instance, 1);
        addChip(chips, version, 2);
        addChip(chips, mods, 3);
        gbc.gridy = 2;
        gbc.insets = new Insets(0, 0, 0, 0);
        text.add(chips, gbc);

        panel.add(text, BorderLayout.CENTER);
        return panel;
    }

    private JPanel controlsPanel() {
        JPanel panel = translucentPanel(PANEL_LIGHT);
        panel.setLayout(new GridBagLayout());
        panel.setBorder(BorderFactory.createEmptyBorder(18, 22, 18, 22));
        GridBagConstraints gbc = new GridBagConstraints();
        gbc.gridy = 0;
        gbc.insets = new Insets(0, 0, 0, 12);
        gbc.fill = GridBagConstraints.BOTH;

        gbc.gridx = 0;
        gbc.weightx = 0.18;
        panel.add(login, gbc);
        gbc.gridx = 1;
        gbc.weightx = 0.20;
        panel.add(play, gbc);
        gbc.gridx = 2;
        gbc.weightx = 0.16;
        panel.add(sync, gbc);
        gbc.gridx = 3;
        gbc.weightx = 0.12;
        panel.add(openInstance, gbc);
        gbc.gridx = 4;
        panel.add(openMods, gbc);
        gbc.gridx = 5;
        panel.add(openConfig, gbc);
        gbc.gridx = 6;
        gbc.insets = new Insets(0, 0, 0, 0);
        panel.add(logout, gbc);

        progress.setStringPainted(false);
        progress.setForeground(MINT);
        progress.setBackground(new Color(8, 20, 20));
        progress.setBorder(BorderFactory.createEmptyBorder());
        gbc.gridx = 0;
        gbc.gridy = 1;
        gbc.gridwidth = 7;
        gbc.weightx = 1;
        gbc.insets = new Insets(16, 0, 0, 0);
        panel.add(progress, gbc);
        return panel;
    }

    private JPanel consolePanel() {
        JPanel panel = translucentPanel(new Color(4, 12, 13, 225));
        panel.setLayout(new BorderLayout());
        panel.setBorder(BorderFactory.createEmptyBorder(16, 18, 18, 18));
        JLabel label = new JLabel("Journal");
        label.setForeground(MUTED);
        label.setFont(new Font("Consolas", Font.BOLD, 13));
        panel.add(label, BorderLayout.NORTH);

        log.setEditable(false);
        log.setOpaque(false);
        log.setForeground(new Color(205, 230, 222));
        log.setCaretColor(MINT);
        log.setFont(new Font("Consolas", Font.PLAIN, 13));
        JScrollPane scroll = new JScrollPane(log);
        scroll.setOpaque(false);
        scroll.getViewport().setOpaque(false);
        scroll.setBorder(BorderFactory.createEmptyBorder(8, 0, 0, 0));
        panel.add(scroll, BorderLayout.CENTER);
        return panel;
    }

    private void wireActions() {
        login.addActionListener(e -> runTask("Connexion Microsoft", () -> {
            controller.login(this);
            refreshSummary();
        }));
        play.addActionListener(e -> runTask("Lancement", () -> {
            controller.launch(this);
            refreshSummary();
        }));
        sync.addActionListener(e -> runTask("Synchronisation", () -> {
            controller.syncOnly(this);
            refreshSummary();
        }));
        openInstance.addActionListener(e -> runTask("Ouverture instance", () -> controller.open(controller.instanceDir())));
        openMods.addActionListener(e -> openPath(controller.manifestPath()));
        openConfig.addActionListener(e -> openPath(controller.launcherConfigPath()));
        logout.addActionListener(e -> runTask("Deconnexion", () -> {
            controller.logout();
            refreshSummary();
            status("Compte deconnecte.");
        }));
    }

    private void runTask(String name, ThrowingRunnable runnable) {
        setBusy(true);
        progress(0);
        status(name + "...");
        Thread thread = new Thread(() -> {
            try {
                runnable.run();
                progress(1);
                status(name + " termine.");
            } catch (Exception ex) {
                progress(0);
                status("Erreur: " + ex.getMessage());
                ex.printStackTrace();
            } finally {
                SwingUtilities.invokeLater(() -> setBusy(false));
            }
        }, "karamon-task");
        thread.setDaemon(true);
        thread.start();
    }

    private void setBusy(boolean busy) {
        login.setEnabled(!busy);
        play.setEnabled(!busy);
        sync.setEnabled(!busy);
        openInstance.setEnabled(!busy);
        openMods.setEnabled(!busy);
        openConfig.setEnabled(!busy);
        logout.setEnabled(!busy);
        setCursor(Cursor.getPredefinedCursor(busy ? Cursor.WAIT_CURSOR : Cursor.DEFAULT_CURSOR));
    }

    private void refreshSummary() {
        SwingUtilities.invokeLater(() -> {
            try {
                Map<String, Object> summary = controller.summary();
                account.setText("Compte: " + controller.cachedAccountLabel());
                instance.setText("Instance: " + summary.get("instance"));
                version.setText("MC " + summary.get("minecraft") + " / " + summary.get("loader"));
                mods.setText("Mods actifs: " + summary.get("mods"));
                status("Dossier donnees: " + controller.dataDir());
            } catch (Exception e) {
                status("Config invalide: " + e.getMessage());
            }
        });
    }

    private void openPath(Path path) {
        try {
            if (!Desktop.isDesktopSupported()) {
                status("Ouverture automatique indisponible.");
                return;
            }
            Desktop.getDesktop().open(path.toFile());
        } catch (Exception e) {
            status("Impossible d'ouvrir " + path + ": " + e.getMessage());
        }
    }

    private static JButton button(String text, Color fill, Color foreground) {
        JButton button = new JButton(text);
        button.setFocusPainted(false);
        button.setBorder(BorderFactory.createEmptyBorder(13, 18, 13, 18));
        button.setBackground(fill);
        button.setForeground(foreground);
        button.setFont(new Font("Segoe UI Semibold", Font.BOLD, 14));
        button.setCursor(Cursor.getPredefinedCursor(Cursor.HAND_CURSOR));
        return button;
    }

    private static JButton ghostButton(String text) {
        JButton button = button(text, new Color(26, 55, 52), INK);
        button.setBorder(BorderFactory.createCompoundBorder(
                BorderFactory.createLineBorder(new Color(72, 113, 101)),
                BorderFactory.createEmptyBorder(12, 16, 12, 16)
        ));
        return button;
    }

    private static JLabel smallLabel(String text) {
        JLabel label = new JLabel(text, SwingConstants.CENTER);
        label.setForeground(INK);
        label.setFont(new Font("Segoe UI Semibold", Font.PLAIN, 13));
        label.setBorder(BorderFactory.createEmptyBorder(8, 12, 8, 12));
        return label;
    }

    private static void addChip(JPanel parent, JLabel label, int x) {
        JPanel chip = new JPanel(new BorderLayout());
        chip.setOpaque(true);
        chip.setBackground(new Color(10, 35, 33));
        chip.setBorder(BorderFactory.createLineBorder(new Color(51, 105, 89)));
        chip.add(label, BorderLayout.CENTER);
        GridBagConstraints gbc = new GridBagConstraints();
        gbc.gridx = x;
        gbc.gridy = 0;
        gbc.insets = new Insets(0, 0, 0, 10);
        parent.add(chip, gbc);
    }

    private static JPanel translucentPanel(Color color) {
        JPanel panel = new JPanel() {
            @Override
            protected void paintComponent(Graphics g) {
                super.paintComponent(g);
                Graphics2D g2 = (Graphics2D) g.create();
                g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
                g2.setColor(color);
                g2.fill(new RoundRectangle2D.Float(0, 0, getWidth(), getHeight(), 8, 8));
                g2.setColor(new Color(255, 255, 255, 22));
                g2.draw(new RoundRectangle2D.Float(0.5f, 0.5f, getWidth() - 1, getHeight() - 1, 8, 8));
                g2.dispose();
            }
        };
        panel.setOpaque(false);
        return panel;
    }

    private interface ThrowingRunnable {
        void run() throws Exception;
    }

    private static final class BackgroundPanel extends JPanel {
        @Override
        protected void paintComponent(Graphics g) {
            super.paintComponent(g);
            Graphics2D g2 = (Graphics2D) g.create();
            g2.setPaint(new GradientPaint(0, 0, new Color(7, 23, 25), getWidth(), getHeight(), new Color(42, 14, 22)));
            g2.fillRect(0, 0, getWidth(), getHeight());
            g2.setColor(new Color(255, 255, 255, 12));
            for (int y = 0; y < getHeight(); y += 34) {
                for (int x = (y / 34) % 2 * 17; x < getWidth(); x += 34) {
                    g2.fillRect(x, y, 3, 3);
                }
            }
            g2.setColor(new Color(80, 231, 176, 24));
            for (int i = 0; i < 9; i++) {
                g2.fillRect(getWidth() - 260 + i * 28, 48 + i * 18, 18, 18);
            }
            g2.setColor(new Color(236, 88, 92, 22));
            for (int i = 0; i < 11; i++) {
                g2.fillRect(42 + i * 22, getHeight() - 118 - i * 10, 14, 14);
            }
            g2.dispose();
        }
    }

    private static final class PixelBadge extends JPanel {
        private PixelBadge() {
            setOpaque(false);
        }

        @Override
        protected void paintComponent(Graphics g) {
            super.paintComponent(g);
            Graphics2D g2 = (Graphics2D) g.create();
            g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            int w = getWidth();
            int h = getHeight();
            g2.setColor(new Color(3, 12, 14, 190));
            g2.fillRoundRect(14, 14, w - 28, h - 28, 26, 26);

            int size = Math.min(w, h) - 78;
            int x = (w - size) / 2;
            int y = (h - size) / 2 + 6;
            g2.setStroke(new BasicStroke(7f));
            g2.setColor(new Color(6, 20, 23));
            g2.fillOval(x, y, size, size);
            g2.setColor(RED);
            g2.fillArc(x + 8, y + 8, size - 16, size - 16, 0, 180);
            g2.setColor(new Color(230, 244, 238));
            g2.fillArc(x + 8, y + 8, size - 16, size - 16, 180, 180);
            g2.setColor(new Color(6, 20, 23));
            g2.drawLine(x + 10, y + size / 2, x + size - 10, y + size / 2);
            g2.fillOval(x + size / 2 - 22, y + size / 2 - 22, 44, 44);
            g2.setColor(MINT);
            g2.fillOval(x + size / 2 - 12, y + size / 2 - 12, 24, 24);

            drawPixelK(g2, x + size / 2 - 34, y + size / 2 - 52, 12);
            g2.dispose();
        }

        private void drawPixelK(Graphics2D g2, int x, int y, int unit) {
            int[][] pixels = {
                    {0, 0}, {0, 1}, {0, 2}, {0, 3}, {0, 4},
                    {1, 2}, {2, 1}, {3, 0}, {2, 3}, {3, 4}
            };
            g2.setColor(new Color(5, 18, 20));
            for (int[] pixel : pixels) {
                g2.fillRect(x + pixel[0] * unit, y + pixel[1] * unit, unit, unit);
            }
            g2.setColor(GOLD);
            for (int[] pixel : pixels) {
                g2.fillRect(x + pixel[0] * unit + 2, y + pixel[1] * unit + 2, unit - 4, unit - 4);
            }
        }
    }
}
