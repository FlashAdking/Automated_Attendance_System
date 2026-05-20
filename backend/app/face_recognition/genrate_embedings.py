import numpy as np
from app.face_recognition.preprocess_image import extract_and_prepare_faces


def prewhiten(img: np.ndarray) -> np.ndarray:
    """
    Standard FaceNet prewhitening:
    Subtract per-image mean and divide by adjusted std so the model
    receives zero-mean, unit-variance input regardless of lighting.
    This is critical for accurate embedding generation.
    """
    img = img.astype(np.float32)
    mean = np.mean(img)
    std = np.std(img)
    # Clamp std to avoid divide-by-zero on flat images
    std_adj = np.maximum(std, 1.0 / np.sqrt(img.size))
    return (img - mean) / std_adj


def get_image_embeddings(image_path, facenet_model, mtcnn_detector):
    """
    Extracts all faces from an image, applies FaceNet prewhitening,
    and generates normalised embeddings.

    Returns:
        list of (bounding_box, embedding_vector, cropped_face_uint8)
    """
    prepared_faces, bounding_boxes = extract_and_prepare_faces(image_path, mtcnn_detector)

    if not prepared_faces:
        return []

    # Apply per-face prewhitening — essential for FaceNet accuracy
    whitened = np.array([prewhiten(face) for face in prepared_faces], dtype=np.float32)

    # Batch predict (N, 160, 160, 3) float32
    embeddings = facenet_model.predict(whitened, verbose=0)

    return [
        (bounding_boxes[i], embeddings[i], prepared_faces[i])
        for i in range(len(prepared_faces))
    ]



