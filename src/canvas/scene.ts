import * as THREE from "three";

export default interface Scene extends THREE.Scene {
  camera: THREE.Camera;

  update(delta: number): void;
  resize(width: number, height: number): void;
  mouseDown(x: number, y: number): void;
  cleanup(): void;
}
