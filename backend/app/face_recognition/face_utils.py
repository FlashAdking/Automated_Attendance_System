import os
import shutil
from tempfile import NamedTemporaryFile
from fastapi import UploadFile

from app.face_recognition.preprocess_image import extract_and_prepare_faces
from app.face_recognition.genrate_embedings import get_image_embeddings

# Initialize models lazily to save startup time if not needed, 
# but for a real app, you'd load them once at startup.
mtcnn_detector = None
facenet_model = None

def load_models():
    global mtcnn_detector, facenet_model
    if mtcnn_detector is None or facenet_model is None:
        print("Loading MTCNN and FaceNet models...")
        from mtcnn import MTCNN
        from keras.models import load_model
        import keras

        BASE_DIR = os.path.dirname(os.path.abspath(__file__))
        MODEL_PATH = os.path.join(BASE_DIR, "ML_models", "facenet_embedder_model.h5")

        # The model has two Lambda layers that Keras 3 cannot auto-resolve from
        # the serialised function names. We supply both explicitly.
        import tensorflow as tf

        def scaling(x, scale=1.0 / 255):
            return x * scale

        def l2_normalize(x, axis=None, epsilon=1e-12):
            return tf.math.l2_normalize(x, axis=axis, epsilon=epsilon)

        mtcnn_detector = MTCNN()
        facenet_model = load_model(
            MODEL_PATH,
            custom_objects={"scaling": scaling, "l2_normalize": l2_normalize},
        )
        print("Models loaded successfully.")

def process_student_image(file: UploadFile) -> list[float]:
    """
    Takes an uploaded file, saves it temporarily, extracts the face, 
    generates embeddings, and returns the embedding vector.
    """
    load_models()
    
    # Save UploadFile to a temporary file
    import os
    ext = os.path.splitext(file.filename or "")[1].lower() or ".jpg"
    if ext not in {".jpg", ".jpeg", ".png", ".webp"}:
        ext = ".jpg"
    temp_file = NamedTemporaryFile(delete=False, suffix=ext)
    try:
        shutil.copyfileobj(file.file, temp_file)
        temp_file.close()
        
        # Get embeddings using existing functions
        embeddings_data = get_image_embeddings(temp_file.name, facenet_model, mtcnn_detector)
        
        if not embeddings_data:
            raise ValueError("No face detected in the image.")
            
        # Assuming the first face found is the student
        _, embedding, _ = embeddings_data[0]
        
        # Convert numpy array to list of floats for MongoDB storage
        return embedding.tolist()
        
    finally:
        # Clean up temp file
        os.unlink(temp_file.name)

def process_multiple_group_photos(files: list[UploadFile]):
    """
    Takes up to 3 uploaded group photos, detects faces and gets embeddings from all of them 
    (to compensate for missed faces). Finds the image with the highest number of detected faces, 
    draws green boxes on it, and returns the path to that boxed image along with ALL embeddings.
    """
    load_models()
    
    if len(files) > 3:
        raise ValueError("Maximum 3 images are allowed")
        
    best_image_path = None
    max_faces = -1
    all_embeddings = []
    temp_files = []
    
    try:
        from app.face_recognition.genrate_embedings import get_image_embeddings
        from app.face_recognition.preprocess_image import draw_boxes_on_faces
        
        # Process each uploaded file
        for file in files:
            import os
            ext = os.path.splitext(file.filename or "")[1].lower() or ".jpg"
            if ext not in {".jpg", ".jpeg", ".png", ".webp"}:
                ext = ".jpg"
            temp_file = NamedTemporaryFile(delete=False, suffix=ext)
            shutil.copyfileobj(file.file, temp_file)
            temp_file.close()
            temp_files.append(temp_file.name)
            
            # Extract embeddings and get number of faces
            embeddings_data = get_image_embeddings(temp_file.name, facenet_model, mtcnn_detector)
            num_faces = len(embeddings_data)
            
            # Collect embeddings
            for emb_data in embeddings_data:
                # emb_data is (bounding_box, embedding, cropped_face_image)
                all_embeddings.append(emb_data[1].tolist())
                
            # Track the image with the most faces
            if num_faces > max_faces:
                max_faces = num_faces
                best_image_path = temp_file.name
                
        if max_faces <= 0 or best_image_path is None:
            raise ValueError("No faces detected in any of the provided images.")
            
        # Draw boxes ONLY on the best image
        import tempfile
        ext = os.path.splitext(best_image_path)[1]
        out_fd, boxed_image_path = tempfile.mkstemp(suffix=f"_boxed{ext}")
        os.close(out_fd)
        
        draw_boxes_on_faces(best_image_path, mtcnn_detector, output_path=boxed_image_path)
        
        return boxed_image_path, all_embeddings
        
    finally:
        # Clean up all original temporary files
        for tmp_path in temp_files:
            if os.path.exists(tmp_path):
                try:
                    os.unlink(tmp_path)
                except Exception:
                    pass
