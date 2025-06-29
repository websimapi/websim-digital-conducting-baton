class DigitalConductor {
    constructor() {
        this.room = new WebsimSocket();
        this.isMobile = this.detectMobile();
        this.conductorController = null;
        this.conducting = false;
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
        this.setupConductingVisualization();
        this.updateConductorDisplay();
    }

    setupConductingVisualization() {
        const canvas = document.getElementById('conductingCanvas');
        const ctx = canvas.getContext('2d');
        
        // Initialize canvas for conducting pattern visualization
        this.canvas = canvas;
        this.ctx = ctx;
        this.batonTrail = [];
        this.maxTrailLength = 50;
        
        this.animateVisualization();
    }

    animateVisualization() {
        if (!this.isMobile) {
            this.renderConductingPattern();
            requestAnimationFrame(() => this.animateVisualization());
        }
    }

    renderConductingPattern() {
        const ctx = this.ctx;
        const canvas = this.canvas;
        
        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Find conducting data from presence
        const conductingData = Object.values(this.room.presence).find(p => p.role === 'conductor' && p.motionData);
        
        if (conductingData && conductingData.motionData) {
            const motion = conductingData.motionData;
            
            // Add current position to trail
            const centerX = canvas.width / 2;
            const centerY = canvas.height / 2;
            const x = centerX + (motion.tilt?.beta || 0) * 2;
            const y = centerY + (motion.tilt?.gamma || 0) * 2;
            
            this.batonTrail.push({ x, y, timestamp: Date.now() });
            
            // Remove old trail points
            const now = Date.now();
            this.batonTrail = this.batonTrail.filter(point => now - point.timestamp < 2000);
            
            // Draw trail
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            
            for (let i = 1; i < this.batonTrail.length; i++) {
                const opacity = 1 - (now - this.batonTrail[i].timestamp) / 2000;
                ctx.globalAlpha = opacity;
                ctx.moveTo(this.batonTrail[i-1].x, this.batonTrail[i-1].y);
                ctx.lineTo(this.batonTrail[i].x, this.batonTrail[i].y);
                ctx.stroke();
            }
            
            // Draw current baton position
            ctx.globalAlpha = 1;
            ctx.fillStyle = '#4ecdc4';
            ctx.beginPath();
            ctx.arc(x, y, 8, 0, 2 * Math.PI);
            ctx.fill();
            
            // Update tempo display
            const tempoText = document.getElementById('tempoText');
            if (motion.tempo) {
                tempoText.textContent = `♩ = ${Math.round(motion.tempo)} BPM`;
            }
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