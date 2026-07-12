package {{javaPackage}}.model;

import javafx.beans.property.BooleanProperty;
import javafx.beans.property.SimpleBooleanProperty;
import javafx.beans.property.SimpleStringProperty;
import javafx.beans.property.StringProperty;

/**
 * A JavaFX model uses observable properties, not plain fields: the TableView
 * binds to them and repaints itself when they change. Plain getters would
 * render once and then go stale.
 */
public class Task {

    private final StringProperty title = new SimpleStringProperty();
    private final BooleanProperty done = new SimpleBooleanProperty(false);

    public Task(String title, boolean done) {
        this.title.set(title);
        this.done.set(done);
    }

    public StringProperty titleProperty() {
        return title;
    }

    public BooleanProperty doneProperty() {
        return done;
    }

    public String getTitle() {
        return title.get();
    }

    public boolean isDone() {
        return done.get();
    }

    public void setDone(boolean value) {
        done.set(value);
    }
}
