import cv2
import numpy as np

try:
    import onnxruntime as ort
    has_ort = True
except ImportError:
    has_ort = False

# Load local trackers from your assets folder
face_cascade = cv2.CascadeClassifier('assets/haarcascade_frontalface_default.xml')
eye_cascade = cv2.CascadeClassifier('assets/haarcascade_eye.xml')

cap = cv2.VideoCapture(0, cv2.CAP_DSHOW) # Use DirectShow for better Windows hardware access
cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*'MJPG')) # High clarity format
cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1920) # 1080p HD clarity
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 1080)
cap.set(cv2.CAP_PROP_FPS, 90) # Request 90 FPS (will default to 60fps if 90 isn't supported by hardware)

# Load the Generative AI ONNX Model safely using onnxruntime
anime_session = None
if has_ort:
    try:
        anime_session = ort.InferenceSession('assets/animegan.onnx', providers=['CPUExecutionProvider'])
    except Exception as e:
        print(f"Warning: Could not load animegan.onnx model: {e}")

# 0: No Filter, 1: Doll Lens, 2: Generative AI Anime
# Starting on 1 so it doesn't instantly crash if Mode 2 is loading
current_lens = 1

def apply_eye_bulge(img, center_x, center_y, radius, scale):
    h, w = img.shape[:2]
    xs = np.arange(w)
    ys = np.arange(h)
    x_grid, y_grid = np.meshgrid(xs, ys)
    dx = x_grid - center_x
    dy = y_grid - center_y
    distance = np.sqrt(dx**2 + dy**2)
    mask = distance < radius
    if np.any(mask):
        map_x = x_grid.astype(np.float32)
        map_y = y_grid.astype(np.float32)
        dist_fraction = 1.0 - (distance[mask] / radius)
        factor = 1.0 - scale * (dist_fraction ** 2)
        map_x[mask] = center_x + dx[mask] * factor
        map_y[mask] = center_y + dy[mask] * factor
        return cv2.remap(img, map_x, map_y, cv2.INTER_LINEAR)
    return img.copy()

def get_dominant_color(roi):
    if roi.size == 0:
        return (0, 0, 0)
    avg_color = cv2.mean(roi)[:3]
    return (int(avg_color[0]), int(avg_color[1]), int(avg_color[2]))

while True:
    ret, frame = cap.read()
    if not ret: break
    
    frame = cv2.flip(frame, 1)
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    faces = face_cascade.detectMultiScale(gray, 1.2, 5, minSize=(100, 100))
    
    output_frame = frame.copy()
    
    if current_lens == 0:
        # NO FILTER
        final_frame = output_frame
        cv2.putText(final_frame, "NO FILTER (Press 1 or 2 to change)", (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2, cv2.LINE_AA)
        
    elif current_lens == 1:
        # SNAPCHAT DOLL LENS
        for (x, y, w_face, h_face) in faces:
            roi_gray = gray[y:y+h_face, x:x+w_face]
            eyes = eye_cascade.detectMultiScale(roi_gray, 1.1, 5, minSize=(20, 20))
            for (ex, ey, ew, eh) in eyes[:2]:
                center_x = x + ex + (ew // 2)
                center_y = y + ey + (eh // 2)
                eye_radius = int(ew * 0.95)
                output_frame = apply_eye_bulge(output_frame, center_x, center_y, eye_radius, 0.75)

        h, w = output_frame.shape[:2]
        small_frame = cv2.resize(output_frame, (w // 2, h // 2))
        smoothed_small = cv2.bilateralFilter(small_frame, d=9, sigmaColor=90, sigmaSpace=90)
        smoothed_frame = cv2.resize(smoothed_small, (w, h), interpolation=cv2.INTER_LINEAR)
        
        hsv = cv2.cvtColor(smoothed_frame, cv2.COLOR_BGR2HSV).astype(np.float32)
        hsv[:, :, 1] *= 1.4
        hsv[:, :, 2] *= 1.1
        hsv = np.clip(hsv, 0, 255).astype(np.uint8)
        final_frame = cv2.cvtColor(hsv, cv2.COLOR_HSV2BGR)
        
        cv2.putText(final_frame, "DOLL EFFECT (Press 2 for AI Lens)", (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2, cv2.LINE_AA)

    elif current_lens == 2:
        # TRUE GENERATIVE AI ANIME (AnimeGANv2) - FACE ONLY
        if anime_session is not None:
            try:
                final_frame = output_frame.copy()
                
                for (x, y, w_face, h_face) in faces:
                    # Add some padding around the face so it captures the hair/chin naturally
                    pad_y = int(h_face * 0.2)
                    pad_x = int(w_face * 0.2)
                    
                    y1 = max(0, y - pad_y)
                    y2 = min(frame.shape[0], y + h_face + pad_y)
                    x1 = max(0, x - pad_x)
                    x2 = min(frame.shape[1], x + w_face + pad_x)
                    
                    face_roi = frame[y1:y2, x1:x2]
                    h_roi, w_roi = face_roi.shape[:2]
                    
                    if h_roi == 0 or w_roi == 0: continue
                    
                    # The AI model processes at 256x256 for speed
                    input_size = 256
                    small_frame = cv2.resize(face_roi, (input_size, input_size))
                    small_frame = cv2.cvtColor(small_frame, cv2.COLOR_BGR2RGB)
                    
                    x_input = (small_frame.astype(np.float32) / 127.5) - 1.0
                    
                    # Check if the model expects NCHW or NHWC by checking the input shape
                    expected_shape = anime_session.get_inputs()[0].shape
                    if expected_shape[1] == 3 or expected_shape[1] == '3':
                        # NCHW (1, 3, H, W)
                        x_input = np.transpose(x_input, (2, 0, 1))
                        x_input = np.expand_dims(x_input, axis=0)
                    else:
                        # NHWC (1, H, W, 3)
                        x_input = np.expand_dims(x_input, axis=0)
                    
                    input_name = anime_session.get_inputs()[0].name
                    out = anime_session.run(None, {input_name: x_input})[0]
                    
                    out = out.squeeze() # (3, H, W) or (H, W, 3)
                    if out.shape[0] == 3:
                        out = np.transpose(out, (1, 2, 0)) # Convert to (H, W, 3)
                        
                    out = (out + 1.0) * 127.5
                    out = np.clip(out, 0, 255).astype(np.uint8)
                    out = cv2.cvtColor(out, cv2.COLOR_RGB2BGR)
                    
                    # Resize the AI output back to the face dimensions
                    anime_face = cv2.resize(out, (w_roi, h_roi), interpolation=cv2.INTER_LINEAR)
                    
                    # Blend the clear anime face back onto the normal background seamlessly
                    mask = np.zeros((h_roi, w_roi, 3), dtype=np.uint8)
                    cv2.ellipse(mask, (w_roi // 2, int(h_roi * 0.45)), (int(w_roi * 0.45), int(h_roi * 0.55)), 0, 0, 360, (255, 255, 255), -1)
                    mask = cv2.GaussianBlur(mask, (31, 31), 0)
                    mask_float = mask.astype(np.float32) / 255.0
                    
                    face_roi_float = face_roi.astype(np.float32)
                    anime_face_float = anime_face.astype(np.float32)
                    
                    blended_face = (anime_face_float * mask_float) + (face_roi_float * (1.0 - mask_float))
                    final_frame[y1:y2, x1:x2] = blended_face.astype(np.uint8)
                
                cv2.putText(final_frame, "GENERATIVE AI LENS (Press 0 to Clear)", (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 165, 255), 2, cv2.LINE_AA)
            except Exception as e:
                final_frame = frame.copy()
                cv2.putText(final_frame, f"AI ERROR: {str(e)}", (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2, cv2.LINE_AA)
        else:
            final_frame = frame.copy()
            cv2.putText(final_frame, "AI MODULE STILL LOADING...", (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2, cv2.LINE_AA)

    cv2.imshow('Multi-Lens AR App', final_frame)
    
    key = cv2.waitKey(1) & 0xFF
    if key == ord('q'):
        break
    elif key == ord('0'):
        current_lens = 0
    elif key == ord('1'):
        current_lens = 1
    elif key == ord('2'):
        current_lens = 2

cap.release()
cv2.destroyAllWindows()
