import cv2
import numpy as np

# Load local trackers from your assets folder
face_cascade = cv2.CascadeClassifier('assets/haarcascade_frontalface_default.xml')
eye_cascade = cv2.CascadeClassifier('assets/haarcascade_eye.xml')

cap = cv2.VideoCapture(0)
# Request higher frame rates from the camera hardware (60-90 FPS)
cap.set(cv2.CAP_PROP_FPS, 60)

def apply_eye_bulge(img, center_x, center_y, radius, scale):
    """
    Distorts pixels outward from a center point to magnify the eyes natively.
    """
    out_img = img.copy()
    h, w = img.shape[:2]
    
    # Create coordinate grid
    xs = np.arange(w)
    ys = np.arange(h)
    x_grid, y_grid = np.meshgrid(xs, ys)
    
    # Calculate distance from center
    dx = x_grid - center_x
    dy = y_grid - center_y
    distance = np.sqrt(dx**2 + dy**2)
    
    # Create a mask for pixels within the radius
    mask = distance < radius
    
    if np.any(mask):
        # Calculate bulge mapping
        dist_fraction = 1.0 - (distance[mask] / radius)
        factor = 1.0 - scale * (dist_fraction ** 2)
        
        map_x = center_x + dx[mask] * factor
        map_y = center_y + dy[mask] * factor
        
        map_x = np.clip(map_x, 0, w - 1).astype(np.float32)
        map_y = np.clip(map_y, 0, h - 1).astype(np.float32)
        
        # Apply remap only to the masked area
        out_img[mask] = cv2.remap(img, map_x, map_y, cv2.INTER_LINEAR)[mask]
        
    return out_img

while True:
    ret, frame = cap.read()
    if not ret: break
    
    # Mirror effect
    frame = cv2.flip(frame, 1)
    
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    faces = face_cascade.detectMultiScale(gray, 1.2, 5, minSize=(100, 100))
    
    output_frame = frame.copy()

    for (x, y, w_face, h_face) in faces:
        roi_gray = gray[y:y+h_face, x:x+w_face]
        eyes = eye_cascade.detectMultiScale(roi_gray, 1.1, 8, minSize=(30, 30))
        
        # --- STEP 1: SNAPCHAT DOLL EYES (PIXEL BULGE) ---
        # Instead of drawing fake circles, we magnify your actual eyes
        for (ex, ey, ew, eh) in eyes[:2]:
            center_x = x + ex + (ew // 2)
            center_y = y + ey + (eh // 2)
            
            # Bulge radius based on detected eye width
            eye_radius = int(ew * 0.9)
            
            # Magnify the real eye pixels (Scale 0.45 stretches them smoothly)
            output_frame = apply_eye_bulge(output_frame, center_x, center_y, eye_radius, 0.45)

    # --- STEP 2: DOLL SKIN SMOOTHING (GLAMOUR FILTER) ---
    # We downscale by 50% before blurring to keep performance lightning fast (60fps)
    h, w = output_frame.shape[:2]
    small_frame = cv2.resize(output_frame, (w // 2, h // 2))
    
    # Bilateral filter removes pores/blemishes but keeps edges (eyes, mouth) totally sharp
    smoothed_small = cv2.bilateralFilter(small_frame, d=9, sigmaColor=40, sigmaSpace=40)
    smoothed_frame = cv2.resize(smoothed_small, (w, h), interpolation=cv2.INTER_LINEAR)
    
    # --- STEP 3: COLOR POP & WARMTH (DOLL BLUSH EFFECT) ---
    # Convert to HSV to gently boost saturation (color) and brightness
    hsv = cv2.cvtColor(smoothed_frame, cv2.COLOR_BGR2HSV).astype(np.float32)
    hsv[:, :, 1] *= 1.2  # Boost color saturation by 20%
    hsv[:, :, 2] *= 1.05 # Boost brightness slightly
    hsv = np.clip(hsv, 0, 255).astype(np.uint8)
    final_frame = cv2.cvtColor(hsv, cv2.HSV_BGR)

    # Render output
    cv2.imshow('Snapchat Doll Style Lens', final_frame)
    
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()
