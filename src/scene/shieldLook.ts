import { AdditiveBlending, Color, ShaderMaterial } from 'three'

/**
 * Shield look (art pass, 2026-11, user's pick): a soft glowing bubble — clear in
 * the middle, blue glow at the rim (fresnel), gently pulsing. One draw call, the
 * same for every character.
 */
const BLUE = '#3f9bff'

/** Fresnel rim glow: transparent facing the camera, glowing at the silhouette. */
export function makeBubbleMaterial() {
  return new ShaderMaterial({
    uniforms: {
      uColor: { value: new Color(BLUE).multiplyScalar(1.8) },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uTime;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float rim = 1.0 - abs(dot(normalize(vNormal), normalize(vView)));
        float glow = pow(rim, 2.6) * (0.85 + 0.15 * sin(uTime * 4.0)) + 0.04;
        gl_FragColor = vec4(uColor * glow, glow);
      }`,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
  })
}
