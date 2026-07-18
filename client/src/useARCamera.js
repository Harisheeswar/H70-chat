import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

export function useARCamera(videoRef, canvasRef, activeFilter) {
  const [isReady, setIsReady] = useState(false);
  const faceMeshRef = useRef(null);
  const cameraRef = useRef(null);
  
  // Three.js refs
  const sceneRef = useRef(null);
  const threeCameraRef = useRef(null);
  const rendererRef = useRef(null);
  const maskObjectRef = useRef(null);

  useEffect(() => {
    if (!videoRef.current || !canvasRef.current || activeFilter !== 'anime3d') {
      // Cleanup if filter changes
      if (rendererRef.current) {
        rendererRef.current.dispose();
        rendererRef.current = null;
      }
      if (cameraRef.current) {
        cameraRef.current.stop();
        cameraRef.current = null;
      }
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;

    canvas.width = width;
    canvas.height = height;

    // 1. Setup Three.js
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Use OrthographicCamera to easily map 2D screen coords to 3D space
    const threeCamera = new THREE.OrthographicCamera(
      -width / 2, width / 2, height / 2, -height / 2, 0.1, 1000
    );
    threeCamera.position.z = 100;
    threeCameraRef.current = threeCamera;

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setSize(width, height);
    rendererRef.current = renderer;

    // Add ambient light
    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.5);
    dirLight.position.set(0, 1, 1);
    scene.add(dirLight);

    // Create 3D Mask Object (A slightly curved plane to wrap around the face)
    const geometry = new THREE.CylinderGeometry(100, 100, 150, 32, 1, false, Math.PI * 0.25, Math.PI * 0.5);
    
    // Load the anime texture we generated earlier
    const textureLoader = new THREE.TextureLoader();
    const texture = textureLoader.load('/anime_mask.png');
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.premultiplyAlpha = true;
    
    const material = new THREE.MeshStandardMaterial({ 
      map: texture, 
      transparent: true,
      side: THREE.DoubleSide
    });
    
    const maskMesh = new THREE.Mesh(geometry, material);
    // Rotate cylinder so it faces camera correctly
    maskMesh.rotation.x = Math.PI / 2;
    maskMesh.rotation.z = Math.PI;
    
    // We group it to apply origin offsets easily
    const maskGroup = new THREE.Group();
    maskGroup.add(maskMesh);
    
    scene.add(maskGroup);
    maskObjectRef.current = maskGroup;

    // 2. Setup MediaPipe Face Mesh
    const faceMesh = new window.FaceMesh({
      locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
      }
    });

    faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    faceMesh.onResults((results) => {
      // Clear background
      renderer.clear();
      
      // We must draw the video frame as the background first
      // Because we are using an alpha canvas, we don't necessarily have to draw video,
      // the video element can sit behind the canvas via CSS!
      
      if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
        const landmarks = results.multiFaceLandmarks[0];
        
        // Calculate head position (Nose tip is index 1)
        const nose = landmarks[1];
        // Calculate head rotation using eyes and chin
        const leftEye = landmarks[33];
        const rightEye = landmarks[263];
        
        // Map normalized coordinates [0, 1] to Three.js world coordinates
        // X goes from -width/2 to width/2
        // Y goes from height/2 to -height/2 (inverted)
        const x = (nose.x - 0.5) * width;
        const y = -(nose.y - 0.5) * height;
        // Estimate Z depth based on eye distance (rough approximation)
        const eyeDist = Math.sqrt(Math.pow(rightEye.x - leftEye.x, 2) + Math.pow(rightEye.y - leftEye.y, 2));
        const scale = eyeDist * 8; // Tweak this multiplier to fit the face
        
        // Estimate Yaw (Y rotation)
        const dx = rightEye.x - leftEye.x;
        const dy = rightEye.y - leftEye.y;
        const dz = rightEye.z - leftEye.z;
        const yaw = Math.atan2(dz, dx);
        
        // Estimate Roll (Z rotation)
        const roll = Math.atan2(dy, dx);
        
        // Estimate Pitch (X rotation) - roughly based on nose to chin vs eye to nose distances
        const pitch = -Math.atan2(nose.z, nose.y);

        if (maskObjectRef.current) {
          maskObjectRef.current.position.set(x, y, 0);
          maskObjectRef.current.scale.set(scale, scale, scale);
          maskObjectRef.current.rotation.set(pitch * 0.5, yaw, roll);
        }
      } else {
        // Hide mask if no face
        if (maskObjectRef.current) {
          maskObjectRef.current.scale.set(0, 0, 0);
        }
      }
      
      renderer.render(scene, threeCamera);
    });

    faceMeshRef.current = faceMesh;

    // 3. Setup Camera stream to feed into Face Mesh
    const mpCamera = new window.Camera(video, {
      onFrame: async () => {
        if (faceMeshRef.current) {
          await faceMeshRef.current.send({ image: video });
        }
      },
      width: width,
      height: height
    });
    
    mpCamera.start();
    cameraRef.current = mpCamera;
    setIsReady(true);

    return () => {
      mpCamera.stop();
      faceMesh.close();
      renderer.dispose();
    };
  }, [activeFilter, videoRef, canvasRef]);

  return { isReady };
}
