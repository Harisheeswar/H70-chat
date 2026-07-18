from flask import Flask, render_template, Response, jsonify
import cv2
import numpy as np
import threading
import time

try:
    import onnxruntime as ort
    has_ort = True
except ImportError:
    has_ort = False

app = Flask(__name__)

# Global variables for the camera and current lens
cap = None
current_lens = 1  # Start with Doll Lens
output_frame = None
lock = threading.Lock()

# Load trackers
face_cascade = cv2.CascadeClassifier('assets/haarcascade_frontalface_default.xml')
eye_cascade = cv2.CascadeClassifier('assets/haarcascade_eye.xml')

# Load the AI model
anime_session = None
if has_ort:
    try:
        anime_session = ort.InferenceSession('assets/animegan.onnx', providers=['CPUExecutionProvider'])
    except Exception as e:
        print(f"Warning: Could not load animegan.onnx model: {e}")

def apply_eye_bulge(img, center_x, center_y, radius, scale):
    h, w = img.shape[:2]
    out_img = img.copy()

    # Get bounding box of the eye area
    x1, y1 = max(0, center_x - radius), max(0, center_y - radius)
    x2, y2 = min(w, center_x + radius), min(h, center_y + radius)

    # Create grid for the bulge effect
    Y, X = np.ogrid[y1:y2, x1:x2]
    Y = Y - center_y
    X = X - center_x

    distance = np.sqrt(X**2 + Y**2)
    
    # Calculate bulging distortion mask
    mask = distance < radius
    
    if not np.any(mask):
        return out_img
        
    distortion = (distance / radius) ** scale
    
    map_x = X * distortion + center_x
    map_y = Y * distortion + center_y

    map_x = map_x.astype(np.float32)
    map_y = map_y.astype(np.float32)
    
    # Apply remapping only to the masked area
    warped_roi = cv2.remap(img, map_x, map_y, cv2.INTER_LINEAR)
    out_img[y1:y2, x1:x2][mask] = warped_roi[y1:y2, x1:x2][mask]

    return out_img

def process_frame(frame):
    global current_lens
    
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    faces = face_cascade.detectMultiScale(gray, 1.3, 5, minSize=(100, 100))

    final_frame = frame.copy()

    if current_lens == 0:
        pass # No filter
        
    elif current_lens == 1:
        # DOLL EFFECT
        for (x, y, w, h) in faces:
            roi_gray = gray[y:y+h, x:x+w]
            eyes = eye_cascade.detectMultiScale(roi_gray, 1.1, 5, minSize=(20, 20))

            if len(eyes) >= 2:
                # Sort eyes left to right
                eyes = sorted(eyes, key=lambda e: e[0])
                for (ex, ey, ew, eh) in eyes[:2]:
                    center_x = x + ex + ew // 2
                    center_y = y + ey + eh // 2
                    eye_radius = int(max(ew, eh) * 0.7)
                    
                    final_frame = apply_eye_bulge(final_frame, center_x, center_y, eye_radius, 0.75)

        hsv = cv2.cvtColor(final_frame, cv2.COLOR_BGR2HSV).astype(np.float32)
        hsv[:, :, 1] = hsv[:, :, 1] * 1.3
        hsv = np.clip(hsv, 0, 255).astype(np.uint8)
        final_frame = cv2.cvtColor(hsv, cv2.COLOR_HSV2BGR)

    elif current_lens == 2:
        # TRUE GENERATIVE AI ANIME (Full Frame for better quality)
        if anime_session is not None:
            try:
                h_orig, w_orig = frame.shape[:2]
                
                # The AI model processes at 384x384 for a wider, more professional look
                input_size = 384
                small_frame = cv2.resize(frame, (input_size, input_size))
                small_frame = cv2.cvtColor(small_frame, cv2.COLOR_BGR2RGB)
                
                x_input = (small_frame.astype(np.float32) / 127.5) - 1.0
                
                expected_shape = anime_session.get_inputs()[0].shape
                if expected_shape[1] == 3 or expected_shape[1] == '3':
                    x_input = np.transpose(x_input, (2, 0, 1))
                    x_input = np.expand_dims(x_input, axis=0)
                else:
                    x_input = np.expand_dims(x_input, axis=0)
                
                input_name = anime_session.get_inputs()[0].name
                out = anime_session.run(None, {input_name: x_input})[0]
                
                out = out.squeeze()
                if out.shape[0] == 3:
                    out = np.transpose(out, (1, 2, 0))
                    
                out = (out + 1.0) * 127.5
                out = np.clip(out, 0, 255).astype(np.uint8)
                out = cv2.cvtColor(out, cv2.COLOR_RGB2BGR)
                
                final_frame = cv2.resize(out, (w_orig, h_orig), interpolation=cv2.INTER_LINEAR)
            except Exception as e:
                cv2.putText(final_frame, f"AI ERROR: {str(e)}", (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2, cv2.LINE_AA)
        else:
            cv2.putText(final_frame, "AI MODULE LOADING...", (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2, cv2.LINE_AA)

    return final_frame

def camera_thread():
    global cap, output_frame, lock
    cap = cv2.VideoCapture(0)
    
    while True:
        ret, frame = cap.read()
        if not ret:
            continue
            
        processed = process_frame(frame)
        
        # Add slight mirror effect for natural camera feel
        processed = cv2.flip(processed, 1)

        with lock:
            output_frame = processed.copy()

def generate_video():
    global output_frame, lock
    
    while True:
        with lock:
            if output_frame is None:
                continue
            
            # Encode frame to JPEG
            ret, encodedImage = cv2.imencode(".jpg", output_frame)
            if not ret:
                continue

        # Yield frame in multipart format
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + bytearray(encodedImage) + b'\r\n')
        # Add a tiny sleep to prevent hogging the CPU when the stream is very fast
        time.sleep(0.01)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/video_feed')
def video_feed():
    return Response(generate_video(), mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/set_lens/<int:lens_id>', methods=['POST'])
def set_lens(lens_id):
    global current_lens
    current_lens = lens_id
    return jsonify({"status": "success", "lens": current_lens})

if __name__ == '__main__':
    # Start the background camera thread
    t = threading.Thread(target=camera_thread)
    t.daemon = True
    t.start()
    
    # Run Flask server
    app.run(host='0.0.0.0', port=5000, debug=False, use_reloader=False)
