import { createBrowserRouter } from 'react-router-dom';
import { RootLayout } from './layouts/RootLayout.jsx';
import { HomePage } from './pages/HomePage.jsx';
import { UsersPage } from './pages/UsersPage.jsx';
import { NotFoundPage } from './pages/NotFoundPage.jsx';

/**
 * Every route in one place. Nested routes render into RootLayout's <Outlet />.
 */
export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    errorElement: <NotFoundPage />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'users', element: <UsersPage /> },
    ],
  },
]);
