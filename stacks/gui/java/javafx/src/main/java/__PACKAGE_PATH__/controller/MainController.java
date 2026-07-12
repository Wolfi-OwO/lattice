package {{javaPackage}}.controller;

import javafx.fxml.FXML;
import javafx.scene.control.*;
import javafx.scene.control.cell.CheckBoxTableCell;
import javafx.scene.control.cell.PropertyValueFactory;
import {{javaPackage}}.model.Task;
import {{javaPackage}}.repository.InMemoryTaskRepository;
import {{javaPackage}}.service.TaskService;

/**
 * Wires the FXML view to the service. Fields annotated @FXML are injected by
 * the FXMLLoader from matching fx:id attributes.
 */
public class MainController {

    private final TaskService service = new TaskService(new InMemoryTaskRepository());

    @FXML private TableView<Task> taskTable;
    @FXML private TableColumn<Task, String> titleColumn;
    @FXML private TableColumn<Task, Boolean> doneColumn;
    @FXML private TextField titleField;
    @FXML private Label statusLabel;

    /** Called by the FXMLLoader once every @FXML field is injected. */
    @FXML
    private void initialize() {
        titleColumn.setCellValueFactory(new PropertyValueFactory<>("title"));

        doneColumn.setCellValueFactory(cell -> cell.getValue().doneProperty());
        doneColumn.setCellFactory(CheckBoxTableCell.forTableColumn(doneColumn));
        taskTable.setEditable(true);

        taskTable.setItems(service.getTasks());
    }

    @FXML
    private void onAdd() {
        try {
            service.add(titleField.getText());
            titleField.clear();
            statusLabel.setText("");
        } catch (IllegalArgumentException ex) {
            statusLabel.setText(ex.getMessage());
        }
    }

    @FXML
    private void onDelete() {
        Task selected = taskTable.getSelectionModel().getSelectedItem();

        if (selected == null) {
            statusLabel.setText("Select a task first");
            return;
        }

        service.remove(selected);
        statusLabel.setText("");
    }
}
