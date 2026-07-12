import { useState } from 'react';
import { useUsers } from '../hooks/useUsers.js';
import { UserList } from '../components/UserList.jsx';

/**
 * Worked example of the data-fetching pattern: the hook owns the request, the
 * page owns the UI state, a dumb component renders.
 */
export function UsersPage() {
  const [page, setPage] = useState(1);
  const { users, pages, isLoading, error } = useUsers({ page });

  if (isLoading) return <p className="muted">Loading…</p>;
  if (error) return <p className="error">{error.message}</p>;

  return (
    <section>
      <h1>Users</h1>

      <UserList users={users} />

      <div className="pager">
        <button onClick={() => setPage((p) => p - 1)} disabled={page <= 1}>
          Previous
        </button>
        <span className="muted">
          Page {page} of {pages || 1}
        </span>
        <button onClick={() => setPage((p) => p + 1)} disabled={page >= pages}>
          Next
        </button>
      </div>
    </section>
  );
}
