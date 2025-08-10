import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import geojson from "../assets/countries.json";
import Scene from "./scene";
import * as THREE from "three";

export default class LocationsScene extends THREE.Scene implements Scene {
  public camera: THREE.PerspectiveCamera;

  private orbitControls: OrbitControls;
  private sphere!: THREE.Mesh;
  private countriesGroup!: THREE.Group;
  private readonly RADIUS = 5;

  constructor(renderer: THREE.WebGLRenderer) {
    super();

    this.background = new THREE.Color(0x333230);

    this.camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.1,
      1000,
    );
    this.camera.position.set(0, 0, 10);

    this.orbitControls = new OrbitControls(this.camera, renderer.domElement);
    this.orbitControls.target.set(0, 0, 0);
    this.orbitControls.enableDamping = true;
    this.orbitControls.dampingFactor = 0.1;

    this.createSphere();
    this.createCountries();

    this.camera.position.set(0, 0, 15);
  }

  private createSphere(): void {
    const sphereGeometry = new THREE.SphereGeometry(4.74, 64, 64);
    const sphereMaterial = new THREE.MeshBasicMaterial({
      color: 0xd8d7d3,
    });

    this.sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    this.add(this.sphere);
  }

  private createCountries(): void {
    this.countriesGroup = new THREE.Group();

    geojson.forEach((country: any) => {
      if (country.type === "Polygon") {
        this.createCountryFromPolygon(country.coordinates[0]);
      } else if (country.type === "MultiPolygon") {
        country.coordinates.forEach((polygon: number[][][]) => {
          this.createCountryFromPolygon(polygon[0]);
        });
      }
    });

    this.add(this.countriesGroup);
  }

  private createCountryFromPolygon(coordinates: number[][]): void {
    const shapeVerts: THREE.Vector2[] = [];
    const latLonArray: number[][] = [];

    coordinates.forEach((coord: number[]) => {
      const [longitude, latitude] = coord;
      latLonArray.push([longitude, latitude]);
      shapeVerts.push(new THREE.Vector2(longitude, latitude));
    });

    if (shapeVerts.length < 3) return;

    const triangles = THREE.ShapeUtils.triangulateShape(shapeVerts, []);

    const positions: number[] = [];

    triangles.forEach((tri) => {
      tri.forEach((idx) => {
        const [lon, lat] = latLonArray[idx];
        const phi = (90 - lat) * (Math.PI / 180);
        const theta = (lon + 180) * (Math.PI / 180);

        const x = -this.RADIUS * Math.sin(phi) * Math.cos(theta);
        const z = this.RADIUS * Math.sin(phi) * Math.sin(theta);
        const y = this.RADIUS * Math.cos(phi);

        positions.push(x, y, z);
      });
    });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.computeVertexNormals();

    const material = new THREE.MeshBasicMaterial({
      color: 0x201f13,
      side: THREE.FrontSide,
    });

    const mesh = new THREE.Mesh(geometry, material);
    this.countriesGroup.add(mesh);
  }

  update(_delta: number): void {
    this.orbitControls.update();
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  mouseDown(_x: number, _y: number): void {}

  cleanup(): void {}
}
