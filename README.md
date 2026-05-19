we are going to develop a attendance system

the basic idea is to use face recognition to mark attendance of students

we are going to use mtcnn for face detection and facenet-pytorch for face recognition

we are going to use mongodb for database

flow thier are two entities one is Admin it can be teacher or any authority they are allowed to mark attendance of students by taking the picture and comparing it with the face embeddings of students

the second entity is student who can only see their attendance and can't change or edit anything

students will be notified with thier percentage of attendance and alerts  when thier attendance is marked using facial recognition


process :
admin will upload a 2-3 images from different angle of group of students from class 

and automaticallly attendance will be marked


behind the scenes:
backend will already create embedings for student when they will register and store those embeddings in databases 512 dimension vector per student using facenet model

in next stage when admin upload a image backend will detect face using mtcnn and then compare the embeddings with the database embeddings and attendance will be marked

for comparing embeddings we can use euclidian distance or cosine similarity or manhattan distance  

we will use which is more robust 


application : 

we have to expose a trial section which will displayed in frontend for demonstration for users without login they simply can upload some individual images upto 4-5 images and upload 2-3 group photo we will process those images and display the results grouped photos and individual images which have matched 


since it is trial we not maintaining any database for it , it will expire after refresh


if user want to continue they can login using their email and password and for verification they have to upload individual image for each student 




create a application their are login for only admin login thier is not any user login or signup admin will add individual students with there details 


student will be added using following feilds

Name : string
prn : string 
class : first year / second year / third year / fourth year  (based on acedamic year )
div : A/B/C/D (based on division )
dob : date of birth 
image_link :   using cloudinary for storing image_link (before we have to proceed it )
contact : string 
email : string  // for notification 
gender : Male/Female 
image_embeddings : [ 512 dimension]


i have facenet_embed model backend/app/face_recognition/facenet_model/facenet_keras.h5 use this for embedings

for admin:

login , signup , mark attendance manually , see all student attendance , add student , remove student , update student details , markattendance using images , once attendance is marked using images then automatically notify students for attendance  using emails provided by admin for students

