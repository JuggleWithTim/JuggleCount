const fs = require('fs');
const path = require('path');
const os = require('os');

class JuggleCounter {
    constructor() {
        this.video = document.getElementById('videoElement');
        this.canvas = document.getElementById('videoCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.detectionLine = document.getElementById('detectionLine');

        // Set up OBS text file path
        this.obsFilePath = path.join(__dirname, 'juggle_count.txt');

        // UI elements
        this.startButton = document.getElementById('startButton');
        this.stopButton = document.getElementById('stopButton');
        this.colorPicker = document.getElementById('colorPicker');
        this.lineHeightSlider = document.getElementById('lineHeight');
        this.lineHeightValue = document.getElementById('lineHeightValue');
        this.toleranceSlider = document.getElementById('colorTolerance');
        this.toleranceValue = document.getElementById('toleranceValue');
        this.ballSizeSlider = document.getElementById('minBallSize');
        this.ballSizeValue = document.getElementById('ballSizeValue');
        this.circularitySlider = document.getElementById('circularityThreshold');
        this.circularityValue = document.getElementById('circularityValue');
        this.hsvWeightSlider = document.getElementById('hsvWeight');
        this.hsvWeightValue = document.getElementById('hsvWeightValue');
        this.multiplierSlider = document.getElementById('catchMultiplier');
        this.multiplierValue = document.getElementById('multiplierValue');
        this.cameraSelect = document.getElementById('cameraSelect');
        this.multiBallCheckbox = document.getElementById('multiBallMode');
        this.catchCount = document.getElementById('catchCount');
        this.statusMessage = document.getElementById('statusMessage');
        this.resetButton = document.getElementById('resetCount');
        this.calibrateButton = document.getElementById('calibrateColor');

        // State
        this.isRunning = false;
        this.stream = null;
        this.animationId = null;
        this.count = 0;
        this.balls = []; // Array of {id, x, y, size, lastY}
        this.nextBallId = 0;
        this.lastBallPosition = null; // For single-ball mode
        this.crossingCooldown = 0;
        this.multiBallMode = false; // Default to single-ball mode
        this.selectedCameraId = null; // Selected camera device ID

        // Detection parameters
        this.targetColor = { r: 255, g: 0, b: 0 }; // Default red
        this.colorTolerance = 30;
        this.lineHeightPercent = 50;
        this.minBallSize = 10;
        this.circularityThreshold = 0.6; // Minimum circularity for ball detection
        this.hsvHueWeight = 4; // Weight for hue in HSV distance calculation
        this.catchMultiplier = 1; // Multiplier for catch counting

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.updateDetectionLine();
        this.enumerateCameras();
        this.initializeObsFile();
        this.updateStatus('Ready to start camera');
    }

    setupEventListeners() {
        this.startButton.addEventListener('click', () => this.startCamera());
        this.stopButton.addEventListener('click', () => this.stopCamera());
        this.colorPicker.addEventListener('change', (e) => this.setTargetColor(e.target.value));
        this.lineHeightSlider.addEventListener('input', (e) => this.setLineHeight(e.target.value));
        this.toleranceSlider.addEventListener('input', (e) => this.setColorTolerance(e.target.value));
        this.ballSizeSlider.addEventListener('input', (e) => this.setMinBallSize(e.target.value));
        this.circularitySlider.addEventListener('input', (e) => this.setCircularityThreshold(e.target.value));
        this.hsvWeightSlider.addEventListener('input', (e) => this.setHsvHueWeight(e.target.value));
        this.multiplierSlider.addEventListener('input', (e) => this.setCatchMultiplier(e.target.value));
        this.cameraSelect.addEventListener('change', (e) => this.setSelectedCamera(e.target.value));
        this.multiBallCheckbox.addEventListener('change', (e) => this.setMultiBallMode(e.target.checked));
        this.resetButton.addEventListener('click', () => this.resetCount());
        this.calibrateButton.addEventListener('click', () => this.calibrateColor());
        this.canvas.addEventListener('click', (e) => this.pickColorFromVideo(e));
    }

    async startCamera() {
        try {
            const constraints = {
                video: {
                    width: 640,
                    height: 480
                }
            };

            // Use selected camera if available, otherwise use default
            if (this.selectedCameraId) {
                constraints.video.deviceId = { exact: this.selectedCameraId };
            } else {
                constraints.video.facingMode = 'user';
            }

            this.stream = await navigator.mediaDevices.getUserMedia(constraints);

            this.video.srcObject = this.stream;
            this.video.onloadedmetadata = () => {
                this.canvas.width = this.video.videoWidth;
                this.canvas.height = this.video.videoHeight;
                this.isRunning = true;
                this.startProcessing();
                this.updateStatus('Camera started - click on the ball to calibrate color', 'success');
            };

            this.startButton.disabled = true;
            this.stopButton.disabled = false;

        } catch (error) {
            console.error('Error accessing camera:', error);
            this.updateStatus('Failed to access camera. Please check permissions.', 'error');
        }
    }

    stopCamera() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }

        this.isRunning = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.startButton.disabled = false;
        this.stopButton.disabled = true;
        this.updateStatus('Camera stopped', 'info');
    }

    startProcessing() {
        const processFrame = () => {
            if (!this.isRunning) return;

            this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
            this.processFrame();
            this.animationId = requestAnimationFrame(processFrame);
        };

        processFrame();
    }

    processFrame() {
        const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        const pixels = imageData.data;

        if (this.multiBallMode) {
            // Multi-ball mode
            const detectedBalls = this.findBall(pixels);
            this.updateBallTracking(detectedBalls);

            // Draw detection circles for all balls
            this.balls.forEach(ball => {
                this.drawBallDetection(ball);
            });

            // Check for line crossings
            this.checkLineCrossings();
        } else {
            // Single-ball mode (original logic)
            const ballPosition = this.findBallSingle(pixels);

            if (ballPosition) {
                // Draw detection circle around ball
                this.drawBallDetection(ballPosition);

                // Check for line crossing
                this.checkLineCrossing(ballPosition);
            }
        }

        // Update cooldown
        if (this.crossingCooldown > 0) {
            this.crossingCooldown--;
        }
    }

    findBall(pixels) {
        const width = this.canvas.width;
        const height = this.canvas.height;
        const matchingPixels = [];

        // Collect all matching pixels
        for (let y = 0; y < height; y += 2) {
            for (let x = 0; x < width; x += 2) {
                const index = (y * width + x) * 4;
                const r = pixels[index];
                const g = pixels[index + 1];
                const b = pixels[index + 2];

                if (this.colorMatches(r, g, b)) {
                    matchingPixels.push({ x, y });
                }
            }
        }

        // Cluster pixels into balls
        const balls = this.clusterPixels(matchingPixels);

        // Filter balls by minimum size
        return balls.filter(ball => ball.size >= this.minBallSize);
    }

    clusterPixels(pixels) {
        const clusters = [];
        const visited = new Set();
        const clusterRadius = 25; // Maximum distance between pixels in same cluster

        for (const pixel of pixels) {
            const key = `${pixel.x},${pixel.y}`;
            if (visited.has(key)) continue;

            // Start new cluster
            const cluster = [];
            const queue = [pixel];
            visited.add(key);

            while (queue.length > 0) {
                const current = queue.shift();
                cluster.push(current);

                // Find nearby pixels
                for (const other of pixels) {
                    const otherKey = `${other.x},${other.y}`;
                    if (visited.has(otherKey)) continue;

                    const distance = Math.sqrt(
                        Math.pow(current.x - other.x, 2) + Math.pow(current.y - other.y, 2)
                    );

                    if (distance <= clusterRadius) {
                        queue.push(other);
                        visited.add(otherKey);
                    }
                }
            }

            // Calculate cluster centroid and size
            if (cluster.length > 0) {
                const totalX = cluster.reduce((sum, p) => sum + p.x, 0);
                const totalY = cluster.reduce((sum, p) => sum + p.y, 0);

                const centroid = {
                    x: totalX / cluster.length,
                    y: totalY / cluster.length,
                    size: cluster.length
                };

                // Calculate circularity and only keep circular shapes
                const circularity = this.calculateCircularity(cluster);
                if (circularity > this.circularityThreshold) { // Configurable threshold for circular shapes
                    clusters.push(centroid);
                }
            }
        }

        return clusters;
    }

    rgbToHsv(r, g, b) {
        r /= 255;
        g /= 255;
        b /= 255;

        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const diff = max - min;

        let h = 0;
        const s = max === 0 ? 0 : diff / max;
        const v = max;

        if (max !== min) {
            switch (max) {
                case r: h = (g - b) / diff + (g < b ? 6 : 0); break;
                case g: h = (b - r) / diff + 2; break;
                case b: h = (r - g) / diff + 4; break;
            }
            h /= 6;
        }

        return { h: h * 360, s, v };
    }

    hsvDistance(hsv1, hsv2) {
        // Calculate distance in HSV space, with configurable emphasis on hue
        const hueDiff = Math.min(Math.abs(hsv1.h - hsv2.h), 360 - Math.abs(hsv1.h - hsv2.h)) / 180; // Normalize to 0-1
        const satDiff = Math.abs(hsv1.s - hsv2.s);
        const valDiff = Math.abs(hsv1.v - hsv2.v);

        // Weight hue more heavily as it's more distinctive for colors
        return Math.sqrt(hueDiff * hueDiff * this.hsvHueWeight + satDiff * satDiff + valDiff * valDiff);
    }

    colorMatches(r, g, b) {
        const pixelHsv = this.rgbToHsv(r, g, b);
        const targetHsv = this.rgbToHsv(this.targetColor.r, this.targetColor.g, this.targetColor.b);

        const distance = this.hsvDistance(pixelHsv, targetHsv);
        return distance <= (this.colorTolerance / 100); // Normalize tolerance to 0-1 range
    }

    calculateCircularity(cluster) {
        if (cluster.length < 3) return 0;

        // Calculate centroid
        const centroid = {
            x: cluster.reduce((sum, p) => sum + p.x, 0) / cluster.length,
            y: cluster.reduce((sum, p) => sum + p.y, 0) / cluster.length
        };

        // Calculate average distance from centroid (radius)
        const avgRadius = cluster.reduce((sum, p) => {
            return sum + Math.sqrt(Math.pow(p.x - centroid.x, 2) + Math.pow(p.y - centroid.y, 2));
        }, 0) / cluster.length;

        if (avgRadius === 0) return 0;

        // Calculate circularity: perimeter² / (4π × area)
        // For a perfect circle, this equals 1
        const area = cluster.length;
        const perimeter = this.calculatePerimeter(cluster);

        if (perimeter === 0) return 0;

        const circularity = (4 * Math.PI * area) / (perimeter * perimeter);

        return circularity;
    }

    calculatePerimeter(cluster) {
        if (cluster.length < 3) return 0;

        // Simple perimeter calculation using pixel connectivity
        let perimeter = 0;
        const pixelSet = new Set(cluster.map(p => `${p.x},${p.y}`));

        for (const pixel of cluster) {
            // Check 4-connected neighbors
            const neighbors = [
                {x: pixel.x + 1, y: pixel.y},
                {x: pixel.x - 1, y: pixel.y},
                {x: pixel.x, y: pixel.y + 1},
                {x: pixel.x, y: pixel.y - 1}
            ];

            let boundaryEdges = 4; // Start with 4 edges
            for (const neighbor of neighbors) {
                if (pixelSet.has(`${neighbor.x},${neighbor.y}`)) {
                    boundaryEdges--; // Connected to neighbor, so not a boundary edge
                }
            }
            perimeter += boundaryEdges;
        }

        return perimeter;
    }

    drawBallDetection(ball) {
        this.ctx.strokeStyle = '#00ff00';
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.arc(ball.x, ball.y, Math.sqrt(ball.size) + 5, 0, 2 * Math.PI);
        this.ctx.stroke();
    }

    updateBallTracking(detectedBalls) {
        const maxTrackingDistance = 50; // Maximum distance to match existing balls
        const matched = new Set();

        // Update existing balls with new detections
        this.balls.forEach(ball => {
            let bestMatch = null;
            let bestDistance = Infinity;

            detectedBalls.forEach((detected, index) => {
                if (matched.has(index)) return;

                const distance = Math.sqrt(
                    Math.pow(ball.x - detected.x, 2) + Math.pow(ball.y - detected.y, 2)
                );

                if (distance < maxTrackingDistance && distance < bestDistance) {
                    bestMatch = { detected, index };
                    bestDistance = distance;
                }
            });

            if (bestMatch) {
                // Update ball position
                ball.lastY = ball.y;
                ball.x = bestMatch.detected.x;
                ball.y = bestMatch.detected.y;
                ball.size = bestMatch.detected.size;
                matched.add(bestMatch.index);
            } else {
                // Ball disappeared, mark for removal
                ball.lastY = ball.y;
                ball.disappeared = true;
            }
        });

        // Add new balls
        detectedBalls.forEach((detected, index) => {
            if (!matched.has(index)) {
                this.balls.push({
                    id: this.nextBallId++,
                    x: detected.x,
                    y: detected.y,
                    size: detected.size,
                    lastY: detected.y
                });
            }
        });

        // Remove disappeared balls
        this.balls = this.balls.filter(ball => !ball.disappeared);
    }

    checkLineCrossings() {
        const lineY = (this.lineHeightPercent / 100) * this.canvas.height;

        this.balls.forEach(ball => {
            if (ball.lastY !== undefined) {
                const lastY = ball.lastY;
                const currentY = ball.y;

                // Crossing from above to below (catch)
                if (lastY < lineY && currentY >= lineY && this.crossingCooldown === 0) {
                    this.count += this.catchMultiplier;
                    this.updateCountDisplay();
                    this.crossingCooldown = 15; // Prevent multiple counts for same crossing
                    this.updateStatus(`Catch detected! Count: ${this.count}`, 'success');
                }
                // Crossing from below to above (throw)
                else if (lastY > lineY && currentY <= lineY && this.crossingCooldown === 0) {
                    // Could count throws separately if needed
                    this.crossingCooldown = 15;
                }
            }
        });
    }

    // Single-ball mode methods (original logic)
    findBallSingle(pixels) {
        let totalX = 0;
        let totalY = 0;
        let pixelCount = 0;
        const width = this.canvas.width;
        const height = this.canvas.height;

        // Sample every 4th pixel for performance
        for (let y = 0; y < height; y += 2) {
            for (let x = 0; x < width; x += 2) {
                const index = (y * width + x) * 4;
                const r = pixels[index];
                const g = pixels[index + 1];
                const b = pixels[index + 2];

                if (this.colorMatches(r, g, b)) {
                    totalX += x;
                    totalY += y;
                    pixelCount++;
                }
            }
        }

        if (pixelCount >= this.minBallSize) {
            return {
                x: totalX / pixelCount,
                y: totalY / pixelCount,
                size: pixelCount
            };
        }

        return null;
    }

    checkLineCrossing(ball) {
        const lineY = (this.lineHeightPercent / 100) * this.canvas.height;

        // Check if ball crossed the line (from above to below or vice versa)
        if (this.lastBallPosition) {
            const lastY = this.lastBallPosition.y;
            const currentY = ball.y;

            // Crossing from above to below (catch)
            if (lastY < lineY && currentY >= lineY && this.crossingCooldown === 0) {
                this.count += this.catchMultiplier;
                this.updateCountDisplay();
                this.crossingCooldown = 15; // Prevent multiple counts for same crossing
                this.updateStatus(`Catch detected! Count: ${this.count}`, 'success');
            }
            // Crossing from below to above (throw)
            else if (lastY > lineY && currentY <= lineY && this.crossingCooldown === 0) {
                // Could count throws separately if needed
                this.crossingCooldown = 15;
            }
        }

        this.lastBallPosition = { x: ball.x, y: ball.y };
    }

    pickColorFromVideo(event) {
        if (!this.isRunning) return;

        const rect = this.canvas.getBoundingClientRect();
        const x = Math.floor((event.clientX - rect.left) * (this.canvas.width / rect.width));
        const y = Math.floor((event.clientY - rect.top) * (this.canvas.height / rect.height));

        const imageData = this.ctx.getImageData(x, y, 1, 1);
        const pixels = imageData.data;

        this.setTargetColor(`rgb(${pixels[0]}, ${pixels[1]}, ${pixels[2]})`);
        this.updateStatus('Color calibrated from video', 'success');
    }

    calibrateColor() {
        if (!this.isRunning) {
            this.updateStatus('Start camera first to calibrate color', 'error');
            return;
        }

        this.updateStatus('Click on the ball in the video to calibrate color', 'info');
    }

    setTargetColor(colorValue) {
        if (colorValue.startsWith('rgb')) {
            const match = colorValue.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
            if (match) {
                this.targetColor = {
                    r: parseInt(match[1]),
                    g: parseInt(match[2]),
                    b: parseInt(match[3])
                };
            }
        } else if (colorValue.startsWith('#')) {
            // Convert hex to RGB
            const r = parseInt(colorValue.slice(1, 3), 16);
            const g = parseInt(colorValue.slice(3, 5), 16);
            const b = parseInt(colorValue.slice(5, 7), 16);
            this.targetColor = { r, g, b };
        }

        this.colorPicker.value = this.rgbToHex(this.targetColor.r, this.targetColor.g, this.targetColor.b);
    }

    rgbToHex(r, g, b) {
        return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    }

    setLineHeight(value) {
        this.lineHeightPercent = parseInt(value);
        this.lineHeightValue.textContent = value;
        this.updateDetectionLine();
    }

    setColorTolerance(value) {
        this.colorTolerance = parseInt(value);
        this.toleranceValue.textContent = value;
    }

    setMinBallSize(value) {
        this.minBallSize = parseInt(value);
        this.ballSizeValue.textContent = value;
    }

    setCircularityThreshold(value) {
        this.circularityThreshold = parseFloat(value);
        this.circularityValue.textContent = value;
    }

    setHsvHueWeight(value) {
        this.hsvHueWeight = parseInt(value);
        this.hsvWeightValue.textContent = value + 'x';
    }

    setCatchMultiplier(value) {
        this.catchMultiplier = parseInt(value);
        this.multiplierValue.textContent = value + 'x';
    }

    setMultiBallMode(enabled) {
        this.multiBallMode = enabled;
        // Reset ball tracking when switching modes
        this.balls = [];
        this.nextBallId = 0;
        this.updateStatus(`${enabled ? 'Multi' : 'Single'}-ball tracking enabled`, 'info');
    }

    async enumerateCameras() {
        try {
            // Request camera permission to get device list
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            stream.getTracks().forEach(track => track.stop()); // Stop the temporary stream

            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(device => device.kind === 'videoinput');

            // Clear existing options except the first one
            this.cameraSelect.innerHTML = '<option value="">Select Camera...</option>';

            // Add camera options
            videoDevices.forEach(device => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.textContent = device.label || `Camera ${this.cameraSelect.options.length}`;
                this.cameraSelect.appendChild(option);
            });

            this.updateStatus(`Found ${videoDevices.length} camera(s)`, 'info');
        } catch (error) {
            console.error('Error enumerating cameras:', error);
            this.updateStatus('Unable to access cameras. Please check permissions.', 'error');
        }
    }

    setSelectedCamera(deviceId) {
        this.selectedCameraId = deviceId;
        this.updateStatus(`Camera selected: ${this.cameraSelect.options[this.cameraSelect.selectedIndex].textContent}`, 'info');
    }

    updateDetectionLine() {
        const lineY = (this.lineHeightPercent / 100) * this.canvas.height;
        this.detectionLine.style.top = `${this.canvas.offsetTop + lineY - 1}px`;
        this.detectionLine.style.left = `${this.canvas.offsetLeft}px`;
        this.detectionLine.style.width = `${this.canvas.offsetWidth}px`;
    }

    resetCount() {
        this.count = 0;
        this.balls = [];
        this.nextBallId = 0;
        this.updateCountDisplay();
        this.updateStatus('Count reset to 0', 'info');
    }

    updateCountDisplay() {
        this.catchCount.textContent = this.count;
        this.writeCountToFile();
    }

    initializeObsFile() {
        try {
            // Initialize the OBS text file with 0
            fs.writeFileSync(this.obsFilePath, '0');
            this.updateStatus(`OBS text file initialized: ${this.obsFilePath}`, 'info');
        } catch (error) {
            console.error('Error initializing OBS file:', error);
            this.updateStatus('Failed to initialize OBS text file', 'error');
        }
    }

    writeCountToFile() {
        try {
            // Write the count to the OBS text file
            fs.writeFileSync(this.obsFilePath, this.count.toString());
        } catch (error) {
            console.error('Error writing count to file:', error);
            this.updateStatus('Failed to write count to file', 'error');
        }
    }

    updateStatus(message, type = 'info') {
        this.statusMessage.textContent = message;
        this.statusMessage.className = `status ${type}`;
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    new JuggleCounter();
});
