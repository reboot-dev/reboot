import { Message, MessageType, Struct } from "@bufbuild/protobuf";
import { StatusCode } from "@reboot-dev/reboot-api";
import { useRebootClient } from "@reboot-dev/reboot-react";
import { grpcInfiniteStream } from "@reboot-dev/reboot-web";
import React, { useEffect, useRef, useState } from "react";
import ReactJson from "react-json-view";
import {
  GetStateRequest,
  GetStateResponse,
  GetStateTypesRequest,
  GetStateTypesResponse,
  ListStatesRequest,
  ListStatesResponse,
} from "../../rbt/v1alpha1/inspect/inspect_pb";
import { useAdminAuthContext } from "./admin_auth";
import { CheckmarkIcon, CopyIcon, SearchIcon } from "./icons";
import "./states.css";

// Generic hook for gRPC streaming with smart loading states.
function useGrpcStream<
  RequestType extends Message<RequestType>,
  ResponseType extends Message<ResponseType>
>({
  endpoint,
  request,
  responseType,
  dependencies,
}: {
  endpoint: string;
  request: RequestType;
  responseType: MessageType<ResponseType>;
  dependencies: React.DependencyList;
}) {
  const [response, setResponse] = useState<ResponseType>();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error>();

  const rebootClient = useRebootClient();
  const adminAuthContext = useAdminAuthContext();

  useEffect(() => {
    const abortController = new AbortController();
    let loadingTimeout: number | null = null;

    // Show loading immediately if there was no prior response,
    // otherwise delay for a bit (showing data from the old response for
    // a little longer) to avoid flickering (briefly showing
    // "loading..." and then very quickly showing something else again),
    // in the hope that the new response will arrive soon and we can go
    // straight from data from the old response to data from the new
    // response.
    if (response === undefined) {
      setIsLoading(true);
    } else {
      loadingTimeout = setTimeout(() => {
        setIsLoading(true);
      }, 500);
    }

    (async () => {
      const headers = new Headers();
      headers.set("Content-Type", "application/json");
      headers.append("Connection", "keep-alive");
      headers.set("Authorization", `Bearer ${adminAuthContext.adminToken}`);

      const responses = grpcInfiniteStream({
        endpoint: `${rebootClient.url}/${endpoint}`,
        method: "POST",
        headers,
        request,
        responseType,
        signal: abortController.signal,
      });

      for await (const { response: gotResponse, status } of responses) {
        if (gotResponse !== undefined) {
          if (loadingTimeout) clearTimeout(loadingTimeout);
          setResponse(gotResponse);
          setIsLoading(false);
          setError(undefined);
        } else if (status !== undefined) {
          console.warn(`Error with status: ${JSON.stringify(status)}`);
          if (loadingTimeout) clearTimeout(loadingTimeout);
          setIsLoading(false);
          setError(
            new Error(
              StatusCode[status.code] +
                (status.message ? ": " + status.message : "")
            )
          );
          break;
        }
      }
    })();

    return () => {
      if (loadingTimeout) clearTimeout(loadingTimeout);
      abortController.abort();
      setIsLoading(false);
      setError(undefined);
    };
  }, [rebootClient, adminAuthContext.adminToken, ...dependencies]);

  return { response, isLoading, error };
}

function useGetStateTypes() {
  const { response, isLoading, error } = useGrpcStream({
    endpoint: "rbt.v1alpha1.inspect.Inspect/GetStateTypes",
    request: new GetStateTypesRequest(),
    responseType: GetStateTypesResponse,
    dependencies: [],
  });

  const sortedStateTypes = (response?.stateTypes || []).slice().sort();
  return { stateTypes: sortedStateTypes, isLoading, error };
}

function useListStates(stateType: string) {
  const { response, isLoading, error } = useGrpcStream({
    endpoint: "rbt.v1alpha1.inspect.Inspect/ListStates",
    request: new ListStatesRequest({ stateType }),
    responseType: ListStatesResponse,
    dependencies: [stateType],
  });

  const sortedStateIds = (response?.stateInfos || [])
    .map((info) => info.stateId)
    .slice()
    .sort();
  return { stateIds: sortedStateIds, isLoading, error };
}

function useGetState(stateType: string, stateId: string) {
  const [stateData, setStateData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error>();

  const rebootClient = useRebootClient();
  const adminAuthContext = useAdminAuthContext();

  useEffect(() => {
    const abortController = new AbortController();
    let loadingTimeout: number | null = null;

    // Show loading immediately if there was no prior response,
    // otherwise delay for a bit (showing data from the old response for
    // a little longer) to avoid flickering (briefly showing
    // "loading..." and then very quickly showing something else again),
    // in the hope that the new response will arrive soon and we can go
    // straight from data from the old response to data from the new
    // response.
    if (stateData === null) {
      setIsLoading(true);
    } else {
      loadingTimeout = setTimeout(() => {
        setIsLoading(true);
      }, 500);
    }

    (async () => {
      const headers = new Headers();
      headers.set("Content-Type", "application/json");
      headers.append("Connection", "keep-alive");
      headers.set("Authorization", `Bearer ${adminAuthContext.adminToken}`);

      // Uniquely for our RPCs here, this call needs the
      // `x-reboot-state-ref` header to ensure that it is routed to the
      // right server.
      const stateRef = `${stateType}:${stateId.replace(/\//g, "\\")}`;
      headers.set("x-reboot-state-ref", stateRef);

      const responses = grpcInfiniteStream({
        endpoint: `${rebootClient.url}/rbt.v1alpha1.inspect.Inspect/GetState`,
        method: "POST",
        headers,
        // The backend will know from the `x-reboot-state-ref` header
        // which state to return.
        request: new GetStateRequest(),
        responseType: GetStateResponse,
        signal: abortController.signal,
      });

      let data: Uint8Array[] = [];

      for await (const { response, status } of responses) {
        if (response !== undefined) {
          // Accumulate chunks of data.
          data.push(response.data);

          // Check if there are more chunks.
          if (response.chunk < response.total - 1) {
            continue;
          }

          // No more chunks - reconstruct the state.
          let length = 0;
          for (const chunk of data) {
            length += chunk.length;
          }

          const accumulated = new Uint8Array(length);

          let offset = 0;
          for (const chunk of data) {
            accumulated.set(chunk, offset);
            offset += chunk.length;
          }

          const struct = Struct.fromBinary(accumulated);
          if (loadingTimeout) clearTimeout(loadingTimeout);
          setStateData(struct.toJson());
          setIsLoading(false);
          setError(undefined);

          // Get ready to start accumulating more chunks.
          data = [];
        } else if (status !== undefined) {
          console.warn(`Error with status: ${JSON.stringify(status)}`);
          if (loadingTimeout) clearTimeout(loadingTimeout);
          setIsLoading(false);
          setError(
            new Error(
              StatusCode[status.code] +
                (status.message ? ": " + status.message : "")
            )
          );
          break;
        }
      }
    })();

    return () => {
      if (loadingTimeout) clearTimeout(loadingTimeout);
      abortController.abort();
      setIsLoading(false);
      setError(undefined);
    };
  }, [rebootClient, adminAuthContext.adminToken, stateType, stateId]);

  return { stateData, isLoading, error };
}

interface StateTypesColumnProps {
  selectedStateType: string | null;
  onStateTypeSelect: (stateType: string) => void;
  width: number;
}

const StateTypesColumn: React.FC<StateTypesColumnProps> = ({
  selectedStateType,
  onStateTypeSelect,
  width,
}) => {
  const { stateTypes, isLoading, error } = useGetStateTypes();

  return (
    <div
      className="states-column state-types-column"
      style={{ width: `${width}px` }}
    >
      <h3 className="column-header">State Types</h3>
      <div className="column-content">
        {isLoading ? (
          <div className="empty-state">Loading...</div>
        ) : error ? (
          <div className="empty-state">
            Could not fetch state types: {error.message}
          </div>
        ) : stateTypes.length === 0 ? (
          <div className="empty-state">No state types found</div>
        ) : (
          stateTypes.map((stateType) => (
            <div
              key={stateType}
              className={`list-item ${
                selectedStateType === stateType ? "selected" : ""
              }`}
              onClick={() => onStateTypeSelect(stateType)}
              title={stateType}
            >
              {stateType}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

interface StateIdsColumnProps {
  stateType: string;
  selectedStateId: string | null;
  onStateIdSelect: (stateId: string) => void;
  width: number;
}

const StateIdsColumn: React.FC<StateIdsColumnProps> = ({
  stateType,
  selectedStateId,
  onStateIdSelect,
  width,
}) => {
  const { stateIds, isLoading, error } = useListStates(stateType);
  const [searchTerm, setSearchTerm] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  // Reset search when state type changes.
  const prevStateTypeRef = useRef(stateType);
  useEffect(() => {
    if (
      prevStateTypeRef.current !== stateType &&
      prevStateTypeRef.current !== undefined
    ) {
      setSearchTerm("");
      setShowSearch(false);
    }
    prevStateTypeRef.current = stateType;
  }, [stateType]);

  // Filter state IDs based on search term (substring matching). If the
  // search term is empty all state IDs will pass this filter.
  const filteredStateIds = stateIds.filter((stateId) =>
    stateId.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Helper to render text with highlighted matches.
  const renderHighlightedText = (text: string) => {
    if (!searchTerm) return text;

    const lowerText = text.toLowerCase();
    const lowerSearch = searchTerm.toLowerCase();
    const index = lowerText.indexOf(lowerSearch);

    if (index === -1) return text;

    return (
      <>
        {text.substring(0, index)}
        <span className="search-highlight">
          {text.substring(index, index + searchTerm.length)}
        </span>
        {text.substring(index + searchTerm.length)}
      </>
    );
  };

  return (
    <div
      className="states-column state-ids-column"
      style={{ width: `${width}px` }}
    >
      <h3 className="column-header with-button">
        <span>State IDs</span>
        <button
          className={`header-button ${showSearch ? "active" : ""}`}
          onClick={() => setShowSearch(!showSearch)}
          title="Search"
        >
          <SearchIcon />
        </button>
      </h3>
      {showSearch && (
        <div className="search-container">
          <input
            type="text"
            className="search-input"
            placeholder="Search state IDs..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            autoFocus
          />
        </div>
      )}
      <div className="column-content">
        {isLoading ? (
          <div className="empty-state">Loading...</div>
        ) : error ? (
          <div className="empty-state">
            <p>Could not fetch state IDs:</p>
            <p>{error.message}</p>
          </div>
        ) : stateIds.length === 0 ? (
          <div className="empty-state">No state IDs found</div>
        ) : filteredStateIds.length === 0 ? (
          <div className="empty-state">No matching state IDs</div>
        ) : (
          filteredStateIds.map((stateId) => (
            <div
              key={stateId}
              className={`list-item ${
                selectedStateId === stateId ? "selected" : ""
              }`}
              onClick={() => onStateIdSelect(stateId)}
              title={stateId}
            >
              {renderHighlightedText(stateId)}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

interface StateDataColumnProps {
  stateType: string;
  stateId: string;
}

const StateDataColumn: React.FC<StateDataColumnProps> = ({
  stateType,
  stateId,
}) => {
  const { stateData, isLoading, error } = useGetState(stateType, stateId);
  const [showCopiedFeedback, setShowCopiedFeedback] = useState(false);

  const handleCopyStateId = async () => {
    try {
      await navigator.clipboard.writeText(stateId);
      setShowCopiedFeedback(true);

      // Reset the checkmark after 1 second.
      setTimeout(() => {
        setShowCopiedFeedback(false);
      }, 1000);
    } catch (err) {
      console.error("Failed to copy state ID:", err);
    }
  };

  return (
    <div className="states-column state-data-column">
      <h3 className="column-header with-button">
        <span>'{stateId}'</span>
        <button
          className={`header-button ${showCopiedFeedback ? "copied" : ""}`}
          onClick={handleCopyStateId}
          title={showCopiedFeedback ? "Copied!" : "Copy state ID"}
        >
          {showCopiedFeedback ? <CheckmarkIcon /> : <CopyIcon />}
        </button>
      </h3>
      <div className="column-content">
        {isLoading ? (
          <div className="empty-state">Loading...</div>
        ) : error ? (
          <div className="empty-state">
            <p>Could not fetch data:</p>
            <p>{error.message}</p>
          </div>
        ) : stateData ? (
          <ReactJson
            src={stateData}
            name={false}
            collapsed={1}
            quotesOnKeys={false}
            theme={"monokai"}
            displayArrayKey={false}
            style={{ background: "#2c2c2c" }}
          />
        ) : (
          <div className="empty-state">State is empty</div>
        )}
      </div>
    </div>
  );
};

// Picked so that a column will always stay clearly visible, but can
// become small enough to be out of the way.
const MIN_COLUMN_WIDTH = 200;

export function StatesInspector() {
  // Initialize state from URL path, so that customers can share links
  // directly to a specific state.
  const getInitialStateFromURL = () => {
    const pathParts = window.location.pathname.split("/");
    const statesIndex = pathParts.indexOf("states");
    if (statesIndex !== -1 && pathParts.length > statesIndex + 1) {
      const stateType = decodeURIComponent(pathParts[statesIndex + 1]);
      const stateId =
        pathParts.length > statesIndex + 2
          ? decodeURIComponent(pathParts[statesIndex + 2])
          : null;
      return { stateType, stateId };
    }
    return {};
  };

  const initialState = getInitialStateFromURL();
  const [selectedStateType, setSelectedStateType] = useState<string | null>(
    initialState.stateType
  );
  const [selectedStateId, setSelectedStateId] = useState<string | null>(
    initialState.stateId
  );

  // The first two columns are resizable.
  const [stateTypesWidth, setStateTypesWidth] = useState(300);
  // Make the state IDs column wide enough for a UUID by default.
  const [stateIdsWidth, setStateIdsWidth] = useState(340);
  const [isResizingTypes, setIsResizingTypes] = useState(false);
  const [isResizingIds, setIsResizingIds] = useState(false);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizingTypes) {
        const newWidth = Math.max(MIN_COLUMN_WIDTH, e.clientX);
        setStateTypesWidth(newWidth);
      } else if (isResizingIds) {
        const newWidth = Math.max(
          MIN_COLUMN_WIDTH,
          e.clientX - stateTypesWidth
        );
        setStateIdsWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizingTypes(false);
      setIsResizingIds(false);
    };

    if (isResizingTypes || isResizingIds) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      return () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isResizingTypes, isResizingIds, stateTypesWidth]);

  // Handle browser back/forward navigation; it should go back to the
  // previous/next selection of state type and state ID.
  useEffect(() => {
    const handlePopState = () => {
      const newState = getInitialStateFromURL();
      setSelectedStateType(newState.stateType);
      setSelectedStateId(newState.stateId);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const updateURL = (stateType: string | null, stateId: string | null) => {
    let newPath = "/__/inspect/states";
    if (stateType) {
      newPath += `/${encodeURIComponent(stateType)}`;
      if (stateId) {
        newPath += `/${encodeURIComponent(stateId)}`;
      }
    }
    window.history.pushState(null, "", newPath);
  };

  const handleStateTypeSelect = (stateType: string) => {
    setSelectedStateType(stateType);
    setSelectedStateId(null); // Reset state ID selection.
    updateURL(stateType, null);
  };

  const handleStateIdSelect = (stateId: string) => {
    setSelectedStateId(stateId);
    updateURL(selectedStateType, stateId);
  };

  return (
    <div
      className="states-inspector"
      style={{
        cursor: isResizingTypes || isResizingIds ? "col-resize" : "default",
      }}
    >
      {/* "State Types" column. */}
      <StateTypesColumn
        selectedStateType={selectedStateType}
        onStateTypeSelect={handleStateTypeSelect}
        width={stateTypesWidth}
      />
      <div
        className="resize-handle"
        onMouseDown={(e: React.MouseEvent) => {
          e.preventDefault();
          setIsResizingTypes(true);
        }}
      />

      {/* "State IDs" column (filled if a state type is selected). */}
      {selectedStateType ? (
        <StateIdsColumn
          stateType={selectedStateType}
          selectedStateId={selectedStateId}
          onStateIdSelect={handleStateIdSelect}
          width={stateIdsWidth}
        />
      ) : (
        <div
          className="states-column state-ids-column"
          style={{ width: `${stateIdsWidth}px` }}
        >
          <h3 className="column-header">State IDs</h3>
          <div className="column-content">
            <div className="empty-state">
              Select a state type to view state IDs
            </div>
          </div>
        </div>
      )}
      <div
        className="resize-handle"
        onMouseDown={(e: React.MouseEvent) => {
          e.preventDefault();
          setIsResizingIds(true);
        }}
      />

      {/* "State Data" column (filled if a state ID is selected). */}
      {selectedStateType && selectedStateId ? (
        <StateDataColumn
          stateType={selectedStateType}
          stateId={selectedStateId}
        />
      ) : (
        <div className="states-column state-data-column">
          <h3 className="column-header">Data</h3>
          <div className="column-content">
            <div className="empty-state">
              Select a state type and state ID to view data
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
