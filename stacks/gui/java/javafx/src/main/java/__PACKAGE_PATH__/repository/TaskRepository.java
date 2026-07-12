package {{javaPackage}}.repository;

import java.util.List;
import {{javaPackage}}.model.Task;

/**
 * The persistence seam. Swap the in-memory implementation for JDBC, a file, or
 * an HTTP client without touching the service or the controller.
 */
public interface TaskRepository {

    List<Task> findAll();

    void save(Task task);

    void delete(Task task);
}
