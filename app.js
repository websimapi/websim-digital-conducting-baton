import * as THREE from 'three';

class DigitalConductor {
    constructor() {
        this.room = new WebsimSocket();
        this.isMobile = this.detectMobile();
        this.conductorController = null;
        this.conducting = false;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.baton = null;
        this.batonGroup = null;
        
        // Pose detection properties
        this.pose = null;
        this.webcamVideo = null;
        this.poseCanvas = null;
        this.poseCanvasCtx = null;
        this.poseData = {
            rightWrist: null,
            leftWrist: null,
            rightShoulder: null,
            leftShoulder: null,
            dominantHand: 'right', // Default to right hand
            handPosition: { x: 0, y: 0, z: 0 },
            confidence: 0
        };
        
        this.init();
    }

    detectMobile() {
        const userAgent = navigator.userAgent.toLowerCase();
        const isMobileUA = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/.test(userAgent);
        const isSmallScreen = window.innerWidth <= 768;
        return isMobileUA || isSmallScreen;
    }

    async init() {
        try {
            await this.room.initialize();
            this.setupUI();
            this.setupEventListeners();
            this.updateDeviceInfo();
            
            if (this.isMobile) {
                this.conductorController = new ConductorController(this.room);
            }
        } catch (error) {
            console.error('Failed to initialize:', error);
        }
    }

    setupUI() {
        const mobileController = document.getElementById('mobileController');
        const desktopDisplay = document.getElementById('desktopDisplay');

        if (this.isMobile) {
            mobileController.style.display = 'block';
            desktopDisplay.style.display = 'none';
            this.setupMobileInterface();
        } else {
            mobileController.style.display = 'none';
            desktopDisplay.style.display = 'block';
            this.setupDesktopInterface();
        }
    }

    setupMobileInterface() {
        const startBtn = document.getElementById('startConducting');
        const stopBtn = document.getElementById('stopConducting');
        const calibrateBtn = document.getElementById('calibrateBaton');

        startBtn.addEventListener('click', () => {
            this.startConducting();
        });

        stopBtn.addEventListener('click', () => {
            this.stopConducting();
        });

        calibrateBtn.addEventListener('click', () => {
            if (this.conductorController) {
                this.conductorController.calibrate();
            }
        });
    }

    setupDesktopInterface() {
        this.setup3DVisualization();
        this.setupPoseDetection();
        this.updateConductorDisplay();
    }

    async setupPoseDetection() {
        if (this.isMobile) return;

        try {
            this.webcamVideo = document.getElementById('webcamVideo');
            this.poseCanvas = document.getElementById('poseCanvas');
            
            // Check if elements exist before proceeding
            if (!this.webcamVideo || !this.poseCanvas) {
                console.warn('Pose detection elements not found, skipping pose setup');
                document.getElementById('poseStatus').textContent = 'Pose detection disabled';
                return;
            }
            
            this.poseCanvasCtx = this.poseCanvas.getContext('2d');
            
            // Check if MediaPipe Pose is available
            if (typeof Pose === 'undefined') {
                console.warn('MediaPipe Pose not loaded, skipping pose detection');
                document.getElementById('poseStatus').textContent = 'Pose library not available';
                return;
            }

            // Initialize MediaPipe Pose with better error handling
            try {
                this.pose = new Pose({
                    locateFile: (file) => {
                        return `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1635989137/${file}`;
                    }
                });

                this.pose.setOptions({
                    modelComplexity: 1,
                    smoothLandmarks: true,
                    enableSegmentation: false,
                    smoothSegmentation: false,
                    minDetectionConfidence: 0.5,
                    minTrackingConfidence: 0.5
                });

                this.pose.onResults((results) => {
                    this.onPoseResults(results);
                });
            } catch (poseError) {
                console.error('Error initializing MediaPipe Pose:', poseError);
                document.getElementById('poseStatus').textContent = 'Pose detection failed to initialize';
                return;
            }

            // Start webcam
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 640, height: 480 }
            });
            
            this.webcamVideo.srcObject = stream;
            this.webcamVideo.addEventListener('loadeddata', () => {
                this.poseCanvas.width = this.webcamVideo.videoWidth;
                this.poseCanvas.height = this.webcamVideo.videoHeight;
                this.startPoseDetection();
                document.getElementById('poseStatus').textContent = 'Pose tracking active';
            });

        } catch (error) {
            console.error('Error setting up pose detection:', error);
            const poseStatusElement = document.getElementById('poseStatus');
            if (poseStatusElement) {
                poseStatusElement.textContent = 'Camera access denied or pose detection unavailable';
            }
            // Continue without pose detection - don't crash the app
        }
    }

    startPoseDetection() {
        if (!this.pose || !this.webcamVideo) {
            console.warn('Pose detection not available, skipping');
            return;
        }

        const detectPose = () => {
            try {
                if (this.webcamVideo && this.pose && this.webcamVideo.readyState === 4) {
                    this.pose.send({ image: this.webcamVideo });
                }
            } catch (error) {
                console.error('Error in pose detection:', error);
                // Continue without crashing
            }
            requestAnimationFrame(detectPose);
        };
        detectPose();
    }

    onPoseResults(results) {
        // Check if canvas context exists
        if (!this.poseCanvasCtx || !this.poseCanvas) return;
        
        try {
            // Clear canvas
            this.poseCanvasCtx.clearRect(0, 0, this.poseCanvas.width, this.poseCanvas.height);
            
            // Draw the video frame
            this.poseCanvasCtx.drawImage(results.image, 0, 0, this.poseCanvas.width, this.poseCanvas.height);

            if (results.poseLandmarks) {
                // Draw pose landmarks - check if drawing functions are available
                if (typeof drawConnectors !== 'undefined' && typeof drawLandmarks !== 'undefined' && typeof POSE_CONNECTIONS !== 'undefined') {
                    drawConnectors(this.poseCanvasCtx, results.poseLandmarks, POSE_CONNECTIONS, {color: '#4ecdc4', lineWidth: 2});
                    drawLandmarks(this.poseCanvasCtx, results.poseLandmarks, {color: '#ff6b6b', lineWidth: 1, radius: 3});
                }

                // Extract key landmarks for conductor tracking
                const landmarks = results.poseLandmarks;
                
                // Key pose points (MediaPipe pose landmark indices)
                const rightWrist = landmarks[16]; // Right wrist
                const leftWrist = landmarks[15];  // Left wrist  
                const rightShoulder = landmarks[12]; // Right shoulder
                const leftShoulder = landmarks[11];  // Left shoulder
                const nose = landmarks[0]; // Nose for reference

                // Update pose data
                this.poseData.rightWrist = rightWrist;
                this.poseData.leftWrist = leftWrist;
                this.poseData.rightShoulder = rightShoulder;
                this.poseData.leftShoulder = leftShoulder;

                // Determine which hand is likely holding the baton (higher position typically)
                if (rightWrist && leftWrist) {
                    this.poseData.dominantHand = rightWrist.y < leftWrist.y ? 'right' : 'left';
                    const dominantWrist = this.poseData.dominantHand === 'right' ? rightWrist : leftWrist;
                    const dominantShoulder = this.poseData.dominantHand === 'right' ? rightShoulder : leftShoulder;

                    // Convert normalized coordinates to 3D space coordinates
                    if (dominantWrist && dominantShoulder) {
                        // Normalize hand position relative to shoulder
                        const relativeX = (dominantWrist.x - dominantShoulder.x) * 4; // Scale for 3D space
                        const relativeY = (dominantShoulder.y - dominantWrist.y) * 4; // Inverted Y
                        const relativeZ = (dominantWrist.z - dominantShoulder.z) * 4;

                        this.poseData.handPosition = {
                            x: relativeX,
                            y: relativeY,
                            z: relativeZ
                        };
                        this.poseData.confidence = Math.min(dominantWrist.visibility, dominantShoulder.visibility);
                    }
                }

                // Draw baton hand indicator
                const dominantWrist = this.poseData.dominantHand === 'right' ? rightWrist : leftWrist;
                if (dominantWrist) {
                    this.poseCanvasCtx.beginPath();
                    this.poseCanvasCtx.arc(
                        dominantWrist.x * this.poseCanvas.width,
                        dominantWrist.y * this.poseCanvas.height,
                        15, 0, 2 * Math.PI
                    );
                    this.poseCanvasCtx.strokeStyle = '#ffd93d';
                    this.poseCanvasCtx.lineWidth = 3;
                    this.poseCanvasCtx.stroke();
                    
                    // Add text label
                    this.poseCanvasCtx.fillStyle = '#ffd93d';
                    this.poseCanvasCtx.font = '12px Arial';
                    this.poseCanvasCtx.fillText(
                        'BATON HAND',
                        dominantWrist.x * this.poseCanvas.width - 30,
                        dominantWrist.y * this.poseCanvas.height - 20
                    );
                }
            }

            // Update status
            const confidence = Math.round(this.poseData.confidence * 100);
            const poseStatusElement = document.getElementById('poseStatus');
            if (poseStatusElement) {
                if (results.poseLandmarks) {
                    poseStatusElement.textContent = 
                        `Tracking ${this.poseData.dominantHand} hand - Confidence: ${confidence}%`;
                } else {
                    poseStatusElement.textContent = 'No pose detected - stand in camera view';
                }
            }
        } catch (error) {
            console.error('Error processing pose results:', error);
            const poseStatusElement = document.getElementById('poseStatus');
            if (poseStatusElement) {
                poseStatusElement.textContent = 'Pose processing error - continuing without pose data';
            }
        }
    }

    setup3DVisualization() {
        const container = document.getElementById('batonScene');
        
        // Create scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0a0a0a);
        
        // Create camera
        this.camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
        this.camera.position.set(0, 2, 5);
        this.camera.lookAt(0, 0, 0);
        
        // Create renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        this.renderer.setClearColor(0x000000, 0);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        container.appendChild(this.renderer.domElement);
        
        // Create lighting
        const ambientLight = new THREE.AmbientLight(0x404040, 0.4);
        this.scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(5, 10, 5);
        directionalLight.castShadow = true;
        directionalLight.shadow.camera.near = 0.1;
        directionalLight.shadow.camera.far = 50;
        directionalLight.shadow.camera.left = -10;
        directionalLight.shadow.camera.right = 10;
        directionalLight.shadow.camera.top = 10;
        directionalLight.shadow.camera.bottom = -10;
        this.scene.add(directionalLight);
        
        // Add glowing accent light
        const accentLight = new THREE.PointLight(0x4ecdc4, 1, 10);
        accentLight.position.set(0, 2, 2);
        this.scene.add(accentLight);
        
        // Create baton
        this.createBaton();
        
        // Create conducting platform
        this.createPlatform();
        
        // Handle window resize
        window.addEventListener('resize', () => {
            if (!this.isMobile && this.renderer) {
                const container = document.getElementById('batonScene');
                this.camera.aspect = container.clientWidth / container.clientHeight;
                this.camera.updateProjectionMatrix();
                this.renderer.setSize(container.clientWidth, container.clientHeight);
            }
        });
        
        this.animate3D();
    }

    createBaton() {
        this.batonGroup = new THREE.Group();
        
        // Baton handle (wooden texture)
        const handleGeometry = new THREE.CylinderGeometry(0.05, 0.08, 1.2, 16);
        const handleMaterial = new THREE.MeshPhongMaterial({ 
            color: 0x8B4513,
            shininess: 30
        });
        const handle = new THREE.Mesh(handleGeometry, handleMaterial);
        handle.castShadow = true;
        handle.receiveShadow = true;
        
        // Baton tip (metallic)
        const tipGeometry = new THREE.SphereGeometry(0.03, 16, 16);
        const tipMaterial = new THREE.MeshPhongMaterial({ 
            color: 0x4ecdc4,
            emissive: 0x4ecdc4,
            emissiveIntensity: 0.3,
            shininess: 100
        });
        const tip = new THREE.Mesh(tipGeometry, tipMaterial);
        tip.position.y = 0.6;
        tip.castShadow = true;
        
        // Add glow effect to tip
        const glowGeometry = new THREE.SphereGeometry(0.05, 16, 16);
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: 0x4ecdc4,
            transparent: true,
            opacity: 0.3
        });
        const glow = new THREE.Mesh(glowGeometry, glowMaterial);
        glow.position.y = 0.6;
        
        this.batonGroup.add(handle);
        this.batonGroup.add(tip);
        this.batonGroup.add(glow);
        
        // Position baton in scene
        this.batonGroup.position.set(0, 1, 0);
        this.scene.add(this.batonGroup);
        
        this.baton = this.batonGroup;
    }

    createPlatform() {
        // Conducting podium
        const platformGeometry = new THREE.CylinderGeometry(2, 2, 0.2, 32);
        const platformMaterial = new THREE.MeshPhongMaterial({ 
            color: 0x333333,
            transparent: true,
            opacity: 0.8
        });
        const platform = new THREE.Mesh(platformGeometry, platformMaterial);
        platform.position.y = -0.1;
        platform.receiveShadow = true;
        this.scene.add(platform);
        
        // Grid lines on platform
        const gridHelper = new THREE.PolarGridHelper(2, 8, 8, 64, 0x4ecdc4, 0x4ecdc4);
        gridHelper.position.y = 0.01;
        gridHelper.material.opacity = 0.3;
        gridHelper.material.transparent = true;
        this.scene.add(gridHelper);
    }

    animate3D() {
        if (!this.isMobile && this.renderer) {
            this.update3DBaton();
            this.renderer.render(this.scene, this.camera);
            requestAnimationFrame(() => this.animate3D());
        }
    }

    update3DBaton() {
        // Find conducting data from presence
        const conductingData = Object.values(this.room.presence).find(p => p.role === 'conductor' && p.motionData);
        
        if (conductingData && conductingData.motionData && this.baton) {
            const motion = conductingData.motionData;
            
            // Combine gyroscope data with pose data for better positioning
            let basePosition = { x: 0, y: 1, z: 0 };
            let positionWeight = 0.5; // Weight for pose vs gyroscope data

            // Use pose data for base positioning if available and confident
            if (this.poseData.confidence > 0.5) {
                basePosition = {
                    x: this.poseData.handPosition.x,
                    y: Math.max(0.5, 1 + this.poseData.handPosition.y), // Keep above ground
                    z: this.poseData.handPosition.z
                };
                positionWeight = 0.8; // Higher weight for pose data when confident
            }

            // Apply rotations based on device orientation (gyroscope data)
            if (motion.tilt) {
                const alpha = THREE.MathUtils.degToRad(motion.tilt.alpha || 0);
                const beta = THREE.MathUtils.degToRad(motion.tilt.beta || 0);
                const gamma = THREE.MathUtils.degToRad(motion.tilt.gamma || 0);
                
                // Apply rotations with smoothing
                this.baton.rotation.x = THREE.MathUtils.lerp(this.baton.rotation.x, beta * 0.5, 0.1);
                this.baton.rotation.y = THREE.MathUtils.lerp(this.baton.rotation.y, alpha * 0.3, 0.1);
                this.baton.rotation.z = THREE.MathUtils.lerp(this.baton.rotation.z, gamma * 0.5, 0.1);
            }
            
            // Combine pose position with gyroscope motion data
            if (motion.acceleration) {
                const intensity = motion.intensity || 0;
                const accelScale = Math.min(intensity * 0.05, 0.3); // Reduced scale when using pose data
                
                // Mix pose-based position with acceleration offsets
                const targetX = basePosition.x + (motion.acceleration.x || 0) * accelScale;
                const targetY = basePosition.y + (motion.acceleration.z || 0) * accelScale;
                const targetZ = basePosition.z + (motion.acceleration.y || 0) * accelScale;
                
                this.baton.position.x = THREE.MathUtils.lerp(this.baton.position.x, targetX, 0.15);
                this.baton.position.y = THREE.MathUtils.lerp(this.baton.position.y, targetY, 0.15);
                this.baton.position.z = THREE.MathUtils.lerp(this.baton.position.z, targetZ, 0.15);
            } else {
                // Use pose data only
                this.baton.position.x = THREE.MathUtils.lerp(this.baton.position.x, basePosition.x, 0.1);
                this.baton.position.y = THREE.MathUtils.lerp(this.baton.position.y, basePosition.y, 0.1);
                this.baton.position.z = THREE.MathUtils.lerp(this.baton.position.z, basePosition.z, 0.1);
            }
            
            // Update sensor data display with combined data
            this.updateSensorDataDisplay(motion);
            
            // Update tempo display
            const tempoText = document.getElementById('tempoText');
            if (motion.tempo && tempoText) {
                tempoText.textContent = `♩ = ${Math.round(motion.tempo)} BPM`;
            }
        }
    }

    updateSensorDataDisplay(motionData) {
        // Update all sensor data displays including pose data
        const elements = {
            alphaValue: motionData.tilt?.alpha?.toFixed(1) + '°' || '0°',
            betaValue: motionData.tilt?.beta?.toFixed(1) + '°' || '0°',
            gammaValue: motionData.tilt?.gamma?.toFixed(1) + '°' || '0°',
            accelXValue: motionData.acceleration?.x?.toFixed(2) || '0',
            accelYValue: motionData.acceleration?.y?.toFixed(2) || '0',
            accelZValue: motionData.acceleration?.z?.toFixed(2) || '0',
            intensityValue: motionData.intensity?.toFixed(2) || '0',
            detectedTempo: Math.round(motionData.tempo || 120) + ' BPM'
        };
        
        Object.entries(elements).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = value;
            }
        });

        // Add pose data to sensor panel if we have it
        const poseDataElements = document.querySelectorAll('.pose-data-item');
        if (poseDataElements.length === 0 && this.poseData.confidence > 0) {
            const sensorGrid = document.querySelector('.data-grid');
            if (sensorGrid) {
                // Add pose data items
                const poseItems = [
                    { label: 'Pose Confidence:', id: 'poseConfidence', value: Math.round(this.poseData.confidence * 100) + '%' },
                    { label: 'Dominant Hand:', id: 'dominantHand', value: this.poseData.dominantHand },
                    { label: 'Hand Position X:', id: 'handPosX', value: this.poseData.handPosition.x.toFixed(2) },
                    { label: 'Hand Position Y:', id: 'handPosY', value: this.poseData.handPosition.y.toFixed(2) }
                ];

                poseItems.forEach(item => {
                    const div = document.createElement('div');
                    div.className = 'data-item pose-data-item';
                    div.innerHTML = `<label>${item.label}</label><span id="${item.id}">${item.value}</span>`;
                    sensorGrid.appendChild(div);
                });
            }
        } else {
            // Update existing pose data
            const poseElements = {
                poseConfidence: Math.round(this.poseData.confidence * 100) + '%',
                dominantHand: this.poseData.dominantHand,
                handPosX: this.poseData.handPosition.x.toFixed(2),
                handPosY: this.poseData.handPosition.y.toFixed(2)
            };

            Object.entries(poseElements).forEach(([id, value]) => {
                const element = document.getElementById(id);
                if (element) {
                    element.textContent = value;
                }
            });
        }
    }

    startConducting() {
        this.conducting = true;
        document.getElementById('startConducting').style.display = 'none';
        document.getElementById('stopConducting').style.display = 'block';
        
        if (this.conductorController) {
            this.conductorController.startConducting();
        }
    }

    stopConducting() {
        this.conducting = false;
        document.getElementById('startConducting').style.display = 'block';
        document.getElementById('stopConducting').style.display = 'none';
        
        if (this.conductorController) {
            this.conductorController.stopConducting();
        }
    }

    setupEventListeners() {
        this.room.subscribePresence((presence) => {
            if (!this.isMobile) {
                this.updateConductorDisplay();
            }
        });

        this.room.onmessage = (event) => {
            const data = event.data;
            switch (data.type) {
                case "connected":
                    console.log(`User connected: ${data.username}`);
                    break;
                case "disconnected":
                    console.log(`User disconnected: ${data.username}`);
                    break;
            }
        };
    }

    updateConductorDisplay() {
        const desktopStatus = document.getElementById('desktopStatus');
        const waitingMessage = document.getElementById('waitingMessage');
        const conductingVisualization = document.getElementById('conductingVisualization');
        const conductorInfo = document.getElementById('conductorInfo');
        
        const connectedUsers = Object.keys(this.room.peers).length;
        const conductor = Object.values(this.room.presence).find(p => p.role === 'conductor');

        if (conductor) {
            desktopStatus.textContent = `Conductor connected - ${conductor.conducting ? 'Conducting' : 'Ready'}`;
            waitingMessage.style.display = 'none';
            conductingVisualization.style.display = 'block';
            
            // Update conductor info
            const conductorPeer = Object.values(this.room.peers).find(peer => 
                this.room.presence[peer.id]?.role === 'conductor'
            );
            
            if (conductorPeer) {
                conductorInfo.innerHTML = `
                    <div class="conductor-card">
                        <h3>Conductor: ${conductorPeer.username}</h3>
                        <p>Status: ${conductor.conducting ? '🎼 Conducting' : '⏸️ Ready'}</p>
                        ${conductor.motionData ? `<p>Tempo: ${Math.round(conductor.motionData.tempo || 120)} BPM</p>` : ''}
                    </div>
                `;
            }
        } else {
            desktopStatus.textContent = `Connected: ${connectedUsers} users - Waiting for conductor...`;
            waitingMessage.style.display = 'block';
            conductingVisualization.style.display = 'none';
        }
    }

    updateDeviceInfo() {
        const deviceInfo = document.getElementById('deviceInfo');
        deviceInfo.textContent = this.isMobile ? 'Mobile Baton' : 'Desktop Display';
    }
}

// Initialize the Digital Conductor
const conductor = new DigitalConductor();