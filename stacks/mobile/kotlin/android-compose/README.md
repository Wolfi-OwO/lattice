# {{projectTitle}}

Android app — Kotlin, Jetpack Compose (Material 3), Retrofit, Navigation.

Open in Android Studio, or:

```bash
./gradlew assembleDebug
```

(Gradle wrapper: run `gradle wrapper` once, or let Android Studio generate it
on first open.)

## Layout

```
{{javaPackage}}
├── MainActivity.kt         Sets the theme and hands off to AppNavHost
├── ui/
│   ├── navigation/         Every route, in one place
│   ├── screens/            One Composable + one ViewModel per screen
│   └── theme/              Material 3 colour scheme
└── data/
    ├── remote/             Retrofit interfaces + DTOs + the shared client
    └── repository/         The boundary the ViewModel talks to
```

## The pattern

**ViewModel owns state, the screen renders it.** `UsersViewModel` exposes a
single immutable `UsersUiState` through a `StateFlow`; `UsersScreen` collects it
and draws. The screen never calls the network, which is why it can be previewed
and tested with no backend running.

**The repository hides where data comes from.** Adding a Room cache or an
offline mode later touches `UserRepository` and nothing above it. `UserApi` is
injected into it, so a test can pass a fake.

**Versions live in `gradle/libs.versions.toml`.** Reference dependencies as
`libs.retrofit`, never as a hard-coded coordinate string.

## Talking to your backend

`BuildConfig.API_BASE_URL` is set in `app/build.gradle.kts` to
`http://10.0.2.2:{{port}}/api/` — that is how the **emulator** reaches a server
on your host machine (`localhost` inside the emulator is the emulator itself).
On a physical device, use your machine's LAN IP.

`usesCleartextTraffic="true"` in the manifest permits plain HTTP so local dev
works. **Remove it before shipping.**
