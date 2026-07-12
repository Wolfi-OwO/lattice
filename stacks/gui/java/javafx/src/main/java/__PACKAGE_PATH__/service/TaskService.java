package {{javaPackage}}.service;

import javafx.collections.FXCollections;
import javafx.collections.ObservableList;
import {{javaPackage}}.model.Task;
import {{javaPackage}}.repository.TaskRepository;

/**
 * Business rules. Holds the ObservableList the view binds to, so a change here
 * shows up in the UI without the controller repainting anything by hand.
 */
public class TaskService {

    private final TaskRepository repository;
    private final ObservableList<Task> tasks = FXCollections.observableArrayList();

    public TaskService(TaskRepository repository) {
        this.repository = repository;
        this.tasks.setAll(repository.findAll());
    }

    public ObservableList<Task> getTasks() {
        return tasks;
    }

    public void add(String title) {
        if (title == null || title.isBlank()) {
            throw new IllegalArgumentException("Task title must not be empty");
        }

        Task task = new Task(title.trim(), false);
        repository.save(task);
        tasks.add(task);
    }

    public void remove(Task task) {
        repository.delete(task);
        tasks.remove(task);
    }
}
