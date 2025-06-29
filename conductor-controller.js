class ConductorController {
    constructor(room) {
        this.room = room;
        this.conducting = false;
        this.motionData = {
            tilt: { alpha: 0, beta: 0, gamma: 0 },
            acceleration: { x: 0, y: 0, z: 0 },
            tempo: 120,
            intensity: 0,
            lastBeat: Date.now()
        };
        
        this.calibrationData = {
            alpha: 0,
            beta: 0,
            gamma: 0
        };
        
        this.beatDetection = {
            lastPeaks: [],
            threshold: 2.0,
            minInterval: 300, // Minimum ms between beats
        };
        
        this.sensorPermission = false;
        this.updateInterval = null;
        
        this.initializeSensors();
        this.setupUI();
    }

    async initializeSensors() {
        try {
            // Request device motion permission for iOS 13+
            if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                const permission = await DeviceMotionEvent.requestPermission();
                this.sensorPermission = permission === 'granted';
            } else {
                this.sensorPermission = true;
            }

            if (this.sensorPermission) {
                this.setupMotionListeners();
                this.updateStatus('Sensors ready - Hold phone like a baton');
            } else {
                this.updateStatus('Sensor permission denied');
            }
        } catch (error) {
            console.error('Error initializing sensors:', error);
            this.updateStatus('Sensor error - Try refreshing page');
        }
    }

    setupMotionListeners() {
        // Device orientation (gyroscope/compass)
        window.addEventListener('deviceorientation', (event) => {
            this.motionData.tilt = {
                alpha: event.alpha || 0,  // Z-axis (compass)
                beta: event.beta || 0,    // X-axis (front-to-back tilt)
                gamma: event.gamma || 0   // Y-axis (left-to-right tilt)
            };
            
            // Apply calibration offset
            this.motionData.tilt.alpha -= this.calibrationData.alpha;
            this.motionData.tilt.beta -= this.calibrationData.beta;
            this.motionData.tilt.gamma -= this.calibrationData.gamma;
            
            this.updateSensorDisplay();
        });

        // Device motion (accelerometer)
        window.addEventListener('devicemotion', (event) => {
            if (event.acceleration) {
                this.motionData.acceleration = {
                    x: event.acceleration.x || 0,
                    y: event.acceleration.y || 0,
                    z: event.acceleration.z || 0
                };
                
                // Calculate motion intensity for tempo detection
                const totalAcceleration = Math.sqrt(
                    Math.pow(this.motionData.acceleration.x, 2) +
                    Math.pow(this.motionData.acceleration.y, 2) +
                    Math.pow(this.motionData.acceleration.z, 2)
                );
                
                this.motionData.intensity = totalAcceleration;
                
                if (this.conducting) {
                    this.detectBeat(totalAcceleration);
                }
                
                this.updateSensorDisplay();
            }
        });
    }

    detectBeat(intensity) {
        const now = Date.now();
        
        // Detect peaks in motion intensity
        if (intensity > this.beatDetection.threshold) {
            const timeSinceLastBeat = now - this.motionData.lastBeat;
            
            if (timeSinceLastBeat > this.beatDetection.minInterval) {
                this.motionData.lastBeat = now;
                this.beatDetection.lastPeaks.push(now);
                
                // Keep only recent peaks for tempo calculation
                this.beatDetection.lastPeaks = this.beatDetection.lastPeaks.filter(
                    peak => now - peak < 5000 // Keep last 5 seconds
                );
                
                // Calculate tempo from recent beats
                if (this.beatDetection.lastPeaks.length >= 2) {
                    const intervals = [];
                    for (let i = 1; i < this.beatDetection.lastPeaks.length; i++) {
                        intervals.push(this.beatDetection.lastPeaks[i] - this.beatDetection.lastPeaks[i-1]);
                    }
                    
                    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
                    this.motionData.tempo = Math.round(60000 / avgInterval); // Convert to BPM
                    
                    // Clamp tempo to reasonable range
                    this.motionData.tempo = Math.max(60, Math.min(200, this.motionData.tempo));
                }
                
                this.triggerBeatPulse();
            }
        }
    }

    triggerBeatPulse() {
        const beatPulse = document.getElementById('beatPulse');
        const tempoDisplay = document.getElementById('tempoDisplay');
        
        beatPulse.classList.add('active');
        tempoDisplay.textContent = `♩ = ${this.motionData.tempo}`;
        
        setTimeout(() => {
            beatPulse.classList.remove('active');
        }, 200);
    }

    setupUI() {
        // Update presence to indicate this is a conductor
        this.room.updatePresence({
            role: 'conductor',
            conducting: false
        });
    }

    startConducting() {
        this.conducting = true;
        this.updateStatus('🎼 Conducting - Move your phone like a baton');
        
        // Add conducting class for visual effects
        document.getElementById('conductingArea').classList.add('conducting');
        
        // Start regular updates to the room
        this.updateInterval = setInterval(() => {
            this.broadcastMotionData();
        }, 50); // 20 FPS updates
        
        this.room.updatePresence({
            role: 'conductor',
            conducting: true,
            motionData: this.motionData
        });
    }

    stopConducting() {
        this.conducting = false;
        this.updateStatus('Ready to conduct');
        
        document.getElementById('conductingArea').classList.remove('conducting');
        
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
        
        this.room.updatePresence({
            role: 'conductor',
            conducting: false,
            motionData: null
        });
    }

    calibrate() {
        // Store current orientation as calibration offset
        this.calibrationData = {
            alpha: this.motionData.tilt.alpha,
            beta: this.motionData.tilt.beta,
            gamma: this.motionData.tilt.gamma
        };
        
        this.updateStatus('Calibrated - Ready to conduct');
        
        // Visual feedback
        const calibrateBtn = document.getElementById('calibrateBaton');
        const originalText = calibrateBtn.textContent;
        calibrateBtn.textContent = 'Calibrated!';
        calibrateBtn.style.background = 'linear-gradient(45deg, #4ecdc4, #44a08d)';
        
        setTimeout(() => {
            calibrateBtn.textContent = originalText;
            calibrateBtn.style.background = 'linear-gradient(45deg, #ffd93d, #ff9800)';
        }, 1500);
    }

    broadcastMotionData() {
        if (this.conducting) {
            this.room.updatePresence({
                role: 'conductor',
                conducting: true,
                motionData: {
                    ...this.motionData,
                    timestamp: Date.now()
                }
            });
        }
    }

    updateSensorDisplay() {
        const tiltReading = document.getElementById('tiltReading');
        const motionReading = document.getElementById('motionReading');
        
        if (tiltReading) {
            const tiltMagnitude = Math.sqrt(
                Math.pow(this.motionData.tilt.beta, 2) + 
                Math.pow(this.motionData.tilt.gamma, 2)
            );
            tiltReading.textContent = `${Math.round(tiltMagnitude)}°`;
        }
        
        if (motionReading) {
            motionReading.textContent = Math.round(this.motionData.intensity * 10) / 10;
        }
    }

    updateStatus(message) {
        const statusElement = document.getElementById('batonStatus');
        if (statusElement) {
            statusElement.textContent = message;
        }
    }
}