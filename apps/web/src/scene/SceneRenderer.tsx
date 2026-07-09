import { Environment, OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import type { Geometry, Material, SceneGraph, SceneNode } from "@vibe/scene";
import { useCallback } from "react";
import type * as THREE from "three";
import { registerNode } from "./registry";

/**
 * Three.js is only a renderer: this component is a pure function of the
 * SceneGraph JSON. Swapping to WebGPU, exporting, or syncing collaborators
 * all happen at the data layer, not here.
 */

function GeometryEl({ g }: { g: Geometry }) {
  switch (g.kind) {
    case "box":
      return <boxGeometry args={g.size} />;
    case "sphere":
      return <sphereGeometry args={[g.radius, 48, 48]} />;
    case "plane":
      return <planeGeometry args={[g.width, g.height]} />;
    case "torusKnot":
      return <torusKnotGeometry args={[g.radius, g.tube, 220, 32]} />;
    case "cylinder":
      return <cylinderGeometry args={[g.radiusTop, g.radiusBottom, g.height, 48]} />;
    default:
      // gltf/text arrive with the Asset Pipeline; render a placeholder box.
      return <boxGeometry args={[0.5, 0.5, 0.5]} />;
  }
}

function MaterialEl({ m }: { m: Material }) {
  const common = {
    color: m.color,
    transparent: m.opacity < 1,
    opacity: m.opacity,
    wireframe: m.wireframe,
  };
  switch (m.kind) {
    case "basic":
      return <meshBasicMaterial {...common} />;
    case "physical":
      return (
        <meshPhysicalMaterial
          {...common}
          metalness={m.metalness}
          roughness={m.roughness}
          emissive={m.emissive ?? "#000000"}
        />
      );
    // "shader" resolves through the shader registry (src/scene/shaders) — reserved.
    default:
      return (
        <meshStandardMaterial
          {...common}
          metalness={m.metalness}
          roughness={m.roughness}
          emissive={m.emissive ?? "#000000"}
        />
      );
  }
}

function Node({ node }: { node: SceneNode }) {
  const ref = useCallback((obj: THREE.Object3D | null) => registerNode(node, obj), [node]);
  const t = node.transform;
  const common = {
    ref,
    position: t?.position,
    rotation: t?.rotation,
    scale: t?.scale,
    visible: node.visible ?? true,
  };
  const children = node.children?.map((c) => <Node key={c.id} node={c} />);

  if (node.type === "light" && node.light) {
    const l = node.light;
    if (l.kind === "ambient") return <ambientLight intensity={l.intensity} color={l.color} />;
    if (l.kind === "directional")
      return <directionalLight {...common} intensity={l.intensity} color={l.color} castShadow />;
    return <pointLight {...common} intensity={l.intensity} color={l.color} />;
  }

  if (node.type === "mesh" && node.geometry) {
    return (
      <mesh {...common} castShadow receiveShadow>
        <GeometryEl g={node.geometry} />
        <MaterialEl m={node.material ?? { kind: "standard", color: "#ffffff", metalness: 0.2, roughness: 0.4, opacity: 1, wireframe: false }} />
        {children}
      </mesh>
    );
  }

  return <group {...common}>{children}</group>;
}

export function SceneRenderer({ scene }: { scene: SceneGraph }) {
  return (
    <Canvas
      shadows
      camera={{ position: scene.camera.position, fov: scene.camera.fov }}
      style={{ background: scene.environment.background }}
    >
      {scene.environment.environmentPreset ? (
        <Environment preset={scene.environment.environmentPreset as never} />
      ) : null}
      {scene.nodes.map((n) => (
        <Node key={n.id} node={n} />
      ))}
      <OrbitControls makeDefault target={scene.camera.lookAt} />
    </Canvas>
  );
}
