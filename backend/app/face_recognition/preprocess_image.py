# File: processing.py

import cv2
import numpy as np
from mtcnn import MTCNN # Assuming MTCNN is installed in your environment

def extract_and_prepare_faces(image_path, mtcnn_detector):
    """
    Loads an image, detects all faces using MTCNN, crops them, and resizes them to 160x160.

    Args:
        image_path (str): Path to the image file.
        mtcnn_detector: An initialized MTCNN detector instance (e.g., `MTCNN()`).

    Returns:
        list: A list of 160x160x3 numpy arrays, each representing a prepared face.
              Returns an empty list if no faces are detected or image cannot be loaded.
        list: A list of bounding boxes (x, y, width, height) for each detected face.
    """
    img_raw = cv2.imread(image_path)
    if img_raw is None:
        print(f"Error: Could not load image from {image_path}")
        return [], []

    img_rgb = cv2.cvtColor(img_raw, cv2.COLOR_BGR2RGB)

    faces_data = mtcnn_detector.detect_faces(img_rgb)

    prepared_faces = []
    bounding_boxes = []

    for face_info in faces_data:
        x, y, width, height = face_info['box']
        x, y = abs(x), abs(y) # Ensure positive coordinates

        # Safely crop face, handling cases where bbox might exceed image dimensions
        cropped_face = img_rgb[max(0, y):min(img_rgb.shape[0], y + height),
                               max(0, x):min(img_rgb.shape[1], x + width)]

        if cropped_face.shape[0] > 0 and cropped_face.shape[1] > 0:
            face_resized = cv2.resize(cropped_face, (160, 160))
            prepared_faces.append(face_resized)
            bounding_boxes.append((x, y, width, height))

    return prepared_faces, bounding_boxes

print("Content for processing.py file generated. You can copy this code.")
