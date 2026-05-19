import cloudinary
import cloudinary.uploader
import os

# CLOUDINARY_URL format: cloudinary://api_key:api_secret@cloud_name
# cloudinary.config() can parse this directly — no need for separate env vars.
cloudinary_url = os.getenv("CLOUDINARY_URL", "")

if cloudinary_url:
    cloudinary.config(cloudinary_url=cloudinary_url, secure=True)
else:
    # Fallback: individual env vars
    cloudinary.config(
        cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
        api_key=os.getenv("CLOUDINARY_API_KEY"),
        api_secret=os.getenv("CLOUDINARY_API_SECRET"),
        secure=True,
    )


def upload_image_to_cloudinary(file_data, folder_name: str = "attendsnap") -> str:
    """
    Uploads an image to Cloudinary and returns the secure URL.
    file_data can be a file path string or a file-like object.
    """
    response = cloudinary.uploader.upload(file_data, folder=folder_name)
    return response.get("secure_url", "")
