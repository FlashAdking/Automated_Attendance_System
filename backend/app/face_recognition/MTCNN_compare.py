import os
import matplotlib.pyplot as plt
import cv2
import numpy as np

# Assuming `saved_facenet_model` and `detector_inference` are loaded from previous cells
# Assuming `known_persons_embeddings` is populated from previous cells

# List of group image paths
group_image_paths = [
    '/content/drive/MyDrive/AttendSnap/test_img/G20 germany.jpg',
    '/content/drive/MyDrive/AttendSnap/test_img/g20-photo.webp'
]

# Dictionary to store detected faces and their embeddings from all group photos
# Format: {'group_photo_name': [(bbox, embedding, cropped_face_img), ...]}
all_group_faces_data = {}

print("\n--- Processing Group Photos ---")
for img_path in group_image_paths:
    img_name = os.path.basename(img_path)
    print(f"Processing {img_name}...")
    faces_data = get_image_embeddings(img_path, saved_facenet_model, detector_inference)
    all_group_faces_data[img_name] = faces_data
    print(f"Found {len(faces_data)} faces in {img_name}.")

print("\n--- Performing Consolidated Attendance Check ---")
THRESHOLD = 0.80 # FaceNet similarity threshold

present_individuals = {}
matched_group_faces_ids = set() # To ensure a group face is only matched once

for known_person_name, known_embedding in known_persons_embeddings.items():
    best_match_found = False
    best_distance = THRESHOLD
    best_group_face_info = None # (img_name, bbox, embedding, cropped_face_img)

    print(f"\nSearching for {known_person_name}...")

    for group_img_name, faces_data_list in all_group_faces_data.items():
        for face_index, (bbox, group_embedding, cropped_face_img) in enumerate(faces_data_list):
            group_face_id = f"{group_img_name}_face_{face_index}"

            # Skip if this specific group face has already been matched to another known person
            if group_face_id in matched_group_faces_ids:
                continue

            distance = np.linalg.norm(known_embedding - group_embedding)

            if distance < best_distance:
                best_distance = distance
                best_group_face_info = (group_img_name, bbox, group_embedding, cropped_face_img, group_face_id)
                best_match_found = True

    if best_match_found:
        present_individuals[known_person_name] = (
            best_group_face_info[0], # group_img_name
            best_group_face_info[1], # bbox
            best_group_face_info[3], # cropped_face_img
            best_distance
        )
        matched_group_faces_ids.add(best_group_face_info[4]) # Add the unique face ID to matched set
        print(f"✅ {known_person_name} present! Matched in {best_group_face_info[0]} (Distance: {best_distance:.4f})")
    else:
        print(f"❌ {known_person_name} ABSENT. (No match below threshold {THRESHOLD:.2f} across all photos)")

print("\n--- CONSOLIDATED ATTENDANCE SUMMARY ---")
print(f"Total known individuals: {len(known_persons_embeddings)}")
print(f"Individuals identified as PRESENT: {len(present_individuals)}")

print("\n--- VISUALIZATION OF MATCHES ---")
if present_individuals:
    num_matches = len(present_individuals)
    fig, axes = plt.subplots(num_matches, 2, figsize=(10, num_matches * 3))
    fig.suptitle('Known vs. Matched Faces in Group Photos', fontsize=16)

    if num_matches == 1: # Handle single match case for axes indexing
        axes = [axes]

    for i, (known_person_name, match_info) in enumerate(present_individuals.items()):
        group_img_name, bbox, matched_cropped_face, distance = match_info
        known_cropped_face = known_persons_embeddings[known_person_name] # This is an embedding, not image.

        # Need to re-load/extract the known person's image for plotting
        known_img_path = None
        for filename in os.listdir('/content/drive/MyDrive/AttendSnap/img_known/'):
            if known_person_name.lower().replace(' ', '_') in filename.lower().replace(' ', '_') and filename.lower().endswith(('.png', '.jpg', '.jpeg')):
                known_img_path = os.path.join('/content/drive/MyDrive/AttendSnap/img_known/', filename)
                break
        
        if known_img_path:
            known_img_raw = cv2.imread(known_img_path)
            known_img_rgb = cv2.cvtColor(known_img_raw, cv2.COLOR_BGR2RGB)
            known_results_for_plot = detector_inference.detect_faces(known_img_rgb)
            if known_results_for_plot:
                kx, ky, kw, kh = known_results_for_plot[0]['box']
                kx, ky = abs(kx), abs(ky)
                known_face_for_plot = known_img_rgb[ky:ky+kh, kx:kx+kw]
            else:
                known_face_for_plot = np.zeros((100, 100, 3), dtype=np.uint8) # Placeholder if face not found in known for plot
        else:
            known_face_for_plot = np.zeros((100, 100, 3), dtype=np.uint8) # Placeholder if path not found


        # Plot Known Face
        axes[i, 0].imshow(known_face_for_plot)
        axes[i, 0].set_title(f"Known: {known_person_name}")
        axes[i, 0].axis('off')

        # Plot Matched Face from Group Photo
        axes[i, 1].imshow(matched_cropped_face)
        axes[i, 1].set_title(f"Matched in {group_img_name}\nDistance: {distance:.4f}")
        axes[i, 1].axis('off')

    plt.tight_layout(rect=[0, 0.03, 1, 0.95]) # Adjust layout to prevent title overlap
    plt.show()
else:
    print("No matches to visualize.")
