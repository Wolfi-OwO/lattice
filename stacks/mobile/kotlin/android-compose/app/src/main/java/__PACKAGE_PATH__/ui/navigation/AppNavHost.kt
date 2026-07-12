package {{javaPackage}}.ui.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import {{javaPackage}}.ui.screens.HomeScreen
import {{javaPackage}}.ui.screens.UsersScreen

/** Every destination in one place. */
object Routes {
    const val HOME = "home"
    const val USERS = "users"
}

@Composable
fun AppNavHost() {
    val navController = rememberNavController()

    NavHost(navController = navController, startDestination = Routes.HOME) {
        composable(Routes.HOME) {
            HomeScreen(onOpenUsers = { navController.navigate(Routes.USERS) })
        }
        composable(Routes.USERS) {
            UsersScreen(onBack = { navController.popBackStack() })
        }
    }
}
