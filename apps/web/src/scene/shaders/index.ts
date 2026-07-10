/**
 * Shader registry: shaderId -> GLSL source + default uniforms.
 * Consumed by SceneRenderer's "shader" material case. Uniform values here use
 * the same JSON-safe shapes as SceneNode.material.uniforms (number | vec3 | hex
 * string) so a shader can be fully parameterized from scene-graph JSON.
 */

export interface ShaderDef {
  vertexShader: string;
  fragmentShader: string;
  /** hex color strings, plain numbers, or [x,y,z] tuples — merged under SceneNode.material.uniforms. */
  defaultUniforms: Record<string, number | [number, number, number] | string>;
}

const VERTEX_PASSTHROUGH = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/**
 * Light mesh-gradient — "living paper". Warm near-white base with five big,
 * soft pastel washes (pink / lilac / blue / light-green / a whisper of orange)
 * drifting on their own very slow orbits (30-60s cycles), shaders.com
 * aurora/mesh style. Each blob color is pre-softened toward the base in GLSL
 * so the field stays airy, and the edges relax toward clean paper so
 * near-black editorial text stays comfortable everywhere. No grain: per-pixel
 * noise shimmered on mediump GPUs (the "flicker" bug) and the soft pastel
 * field doesn't band visibly without it.
 *
 * NOTE ON COORDS: the backdrop plane (70x70, z=-12) is mostly cropped by the
 * camera — only roughly the central quarter of UV space is visible. `q` below
 * rescales UV so the visible window maps to about [-1, 1].
 */
const AMBIENT_FLOW: ShaderDef = {
  vertexShader: VERTEX_PASSTHROUGH,
  fragmentShader: /* glsl */ `
    uniform float uTime;
    uniform vec3 uBase;
    uniform vec3 uColor1;
    uniform vec3 uColor2;
    uniform vec3 uColor3;
    uniform vec3 uColor4;
    uniform vec3 uColor5;
    varying vec2 vUv;

    // Gaussian-ish wash around a drifting center.
    float blob(vec2 q, vec2 center, float radius) {
      float d = length(q - center);
      return exp(-(d * d) / (2.0 * radius * radius));
    }

    void main() {
      // Rescale so the camera-visible window is roughly q in [-1,1]^2.
      vec2 q = (vUv - 0.5) * vec2(4.7, 8.3);
      float t = uTime;

      vec3 col = uBase;

      // Pre-soften each hue toward the base so washes stay pastel, never neon.
      vec3 c1 = mix(uColor1, uBase, 0.30); // pink
      vec3 c2 = mix(uColor2, uBase, 0.35); // lilac
      vec3 c3 = mix(uColor3, uBase, 0.50); // blue (strong hue, soften more)
      vec3 c4 = mix(uColor4, uBase, 0.30); // light green
      vec3 c5 = mix(uColor5, uBase, 0.72); // orange whisper

      // Five big washes, each on its own slow elliptical drift (~35-60s loops).
      vec2 p1 = vec2(-0.85, 0.55) + 0.45 * vec2(sin(t * 0.110), cos(t * 0.089));
      vec2 p2 = vec2(0.95, -0.35) + 0.50 * vec2(sin(t * 0.083 + 2.1), cos(t * 0.127 + 0.6));
      vec2 p3 = vec2(0.55, 0.95) + 0.40 * vec2(sin(t * 0.147 + 4.2), cos(t * 0.071 + 3.3));
      vec2 p4 = vec2(-0.75, -0.85) + 0.45 * vec2(sin(t * 0.095 + 1.2), cos(t * 0.104 + 5.1));
      vec2 p5 = vec2(0.05, 0.05) + 0.65 * vec2(sin(t * 0.061 + 3.7), cos(t * 0.118 + 1.9));

      col = mix(col, c1, blob(q, p1, 0.95) * 0.85);
      col = mix(col, c2, blob(q, p2, 1.05) * 0.80);
      col = mix(col, c3, blob(q, p3, 0.85) * 0.75);
      col = mix(col, c4, blob(q, p4, 1.00) * 0.80);
      col = mix(col, c5, blob(q, p5, 1.25) * 0.55);

      // Edges drift back toward clean paper so the column margins stay calm.
      float edge = smoothstep(0.55, 1.45, length(q * vec2(1.0, 0.62)));
      col = mix(col, uBase, edge * 0.65);

      // Keep the whole field light enough for near-black text everywhere —
      // smooth lift instead of a hard max() clamp (hard plateaus shimmer as
      // their edges crawl with the drifting blobs).
      vec3 floorCol = vec3(0.82, 0.82, 0.78);
      col = mix(col, max(col, floorCol), smoothstep(0.9, 0.6, dot(col, vec3(0.333))));

      gl_FragColor = vec4(col, 1.0);
    }
  `,
  defaultUniforms: {
    uBase: "#fffef5",
    uColor1: "#fec5fb", // pink
    uColor2: "#9d95ff", // lilac
    uColor3: "#00bae2", // blue
    uColor4: "#abff84", // light green
    uColor5: "#ff8709", // orangey whisper
  },
};

export const shaderRegistry: Record<string, ShaderDef> = {
  "ambient-flow": AMBIENT_FLOW,
};

export function getShader(shaderId: string | undefined): ShaderDef {
  if (shaderId && shaderRegistry[shaderId]) return shaderRegistry[shaderId];
  return AMBIENT_FLOW;
}
