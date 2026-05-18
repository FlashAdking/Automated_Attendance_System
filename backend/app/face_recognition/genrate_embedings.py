import numpy as np
# Assuming `extract_and_prepare_faces` is available (either imported or defined in a previous cell)
# from processing import extract_and_prepare_faces # In your application, you would import it.

def get_image_embeddings(image_path, facenet_model, mtcnn_detector):
    """
    Extracts all faces from an image, preprocesses them, and generates their FaceNet embeddings.

    Args:
        image_path (str): Path to the image file.
        facenet_model: The loaded FaceNet Keras model.
        mtcnn_detector: An initialized MTCNN detector instance.

    Returns:
        list: A list of tuples, where each tuple contains
              (bounding_box, embedding, cropped_face_image) for each detected face.
              Returns an empty list if no faces are detected or image cannot be loaded.
    """
    prepared_faces, bounding_boxes = extract_and_prepare_faces(image_path, mtcnn_detector)

    face_embeddings_data = []

    if not prepared_faces:
        return []

    # Generate embeddings for all prepared faces in a single batch for efficiency
    # The facenet_model.predict expects a batch of images (N, 160, 160, 3)
    batch_of_faces = np.array(prepared_faces)
    embeddings = facenet_model.predict(batch_of_faces)

    for i in range(len(prepared_faces)):
        face_embeddings_data.append(
            (bounding_boxes[i], embeddings[i], prepared_faces[i])
        )

    return face_embeddings_data

print("Function `get_image_embeddings` defined.")
