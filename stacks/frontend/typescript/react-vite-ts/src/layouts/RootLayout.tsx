import { NavLink, Outlet } from 'react-router-dom';

export function RootLayout() {
  return (
    <div className="app">
      <header className="app__header">
        <span className="app__brand">{{projectTitle}}</span>
        <nav className="app__nav">
          <NavLink to="/">Home</NavLink>
          <NavLink to="/users">Users</NavLink>
        </nav>
      </header>

      <main className="app__main">
        <Outlet />
      </main>
    </div>
  );
}
