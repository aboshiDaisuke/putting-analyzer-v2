/**
 * 3D パッティンググリーン（Web / three.js）。
 *
 * - グリーンは「手前（カメラ側）に向かって下っている1枚の仮想グリーン」。
 *   上りのパットはカップの手前、下りは奥、左に曲がるラインはカップの右側に置かれる（lib/putting-stats の greenPoints）。
 * - 芝目の縞・等高線・距離リングはシェーダーで描く（テクスチャ画像なし）。
 * - hero: ボールが曲がりながら転がってカップイン（ループ）。map: 1st パットの位置を結果で色分け。
 * - ドラッグで回転、タップで選択。画面外では描画を止め、prefers-reduced-motion では自動回転・演出を止める。
 * - three は動的 import（初回表示のバンドルを軽くする）。
 */
import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import type * as THREE_NS from "three";

import type { GreenPoint } from "@/lib/putting-stats";
import {
  MAX_RADIUS_M,
  OUTCOME_COLOR,
  RING_METERS,
  STAGE,
  pointXZ,
  type GreenSceneProps,
  type Outcome,
} from "./green-types";

type Three = typeof THREE_NS;

// 地形: 手前へ一様に下る + ゆるいうねり（単位 m）
const SLOPE = 0.045;
function heightAt(x: number, z: number): number {
  return -SLOPE * z + 0.18 * Math.sin(0.21 * x + 0.6) * Math.cos(0.17 * z - 0.3) + 0.08 * Math.sin(0.11 * (x + z));
}

const GREEN_VERT = /* glsl */ `
  uniform float uSlope;
  varying vec3 vPos;
  varying float vH;
  float heightAt(vec2 p) {
    return -uSlope * p.y + 0.18 * sin(0.21 * p.x + 0.6) * cos(0.17 * p.y - 0.3) + 0.08 * sin(0.11 * (p.x + p.y));
  }
  void main() {
    vec3 p = position;
    // PlaneGeometry は XY 平面。X→x、Y→-z として寝かせる
    vec2 g = vec2(p.x, -p.y);
    float h = heightAt(g);
    vPos = vec3(g.x, h, g.y);
    vH = h;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(g.x, h, g.y, 1.0);
  }
`;

const GREEN_FRAG = /* glsl */ `
  uniform vec3 uGrass;
  uniform vec3 uGrassLight;
  uniform vec3 uFringe;
  uniform vec3 uRing;
  uniform vec3 uBg;
  uniform float uRadius;
  uniform float uShowRings;
  uniform float uTime;
  varying vec3 vPos;
  varying float vH;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float ringLine(float r, float target, float w) {
    return 1.0 - smoothstep(0.0, w, abs(r - target));
  }

  void main() {
    float r = length(vPos.xz);
    // 刈り込みの縞（斜め 3m 幅）
    float stripe = step(0.5, fract((vPos.x * 0.7 + vPos.z * 0.7) / 3.0));
    vec3 col = mix(uGrass, uGrassLight, stripe * 0.55);
    // 芝の細かいムラ
    col *= 0.9 + 0.12 * noise(vPos.xz * 3.5) + 0.06 * noise(vPos.xz * 0.6);
    // 等高線（傾斜が読める程度に薄く）
    float c = abs(fract(vH * 6.0) - 0.5);
    col = mix(col, col * 1.18, (1.0 - smoothstep(0.0, 0.04, c)) * 0.55);
    // 距離リング 1,2,3,5,10,15m
    float rings = 0.0;
    rings = max(rings, ringLine(r, 1.0, 0.035));
    rings = max(rings, ringLine(r, 2.0, 0.04));
    rings = max(rings, ringLine(r, 3.0, 0.045));
    rings = max(rings, ringLine(r, 5.0, 0.05));
    rings = max(rings, ringLine(r, 10.0, 0.06));
    rings = max(rings, ringLine(r, 15.0, 0.07));
    col = mix(col, uRing, rings * 0.42 * uShowRings);
    // カラー（外周）と背景へのフェード
    float edge = smoothstep(uRadius - 1.6, uRadius, r);
    col = mix(col, uFringe, edge);
    float fade = smoothstep(uRadius + 0.5, uRadius + 5.0, r);
    col = mix(col, uBg, fade);
    // ビネット
    col *= 1.0 - 0.25 * smoothstep(8.0, uRadius + 4.0, r);
    gl_FragColor = vec4(col, 1.0);
  }
`;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

function makeLabelSprite(THREE: Three, text: string): THREE_NS.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.font = "700 34px -apple-system, 'Hiragino Sans', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(10,25,15,0.55)";
  ctx.beginPath();
  ctx.roundRect?.(14, 10, 100, 44, 22);
  ctx.fill();
  ctx.fillStyle = "#F3EFE4";
  ctx.fillText(text, 64, 33);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sprite.scale.set(1.5, 0.75, 1);
  sprite.renderOrder = 10;
  return sprite;
}

function shadowTexture(THREE: Three): THREE_NS.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, "rgba(0,0,0,0.55)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

type SceneApi = {
  setPoints: (points: GreenPoint[], visible: Set<Outcome>, selected: GreenPoint | null) => void;
  dispose: () => void;
};

async function createScene(
  container: HTMLDivElement,
  mode: "hero" | "map",
  onPick: (index: number | null) => void,
): Promise<SceneApi> {
  const THREE: Three = await import("three");
  const reduced = prefersReducedMotion();
  let needsRender = true;
  let disposed = false;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const canvas = renderer.domElement;
  canvas.style.display = "block";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.touchAction = "pan-y"; // 縦スクロールは妨げない
  canvas.style.cursor = mode === "map" ? "grab" : "default";
  container.appendChild(canvas);

  const scene = new THREE.Scene();
  const bg = new THREE.Color(STAGE.bgBottom);
  scene.background = bg;
  scene.fog = new THREE.Fog(bg, 26, 60);

  const camera = new THREE.PerspectiveCamera(mode === "hero" ? 32 : 36, 1, 0.1, 200);

  scene.add(new THREE.HemisphereLight(0xdff5e3, 0x0a1a10, 1.4));
  const sun = new THREE.DirectionalLight(0xfff3dc, 1.6);
  sun.position.set(-8, 14, 10);
  scene.add(sun);

  // ─── グリーン ───
  const GREEN_R = MAX_RADIUS_M + 2;
  const geo = new THREE.PlaneGeometry(GREEN_R * 2 + 14, GREEN_R * 2 + 14, 160, 160);
  const greenMat = new THREE.ShaderMaterial({
    vertexShader: GREEN_VERT,
    fragmentShader: GREEN_FRAG,
    uniforms: {
      uSlope: { value: SLOPE },
      uGrass: { value: new THREE.Color(STAGE.grass) },
      uGrassLight: { value: new THREE.Color(STAGE.grassLight) },
      uFringe: { value: new THREE.Color(STAGE.fringe) },
      uRing: { value: new THREE.Color(STAGE.ring) },
      uBg: { value: bg.clone() },
      uRadius: { value: GREEN_R },
      uShowRings: { value: mode === "map" ? 1 : 0.35 },
      uTime: { value: 0 },
    },
  });
  const green = new THREE.Mesh(geo, greenMat);
  scene.add(green);

  // ─── カップとピン ───
  const cup = new THREE.Mesh(new THREE.CircleGeometry(0.108 * 2.2, 40), new THREE.MeshBasicMaterial({ color: 0x050805 }));
  cup.rotation.x = -Math.PI / 2;
  cup.position.set(0, heightAt(0, 0) + 0.012, 0);
  scene.add(cup);
  const rim = new THREE.Mesh(new THREE.RingGeometry(0.108 * 2.2, 0.108 * 2.2 + 0.04, 40), new THREE.MeshBasicMaterial({ color: 0xf5f1e6 }));
  rim.rotation.x = -Math.PI / 2;
  rim.position.set(0, heightAt(0, 0) + 0.014, 0);
  scene.add(rim);
  const pinHeight = mode === "hero" ? 2.2 : 1.6;
  const pin = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.02, pinHeight, 8),
    new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.4, transparent: mode === "map", opacity: mode === "map" ? 0.7 : 1 }),
  );
  pin.position.set(0, heightAt(0, 0) + pinHeight / 2, 0);
  scene.add(pin);
  const flagShape = new THREE.Shape();
  flagShape.moveTo(0, 0);
  flagShape.lineTo(0.62, -0.18);
  flagShape.lineTo(0, -0.36);
  flagShape.lineTo(0, 0);
  const flag = new THREE.Mesh(
    new THREE.ShapeGeometry(flagShape),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(STAGE.one), side: THREE.DoubleSide, roughness: 0.6, transparent: mode === "map", opacity: mode === "map" ? 0.8 : 1 }),
  );
  flag.position.set(0.02, heightAt(0, 0) + pinHeight, 0);
  scene.add(flag);

  // 距離ラベル
  const labels: THREE_NS.Sprite[] = [];
  if (mode === "map") {
    for (const m of RING_METERS.filter((v) => v !== 1)) {
      const s = makeLabelSprite(THREE, `${m}m`);
      const x = m * Math.sin(-0.62);
      const z = m * Math.cos(-0.62);
      s.position.set(x, heightAt(x, z) + 0.45, z);
      scene.add(s);
      labels.push(s);
    }
  }

  // ─── ボール（map: インスタンス描画） ───
  const ballGeo = new THREE.SphereGeometry(1, 20, 14);
  const ballMat = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.0, emissive: new THREE.Color(0x111111) });
  const MAX_POINTS = 1500;
  const balls = new THREE.InstancedMesh(ballGeo, ballMat, MAX_POINTS);
  balls.count = 0;
  balls.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(balls);
  const shadowGeo = new THREE.PlaneGeometry(1, 1);
  const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTexture(THREE), transparent: true, depthWrite: false });
  const shadows = new THREE.InstancedMesh(shadowGeo, shadowMat, MAX_POINTS);
  shadows.count = 0;
  scene.add(shadows);
  const selRing = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.44, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthTest: false }));
  selRing.rotation.x = -Math.PI / 2;
  selRing.visible = false;
  selRing.renderOrder = 5;
  scene.add(selRing);
  // 選択した点からカップへの線
  const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const selLine = new THREE.Line(lineGeo, new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.3, gapSize: 0.2, transparent: true, opacity: 0.8 }));
  selLine.visible = false;
  scene.add(selLine);

  let pointIndex: number[] = []; // instance → points の index
  const BALL_R = 0.17;
  const tmp = new THREE.Object3D();
  const color = new THREE.Color();

  function setPoints(points: GreenPoint[], visible: Set<Outcome>, selected: GreenPoint | null) {
    pointIndex = [];
    let n = 0;
    points.forEach((p, i) => {
      if (!visible.has(p.outcome) || n >= MAX_POINTS) return;
      const { x, z } = pointXZ(p);
      const y = heightAt(x, z);
      tmp.position.set(x, y + BALL_R, z);
      tmp.rotation.set(0, 0, 0);
      tmp.scale.setScalar(BALL_R);
      tmp.updateMatrix();
      balls.setMatrixAt(n, tmp.matrix);
      balls.setColorAt(n, color.set(OUTCOME_COLOR[p.outcome]));
      tmp.position.set(x + 0.05, y + 0.01, z + 0.05);
      tmp.rotation.set(-Math.PI / 2, 0, 0);
      tmp.scale.setScalar(BALL_R * 3.2);
      tmp.updateMatrix();
      shadows.setMatrixAt(n, tmp.matrix);
      pointIndex.push(i);
      n++;
    });
    balls.count = n;
    shadows.count = n;
    balls.instanceMatrix.needsUpdate = true;
    shadows.instanceMatrix.needsUpdate = true;
    if (balls.instanceColor) balls.instanceColor.needsUpdate = true;

    if (selected) {
      const { x, z } = pointXZ(selected);
      selRing.position.set(x, heightAt(x, z) + 0.03, z);
      selRing.visible = true;
      const pos = lineGeo.attributes.position as THREE_NS.BufferAttribute;
      pos.setXYZ(0, x, heightAt(x, z) + 0.05, z);
      pos.setXYZ(1, 0, heightAt(0, 0) + 0.05, 0);
      pos.needsUpdate = true;
      selLine.computeLineDistances();
      selLine.visible = true;
    } else {
      selRing.visible = false;
      selLine.visible = false;
    }
    needsRender = true;
  }

  // ─── hero: 転がるボール ───
  const heroBall = new THREE.Mesh(ballGeo, new THREE.MeshStandardMaterial({ color: 0xf6f3ea, roughness: 0.3 }));
  heroBall.scale.setScalar(0.11);
  const heroShadow = new THREE.Mesh(shadowGeo, shadowMat);
  heroShadow.rotation.x = -Math.PI / 2;
  heroShadow.scale.setScalar(0.36);
  const trail = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 }));
  if (mode === "hero") {
    scene.add(heroBall, heroShadow, trail);
  }
  let heroPath: THREE_NS.QuadraticBezierCurve3 | null = null;
  let heroStart = 0;
  let heroSeed = 0;
  const HERO_ROLL = 3.6;
  const HERO_PAUSE = 1.6;
  function newHeroPath(t: number) {
    heroSeed++;
    const angle = [-0.5, 0.35, -0.2, 0.6][heroSeed % 4];
    const dist = [5.5, 7, 4.2, 6.2][heroSeed % 4];
    const sx = Math.sin(angle) * dist;
    const sz = Math.cos(angle) * dist;
    // 傾斜で下（手前 +z）側へ膨らむ曲線
    const mid = new THREE.Vector3(sx * 0.45 + (angle > 0 ? -0.9 : 0.9) * 0.4, 0, sz * 0.5 + 1.1);
    heroPath = new THREE.QuadraticBezierCurve3(new THREE.Vector3(sx, 0, sz), mid, new THREE.Vector3(0, 0, 0));
    const pts = heroPath.getPoints(60).map((p) => new THREE.Vector3(p.x, heightAt(p.x, p.z) + 0.02, p.z));
    trail.geometry.dispose();
    trail.geometry = new THREE.BufferGeometry().setFromPoints(pts);
    trail.geometry.setDrawRange(0, 0);
    heroStart = t;
  }

  // ─── カメラ ───
  let azimuth = mode === "hero" ? -0.25 : 0.0;
  let elevation = mode === "hero" ? 0.36 : 0.72;
  const distance = mode === "hero" ? 9.5 : 30;
  const target = mode === "hero" ? new THREE.Vector3(-1.7, 0.2, -0.4) : new THREE.Vector3(0, 0, 1.5);
  function placeCamera() {
    camera.position.set(
      target.x + distance * Math.cos(elevation) * Math.sin(azimuth),
      target.y + distance * Math.sin(elevation),
      target.z + distance * Math.cos(elevation) * Math.cos(azimuth),
    );
    camera.lookAt(target);
    // ラベルは常にカメラを向く（Sprite）
  }
  placeCamera();

  // ─── リサイズ ───
  function resize() {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // 縦長の画面では引きを増やして 15m のリングまで収める
    camera.zoom = mode === "map" ? Math.min(1, (w / h) * 0.82) : 1;
    camera.updateProjectionMatrix();
    needsRender = true;
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  // ─── 操作（ドラッグで回転・タップで選択） ───
  let dragging = false;
  let moved = 0;
  let lastX = 0;
  let lastY = 0;
  let lastInteraction = -Infinity;
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function onDown(e: PointerEvent) {
    dragging = true;
    moved = 0;
    lastX = e.clientX;
    lastY = e.clientY;
    if (mode === "map") canvas.style.cursor = "grabbing";
  }
  function onMove(e: PointerEvent) {
    if (!dragging) {
      if (mode === "map" && e.pointerType === "mouse") hover(e);
      return;
    }
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    moved += Math.abs(dx) + Math.abs(dy);
    lastX = e.clientX;
    lastY = e.clientY;
    azimuth -= dx * 0.008;
    if (e.pointerType === "mouse") elevation = Math.min(1.25, Math.max(0.22, elevation + dy * 0.005));
    lastInteraction = performance.now();
    placeCamera();
    needsRender = true;
  }
  function pick(e: PointerEvent): number | null {
    const rect = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObject(balls, false)[0];
    if (hit && hit.instanceId != null) return pointIndex[hit.instanceId] ?? null;
    return null;
  }
  function hover(e: PointerEvent) {
    canvas.style.cursor = pick(e) != null ? "pointer" : "grab";
  }
  function onUp(e: PointerEvent) {
    if (mode === "map") canvas.style.cursor = "grab";
    if (dragging && moved < 8 && mode === "map") onPick(pick(e));
    dragging = false;
  }
  canvas.addEventListener("pointerdown", onDown);
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);

  // ─── 画面外では止める ───
  let onScreen = true;
  const io = new IntersectionObserver((entries) => {
    onScreen = entries.some((en) => en.isIntersecting);
    if (onScreen) loop();
  });
  io.observe(container);

  // ─── 描画ループ ───
  let raf = 0;
  let running = false;
  const clock = new THREE.Clock();
  if (mode === "hero") newHeroPath(0);

  function frame() {
    running = false;
    if (!onScreen || disposed) return;
    const t = clock.getElapsedTime();
    const idle = performance.now() - lastInteraction > 2500;
    if (!reduced && idle && !dragging) {
      azimuth += mode === "hero" ? 0.0009 : 0.0012;
      placeCamera();
      needsRender = true;
    }
    if (mode === "hero" && heroPath) {
      const local = reduced ? HERO_ROLL : t - heroStart;
      const u = Math.min(1, local / HERO_ROLL);
      const eased = 1 - Math.pow(1 - u, 2.4); // 減速しながら転がる
      const p = heroPath.getPoint(eased);
      const y = heightAt(p.x, p.z);
      const sink = u >= 1 ? Math.min(0.25, (local - HERO_ROLL) * 0.9) : 0;
      heroBall.position.set(p.x, y + 0.11 - sink, p.z);
      heroBall.rotation.x -= (1 - eased) * 0.25;
      heroShadow.position.set(p.x + 0.03, y + 0.01, p.z + 0.03);
      heroShadow.visible = sink === 0;
      trail.geometry.setDrawRange(0, Math.floor(eased * 61));
      if (!reduced && local > HERO_ROLL + HERO_PAUSE) newHeroPath(t);
      needsRender = true;
    }
    if (needsRender) {
      renderer.render(scene, camera);
      needsRender = false;
    }
    if (!reduced || dragging || mode === "hero") loop();
  }
  function loop() {
    if (running || disposed) return;
    running = true;
    raf = requestAnimationFrame(frame);
  }
  loop();
  // reduced-motion のときも操作には反応させる
  const kick = () => loop();
  canvas.addEventListener("pointermove", kick);

  return {
    setPoints: (points, visible, selected) => {
      setPoints(points, visible, selected);
      loop();
    },
    dispose: () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", kick);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      scene.traverse((obj) => {
        const mesh = obj as THREE_NS.Mesh;
        mesh.geometry?.dispose?.();
        const mat = mesh.material as THREE_NS.Material | THREE_NS.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat?.dispose?.();
      });
      labels.forEach((l) => l.material.map?.dispose());
      renderer.dispose();
      canvas.remove();
    },
  };
}

export function GreenScene({ mode, points = [], visible, height, selected = null, onSelect, accessibilityLabel, radius = 24 }: GreenSceneProps) {
  const hostRef = useRef<View>(null);
  const apiRef = useRef<SceneApi | null>(null);
  const [failed, setFailed] = useState(false);
  const pointsRef = useRef(points);
  pointsRef.current = points;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    const host = hostRef.current as unknown as HTMLDivElement | null;
    if (!host) return;
    let cancelled = false;
    let api: SceneApi | null = null;
    createScene(host, mode, (i) => onSelectRef.current?.(i == null ? null : pointsRef.current[i] ?? null))
      .then((a) => {
        if (cancelled) {
          a.dispose();
          return;
        }
        api = a;
        apiRef.current = a;
        a.setPoints(pointsRef.current, new Set(visible ?? ["one", "two", "three"]), selected);
      })
      .catch((e) => {
        console.warn("[GreenScene] WebGL unavailable:", e);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      api?.dispose();
      apiRef.current = null;
    };
    // mode が変わったときだけ作り直す
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const visibleKey = (visible ?? ["one", "two", "three"]).join(",");
  useEffect(() => {
    apiRef.current?.setPoints(points, new Set(visibleKey.split(",") as Outcome[]), selected);
  }, [points, visibleKey, selected]);

  return (
    <View
      ref={hostRef}
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      style={{ height, borderRadius: radius, overflow: "hidden", backgroundColor: STAGE.bgBottom }}
    >
      {failed && (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 16 }}>
          <Text style={{ color: STAGE.textMuted, fontSize: 14, textAlign: "center" }}>
            このブラウザでは 3D 表示を利用できません
          </Text>
        </View>
      )}
    </View>
  );
}
