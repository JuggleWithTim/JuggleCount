# JuggleCount

A live juggling catch counter using computer vision. This Electron application tracks juggling balls in real-time using your webcam and counts catches as they cross a configurable detection line.

## Features

- **Real-time Computer Vision**: Uses advanced color detection and tracking algorithms to identify juggling balls
- **Single & Multi-ball Tracking**: Support for both single ball and multiple ball juggling patterns
- **Color Calibration**: Click on a ball in the video feed to automatically calibrate color detection
- **Adjustable Parameters**: Fine-tune detection with sliders for:
  - Detection line height
  - Color tolerance
  - Minimum ball size
  - Circularity threshold
  - HSV hue weighting
  - Catch multiplier
- **OBS Integration**: Automatically writes the current count to a text file for use in streaming software like OBS
- **Camera Selection**: Choose from multiple available cameras
- **Cross-platform**: Built with Electron for Windows, macOS, and Linux

## Installation

### Prerequisites

- Node.js (v14 or higher)
- npm

### Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/JuggleWithTim/JuggleCount.git
   cd JuggleCount
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

## Usage

### Running the Application

Start the application:
```bash
npm start
```

For development mode (with DevTools open):
```bash
npm run dev
```

### How to Use

1. **Start Camera**: Click "Start Camera" to begin video capture
2. **Calibrate Color**: Click on a juggling ball in the video feed to set the target color
3. **Adjust Detection Line**: Use the "Detection Line Height" slider to position the red line where catches should be counted
4. **Fine-tune Parameters**: Adjust color tolerance, ball size, and other settings as needed
5. **Start Juggling**: The counter will automatically increment when balls cross the detection line from above
6. **Reset**: Use the "Reset Count" button to start over

### OBS Integration

The application creates a `juggle_count.txt` file in the project directory. You can add this as a text source in OBS to display the live count on your stream.

## Configuration

### Detection Parameters

- **Detection Line Height**: Position of the horizontal line (10-90% of video height)
- **Color Tolerance**: How closely pixels must match the target color (5-100)
- **Minimum Ball Size**: Minimum number of matching pixels to consider a ball (5-50)
- **Circularity Threshold**: How circular the detected object must be (0.1-1.0)
- **HSV Hue Weight**: Emphasis on color hue vs. saturation/value in matching (1-10x)
- **Catch Multiplier**: Multiply each catch by this factor (1-10x)

### Multi-ball Mode

Enable "Multi-ball Tracking" to track multiple balls simultaneously. This can be useful if you have the processing power to handle it.
For performance and reliability I recommend using single ball tracking instead and setting Catch Multiplyer to the amount of balls you juggle.

## Troubleshooting

### Camera Issues

- Ensure your webcam is not being used by other applications
- Check camera permissions in your browser/OS settings
- Try selecting a different camera from the dropdown

### Detection Problems

- Calibrate the color by clicking directly on the ball
- Adjust color tolerance if the ball isn't being detected
- Modify the detection line height to match your juggling height
- Increase minimum ball size if small objects are being detected as balls

### Performance

- Lower video resolution or frame rate if performance is poor
- Disable multi-ball mode if not needed

## Development

### Project Structure

- `main.js`: Electron main process
- `index.html`: Application UI
- `app.js`: Computer vision logic and UI controls
- `package.json`: Dependencies and scripts

### Building

To build for distribution:
```bash
npm run build
```

## License

MIT License - see LICENSE file for details

## Author

JuggleWithTim

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Acknowledgments

- Built with [Electron](https://electronjs.org/)
- Uses computer vision algorithms for real-time ball tracking
