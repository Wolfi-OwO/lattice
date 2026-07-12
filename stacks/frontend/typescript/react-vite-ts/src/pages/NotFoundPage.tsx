import { Link, useRouteError } from 'react-router-dom';

export function NotFoundPage() {
  const error = useRouteError() as { statusText?: string; message?: string } | null;

  return (
    <section>
      <h1>Something went wrong</h1>
      <p className="error">{error?.statusText ?? error?.message ?? 'Page not found'}</p>
      <Link to="/">Back home</Link>
    </section>
  );
}
