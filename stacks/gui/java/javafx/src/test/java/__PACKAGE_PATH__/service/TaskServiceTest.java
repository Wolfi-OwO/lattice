package {{javaPackage}}.service;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import {{javaPackage}}.repository.InMemoryTaskRepository;

/**
 * The service holds the rules and has no JavaFX Stage, so it is testable
 * headlessly — that is the whole point of keeping logic out of the controller.
 */
class TaskServiceTest {

    private TaskService service;

    @BeforeEach
    void setUp() {
        service = new TaskService(new InMemoryTaskRepository());
    }

    @Test
    void addAppendsATask() {
        int before = service.getTasks().size();

        service.add("Write a test");

        assertEquals(before + 1, service.getTasks().size());
        var tasks = service.getTasks();
        assertEquals("Write a test", tasks.get(tasks.size() - 1).getTitle());
    }

    @Test
    void addRejectsABlankTitle() {
        assertThrows(IllegalArgumentException.class, () -> service.add("   "));
    }

    @Test
    void removeDeletesTheTask() {
        service.add("Temporary");
        var tasks = service.getTasks();
        var task = tasks.get(tasks.size() - 1);

        service.remove(task);

        assertFalse(service.getTasks().contains(task));
    }
}
