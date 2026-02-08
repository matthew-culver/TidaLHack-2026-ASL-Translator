# TidaLHack-2026-ASL-Translator
Problem: We were inspired to make this project by the difficulties mute and deaf people go through in order to have real-time conversations with people who don't speak ASL.

Our solution is this real-time ASL translator.
The program takes a video stream and takes a certain amount of frames per second to convert into an image, which is then sent to the backend. 
The backend checks if gemini has finished with its last process, or if the last gemini request was too recent. 
If gemini is available, the image is sent to gemini, which analyzes the image (and the previous 2 for context) and describes the motion the user is making.
With this information, it compares the description of the sign with the known ASL signs in the MongoDB database, and chooses the most similar sign. It includes a confidence percent for certainty based on how similar it was to the chosen sign.
The chosen sign is then sent to the frontend for display, and to ElevenLabs for speech output.