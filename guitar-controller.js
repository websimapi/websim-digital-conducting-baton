class GuitarController {
    constructor(room) {
        this.room = room;
        this.fretStates = [false, false, false, false, false, false];
        this.strumState = null;
        this.activeTouches = new Map(); // Map touch ID to fret index
        this.touchStartPositions = new Map(); // Track initial touch positions
        
        // Strum state
        this.strumTouchId = null;
        this.lastStrumZone = null;
        
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Prevent default touch behaviors on the entire guitar controller
        const guitarController = document.getElementById('guitarController');
        guitarController.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
        guitarController.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
        guitarController.addEventListener('touchend', (e) => e.preventDefault(), { passive: false });

        // Fret buttons - handle multiple simultaneous touches
        const fretButtons = document.querySelectorAll('.fret-btn');
        
        // Global touch handling for better multi-touch support
        document.addEventListener('touchstart', (e) => {
            this.handleTouchStart(e);
        }, { passive: false });

        document.addEventListener('touchmove', (e) => {
            this.handleTouchMove(e);
        }, { passive: false });

        document.addEventListener('touchend', (e) => {
            this.handleTouchEnd(e);
        }, { passive: false });

        document.addEventListener('touchcancel', (e) => {
            this.handleTouchEnd(e);
        }, { passive: false });

        // Mouse events for desktop testing
        fretButtons.forEach((btn, index) => {
            btn.addEventListener('mousedown', (e) => {
                e.preventDefault();
                this.pressFret(index);
            });
            
            btn.addEventListener('mouseup', (e) => {
                e.preventDefault();
                this.releaseFret(index);
            });
        });

        this.setupStrumListeners();
    }

    handleTouchStart(e) {
        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            const element = this.getElementUnderTouch(touch);
            
            // Store initial touch position for better tracking
            this.touchStartPositions.set(touch.identifier, {
                x: touch.clientX,
                y: touch.clientY,
                timestamp: Date.now()
            });
            
            if (element && element.classList.contains('fret-btn')) {
                const fretIndex = parseInt(element.dataset.fret);
                this.activeTouches.set(touch.identifier, fretIndex);
                this.pressFret(fretIndex);
            }
        }
    }

    handleTouchMove(e) {
        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            const element = this.getElementUnderTouch(touch);
            const oldFretIndex = this.activeTouches.get(touch.identifier);
            
            if (element && element.classList.contains('fret-btn')) {
                const newFretIndex = parseInt(element.dataset.fret);
                
                // If we moved to a different fret button
                if (oldFretIndex !== undefined && oldFretIndex !== newFretIndex) {
                    // Release the old fret if no other touches are on it
                    const stillPressed = Array.from(this.activeTouches.values()).filter(v => v === oldFretIndex).length > 1;
                    if (!stillPressed) {
                        this.releaseFret(oldFretIndex);
                    }
                    
                    // Press the new fret and update the touch mapping
                    this.activeTouches.set(touch.identifier, newFretIndex);
                    this.pressFret(newFretIndex);
                } else if (oldFretIndex === undefined) {
                    // New touch on a fret
                    this.activeTouches.set(touch.identifier, newFretIndex);
                    this.pressFret(newFretIndex);
                }
            } else {
                // Finger moved off all fret buttons
                if (oldFretIndex !== undefined) {
                    const stillPressed = Array.from(this.activeTouches.values()).filter(v => v === oldFretIndex).length > 1;
                    if (!stillPressed) {
                        this.releaseFret(oldFretIndex);
                    }
                    this.activeTouches.delete(touch.identifier);
                }
            }
        }
    }

    handleTouchEnd(e) {
        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            const fretIndex = this.activeTouches.get(touch.identifier);
            
            if (fretIndex !== undefined) {
                this.activeTouches.delete(touch.identifier);
                // Only release if no other touches are on this fret
                const stillPressed = Array.from(this.activeTouches.values()).includes(fretIndex);
                if (!stillPressed) {
                    this.releaseFret(fretIndex);
                }
            }
            
            // Clean up touch tracking
            this.touchStartPositions.delete(touch.identifier);
        }
    }

    getElementUnderTouch(touch) {
        // Use more precise touch detection
        const elements = document.elementsFromPoint(touch.clientX, touch.clientY);
        
        // Find the fret button in the stack of elements
        for (let element of elements) {
            if (element.classList.contains('fret-btn')) {
                return element;
            }
        }
        
        // Fallback to original method
        return document.elementFromPoint(touch.clientX, touch.clientY);
    }

    setupStrumListeners() {
        const strumBar = document.getElementById('strumBar');

        const getStrumZone = (x, rect) => {
            const midpoint = rect.left + rect.width / 2;
            return x < midpoint ? 'up' : 'down';
        };

        const handleStrumStart = (e, touch) => {
            e.preventDefault();
            if (this.strumTouchId !== null) return;

            this.strumTouchId = touch.identifier;
            strumBar.classList.add('pressed');

            const rect = strumBar.getBoundingClientRect();
            this.lastStrumZone = getStrumZone(touch.clientX, rect);
        };

        const handleStrumMove = (e, touch) => {
            e.preventDefault();
            if (touch.identifier !== this.strumTouchId) return;

            const rect = strumBar.getBoundingClientRect();
            const currentZone = getStrumZone(touch.clientX, rect);

            if (currentZone !== this.lastStrumZone) {
                this.strum(currentZone);
                this.lastStrumZone = currentZone;
            }
        };
        
        const handleStrumEnd = (e, touch) => {
            if (touch.identifier !== this.strumTouchId) return;
            
            e.preventDefault();
            this.strumTouchId = null;
            this.lastStrumZone = null;
            strumBar.classList.remove('pressed');
            this.stopStrum();
        };

        strumBar.addEventListener('touchstart', (e) => {
            handleStrumStart(e, e.changedTouches[0]);
        });
        strumBar.addEventListener('touchmove', (e) => {
            handleStrumMove(e, e.changedTouches[0]);
        });
        strumBar.addEventListener('touchend', (e) => {
            handleStrumEnd(e, e.changedTouches[0]);
        });
        strumBar.addEventListener('touchcancel', (e) => {
            handleStrumEnd(e, e.changedTouches[0]);
        });

        // Mouse events for strumming for desktop testing
        let isMouseDown = false;
        strumBar.addEventListener('mousedown', (e) => {
            e.preventDefault();
            isMouseDown = true;
            strumBar.classList.add('pressed');
            const rect = strumBar.getBoundingClientRect();
            this.lastStrumZone = getStrumZone(e.clientX, rect);
        });

        strumBar.addEventListener('mousemove', (e) => {
            if (!isMouseDown) return;
            e.preventDefault();
            const rect = strumBar.getBoundingClientRect();
            const currentZone = getStrumZone(e.clientX, rect);
            if (currentZone !== this.lastStrumZone) {
                this.strum(currentZone);
                this.lastStrumZone = currentZone;
            }
        });

        const mouseUpOrLeaveHandler = (e) => {
            if (!isMouseDown) return;
            e.preventDefault();
            isMouseDown = false;
            strumBar.classList.remove('pressed');
            this.lastStrumZone = null;
            this.stopStrum();
        };
        
        strumBar.addEventListener('mouseup', mouseUpOrLeaveHandler);
        strumBar.addEventListener('mouseleave', mouseUpOrLeaveHandler);
    }

    pressFret(fretIndex) {
        this.fretStates[fretIndex] = true;
        const fretBtn = document.querySelector(`[data-fret="${fretIndex}"]`);
        fretBtn.classList.add('pressed');
        this.updateGuitarState();
    }

    releaseFret(fretIndex) {
        this.fretStates[fretIndex] = false;
        const fretBtn = document.querySelector(`[data-fret="${fretIndex}"]`);
        fretBtn.classList.remove('pressed');
        this.updateGuitarState();
    }

    strum(direction) {
        this.strumState = direction;
        this.updateGuitarState();
        
        // Auto-release strum after short delay
        setTimeout(() => {
            // Only stop if the strum state hasn't been changed by a new strum
            if (this.strumState === direction) {
                this.stopStrum();
            }
        }, 150);
    }

    stopStrum() {
        this.strumState = null;
        this.updateGuitarState();
    }

    updateWhammy() {
        this.updateGuitarState();
    }

    updateGuitarState() {
        this.room.updatePresence({
            instrument: 'guitar',
            guitarState: {
                frets: [...this.fretStates],
                strum: this.strumState,
                timestamp: Date.now()
            }
        });
    }

    showGuitarController() {
        document.getElementById('instrumentSelection').style.display = 'none';
        document.getElementById('guitarController').style.display = 'block';
    }

    hideGuitarController() {
        document.getElementById('instrumentSelection').style.display = 'block';
        document.getElementById('guitarController').style.display = 'none';
        
        // Reset guitar state
        this.room.updatePresence({
            instrument: null,
            guitarState: null
        });
    }
}