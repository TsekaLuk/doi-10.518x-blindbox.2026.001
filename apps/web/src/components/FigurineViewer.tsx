import { OrbitControls, useGLTF } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { API_ROUTES } from "@vibe/shared";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";

/**
 * "养成手办" bonus feature: 2D persona portrait -> rotatable 3D figurine via
 * the server's Tripo 3D-generation proxy.
 *
 * KNOWN LIMITATION (flagged for integration/server decision): DashScope's
 * Tripo API requires a fetchable https URL for the source image. If the only
 * portrait available to the caller is a `data:` URI (as produced today by
 * ai.generateImage / the persona portrait flow), POST /api/ai/3d will not be
 * able to fetch it. This hook does not attempt to work around that — it POSTs
 * whatever imageUrl it is given, assuming the caller has already resolved it
 * to a real https URL. If in practice only a data URI exists, either (a) the
 * server should be extended to accept a base64 payload for this endpoint and
 * re-host/proxy it as a temporary https-accessible file, or (b) the client
 * should skip offering this feature until an https portrait URL exists.
 */

const baseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:8787";
const url = (p: string) => new URL(p, baseUrl).toString();

const POLL_INTERVAL_MS = 5000;
const MAX_POLL_ATTEMPTS = 24; // ~2 minutes at 5s intervals

export type Tripo3DStatus = "idle" | "submitting" | "processing" | "ready" | "error" | "timeout";

interface CreateTaskResponse {
  taskId: string;
}

interface PollTaskResponse {
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELED" | "UNKNOWN";
  glbUrl?: string;
  previewUrl?: string;
}

export function useTripo3D(imageUrl: string | undefined): {
  status: Tripo3DStatus;
  glbUrl?: string;
  previewUrl?: string;
  errorMessage?: string;
  start(): void;
} {
  const [status, setStatus] = useState<Tripo3DStatus>("idle");
  const [glbUrl, setGlbUrl] = useState<string | undefined>(undefined);
  const [previewUrl, setPreviewUrl] = useState<string | undefined>(undefined);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const inFlightRef = useRef(false);
  const cancelledRef = useRef(false);

  useEffect(
    () => () => {
      cancelledRef.current = true;
    },
    [],
  );

  const start = useCallback(() => {
    if (!imageUrl || inFlightRef.current) return;
    inFlightRef.current = true;
    cancelledRef.current = false;
    setStatus("submitting");
    setErrorMessage(undefined);
    setGlbUrl(undefined);
    setPreviewUrl(undefined);

    (async () => {
      try {
        const res = await fetch(url(API_ROUTES.ai3d), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ imageUrl }),
        });
        if (!res.ok) throw new Error(`3D generation request failed: ${res.status}`);
        const { taskId } = (await res.json()) as CreateTaskResponse;

        if (cancelledRef.current) return;
        setStatus("processing");

        for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
          if (attempt > 0) {
            await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
          }
          if (cancelledRef.current) return;

          const pollRes = await fetch(url(`${API_ROUTES.ai3d}/${taskId}`));
          if (!pollRes.ok) throw new Error(`3D generation poll failed: ${pollRes.status}`);
          const poll = (await pollRes.json()) as PollTaskResponse;

          if (poll.status === "SUCCEEDED") {
            if (cancelledRef.current) return;
            setGlbUrl(poll.glbUrl);
            setPreviewUrl(poll.previewUrl);
            setStatus("ready");
            return;
          }
          if (poll.status === "FAILED" || poll.status === "CANCELED") {
            if (cancelledRef.current) return;
            setErrorMessage(`3D generation ${poll.status.toLowerCase()}`);
            setStatus("error");
            return;
          }
          // PENDING / RUNNING / UNKNOWN -> keep polling.
        }

        if (!cancelledRef.current) {
          setStatus("timeout");
          setErrorMessage("3D generation timed out after ~2 minutes");
        }
      } catch (err) {
        if (!cancelledRef.current) {
          setErrorMessage(err instanceof Error ? err.message : "3D generation failed");
          setStatus("error");
        }
      } finally {
        inFlightRef.current = false;
      }
    })();
  }, [imageUrl]);

  return { status, glbUrl, previewUrl, errorMessage, start };
}

function FigurineModel({ glbUrl }: { glbUrl: string }) {
  const { scene } = useGLTF(glbUrl);
  return <primitive object={scene} />;
}

export function FigurineViewer({ glbUrl, className }: { glbUrl: string; className?: string }) {
  return (
    <Canvas
      className={className}
      camera={{ position: [0, 1.2, 3], fov: 45 }}
      style={{ background: "#f6f3e2" }}
    >
      <color attach="background" args={["#f6f3e2"]} />
      <ambientLight intensity={0.75} />
      <directionalLight position={[3, 5, 2]} intensity={1.2} />
      <directionalLight position={[-3, 2, -2]} intensity={0.4} />
      <Suspense fallback={null}>
        <FigurineModel glbUrl={glbUrl} />
      </Suspense>
      <OrbitControls autoRotate makeDefault />
    </Canvas>
  );
}
