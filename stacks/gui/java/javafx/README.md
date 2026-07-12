# {{projectTitle}}

Desktop app — JavaFX 21, Maven, MVC.

```bash
mvn javafx:run
mvn test
```

Needs JDK 21. The JavaFX SDK does not need to be installed separately — Maven
pulls the platform-specific artifacts.

## Layout

```
{{javaPackage}}
├── {{mainClass}}.java   Loads the root FXML and shows the Stage
├── controller/          @FXML handlers — wire view to service, nothing more
├── service/             Business rules; owns the ObservableList the view binds to
├── repository/          Persistence seam (in-memory today, JDBC tomorrow)
└── model/               Domain objects with JavaFX properties

resources/{{javaPackage}}/
├── view/main-view.fxml  Layout, built in Scene Builder or by hand
└── css/app.css
```

## The two rules that make this scale

**Models use `Property`, not plain fields.** `TableView` binds to
`titleProperty()`; if the model exposed a plain `String`, the table would render
once and never update.

**Logic lives in the service, not the controller.** `TaskService` has no
`Stage`, no `Node`, no `@FXML` — so `TaskServiceTest` runs headlessly in
milliseconds. A controller that starts making decisions instead of delegating
is a controller that can no longer be tested.

## Swapping the persistence layer

`TaskRepository` is an interface. To move from memory to a database, write a
`JdbcTaskRepository`, add the JDBC driver plus HikariCP to `pom.xml`, and change
the one line in `MainController` that constructs it. No other file changes.
