import { FC, useEffect, useRef, useState } from "react";
import Moveable from "react-moveable";
import { useFig } from "./api/fig/v1/fig_rbt_react";

const Fig: FC<{ id: string; userId: string }> = ({ id, userId }) => {
  const fig = useFig({ id });

  const { response } = fig.useGetPosition();

  const active = response?.position?.userIdActive == userId || false;

  const unlocking = useRef<Promise<void> | undefined>(undefined);

  const [isHovering, setIsHovering] = useState(false);

  useEffect(() => {
    const onKeyDown = async (e) => {
      if (!active && e.key === "l" && isHovering) {
        await fig.lock({ userId });
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [fig, active, isHovering]);

  const targetRef = useRef<HTMLDivElement>(null);
  const moveableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (active) return;

    if (targetRef.current && response !== undefined) {
      targetRef.current.style.width = `${response.position!.width}px`;
      targetRef.current.style.height = `${response.position!.height}px`;
      targetRef.current.style.transform = `translate(${
        response.position!.top
      }px, ${response.position!.left}px) rotate(${
        response.position!.rotation
      }deg)`;

      if (moveableRef.current) {
        moveableRef.current.updateRect();
      }
    }
  }, [response, active, targetRef]);

  const onStart = async (_) => {
    if (!active || unlocking.current) {
      // We need to wait until we've called unlock to protect against
      // users "unclicking" and then "clicking" again right away.
      if (unlocking.current) await unlocking.current;
      await fig.lock({ userId });
    }
  };

  const onEnd = (_) => {
    if (active) {
      unlocking.current = new Promise<void>(async (resolve, reject) => {
        while (active) {
          const { response } = await fig.unlock({ userId });
          if (response) {
            resolve();
            break;
          }
        }
      });
    }
  };

  const onDrag = (e: any) => {
    if (!active) return;

    e.target.style.transform = e.transform;

    const [top, left] = e.beforeTranslate;

    fig.updatePosition({
      newFigState: {
        height: e.height,
        width: e.width,
        top,
        left,
        rotation: response.position?.rotation,
      },
      userId,
    });
  };

  const onResize = (e: any) => {
    if (!active) return;

    e.target.style.width = `${e.width}px`;
    e.target.style.height = `${e.height}px`;
    e.target.style.transform = e.drag.transform;

    const [top, left] = e.drag.beforeTranslate;

    fig.updatePosition({
      newFigState: {
        height: e.height,
        width: e.width,
        top,
        left,
        rotation: response.position?.rotation,
      },
      userId,
    });
  };

  const onRotate = (e: any) => {
    if (!active) return;

    e.target.style.transform = e.drag.transform;

    const [top, left] = e.drag.beforeTranslate;

    fig.updatePosition({
      newFigState: {
        height: response.position?.height,
        width: response.position?.width,
        top,
        left,
        rotation: Math.round(e.rotation),
      },
      userId,
    });
  };

  if (response === undefined) return <></>;

  return (
    <>
      <div
        className="absolute target"
        ref={targetRef}
        onMouseOver={() => setIsHovering(true)}
        onMouseOut={() => setIsHovering(false)}
        style={{
          maxWidth: "auto",
          maxHeight: "auto",
          minWidth: "auto",
          minHeight: "auto",
        }}
      >
        {response.position?.userIdActive !== "" && (
          <div className="absolute">🔒</div>
        )}
        <img
          className="relative object-contain h-full w-full"
          src="https://cdn-icons-png.flaticon.com/512/4055/4055142.png"
          alt="A fig"
        />
      </div>
      <Moveable
        ref={moveableRef}
        target={targetRef}
        container={null}
        draggable={true}
        resizable={true}
        rotatable={true}
        keepRatio={false}
        rotationPosition={"top"}
        throttleDrag={1}
        edgeDraggable={false}
        startDragRotate={0}
        throttleDragRotate={0}
        renderDirections={["nw", "n", "ne", "w", "e", "sw", "s", "se"]}
        onRotateStart={onStart}
        onRotateEnd={onEnd}
        onRotate={onRotate}
        onResizeStart={onStart}
        onResizeEnd={onEnd}
        onResize={onResize}
        onDragStart={onStart}
        onDragEnd={onEnd}
        onDrag={onDrag}
      />
    </>
  );
};

export default Fig;
