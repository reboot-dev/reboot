// frontend/web/src/main.tsx
import { type UseUserApi, useUser } from "@api/todos/v1/todos_rbt_react";
import { RebootClientProvider, useSignIn } from "@reboot-dev/reboot-react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// The signed-in person, or a button to become one. `useUser()` takes
// no ID: it resolves the caller's own `User`, the instance Reboot
// auto-constructed when they signed in.
const Root = () => {
  const { user, isLoading } = useUser();
  const signIn = useSignIn();

  if (isLoading) return <p>Checking session…</p>;
  if (user === undefined) {
    return <button onClick={() => signIn()}>Sign in</button>;
  }
  return <TodoLists user={user} />;
};

// Everything the app knows about this person hangs off `user`: its
// readers are reactive hooks, its mutators are plain calls.
const TodoLists = ({ user }: { user: UseUserApi }) => {
  const { response } = user.useListTodoLists();

  return (
    <ul>
      {(response?.todoLists ?? []).map((todoList) => (
        <li key={todoList.todoListId}>{todoList.title}</li>
      ))}
      <li>
        <button onClick={() => void user.createTodoList({ title: "New list" })}>
          New list
        </button>
      </li>
    </ul>
  );
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RebootClientProvider url={import.meta.env.VITE_REBOOT_URL}>
      <Root />
    </RebootClientProvider>
  </StrictMode>
);
