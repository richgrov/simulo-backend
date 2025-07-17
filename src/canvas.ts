import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import { Machine } from "./models";
import { showCallout } from "./callout";

const canvas = document.querySelector("canvas")!;
if (!canvas) throw new Error("No canvas element found.");

const raycaster = new THREE.Raycaster();

var machines: Record<number, Machine> = {};

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  1000,
);
camera.position.set(15, 25, 20);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.1;

const gridSize = 30;
const spacing = 4;

const dotGeometry = new THREE.SphereGeometry(0.2, 8, 8);
const dotMaterial = new THREE.MeshBasicMaterial({ color: 0xcccccc });
const dotCount = gridSize * gridSize;
const instancedDots = new THREE.InstancedMesh(
  dotGeometry,
  dotMaterial,
  dotCount,
);

const dummy = new THREE.Object3D();
let i = 0;
for (let x = 0; x < gridSize; x++) {
  for (let z = 0; z < gridSize; z++) {
    const posX = (x - gridSize / 2) * spacing;
    const posZ = (z - gridSize / 2) * spacing;
    dummy.position.set(posX, 0, posZ);
    dummy.updateMatrix();
    instancedDots.setMatrixAt(i++, dummy.matrix);
  }
}
scene.add(instancedDots);

const lineMaterial = new THREE.LineBasicMaterial({ color: 0x888888 });
for (let x = 0; x < gridSize; x++) {
  for (let z = 0; z < gridSize; z++) {
    const posX = (x - gridSize / 2) * spacing;
    const posZ = (z - gridSize / 2) * spacing;
    const posY = 0;

    if (x < gridSize - 1) {
      const nextX = (x + 1 - gridSize / 2) * spacing;
      const pointsX = [
        new THREE.Vector3(posX, posY, posZ),
        new THREE.Vector3(nextX, posY, posZ),
      ];
      const lineX = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pointsX),
        lineMaterial,
      );
      scene.add(lineX);
    }

    if (z < gridSize - 1) {
      const nextZ = (z + 1 - gridSize / 2) * spacing;
      const pointsZ = [
        new THREE.Vector3(posX, posY, posZ),
        new THREE.Vector3(posX, posY, nextZ),
      ];
      const lineZ = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pointsZ),
        lineMaterial,
      );
      scene.add(lineZ);
    }
  }
}

const squareMaterialTemplate = new THREE.MeshBasicMaterial({
  color: 0x444444,
  side: THREE.DoubleSide,
  transparent: true, // Enable opacity control
  opacity: 0,
});

const squareGeometry = new THREE.PlaneGeometry(spacing, spacing);
const squareCount = Math.floor((gridSize - 1) * (gridSize - 1) * 0.1);

type SquareState = {
  mesh: THREE.Mesh;
  fadeDirection: 1 | -1; // 1 for fade-in, -1 for fade-out
  timer: number; // To delay before switching position
};

const animatedSquares: SquareState[] = [];

function randomGridPosition() {
  const x = Math.floor(Math.random() * (gridSize - 1));
  const z = Math.floor(Math.random() * (gridSize - 1));
  return {
    x: (x + 0.5 - gridSize / 2) * spacing,
    z: (z + 0.5 - gridSize / 2) * spacing,
  };
}

for (let i = 0; i < squareCount; i++) {
  const pos = randomGridPosition();

  const mat = squareMaterialTemplate.clone();
  const square = new THREE.Mesh(squareGeometry, mat);
  square.rotation.x = -Math.PI / 2;
  square.position.set(pos.x, 0, pos.z);
  scene.add(square);

  animatedSquares.push({
    mesh: square,
    fadeDirection: 1,
    timer: Math.random() * 3,
  });
}

let lastTime = performance.now();
function loop() {
  requestAnimationFrame(loop);
  controls.update();

  const now = performance.now();
  const delta = (now - lastTime) / 1000;
  lastTime = now;

  for (const machine of Object.values(machines)) {
    machine.update();
  }

  for (const squareState of animatedSquares) {
    const { mesh, fadeDirection } = squareState;
    const mat = mesh.material as THREE.MeshBasicMaterial;

    squareState.timer -= delta;
    if (squareState.timer > 0) continue;

    mat.opacity += fadeDirection * delta * 0.5; // Fade speed

    if (mat.opacity <= 0) {
      mat.opacity = 0;
      squareState.fadeDirection = 1;

      // Move to new location
      const pos = randomGridPosition();
      mesh.position.set(pos.x, 0, pos.z);

      // Wait before starting fade-in
      squareState.timer = Math.random() * 2;
    } else if (mat.opacity >= 1) {
      mat.opacity = 1;
      squareState.fadeDirection = -1;

      // Wait before starting fade-out
      squareState.timer = Math.random() * 2;
    }
  }

  renderer.render(scene, camera);
}
loop();

window.onresize = () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
};

window.onmousedown = (event) => {
  const mousePos = new THREE.Vector2(
    (event.clientX / window.innerWidth) * 2 - 1,
    -(event.clientY / window.innerHeight) * 2 + 1,
  );

  raycaster.setFromCamera(mousePos, camera);
  for (const intersect of raycaster.intersectObjects(scene.children)) {
    var obj = intersect.object;
    if (obj.parent instanceof Machine) {
      obj = obj.parent;
    } else if (!(obj instanceof Machine)) {
      continue;
    }

    (obj as Machine).onClick();
    showCallout(event.clientX, event.clientY);
  }
};

export async function init(sceneData: any[]) {
  for (const machine of Object.values(machines)) {
    machine.removeFromParent();
  }
  machines = {};

  for (const obj of sceneData) {
    if (obj.type !== "machine") {
      continue;
    }

    const machine = new Machine(
      obj.x,
      obj.y,
      obj.z,
      obj.xRot,
      obj.yRot,
      obj.zRot,
      obj.id,
    );
    scene.add(machine);
    machines[obj.id] = machine;
  }
}

export function setMachineOnline(machineId: number, online: boolean) {
  const machine = machines[machineId];
  if (!machine) {
    return;
  }

  machine.status = online ? "online" : "offline";
}
