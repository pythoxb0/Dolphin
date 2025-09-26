from flask import Flask, render_template, request, jsonify,session , send_from_directory
import os
import time
import json
import base64
from datetime import datetime
from dotenv import load_dotenv
from groq import Groq
import sounddevice as sd
from scipy.io.wavfile import write
import re
import uuid
import soundfile as sf
import sounddevice as sd


# Load environment variables
load_dotenv()

# Flask app
app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET_KEY", "default-secret-key")

# Groq client
client = Groq(api_key=os.environ.get("GROQ_API_KEY"))

# Temp folder for images
TEMP_IMAGE_FOLDER = "temp_images"
os.makedirs(TEMP_IMAGE_FOLDER, exist_ok=True)

# File to store chat history
CHAT_HISTORY_FILE = "chat_history.json"

# Settings for recording
SAMPLE_RATE = 44100  # CD quality
DURATION = 5  # seconds
AUDIO_DIR = "saved_audios"
os.makedirs(AUDIO_DIR, exist_ok=True)


# --------- Utility: Chat History ----------
def load_chat_history():
    if os.path.exists(CHAT_HISTORY_FILE):
        try:
            with open(CHAT_HISTORY_FILE, "r") as f:
                return json.load(f)
        except:
            return {}
    return {}

def save_chat_history(chat_history):
    with open(CHAT_HISTORY_FILE, "w") as f:
        json.dump(chat_history, f)


def process_text_message(text, chat_history):
    try:
        # Prepare messages with history
        messages = []
        
        # Add previous conversation (last 6 messages for context)
        for msg in chat_history[-6:]:
            role = "user" if msg["sender"] == "user" else "assistant"
            # Only include text messages in the context
            if msg["type"] == "text":
                messages.append({"role": role, "content": msg["content"]})
        
        # Add current message
        messages.append({"role": "user", "content": text})
        
        response = client.chat.completions.create(
            messages=messages,
            model="llama-3.1-8b-instant",
        )
        
        raw_response = response.choices[0].message.content
        formatted_response = format_simple_markdown(raw_response)
        
        return formatted_response
    except Exception as e:
        return f"Sorry, I encountered an error: {str(e)}"

def encode_image(image_path):
    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode('utf-8')


def process_image_message(image_data, caption=""):
    try:
        # If frontend sends base64 directly
        if image_data.startswith("data:image"):
            base64_image = image_data.split(",")[1]  # remove prefix
        else:
            # If it's a file path, encode it
            base64_image = encode_image(image_data)

        # Prepare prompt
        user_prompt = caption if caption else "Describe this image."

        # Call Groq API
        chat_completion = client.chat.completions.create(
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": user_prompt},
                        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{base64_image}"}},
                    ],
                }
            ],
            model="meta-llama/llama-4-scout-17b-16e-instruct",
        )

        raw_response = chat_completion.choices[0].message.content
        formatted_response = format_simple_markdown(raw_response)
        
        return formatted_response
    except Exception as e:
        return f"Error processing image: {e}"


def record_audio(duration=DURATION, sample_rate=SAMPLE_RATE):
    """Record audio from microphone and save as WAV file"""
    try:
        print("🎙️ Recording...")
        audio_data = sd.rec(int(duration * sample_rate), 
                           samplerate=sample_rate, 
                           channels=1, 
                           dtype='int16')
        sd.wait()
        print("✅ Recording complete!")

        # Create unique filename
        timestamp = int(time.time())
        file_name = f"audio_{timestamp}.wav"
        file_path = os.path.join(AUDIO_DIR, file_name)

        # Save WAV file
        write(file_path, sample_rate, audio_data)

        # Verify file was created
        if os.path.exists(file_path):
            file_size = os.path.getsize(file_path)
            print(f"📁 Audio successfully saved at {file_path} (Size: {file_size} bytes)")
            return file_path
        else:
            print("❌ Failed to save audio - file not created")
            return None
            
    except Exception as e:
        print(f"❌ Error during recording: {e}")
        return None
    
    
    
def process_audio_message(audio_input):
    try:
        # Check if it's a file path or blob URL
        if audio_input.startswith('blob:'):
            # This is a blob URL from the browser - we can't process this directly
            return "I received your audio message, but I can only process audio files that are saved on the server. Please use the upload method."
        
        # It should be a file path
        if not os.path.exists(audio_input):
            return f"Error: Audio file not found at {audio_input}"
        
        print(f"📝 Processing audio file: {audio_input}")
        
        # Open the audio file
        with open(audio_input, "rb") as file:
            # Create a transcription of the audio file
            transcription = client.audio.transcriptions.create(
                file=file,
                model="whisper-large-v3-turbo",
                prompt="Transcribe the spoken audio",
                response_format="verbose_json",
                timestamp_granularities=["word", "segment"],
                language="en",
                temperature=0.0
            )
        
        transcribed_text = transcription.text
        print(f"✅ Transcribed text: {transcribed_text}")
        
        return transcribed_text
        
    except Exception as e:
        print(f"❌ Error processing audio: {e}")
        return f"Error processing audio: {str(e)}"
# from gtts import gTTS

def text_to_speech(text, filename=None):
    """Convert text to speech and play it"""
    try:
        if filename is None:
            filename = f"speech_{int(time.time())}.wav"
        
        speech_file_path = os.path.join(AUDIO_DIR, filename)
        
        # Generate audio using Groq TTS
        response = client.audio.speech.create(
            model="playai-tts",
            voice="Fritz-PlayAI",  # You can change this to other voices
            input=text,
            response_format="wav"
        )
        
        # Save audio file
        response.write_to_file(speech_file_path)
        
        # Play audio
        data, samplerate = sf.read(speech_file_path, dtype='float32')
        sd.play(data, samplerate)
        sd.wait()  # Wait until file is done playing
        
        return speech_file_path
        
    except Exception as e:
        print(f"❌ Error in text-to-speech: {e}")
        return None
    
def format_simple_markdown(text):
    """
    Convert markdown-like text to HTML formatting
    with better separation between code and text
    """
    import html
    
    # Handle code blocks (```code```)
    def replace_code_block(match):
        code_content = match.group(1)
        # Escape HTML entities in code content
        escaped_code = html.escape(code_content)
        return f'<div class="code-block"><pre><code>{escaped_code}</code></pre></div>'
    
    text = re.sub(r'```(.*?)```', replace_code_block, text, flags=re.DOTALL)
    
    # Handle inline code (`code`)
    def replace_inline_code(match):
        code_content = match.group(1)
        escaped_code = html.escape(code_content)
        return f'<code class="inline-code">{escaped_code}</code>'
    
    text = re.sub(r'`(.*?)`', replace_inline_code, text)
    
    # Handle bold text (**text**)
    text = re.sub(r'\*\*(.*?)\*\*', r'<strong>\1</strong>', text)
    
    # Handle italic text (*text*)
    text = re.sub(r'\*(.*?)\*', r'<em>\1</em>', text)
    
    # Convert line breaks to HTML
    text = text.replace("\n", "<br>")
    
    return text
# --------- Routes ----------
@app.route("/")
def index():
    # Initialize session if not exists
    if 'session_id' not in session:
        session['session_id'] = str(uuid.uuid4())
    
    # Load chat history for this session
    session_id = session['session_id']
    all_history = load_chat_history()
    chat_history = all_history.get(session_id, [])
    
    return render_template("index.html", chat_history=chat_history)



@app.route("/send_message", methods=["POST"])
def send_message():
    # Initialize session if not exists
    if 'session_id' not in session:
        session['session_id'] = str(uuid.uuid4())
    
    # Load chat history for this session
    session_id = session['session_id']
    all_history = load_chat_history()
    chat_history = all_history.get(session_id, [])
    
    data = request.json
    message_type = data.get("type", "text")
    content = data.get("content", "")
    caption = data.get("caption", "")

    # Save user message
    user_message = {
        "type": message_type,
        "content": content,
        "caption": caption,
        "sender": "user",
        "timestamp": datetime.now().strftime("%H:%M"),
    }
    chat_history.append(user_message)

    # Process message
    if message_type == "text":
        bot_response = process_text_message(content, chat_history)
    elif message_type == "image":
        bot_response = process_image_message(content, caption)
    elif message_type == "audio":
    # content should be the audio file path for audio messages
         bot_response = process_audio_message(content)
    else:
        return jsonify({"status": "error", "message": "Unknown message type"})

    # Save bot response
    bot_message = {
        "type": "text",
        "content": bot_response,
        "sender": "bot",
        "timestamp": datetime.now().strftime("%H:%M"),
    }
    
    chat_history.append(bot_message)
    
    # Save updated history for this session
    all_history[session_id] = chat_history
    save_chat_history(all_history)

    return jsonify({"status": "success", "response": bot_response})


@app.route("/record_audio", methods=["POST"])
def record_audio_route():
    """Route to record audio and return the file path"""
    audio_path = record_audio()
    if audio_path:
        # Return relative path that can be accessed via the /saved_audios route
        filename = os.path.basename(audio_path)
        return jsonify({
            "status": "success", 
            "audio_path": f"/saved_audios/{filename}",
            "absolute_path": audio_path  # For debugging
        })
    else:
        return jsonify({"status": "error", "message": "Failed to record audio"})


@app.route("/upload_audio", methods=["POST"])
def upload_audio():
    """Route to handle audio file uploads"""
    try:
        if 'audio' not in request.files:
            return jsonify({"status": "error", "message": "No audio file provided"})
        
        audio_file = request.files['audio']
        if audio_file.filename == '':
            return jsonify({"status": "error", "message": "No audio file selected"})
        
        # Save the audio file
        timestamp = int(time.time())
        file_name = f"audio_{timestamp}.wav"
        file_path = os.path.join(AUDIO_DIR, file_name)
        
        audio_file.save(file_path)
        
        # Verify file was saved
        if os.path.exists(file_path):
            return jsonify({
                "status": "success", 
                "audio_path": file_path,  # Send absolute path for processing
                "message": "Audio uploaded successfully"
            })
        else:
            return jsonify({"status": "error", "message": "Failed to save audio file"})
            
    except Exception as e:
        print(f"❌ Error uploading audio: {e}")
        return jsonify({"status": "error", "message": str(e)})


@app.route("/saved_audios/<filename>")
def saved_audios(filename):
    return send_from_directory(AUDIO_DIR, filename)


@app.route("/clear_chat", methods=["POST"])
def clear_chat():
    # Clear ALL chat history by saving an empty dictionary
    save_chat_history({})
    
    return jsonify({"status": "success", "message": "All chat history cleared"})


@app.route("/temp_images/<filename>")
def temp_images(filename):
    return send_from_directory(TEMP_IMAGE_FOLDER, filename)




@app.route("/text_to_speech", methods=["POST"])
def text_to_speech_route():
    """Route to convert text to speech"""
    try:
        data = request.json
        text = data.get("text", "")
        
        if not text:
            return jsonify({"status": "error", "message": "No text provided"})
        
        # Clean the text - remove HTML tags for TTS
        import re
        clean_text = re.sub('<[^<]+?>', '', text)  # Remove HTML tags
        clean_text = re.sub(r'```.*?```', '', clean_text, flags=re.DOTALL)  # Remove code blocks
        
        speech_file_path = text_to_speech(clean_text)
        
        if speech_file_path:
            filename = os.path.basename(speech_file_path)
            return jsonify({
                "status": "success", 
                "audio_url": f"/saved_audios/{filename}",
                "message": "Text converted to speech successfully"
            })
        else:
            return jsonify({"status": "error", "message": "Failed to convert text to speech"})
            
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})


@app.route("/debug")
def debug():
    """Debug route to check server status"""
    return jsonify({
        "audio_dir": AUDIO_DIR,
        "audio_dir_exists": os.path.exists(AUDIO_DIR),
        "audio_files": os.listdir(AUDIO_DIR) if os.path.exists(AUDIO_DIR) else [],
        "current_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    })


@app.route("/clear_session", methods=["POST"])
def clear_session():
    if 'session_id' in session:
        session_id = session['session_id']
        
        # Load all histories
        all_history = load_chat_history()
        
        # Remove current session
        if session_id in all_history:
            del all_history[session_id]
        
        # Save updated history
        save_chat_history(all_history)
    
    # Generate new session ID
    session['session_id'] = str(uuid.uuid4())
    
    return jsonify({"status": "success", "message": "Session cleared"})


@app.route("/api/data")
def get_data():
    return jsonify({"message": "Hello World"})


if __name__ == "__main__":
    app.run(debug=True)