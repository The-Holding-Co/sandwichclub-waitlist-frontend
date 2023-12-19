const config = {
    development: 'http://localhost:3000',
    production: 'https://sandwich-club-backend.onrender.com'
};

let API_URL;

if (window.location.hostname === '' || window.location.hostname.includes('localhost')) {
    API_URL = config.development;
} else {
    API_URL = config.production;
}

class ChatManager {
    constructor() {
        this.initializeChat();
        this.createThread();
    }

    initializeChat() {            
        this.apiKey = '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';
        this.assistantID = 'asst_vmoSSsFi9UhgnFwj7sRi6CT1';
        this.thread = null;
        this.messages = [];
        this.lastMessageID = null;
        this.currentRun = null;

        console.log("Using backend at " + API_URL);

        const submitButton = document.getElementById('chat-submit');
        const inputField = document.getElementById('chat-input');

        submitButton.addEventListener('click', () => this.handleSubmit());
        inputField.addEventListener('keypress', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault(); // Prevents the default action of the Enter key in a form
                this.handleSubmit();
            }
        });
    }

    handleSubmit() {
        const inputField = document.getElementById('chat-input');
        const message = inputField.value;
        // Here you can add the logic to display the message or send it to the server
        console.log("Message submitted:", message);

        if (message) {
            this.addMessagetoUI(message, 'user');
            //this.messages.push({ role: 'user', content: message }); // Add user message to messages array
            this.createMessage(message).then(data => {
                this.startRun();
            }).catch(error => {
                console.error("Error in message creation:", error);
            });
        }

        inputField.value = ''; // Clear the input field after submission
    }

    addMessagetoUI(message, sender) {
        const chatContainer = document.getElementById('chat-container');
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('chat-message');

        if (sender === 'user') {
            messageDiv.classList.add('user-message');
        } else {
            messageDiv.classList.add('recipient-message');
        }

        messageDiv.textContent = message;
        chatContainer.appendChild(messageDiv);

        // Scroll to the latest message
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    addStatusMessage(message) {
        const chatContainer = document.getElementById('chat-container');
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('status-message');
        messageDiv.textContent = message;
        chatContainer.appendChild(messageDiv);

        // Scroll to the latest message
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }



    createThread() {
        return fetch(`${API_URL}/threads/create`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            this.thread = data;  // Store the response in the class property
            console.log('Thread Created:', this.thread);
            this.addStatusMessage("Successfully created a new thread.");
            return this.thread;
        })
        .catch(error => {
            console.error('Error creating thread:', error);
            throw error; // Rethrow the error if you want calling code to handle it
        });
    }

    createMessage(content) {
        // Ensure there is a current thread ID and message content
        if (!this.thread.id || !content) {
            console.error('Thread ID or message content is missing.');
            return;
        }

        console.log("Creating message");

        return fetch(`${API_URL}/messages/create`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                threadId: this.thread.id, 
                content: content 
            })
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log('Message created:', data);
            this.lastMessageID = data.id;
            return data;
        })
        .catch(error => {
            console.error('Error creating message:', error);
            throw error;
        });
    }


    startRun() {
        console.log("Starting run");
        if (this.currentRun) return; // There is already a run going

        return fetch(`${API_URL}/threads/${this.thread.id}/runs/create`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ assistant_id: this.assistantID })
        })
        .then(response => response.json())
        .then(data => {
            this.currentRun = data;
            this.checkRunStatusAsNeeded();
        })
        .catch(error => console.error('Error creating run:', error));

    }

    checkRunStatusAsNeeded() {
        if (!this.currentRun) return; // Exit if there's no current run

        this.checkRunStatus(this.currentRun.id).then(run => {
            console.log("Run status updated: " + run.status);
            if (run.status == "completed") {
                this.currentRun = null; // Reset the current run
            } else {
                setTimeout(() => this.checkRunStatusAsNeeded(), 3000);
            }
        });
    }

    checkRunStatus(runID) {
        console.log("Checking run status");

        return fetch(`${API_URL}/threads/${this.thread.id}/runs/${this.currentRun.id}`)
        .then(response => response.json())
        .then(data => {
            console.log(data);
            if (data.status === 'completed') {
                this.fetchMessages();
            } 

            return data;
        })
        .catch(error => console.error('Error retrieving run status:', error));
    }

    fetchMessages() {
        console.log("Fetching messages");

        return fetch(`${API_URL}/threads/${this.thread.id}/messages`)
        .then(response => response.json())
        .then(data => {
            console.log("Got messages");
            console.log(data);
            this.messages = data.data;
            this.displayNewMessages(this.messages);
        })
        .catch(error => console.error('Error retrieving thread messages:', error));
    }

    displayNewMessages(allMessages) {
        let lastProcessedIndex = -1;

        console.log("last known message: " + this.lastMessageID);
        if (this.lastMessageID) {
            lastProcessedIndex = allMessages.findIndex(message => message.id === this.lastMessageID);
        }

        console.log("last processed index: " + lastProcessedIndex);

        const newMessages = (lastProcessedIndex === -1) ? allMessages : allMessages.slice(0, lastProcessedIndex);

        // Add new messages to the UI, in reverse order
        for (let i = newMessages.length - 1; i >= 0; i--) {
            const message = newMessages[i];
            this.addMessagetoUI(message.content[0].text.value, 'assistant');
        }

        // Update the last known message ID to the ID of the newest message
        if (newMessages.length > 0) {
            this.lastMessageID = newMessages[0].id;
            console.log("new last message ID: " + this.lastMessageID);
        }
    }
}

