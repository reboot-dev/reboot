import { Timestamp } from "@bufbuild/protobuf";
import { useRebootClient } from "@reboot-dev/reboot-react";
import { grpcInfiniteStream } from "@reboot-dev/reboot-web";
import React, { useEffect, useState } from "react";
import {
  CancelTaskRequest,
  CancelTaskResponse,
  CancelTaskResponse_Status,
  ListTasksRequest,
  ListTasksResponse,
  TaskInfo,
  TaskInfo_Status,
} from "../../rbt/v1alpha1/tasks_pb";
import { useAdminAuthContext } from "./admin_auth";
import { CopyIcon } from "./icons";
import "./tasks.css";

const getJsDateFromTimestamp = (
  timestamp: string | Timestamp | undefined
): Date => {
  if (!timestamp) {
    return new Date();
  }
  return typeof timestamp === "string"
    ? new Date(timestamp)
    : new Date(
        Number(timestamp.seconds || 0) * 1000 +
          Number(timestamp.nanos || 0) / 1_000_000
      );
};

function useListTasksStream() {
  const [response, setResponse] = useState<ListTasksResponse>();

  const rebootClient = useRebootClient();
  const adminAuthContext = useAdminAuthContext();

  useEffect(() => {
    const abortController = new AbortController();

    (async () => {
      const headers = new Headers();
      headers.set("Content-Type", "application/json");
      headers.append("Connection", "keep-alive");
      headers.set("Authorization", `Bearer ${adminAuthContext.adminToken}`);

      const responses = grpcInfiniteStream({
        endpoint: `${rebootClient.url}/rbt.v1alpha1.Tasks/ListTasksStream`,
        method: "POST",
        headers,
        request: new ListTasksRequest(),
        responseType: ListTasksResponse,
        signal: abortController.signal,
      });

      for await (const { response, status } of responses) {
        if (response !== undefined) {
          setResponse(response);
        } else if (status !== undefined) {
          console.warn(`Error with gRPC status: ${JSON.stringify(status)}`);
          // TODO: handle error
        }
      }
    })();

    return () => {
      abortController.abort();
    };
  }, [rebootClient]);

  return {
    response,
  };
}

function toHexString(bytesOrBase64: Uint8Array | string): string {
  if (!bytesOrBase64) return "";
  let bytes: Uint8Array;
  if (typeof bytesOrBase64 === "string") {
    // Handle base64-encoded strings.
    const binaryString = atob(bytesOrBase64);
    bytes = Uint8Array.from(binaryString, (c) => c.charCodeAt(0));
  } else {
    bytes = bytesOrBase64;
  }
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    ""
  );
}

function stateNameForTask(stateType: string, stateId: string) {
  return `${stateType}('${stateId}')`;
}

function stateInfoFromTask(task: TaskInfo) {
  const stateType = task.taskId.stateType;
  const stateRef = task.taskId.stateRef;

  // stateRef is formatted as "TypeName:ID". We want to extract just the
  // ID part.
  const colonIndex = stateRef.lastIndexOf(":");
  const stateId = stateRef.substring(colonIndex + 1);

  return { stateType, stateId };
}

const StateNameLink = ({ task }: { task: TaskInfo }) => {
  const { stateType, stateId } = stateInfoFromTask(task);
  const stateName = stateNameForTask(stateType, stateId);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    // Navigate to the states inspector with the specific state type and ID.
    const newPath = `/__/inspect/states/${encodeURIComponent(
      stateType
    )}/${encodeURIComponent(stateId)}`;
    window.history.pushState(null, "", newPath);
    // Trigger a popstate event to update the current tab if needed.
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  if (!stateType || !stateId) {
    // If we can't extract state info, just show as text.
    return <>{stateName}</>;
  }

  return (
    <a
      href={`/__/inspect/states/${encodeURIComponent(
        stateType
      )}/${encodeURIComponent(stateId)}`}
      onClick={handleClick}
      style={{
        color: "inherit",
        textDecoration: "underline",
        cursor: "pointer",
      }}
      title={`View state: ${stateName}`}
    >
      {stateName}
    </a>
  );
};

const HumanReadableTimestamp = ({
  timestamp,
  past,
}: {
  timestamp: string | Timestamp | undefined;
  past: boolean;
}) => {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    // Update the current time every 200 milliseconds to keep the display
    // accurate.
    const timerId = setInterval(() => setCurrentTime(new Date()), 200);
    return () => clearInterval(timerId);
  }, []);

  if (!timestamp) {
    return <>N/A</>;
  }

  // The timestamp can be an ISO string or a protobuf Timestamp object.
  const date = getJsDateFromTimestamp(timestamp);

  if (isNaN(date.getTime())) {
    return <>N/A</>;
  }

  const diffSeconds = Math.floor(
    (date.getTime() - currentTime.getTime()) / 1000
  );
  // If an expected time has arrived, we show "now". However, if a past
  // time is so recent as to be within 2 seconds, we show "just now".
  if (diffSeconds == 0.0 && !past) {
    return <>now</>;
  }
  if (diffSeconds <= 0.0 && diffSeconds > -2.0) {
    return <>just now</>;
  }

  const isPast = diffSeconds < 0;
  const absDiffSeconds = Math.abs(diffSeconds);

  let value: number;
  let unit: string;

  if (absDiffSeconds < 60) {
    value = absDiffSeconds;
    unit = "second";
  } else if (absDiffSeconds < 3600) {
    value = Math.floor(absDiffSeconds / 60);
    unit = "minute";
  } else if (absDiffSeconds < 86400) {
    value = Math.floor(absDiffSeconds / 3600);
    unit = "hour";
  } else {
    value = Math.floor(absDiffSeconds / 86400);
    unit = "day";
  }

  if (value !== 1) {
    unit += "s";
  }

  if (isPast) {
    return <>{`${value} ${unit} ago`}</>;
  } else {
    return <>{`in ${value} ${unit}`}</>;
  }
};

const CopyableCell = ({ text }: { text: string }) => {
  const handleCopy = (e: React.MouseEvent<HTMLButtonElement>) => {
    navigator.clipboard.writeText(text);
    const button = e.currentTarget;
    const originalText = button.innerText;
    button.innerText = "✓";
    setTimeout(() => {
      button.innerText = originalText;
    }, 1500);
  };

  return (
    <div className="copyable-cell">
      <span className="copyable-text" title={text}>
        {text}
      </span>
      <button onClick={handleCopy} className="copy-button" title="Copy ID">
        <CopyIcon />
      </button>
    </div>
  );
};

function CancelButton({ task }: { task: TaskInfo }) {
  const rebootClient = useRebootClient();
  const adminAuthContext = useAdminAuthContext();
  const [isCancelling, setIsCancelling] = useState(false);

  const cancellableStatuses = [
    TaskInfo_Status.STARTED,
    TaskInfo_Status.SCHEDULED,
    TaskInfo_Status.SCHEDULED_ITERATION,
    TaskInfo_Status.SCHEDULED_RETRY,
  ];

  if (!cancellableStatuses.includes(task.status)) {
    return null; // Don't show button for non-cancellable tasks
  }

  const handleCancel = async () => {
    if (!task.taskId) {
      console.error("Task ID is missing for cancellation.");
      return;
    }

    setIsCancelling(true);

    try {
      const headers = new Headers();
      headers.set("Content-Type", "application/json");
      if (adminAuthContext.adminToken) {
        headers.set("Authorization", `Bearer ${adminAuthContext.adminToken}`);
      }
      headers.set("x-reboot-state-ref", task.taskId.stateRef);

      const request = new CancelTaskRequest({
        taskId: task.taskId,
      });

      const response = await fetch(
        `${rebootClient.url}/rbt.v1alpha1.Tasks/CancelTask`,
        {
          method: "POST",
          headers,
          body: request.toJsonString(),
        }
      );

      if (response.ok) {
        const cancelResponse = CancelTaskResponse.fromJson(
          await response.json()
        );
        if (cancelResponse.status !== CancelTaskResponse_Status.OK) {
          console.warn(
            `Failed to cancel task with status: ${
              CancelTaskResponse_Status[cancelResponse.status]
            }`
          );
        }
        // The UI should update from the `ListTasksStream` stream automatically.
      } else {
        const status = await response.json();
        console.error("Failed to cancel task:", status);
      }
    } catch (error) {
      console.error("Error during task cancellation:", error);
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <button
      onClick={handleCancel}
      disabled={isCancelling}
      className="cancel-button"
    >
      {isCancelling ? "..." : "Cancel"}
    </button>
  );
}

export function TasksInspector() {
  const { response } = useListTasksStream();

  if (response === undefined) {
    return <p style={{ color: "white" }}>Loading ...</p>;
  }

  const tasks = response.tasks;

  if (tasks.length === 0) {
    return (
      <div style={{ textAlign: "center", color: "white", marginTop: "20px" }}>
        No tasks found.
      </div>
    );
  }

  // Sort tasks: COMPLETED/CANCELLED last, then by stateNameForTask, method, taskUuid.
  const sortedTasks = [...tasks].sort((a, b) => {
    const isACompletedOrCancelled =
      a.status === TaskInfo_Status.COMPLETED ||
      a.status === TaskInfo_Status.CANCELLED;
    const isBCompletedOrCancelled =
      b.status === TaskInfo_Status.COMPLETED ||
      b.status === TaskInfo_Status.CANCELLED;

    if (isACompletedOrCancelled && !isBCompletedOrCancelled) return 1;
    if (!isACompletedOrCancelled && isBCompletedOrCancelled) return -1;

    if (isACompletedOrCancelled && isBCompletedOrCancelled) {
      // If both are completed or cancelled, sort by the time they
      // finished, with the most recent first.
      const dateA = new Date(a.occurredAt);
      const dateB = new Date(b.occurredAt);
      if (dateA > dateB) return -1;
      if (dateA < dateB) return 1;
      // If they finished at the same time, sort by taskId.
      if (a.taskId?.taskUuid < b.taskId?.taskUuid) return -1;
      if (a.taskId?.taskUuid > b.taskId?.taskUuid) return 1;
      return 0; // They are equal in this case.
    }

    const { stateType: stateTypeNameA, stateId: stateIdA } =
      stateInfoFromTask(a);
    const { stateType: stateTypeNameB, stateId: stateIdB } =
      stateInfoFromTask(b);
    if (stateTypeNameA < stateTypeNameB) return -1;
    if (stateTypeNameA > stateTypeNameB) return 1;
    if (stateIdA < stateIdB) return -1;
    if (stateIdA > stateIdB) return 1;

    if (a.method < b.method) return -1;
    if (a.method > b.method) return 1;

    const uuidA = toHexString(a.taskId?.taskUuid ?? "");
    const uuidB = toHexString(b.taskId?.taskUuid ?? "");
    if (uuidA < uuidB) return -1;
    if (uuidA > uuidB) return 1;

    return 0;
  });

  const completedTasks = sortedTasks.filter(
    (task) => task.status === TaskInfo_Status.COMPLETED
  );

  let earliestCompletedTaskTimestamp = new Date();
  if (completedTasks.length > 0) {
    earliestCompletedTaskTimestamp = completedTasks.reduce((earliest, task) => {
      const taskDate = getJsDateFromTimestamp(task.occurredAt);
      return taskDate < earliest ? taskDate : earliest;
    }, getJsDateFromTimestamp(completedTasks[0].occurredAt));
  }

  return (
    <>
      <table className="tasks-table">
        <thead>
          <tr>
            <th className="task-id-col">Task ID</th>
            <th>On</th>
            <th>Method</th>
            <th className="status-col">Status</th>
            <th className="when-col">When</th>
            <th className="scheduled-col">Scheduled</th>
            <th className="iterations-col">Iterations</th>
            <th className="failures-col">Failures</th>
            <th className="cancel-col"></th>
          </tr>
        </thead>
        <tbody>
          {sortedTasks.map((task, index) => {
            // The `iterations` field can take the form "123n"; we need
            // to drop the textual suffix.
            const iterations = Number(
              task.iterations?.toString().replace(/[^0-9]/g, "") || 0
            );
            return (
              <tr key={index}>
                <td className="task-id-col">
                  <CopyableCell text={toHexString(task.taskId?.taskUuid)} />
                </td>
                <td>
                  <StateNameLink task={task} />
                </td>
                <td>{task.method}</td>
                <td className="status-col">{TaskInfo_Status[task.status]}</td>
                <td className="when-col">
                  <HumanReadableTimestamp
                    timestamp={task.occurredAt}
                    past={true}
                  />
                </td>
                <td className="scheduled-col">
                  {task.status === TaskInfo_Status.SCHEDULED ||
                  task.status === TaskInfo_Status.SCHEDULED_RETRY ||
                  task.status === TaskInfo_Status.SCHEDULED_ITERATION ? (
                    <HumanReadableTimestamp
                      timestamp={task.scheduledAt}
                      past={false}
                    />
                  ) : (
                    "N/A"
                  )}
                </td>
                <td className="iterations-col">
                  {iterations > 0 ? iterations : "N/A"}
                </td>
                <td className="failures-col">{`${
                  task.numRunsFailedRecently || 0
                } or more`}</td>
                <td className="cancel-col">
                  <CancelButton task={task} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="omitted-tasks-warning">
        NOTE: omitted all tasks that finished before{" "}
        {earliestCompletedTaskTimestamp
          .toISOString()
          .slice(0, 16)
          .replace("T", " ")}
        .
      </p>
    </>
  );
}
