import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import Scene from "./scene";
import { Machine } from "../models";
import { showCallout } from "../callout";

const gridSize = 10;
const spacing = 2;

type SquareState = {
  mesh: THREE.Mesh;
  fadeDirection: 1 | -1;
  timer: number;
};

function randomGridPosition() {
  const x = Math.floor(Math.random() * (gridSize - 1));
  const z = Math.floor(Math.random() * (gridSize - 1));
  return {
    x: (x + 0.5 - gridSize / 2) * spacing,
    z: (z + 0.5 - gridSize / 2) * spacing,
  };
}

export default class EditorScene extends THREE.Scene implements Scene {
  public camera: THREE.PerspectiveCamera;

  private orbitControls: OrbitControls;
  private raycaster = new THREE.Raycaster();
  private animatedSquares = new Array<SquareState>();
  private machines: Record<number, Machine> = {};

  constructor(renderer: THREE.WebGLRenderer) {
    super();

    this.background = new THREE.Color(0x000000);

    this.camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.1,
      1000,
    );
    this.camera.position.set(15, 25, 20);

    this.orbitControls = new OrbitControls(this.camera, renderer.domElement);
    this.orbitControls.target.set(0, 0, 0);
    this.orbitControls.enableDamping = true;
    this.orbitControls.dampingFactor = 0.1;

    const dotGeometry = new THREE.SphereGeometry(0.1, 8, 8);
    const dotMaterial = new THREE.MeshBasicMaterial({ color: 0x888888 });
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
    this.add(instancedDots);

    const lineMaterial = new THREE.LineBasicMaterial({ color: 0x666666 });
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
          this.add(lineX);
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
          this.add(lineZ);
        }
      }
    }

    const squareMaterialTemplate = new THREE.MeshBasicMaterial({
      color: 0x222222,
      side: THREE.DoubleSide,
    });

    const squareGeometry = new THREE.PlaneGeometry(spacing, spacing);
    const squareCount = Math.floor((gridSize - 1) * (gridSize - 1) * 0.1);

    const animatedSquares: SquareState[] = [];

    for (let i = 0; i < squareCount; i++) {
      const pos = randomGridPosition();

      const mat = squareMaterialTemplate.clone();
      const square = new THREE.Mesh(squareGeometry, mat);
      square.rotation.x = -Math.PI / 2;
      square.position.set(pos.x, 0, pos.z);
      this.add(square);

      animatedSquares.push({
        mesh: square,
        fadeDirection: 1,
        timer: Math.random() * 3,
      });
    }
  }

  update(delta: number): void {
    this.orbitControls.update();

    for (const squareState of this.animatedSquares) {
      const { mesh, fadeDirection } = squareState;
      const mat = mesh.material as THREE.MeshBasicMaterial;

      squareState.timer -= delta;
      if (squareState.timer > 0) continue;

      mat.opacity += fadeDirection * delta * 0.5;

      if (mat.opacity <= 0) {
        mat.opacity = 0;
        squareState.fadeDirection = 1;

        // Move to new location
        const pos = randomGridPosition();
        mesh.position.set(pos.x, 0, pos.z);

        // Wait before starting fade-in
        squareState.timer = Math.random() * 2;
      } else if (mat.opacity >= 0.75) {
        mat.opacity = 0.75;
        squareState.fadeDirection = -1;

        // Wait before starting fade-out
        squareState.timer = Math.random() * 2;
      }
    }

    for (const machine of Object.values(this.machines)) {
      machine.update();
    }
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  mouseDown(x: number, y: number): void {
    const mousePos = new THREE.Vector2(
      (x / window.innerWidth) * 2 - 1,
      -(y / window.innerHeight) * 2 + 1,
    );

    this.raycaster.setFromCamera(mousePos, this.camera);
    for (const intersect of this.raycaster.intersectObjects(this.children)) {
      var obj = intersect.object;
      if (obj.parent instanceof Machine) {
        obj = obj.parent;
      } else if (!(obj instanceof Machine)) {
        continue;
      }

      (obj as Machine).onClick();
      showCallout(x, y);
    }
  }

  initSceneData(sceneData: any[]): void {
    for (const machine of Object.values(this.machines)) {
      machine.removeFromParent();
    }
    this.machines = {};

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
      this.add(machine);
      this.machines[obj.id] = machine;
    }
  }

  setMachineOnline(machineId: number, online: boolean) {
    const machine = this.machines[machineId];
    if (!machine) {
      return;
    }

    machine.status = online ? "online" : "offline";
  }

  cleanup(): void {
    // TODO: Implement
  }
}
