package {{javaPackage}}.repository;

import java.util.ArrayList;
import java.util.List;
import {{javaPackage}}.model.Task;

public class InMemoryTaskRepository implements TaskRepository {

    private final List<Task> tasks = new ArrayList<>(
            List.of(new Task("Read the README", false), new Task("Ship something", false)));

    @Override
    public List<Task> findAll() {
        return List.copyOf(tasks);
    }

    @Override
    public void save(Task task) {
        tasks.add(task);
    }

    @Override
    public void delete(Task task) {
        tasks.remove(task);
    }
}
