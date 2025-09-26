document.addEventListener('DOMContentLoaded', function() {
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-button');
    const chatMessages = document.getElementById('chat-messages');
    const themeToggle = document.getElementById('theme-toggle');
    const clearChatBtn = document.getElementById('clear-chat');
    const imageInput = document.getElementById('image-input');
    const recordAudioBtn = document.getElementById('record-audio');
    const recordingIndicator = document.getElementById('recording-indicator');
    const stopRecordingBtn = document.getElementById('stop-recording');
    
    // Modal elements
    const imagePreviewModal = document.getElementById('image-preview-modal');
    const imagePreview = document.getElementById('image-preview');
    const imageCaption = document.getElementById('image-caption');
    const cancelImageBtn = document.getElementById('cancel-image');
    const sendImageBtn = document.getElementById('send-image');
    const closeModalBtn = document.querySelector('.close');
    
    // Audio recording variables
    let mediaRecorder = null;
    let audioChunks = [];
    let audioBlob = null;
    
    // Theme toggle functionality
    themeToggle.addEventListener('click', function() {
        document.body.classList.toggle('light-mode');
        document.body.classList.toggle('dark-mode');
        
        const icon = themeToggle.querySelector('i');
        if (document.body.classList.contains('dark-mode')) {
            icon.classList.remove('fa-moon');
            icon.classList.add('fa-sun');
        } else {
            icon.classList.remove('fa-sun');
            icon.classList.add('fa-moon');
        }
    });
    
    // Clear chat functionality
    clearChatBtn.addEventListener('click', function() {
        if (confirm('Are you sure you want to clear the chat?')) {
            fetch('/clear_chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            })
            .then(response => response.json())
            .then(data => {
                if (data.status === 'success') {
                    chatMessages.innerHTML = '';
                }
            });
        }
    });
    
    // Send message functionality
    function sendMessage(type, content, caption = '') {
        fetch('/send_message', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                type: type,
                content: content,
                caption: caption
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                // Add bot response to chat
                addMessage('bot', 'text', data.response);
            }
        });
    }
    
    // Add message to chat UI
    function addMessage(sender, type, content, caption = '') {
        const timestamp = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        const messageId = Date.now(); // Unique ID for each message
        
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', `${sender}-message`);
        messageDiv.setAttribute('data-message-id', messageId);
        
        let contentHTML = '';
        if (type === 'text') {
            contentHTML = `<p>${content}</p>`;
        } else if (type === 'image') {
            contentHTML = `<img src="${content}" alt="Sent image" class="chat-image">`;
            if (caption) {
                contentHTML += `<p class="image-caption">${caption}</p>`;
            }
        } else if (type === 'audio') {
            contentHTML = `<audio controls>
                <source src="${content}" type="audio/wav">
                Your browser does not support the audio element.
            </audio>`;
        }
        
        // Add speak button only for bot text messages
        let speakButtonHTML = '';
        if (sender === 'bot' && type === 'text') {
            speakButtonHTML = `<button class="speak-btn" data-message-id="${messageId}">
                <i class="fas fa-volume-up"></i>
            </button>`;
        }
        
        messageDiv.innerHTML = `
            <div class="message-content">
                ${contentHTML}
            </div>
            <div class="message-meta">
                <span class="message-time">${timestamp}</span>
                <button class="copy-btn" data-message-id="${messageId}">
                    <i class="fas fa-copy"></i>
                </button>
                ${speakButtonHTML}
            </div>
        `;
        
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
    
    // Send text message
    function sendTextMessage() {
        const message = messageInput.value.trim();
        if (message) {
            addMessage('user', 'text', message);
            sendMessage('text', message);
            messageInput.value = '';
        }
    }
    
    sendButton.addEventListener('click', sendTextMessage);
    
    messageInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            sendTextMessage();
        }
    });
    
    // Image handling with caption
    imageInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(event) {
                imagePreview.src = event.target.result;
                imageCaption.value = '';
                imagePreviewModal.style.display = 'block';
            };
            reader.readAsDataURL(file);
        }
    });
    
    // Close modal functions
    function closeImageModal() {
        imagePreviewModal.style.display = 'none';
        imageInput.value = '';
    }
    
    closeModalBtn.addEventListener('click', closeImageModal);
    cancelImageBtn.addEventListener('click', closeImageModal);
    
    // Send image with caption
    sendImageBtn.addEventListener('click', function() {
        const caption = imageCaption.value.trim();
        addMessage('user', 'image', imagePreview.src, caption);
        sendMessage('image', imagePreview.src, caption);
        closeImageModal();
    });
    
    // Close modal if clicked outside
    window.addEventListener('click', function(e) {
        if (e.target === imagePreviewModal) {
            closeImageModal();
        }
    });
    
   // Audio recording functionality - FIXED VERSION
recordAudioBtn.addEventListener('click', function() {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(function(stream) {
                mediaRecorder = new MediaRecorder(stream);
                audioChunks = [];
                
                mediaRecorder.ondataavailable = function(e) {
                    audioChunks.push(e.data);
                };
                
                mediaRecorder.onstop = function() {
                    audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
                    const audioUrl = URL.createObjectURL(audioBlob);
                    
                    // Display the audio in chat immediately
                    addMessage('user', 'audio', audioUrl);
                    
                    // Send the audio blob to server for processing
                    sendAudioToServer(audioBlob);
                    
                    // Stop all audio tracks
                    stream.getTracks().forEach(track => track.stop());
                };
                
                mediaRecorder.start();
                recordAudioBtn.classList.add('hidden');
                recordingIndicator.classList.remove('hidden');
            })
            .catch(function(err) {
                console.error('Error accessing microphone:', err);
                alert('Could not access your microphone. Please check permissions.');
            });
    } else {
        alert('Your browser does not support audio recording.');
    }
});

// Stop recording - KEEP THIS THE SAME
stopRecordingBtn.addEventListener('click', function() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        recordAudioBtn.classList.remove('hidden');
        recordingIndicator.classList.add('hidden');
    }
});

// NEW FUNCTION: Send audio blob to server
function sendAudioToServer(audioBlob) {
    // Create FormData to send the file
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.wav');
    
    // Send to server for processing
    fetch('/upload_audio', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === 'success') {
            // Now send the audio file path for transcription
            sendMessage('audio', data.audio_path);
        } else {
            console.error('Audio upload failed:', data.message);
            // Still try to process with the blob URL as fallback
            sendMessage('audio', URL.createObjectURL(audioBlob));
        }
    })
    .catch(error => {
        console.error('Audio upload error:', error);
        // Fallback: try to process with blob URL
        sendMessage('audio', URL.createObjectURL(audioBlob));
    });
}
    
    // Event delegation for copy and speak buttons
    chatMessages.addEventListener('click', function(e) {
        // Handle copy button clicks
        if (e.target.closest('.copy-btn')) {
            const button = e.target.closest('.copy-btn');
            const messageId = button.getAttribute('data-message-id');
            copyMessage(messageId);
        }
        
        // Handle speak button clicks
        if (e.target.closest('.speak-btn')) {
            const button = e.target.closest('.speak-btn');
            const messageId = button.getAttribute('data-message-id');
            speakMessage(messageId);
        }
    });
    
    // Copy message functionality
    function copyMessage(messageId) {
        const messageElement = document.querySelector(`.message[data-message-id="${messageId}"]`);
        const messageContent = messageElement.querySelector('.message-content');
        
        let textToCopy = '';
        if (messageContent.querySelector('p')) {
            textToCopy = messageContent.querySelector('p').textContent;
        } else if (messageContent.querySelector('.image-caption')) {
            textToCopy = messageContent.querySelector('.image-caption').textContent;
        } else if (messageContent.querySelector('img')) {
            textToCopy = messageContent.querySelector('img').src;
        } else if (messageContent.querySelector('audio')) {
            textToCopy = messageContent.querySelector('audio').src;
        }
        
        navigator.clipboard.writeText(textToCopy).then(() => {
            const button = messageElement.querySelector('.copy-btn');
            const originalIcon = button.innerHTML;
            button.innerHTML = '<i class="fas fa-check"></i>';
            setTimeout(() => {
                button.innerHTML = originalIcon;
            }, 2000);
        });
    }
    
          // Speak message functionality
    // Speak message functionality
function speakMessage(messageId) {
    const messageElement = document.querySelector(`.message[data-message-id="${messageId}"]`);
    const messageContent = messageElement.querySelector('.message-content');
    
    // Extract text content (remove HTML tags)
    let textToSpeak = '';
    
    if (messageContent.querySelector('p')) {
        textToSpeak = messageContent.querySelector('p').textContent;
    } else {
        // Fallback: get all text content
        textToSpeak = messageContent.textContent || messageContent.innerText;
    }
    
    // Clean the text - remove any extra whitespace
    textToSpeak = textToSpeak.trim();
    
    if (!textToSpeak) {
        console.log('No text content found to speak');
        return;
    }
    
    // Show speaking indicator
    const speakButton = messageElement.querySelector('.speak-btn');
    const originalIcon = speakButton.innerHTML;
    speakButton.innerHTML = '<i class="fas fa-volume-up speaking-pulse"></i>';
    speakButton.disabled = true;
    
    // Call the text-to-speech API
    fetch('/text_to_speech', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            text: textToSpeak
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === 'success') {
            console.log('Text-to-speech successful');
            
            // Create audio element to play the speech
            const audio = new Audio(data.audio_url);
            audio.play();
            
            // Reset button when audio ends
            audio.onended = function() {
                speakButton.innerHTML = originalIcon;
                speakButton.disabled = false;
            };
            
            // Also reset button after 30 seconds max (in case of errors)
            setTimeout(() => {
                speakButton.innerHTML = originalIcon;
                speakButton.disabled = false;
            }, 30000);
            
        } else {
            console.error('Text-to-speech failed:', data.message);
            speakButton.innerHTML = originalIcon;
            speakButton.disabled = false;
            alert('Text-to-speech failed: ' + data.message);
        }
    })
    .catch(error => {
        console.error('Text-to-speech error:', error);
        speakButton.innerHTML = originalIcon;
        speakButton.disabled = false;
        alert('Error with text-to-speech service');
    });
}


// Stop speaking functionality
function stopSpeaking() {
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
        currentAudio = null;
    }
    resetSpeakButton();
}

// Reset speak button to original state
function resetSpeakButton() {
    if (currentSpeakButton) {
        currentSpeakButton.innerHTML = '<i class="fas fa-volume-up"></i>';
        currentSpeakButton.classList.remove('speaking');
        currentSpeakButton.setAttribute('title', 'Speak message');
        currentSpeakButton = null;
    }
}

// Add event listener for stop button clicks
chatMessages.addEventListener('click', function(e) {
    const speakButton = e.target.closest('.speak-btn');
    if (speakButton) {
        const messageId = speakButton.getAttribute('data-message-id');
        
        // If already speaking this message, stop it
        if (speakButton.classList.contains('speaking')) {
            stopSpeaking();
        } else {
            // If other audio is playing, stop it first
            if (currentAudio) {
                stopSpeaking();
            }
            speakMessage(messageId);
        }
    }
});
    
    // Function to extract clean text from HTML content
    function extractTextFromHTML(htmlContent) {
        // Create a temporary div element
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlContent;
        
        // Remove any code tags and their content
        const codeElements = tempDiv.querySelectorAll('code');
        codeElements.forEach(el => el.remove());
        
        // Remove any remaining HTML tags
        return tempDiv.textContent || tempDiv.innerText || '';
    }
    
    // Auto-scroll to bottom on page load
    chatMessages.scrollTop = chatMessages.scrollHeight;
});

// Add to your existing JavaScript

// New session button
document.getElementById('new-session').addEventListener('click', function() {
    if (confirm('Start a new conversation? Your current chat history will be saved.')) {
        fetch('/clear_session', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                location.reload(); // Refresh the page to show empty chat
            }
        })
        .catch(error => console.error('Error:', error));
    }
});

// Update clear chat to clear ALL history
document.getElementById('clear-chat').addEventListener('click', function() {
    if (confirm('Clear ALL chat history? This cannot be undone.')) {
        fetch('/clear_chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                location.reload(); // Refresh the page
            }
        })
        .catch(error => console.error('Error:', error));
    }
});

