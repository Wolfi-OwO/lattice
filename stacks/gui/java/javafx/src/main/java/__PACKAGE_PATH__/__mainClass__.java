package {{javaPackage}};

import java.io.IOException;
import java.util.Objects;
import javafx.application.Application;
import javafx.fxml.FXMLLoader;
import javafx.scene.Parent;
import javafx.scene.Scene;
import javafx.stage.Stage;

/**
 * Entry point. Loads the root FXML view and shows it — no UI logic lives here.
 */
public class {{mainClass}} extends Application {

    @Override
    public void start(Stage stage) throws IOException {
        FXMLLoader loader = new FXMLLoader(
                Objects.requireNonNull({{mainClass}}.class.getResource("view/main-view.fxml")));

        Parent root = loader.load();
        Scene scene = new Scene(root, 900, 600);

        scene.getStylesheets().add(
                Objects.requireNonNull({{mainClass}}.class.getResource("css/app.css")).toExternalForm());

        stage.setTitle("{{projectTitle}}");
        stage.setScene(scene);
        stage.show();
    }

    public static void main(String[] args) {
        launch(args);
    }
}
