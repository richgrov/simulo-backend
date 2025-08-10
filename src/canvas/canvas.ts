import * as THREE from "three";

import Scene from "./scene";

const canvas = document.querySelector("canvas")!;
if (!canvas) throw new Error("No canvas element found.");

export const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);

let scene: Scene;

let lastTime = performance.now();
function loop() {
  requestAnimationFrame(loop);

  const now = performance.now();
  const delta = (now - lastTime) / 1000;
  lastTime = now;

  if (scene) {
    scene.update(delta);
  }

  if (scene) {
    renderer.render(scene, scene.camera);
  }
}
loop();

window.onresize = () => {
  if (scene) {
    scene.resize(window.innerWidth, window.innerHeight);
  }
  renderer.setSize(window.innerWidth, window.innerHeight);
};

window.onmousedown = (event) => {
  if (scene) {
    scene.mouseDown(event.clientX, event.clientY);
  }
};

export function setScene(newScene: Scene) {
  if (scene) {
    scene.cleanup();
  }
  scene = newScene;
  scene.resize(window.innerWidth, window.innerHeight);
}
