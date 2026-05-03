package fr.karamon.launcher.util;

public interface ProgressListener {
    default void status(String message) {
    }

    default void progress(double value) {
    }
}
