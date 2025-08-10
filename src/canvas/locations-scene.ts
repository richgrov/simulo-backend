import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import geojson from "../assets/countries.json";
import Scene from "./scene";
import * as THREE from "three";
import { Location } from "../models";

export default class LocationsScene extends THREE.Scene implements Scene {
  public camera: THREE.PerspectiveCamera;

  private orbitControls: OrbitControls;
  private locationsGroup = new THREE.Group();
  private readonly RADIUS = 5;

  private coordsToPos(
    latitude: number,
    longitude: number,
    radius: number = this.RADIUS,
  ): THREE.Vector3 {
    const phi = (90 - latitude) * (Math.PI / 180);
    const theta = (longitude + 180) * (Math.PI / 180);

    const x = -radius * Math.sin(phi) * Math.cos(theta);
    const z = radius * Math.sin(phi) * Math.sin(theta);
    const y = radius * Math.cos(phi);

    return new THREE.Vector3(x, y, z);
  }

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
    this.orbitControls.minDistance = 6;
    this.orbitControls.maxDistance = 20;
    this.orbitControls.enablePan = false;
    this.orbitControls.enableDamping = true;
    this.orbitControls.dampingFactor = 0.1;

    this.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(4.74, 64, 64),
        new THREE.MeshBasicMaterial({
          color: 0xd8d7d3,
        }),
      ),
    );

    geojson.forEach((country: any) => {
      if (country.type === "Polygon") {
        this.createCountryFromPolygon(country.coordinates[0]);
      } else if (country.type === "MultiPolygon") {
        country.coordinates.forEach((polygon: number[][][]) => {
          this.createCountryFromPolygon(polygon[0]);
        });
      }
    });

    this.camera.position.set(0, 0, 15);
    this.add(this.locationsGroup);
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
        const position = this.coordsToPos(lat, lon);

        positions.push(position.x, position.y, position.z);
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

    this.add(new THREE.Mesh(geometry, material));
  }

  public addLocations(locations: Location[]): void {
    for (const location of locations) {
      this.locationsGroup.add(this.createLocationPoint(location));
    }
  }

  private createLocationPoint(location: Location): THREE.Points {
    const position = this.coordsToPos(location.latitude, location.longitude);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([position.x, position.y, position.z], 3),
    );

    const material = new THREE.PointsMaterial({
      color: 0xe8c7c3,
      size: 8,
      sizeAttenuation: false,
      depthWrite: false,
    });

    return new THREE.Points(geometry, material);
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
