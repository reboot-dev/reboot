import { RebootClientProvider } from "@reboot-dev/reboot-react";
import { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { AdminAuthProvider } from "./admin_auth";
import "./index.css";
import { StatesInspector } from "./states";
import { TasksInspector } from "./tasks";

const App = () => {
  const getTabFromPath = () => {
    const path = window.location.pathname;
    if (path.endsWith("/tasks")) {
      return "tasks";
    }
    // Default to 'states'.
    return "states";
  };

  const [activeTab, setActiveTab] = useState(getTabFromPath());

  useEffect(() => {
    // This effect hook handles two things:
    // 1. On initial load, it canonicalizes the URL. For example, if the
    //    user visits `.../inspect/`, it changes the URL to
    //    `.../inspect/states`. But it preserves specific state
    //    selections like `.../inspect/states/MyType/my-id`.
    // 2. It adds a `popstate` listener to handle browser back/forward
    //    buttons, ensuring the active tab stays in sync with the URL.

    const tabFromPath = getTabFromPath();
    const currentPath = window.location.pathname;

    // Only canonicalize if the path is exactly `/__/inspect` or
    // `/__/inspect/`. Don't touch paths that already have the tab
    // specified.
    if (currentPath === "/__/inspect" || currentPath === "/__/inspect/") {
      const canonicalPath = `/__/inspect/${tabFromPath}`;
      window.history.replaceState(null, "", canonicalPath);
    }

    // Set the active tab based on the current path.
    setActiveTab(tabFromPath);

    const handlePopState = () => {
      setActiveTab(getTabFromPath());
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  const handleTabClick = (tab: "states" | "tasks") => {
    if (tab !== activeTab) {
      setActiveTab(tab);
      const newPath = `/__/inspect/${tab}`;
      window.history.pushState(null, "", newPath);
    }
  };

  return (
    <div className="container">
      <div className="tabs">
        <div
          className={`tab ${activeTab === "states" ? "active" : ""}`}
          onClick={() => handleTabClick("states")}
        >
          States
        </div>
        <div
          className={`tab ${activeTab === "tasks" ? "active" : ""}`}
          onClick={() => handleTabClick("tasks")}
        >
          Tasks
        </div>
      </div>
      <div className="content">
        {activeTab === "states" && <StatesInspector />}
        {activeTab === "tasks" && <TasksInspector />}
      </div>
    </div>
  );
};

export const render = (url: string) => {
  const root = ReactDOM.createRoot(document.getElementById("root")!);

  root.render(
    <AdminAuthProvider>
      <RebootClientProvider url={url}>
        <App />
      </RebootClientProvider>
    </AdminAuthProvider>
  );
};
