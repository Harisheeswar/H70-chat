import cv2
import numpy as np

# Load local trackers from your assets folder
face_cascade = cv2.CascadeClassifier('assets/haarcascade_frontalface_default.xml')
eye_cascade = cv2.CascadeClassifier('assets/haarcascade_eye.xml')

cap = cv2.VideoCapture(0)
# Request higher frame rates from the camera hardware (60-90 FPS)
cap.set(cv2.CAP_PROP_FPS, 60)

def get_dominant_color(roi):
    """Calculates the average color of a specific face region."""
    if roi.size == 0:
        return (0, 0, 0)
    avg_color = cv2.mean(roi)[:3]
    return (int(avg_color[0]), int(avg_color[1]), int(avg_color[2]))

while True:
    ret, frame = cap.read()
    if not ret: break
    # Re-enabled horizontal flip for a natural mirror effect
    frame = cv2.flip(frame, 1)
    h, w = frame.shape[:2]
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    
    # Track face
    faces = face_cascade.detectMultiScale(gray, 1.2, 5, minSize=(100, 100))
    
    # Default fallback colors if no face is tracked yet
    user_skin = (200, 200, 200)
    user_hair = (30, 30, 30)
    user_eyes = (0, 0, 0)

    for (x, y, w_face, h_face) in faces:
        # --- STEP 1: EXTRACT USER'S PERSONALIZED COLOR PALETTE ---
        
        # Sample Skin: Center of the cheek/nose area
        skin_roi = frame[y + int(h_face*0.5):y + int(h_face*0.7), x + int(w_face*0.3):x + int(w_face*0.7)]
        user_skin = get_dominant_color(skin_roi)
        
        # Sample Hair: A small box safely above the forehead
        hair_y = max(0, y - int(h_face * 0.15))
        hair_roi = frame[hair_y:y, x + int(w_face*0.3):x + int(w_face*0.7)]
        user_hair = get_dominant_color(hair_roi)

        # Track eyes inside face region
        roi_gray = gray[y:y+h_face, x:x+w_face]
        eyes = eye_cascade.detectMultiScale(roi_gray, 1.1, 8, minSize=(30, 30))
        
        for i, (ex, ey, ew, eh) in enumerate(eyes[:2]):
            # Pinpoint eye center
            center_x = x + ex + (ew // 2)
            center_y = y + ey + (eh // 2)
            
            # Sample Eye Color: Small inner circle of the detected eye box
            eye_roi = frame[center_y-5:center_y+5, center_x-5:center_x+5]
            user_eyes = get_dominant_color(eye_roi)

            # --- STEP 2: DRAW CUSTOM ANIME EYES BASED ON USER DATA ---
            # Instead of a basic distortion, we draw a sharp, stylized anime eye template 
            # filled with the user's actual eye color and crisp white highlights.
            eye_radius = int(ew * 0.6)
            
            # 1. Base iris matching user's real eye color
            cv2.circle(frame, (center_x, center_y), eye_radius, user_eyes, -1)
            # 2. Oversized black pupil
            cv2.circle(frame, (center_x, center_y), int(eye_radius * 0.5), (0, 0, 0), -1)
            # 3. Anime-style white gloss highlight reflections
            cv2.circle(frame, (center_x - int(eye_radius*0.3), center_y - int(eye_radius*0.3)), int(eye_radius * 0.25), (255, 255, 255), -1)
            cv2.circle(frame, (center_x + int(eye_radius*0.3), center_y + int(eye_radius*0.3)), int(eye_radius * 0.1), (255, 255, 255), -1)

    # --- STEP 3: K-MEANS COLOR QUANTIZATION (CARTOON SHADING) ---
    # To run at 60fps/90fps, we downscale the image significantly before running K-means
    scale_factor = 0.25
    small_frame = cv2.resize(frame, (0, 0), fx=scale_factor, fy=scale_factor)
    data = small_frame.reshape((-1, 3)).astype(np.float32)
    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 10, 1.0)
    
    # Dynamically cluster pixels to match the user's ambient colors
    _, label, center = cv2.kmeans(data, 4, None, criteria, 10, cv2.KMEANS_RANDOM_CENTERS)
    center = np.uint8(center)
    quantized_small = center[label.flatten()].reshape((small_frame.shape))
    
    # Scale it back up to the original window size using nearest neighbor to keep the cartoon look sharp
    quantized_frame = cv2.resize(quantized_small, (w, h), interpolation=cv2.INTER_NEAREST)

    # --- STEP 4: APPLY TO LOCAL BILATERAL PIPELINE ---
    anime_color = cv2.bilateralFilter(quantized_frame, d=7, sigmaColor=50, sigmaSpace=50)
    
    # Generate clean cartoon borders
    gray_blur = cv2.medianBlur(gray, 5)
    ink_edges = cv2.adaptiveThreshold(gray_blur, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY, 9, 3)
    ink_edges_bgr = cv2.cvtColor(ink_edges, cv2.COLOR_GRAY2BGR)
    
    # Final blend
    final_face_filter = cv2.bitwise_and(anime_color, ink_edges_bgr)
    
    # Render personalized output window
    cv2.imshow('Personalized Local Anime Filter', final_face_filter)
    
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()
