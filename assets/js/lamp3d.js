// Real-time 3D lamp renderer built on three.js.
// Each product's parametric radius function is turned into a lathe-like mesh
// with a fine layer-line bump texture so it reads as a 3D print.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const SEG_U = 192;
const SEG_V = 150;
const WARM = new THREE.Color('#ffd9a8');

export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch {
    return false;
  }
}

let layerTexture;
function getLayerTexture() {
  if (layerTexture) return layerTexture;
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 64;
  const g = c.getContext('2d');
  for (let y = 0; y < 64; y++) {
    const s = 0.5 + 0.5 * Math.sin((y / 64) * Math.PI * 2 * 8);
    const v = Math.round(90 + 140 * s);
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(0, y, 4, 1);
  }
  layerTexture = new THREE.CanvasTexture(c);
  layerTexture.wrapS = layerTexture.wrapT = THREE.RepeatWrapping;
  return layerTexture;
}

let glowTexture;
function getGlowTexture() {
  if (glowTexture) return glowTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  glowTexture = new THREE.CanvasTexture(c);
  glowTexture.colorSpace = THREE.SRGBColorSpace;
  return glowTexture;
}

const geometryCache = new Map();
function shadeGeometry(product) {
  if (geometryCache.has(product.id)) return geometryCache.get(product.id);
  const H = product.height;
  const cols = SEG_U;
  const rows = SEG_V + 1;
  const pos = new Float32Array(cols * rows * 3);
  const uv = new Float32Array(cols * rows * 2);
  let p = 0;
  let q = 0;
  for (let j = 0; j < rows; j++) {
    const v = j / SEG_V;
    for (let i = 0; i < cols; i++) {
      const theta = (i / cols) * Math.PI * 2;
      const r = product.radius(theta, v);
      pos[p++] = Math.cos(theta) * r;
      pos[p++] = v * H;
      pos[p++] = Math.sin(theta) * r;
      uv[q++] = i / cols;
      uv[q++] = v * H;
    }
  }
  const index = [];
  for (let j = 0; j < SEG_V; j++) {
    for (let i = 0; i < cols; i++) {
      const a = j * cols + i;
      const b = j * cols + ((i + 1) % cols);
      const c = a + cols;
      const d = b + cols;
      index.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(index);
  geo.computeVertexNormals();
  geometryCache.set(product.id, geo);
  return geo;
}

class Lamp {
  constructor() {
    this.group = new THREE.Group();
    const bump = getLayerTexture().clone();
    bump.needsUpdate = true;
    this.material = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      roughness: 0.62,
      metalness: 0.0,
      side: THREE.DoubleSide,
      bumpMap: bump,
      bumpScale: 0.6,
      emissive: '#000000',
    });
    this.shade = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
    this.group.add(this.shade);

    this.bulbMaterial = new THREE.MeshBasicMaterial({ color: '#fff4dc' });
    this.bulb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 32, 16), this.bulbMaterial);
    this.group.add(this.bulb);

    this.light = new THREE.PointLight(WARM, 0, 0, 2);
    this.group.add(this.light);

    this.baseMaterial = new THREE.MeshStandardMaterial({ color: '#5a4030', roughness: 0.5, metalness: 0.05 });
    this.base = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.05, 1, 96), this.baseMaterial);
    this.group.add(this.base);

    this.cord = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 1, 12),
      new THREE.MeshStandardMaterial({ color: '#3a3530', roughness: 0.7 }),
    );
    this.group.add(this.cord);

    this.glowMaterial = new THREE.MeshBasicMaterial({
      map: getGlowTexture(),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0,
    });
    this.glow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.glowMaterial);
    this.glow.rotation.x = -Math.PI / 2;
    this.group.add(this.glow);

    this.color = new THREE.Color('#ffffff');
    this.on = true;
  }

  setProduct(product) {
    this.product = product;
    const H = product.height;
    this.shade.geometry = shadeGeometry(product);
    this.material.bumpMap.repeat.set(1, 42);
    const bottomR = product.radius(0, 0);
    const topR = product.radius(0, 1);

    if (product.type === 'table') {
      const baseH = 0.12;
      this.base.visible = true;
      this.base.scale.set(Math.max(0.28, bottomR * 0.82), baseH, Math.max(0.28, bottomR * 0.82));
      this.base.position.y = baseH / 2;
      this.shade.position.y = baseH;
      this.bulb.position.y = baseH + H * 0.4;
      this.cord.visible = false;
      this.glow.visible = true;
      this.glow.scale.setScalar(Math.max(3.2, bottomR * 5));
      this.glow.position.y = 0.002;
      this.bounds = { bottom: 0, top: baseH + H, radius: Math.max(bottomR, topR, 0.9) };
    } else {
      this.base.visible = false;
      this.shade.position.y = 0;
      this.bulb.position.y = H * 0.55;
      this.cord.visible = true;
      this.cord.scale.y = 2.4;
      this.cord.position.y = H + 1.2;
      this.glow.visible = true;
      this.glow.scale.setScalar(bottomR * 3.2);
      this.glow.position.y = -0.9;
      this.bounds = { bottom: -0.3, top: H + 0.35, radius: Math.max(bottomR, 1) };
    }
    this.light.position.copy(this.bulb.position);
    this.update();
  }

  setColor(hex) {
    this.color.set(hex);
    this.update();
  }

  setOn(on) {
    this.on = on;
    this.update();
  }

  update() {
    const lum = this.color.r * 0.2126 + this.color.g * 0.7152 + this.color.b * 0.0722;
    this.material.color.copy(this.color);
    const glowColor = this.color.clone().lerp(WARM, 0.35);
    this.material.emissive.copy(glowColor);
    // Lighter filaments transmit more light, darker ones glow more subtly.
    this.material.emissiveIntensity = this.on ? 0.18 + 0.5 * Math.min(1, lum * 1.6) : 0;
    this.bulbMaterial.color.set(this.on ? '#fff4dc' : '#6d6a64');
    this.light.intensity = this.on ? 2.2 : 0;
    this.glowMaterial.color.copy(glowColor);
    this.glowMaterial.opacity = this.on ? 0.55 : 0;
  }
}

function setupScene(scene) {
  scene.add(new THREE.HemisphereLight('#fff4e6', '#1a1510', 0.9));
  const key = new THREE.DirectionalLight('#fff1e0', 1.6);
  key.position.set(3, 4, 5);
  scene.add(key);
  const rim = new THREE.DirectionalLight('#9fb4ff', 0.6);
  rim.position.set(-4, 2, -3);
  scene.add(rim);
}

function frameCamera(camera, lamp, padding = 1.25) {
  const { bottom, top, radius } = lamp.bounds;
  const h = top - bottom;
  const centerY = bottom + h / 2;
  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const distH = (h / 2) / Math.tan(vFov / 2);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
  const distW = radius / Math.tan(hFov / 2);
  const dist = Math.max(distH, distW) * padding + radius;
  return { centerY, dist };
}

export class LampStage {
  constructor(canvas, { interactive = true, autoRotate = true, padding = 1.25, shiftY = 0 } = {}) {
    this.canvas = canvas;
    this.padding = padding;
    // Fraction of the view height to raise the lamp by (e.g. to clear an overlay).
    this.shiftY = shiftY;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.scene = new THREE.Scene();
    setupScene(this.scene);
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    this.lamp = new Lamp();
    this.scene.add(this.lamp.group);

    if (interactive) {
      this.controls = new OrbitControls(this.camera, canvas);
      this.controls.enableZoom = false;
      this.controls.enablePan = false;
      this.controls.enableDamping = true;
      this.controls.autoRotate = autoRotate;
      this.controls.autoRotateSpeed = 1.4;
      this.controls.minPolarAngle = Math.PI * 0.22;
      this.controls.maxPolarAngle = Math.PI * 0.62;
    }

    this.visible = true;
    this._loop = this._loop.bind(this);
    this._resize = this.resize.bind(this);
    new ResizeObserver(this._resize).observe(canvas);
    new IntersectionObserver(([e]) => {
      this.visible = e.isIntersecting;
      if (this.visible) this.start();
    }).observe(canvas);
    this.resize();
  }

  resize() {
    const w = this.canvas.clientWidth || 1;
    const h = this.canvas.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.lamp.product) this._frame(false);
    this.render();
  }

  _frame(resetAngle = true) {
    const { centerY, dist } = frameCamera(this.camera, this.lamp, this.padding);
    const viewH = 2 * dist * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2);
    const shift = typeof this.shiftY === 'function' ? this.shiftY() : this.shiftY;
    const target = new THREE.Vector3(0, centerY - shift * viewH, 0);
    let dir = new THREE.Vector3(0.55, 0.32, 1).normalize();
    if (!resetAngle && this.controls) {
      dir = this.camera.position.clone().sub(this.controls.target).normalize();
    }
    this.camera.position.copy(target).addScaledVector(dir, dist);
    this.camera.lookAt(target);
    if (this.controls) {
      this.controls.target.copy(target);
      this.controls.update();
    }
  }

  setProduct(product) {
    this.lamp.setProduct(product);
    this._frame(true);
    this.render();
  }

  setColor(hex) {
    this.lamp.setColor(hex);
    this.render();
  }

  setOn(on) {
    this.lamp.setOn(on);
    this.render();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  start() {
    if (this._raf || !this.controls) return;
    this._raf = requestAnimationFrame(this._loop);
  }

  stop() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
  }

  _loop() {
    this._raf = null;
    if (!this.visible || document.hidden) return;
    this.controls.update();
    this.render();
    this._raf = requestAnimationFrame(this._loop);
  }
}

// Offscreen renderer used to produce product-card thumbnails without
// creating a WebGL context per card.
let thumbStage;
const thumbCache = new Map();
export function renderThumbnail(product, hex) {
  const key = `${product.id}|${hex}`;
  if (thumbCache.has(key)) return thumbCache.get(key);
  if (!thumbStage) {
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:fixed;left:-9999px;top:0;width:480px;height:600px;';
    document.body.appendChild(canvas);
    thumbStage = new LampStage(canvas, { interactive: false, padding: 1.15 });
    thumbStage.renderer.setPixelRatio(1.5);
    thumbStage.renderer.setSize(480, 600, false);
    thumbStage.camera.aspect = 480 / 600;
    thumbStage.camera.updateProjectionMatrix();
  }
  thumbStage.setProduct(product);
  thumbStage.setColor(hex);
  thumbStage.render();
  const url = thumbStage.canvas.toDataURL('image/png');
  thumbCache.set(key, url);
  return url;
}
