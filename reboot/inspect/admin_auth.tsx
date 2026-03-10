import React, {
  ReactNode,
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";

// Set up provider for admin authentication.
export interface IAdminAuthContext {
  adminToken: string;
}

export const AdminAuthContext = createContext<IAdminAuthContext>({});

export const useAdminAuthContext = () => {
  return useContext(AdminAuthContext);
};

export const AdminAuthProvider = ({ children }: { children: ReactNode }) => {
  const [adminToken, setAdminToken] = useState<string | undefined>(undefined);
  const [tokenInput, setTokenInput] = useState<string>("");

  useEffect(() => {
    if (
      (window.location.hostname.endsWith("localhost") ||
        window.location.hostname.endsWith("127.0.0.1")) &&
      // This is the default hostname for a testing cluster, not `rbt dev`.
      !window.location.hostname.endsWith("reboot-cloud-cluster.localhost")
    ) {
      // We are in `rbt dev` mode, and admin calls don't require a secret.
      // However, we still need to pass _some_ bearer token; empty headers are
      // not acceptable. The value could be anything.
      setAdminToken("dev");
    }
  }, []);

  const handleTokenSubmit = (e: React.FormEvent) => {
    // Prevent the form from refreshing the page and set the admin token to the
    // token input value.
    e.preventDefault();
    setAdminToken(tokenInput);
  };

  if (adminToken === undefined || adminToken === "") {
    // Prompt the user for an admin token in case none is given and a token is
    // required.
    return (
      <div className="admin-token-container">
        <div className="admin-token-box">
          <h2>Enter Admin Credential</h2>
          <p>
            Please see <a href="https://docs.reboot.dev">the docs</a> for more
            information about admin credentials.
          </p>
          <form onSubmit={handleTokenSubmit}>
            <input
              type="password"
              placeholder="Admin Credential (e.g. an API key)"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
            />
            <button type="submit">Submit</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <AdminAuthContext.Provider value={{ adminToken: adminToken }}>
      {children}
    </AdminAuthContext.Provider>
  );
};
