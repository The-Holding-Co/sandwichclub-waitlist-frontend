const config = {
    development: 'http://localhost:3000',
    production: 'https://sandwich-club-backend.onrender.com'
};

let API_URL;

const urlParams = new URLSearchParams(window.location.search);
const useLocalBackend = urlParams.get('useLocalBackend') === 'true';

if (window.location.hostname === '' || window.location.hostname.includes('localhost') || useLocalBackend) {
    API_URL = config.development;
} else {
    API_URL = config.production;
}

class OpenAIAssistant {

    constructor(assistantID) {
        this.assistantID = assistantID;
        this.thread = null;
        this.messages = [];
        this.lastMessageID = null;
        this.currentRun = null;
        this.pollinginterval = 2500;

        console.log("Using backend at " + API_URL);
    }

    // This is a public facing method that encapsulates the entire process of handling a new user message
    // It creates the message, the run, polls to check run status, and resolves the promise when it's all done
    sendMessage(message) {
        
        return new Promise((resolve, reject) => {     
            this.createMessage(message).then(data => {
                this.createRun().then(data => {
                    this.checkRunStatusAsNeeded((status) => {

                        if (status === 'completed') {

                            this.fetchMessages(this.thread.id).then(messages => {
                                
                                resolve({"status": status, "messages": this.trimToNewMessages(messages)});

                            }).catch(reject);
                        } else if (status === 'requires_action') {
                            resolve({"status": status, "run": this.currentRun});
                        } else {
                            console.log("Unexpected status: " + status);
                        }

                    }, reject);
                }).catch(error => {
                    console.error("Error creating run:", error);
                    reject(error);
                });

            }).catch(error => {
                console.error("Error creating message:", error);
                reject(error);
            });    
        });
    }

    // TODO: Should maybe refactor this so it doesnt duplicate what sendMessage does
    // consider letting client just set callback functions
    sendToolOutputs(toolOutputs) {
        return new Promise((resolve, reject) => {     
            this.submitToolOutputs(toolOutputs).then(data => {

                    this.checkRunStatusAsNeeded((status) => {

                        if (status === 'completed') {

                            this.fetchMessages(this.thread.id).then(messages => {
                                
                                resolve({"status": status, "messages": this.trimToNewMessages(messages)});

                            }).catch(reject);
                        } else if (status === 'requires_action') {
                            resolve({"status": status, "run": this.currentRun});
                        } else {
                            console.log("Unexpected status: " + status);
                        }

                    }, reject);

            }).catch(error => {
                console.error("Error submitting tools:", error);
                reject(error);
            });    
        });        
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
            return this.thread;
        })
        .catch(error => {
            console.error('Error creating thread:', error);
            throw error; // Rethrow the error if you want calling code to handle it
        });
    }



    //  -------------------------
    //  Internal below here
    //  -------------------------


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


    createRun() {
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
            return this.currentRun;
        })
        .catch(error => console.error('Error creating run:', error));

    }

    // This method has a bit of magic. It continues polling a run until the status is completed or failed
    // then it calls onCompletion handler
    checkRunStatusAsNeeded(onCompletion, reject) {
        if (!this.currentRun) return; // Exit if there's no current run


        const checkStatus = () => {
            this.checkRunStatus(this.currentRun.id).then(run => {
                console.log("Run status updated: " + run.status);
                if (run.status === 'completed' || run.status === 'failed') {
                    this.currentRun = null;
                    onCompletion(run.status, run);
                }
                else if (run.status === 'requires_action') {                    
                    onCompletion(run.status, run);
                } else {
                    // Continue polling
                    setTimeout(checkStatus, this.pollinginterval);
                }
            }).catch(reject);
        };
    
        setTimeout(checkStatus, this.pollinginterval);
    }

    checkRunStatus(runID) {
        console.log("Checking run status");

        return fetch(`${API_URL}/threads/${this.thread.id}/runs/${this.currentRun.id}`)
        .then(response => response.json())
        .then(data => {
            console.log(data);
            this.currentRun = data;

            return data;
        })
        .catch(error => console.error('Error retrieving run status:', error));
    }


    // expects an object in the form [{tool_call_id: callIds[0], output: "22C"}]
    submitToolOutputs(toolOutputs) {
        console.log("Submitting tool outputs");
        console.log(JSON.stringify({ tool_outputs: toolOutputs }));

        return fetch(`${API_URL}/threads/${this.thread.id}/runs/${this.currentRun.id}/submit_tool_outputs`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ tool_outputs: toolOutputs })
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.text();
        })
        .then(data => {
            console.log('Tool outputs submitted');
            // Handle the response data
        })
        .catch(error => {
            console.error('Error in submitting tool outputs:', error);
            // Handle errors
        });
    }


    fetchMessages() {
        console.log("Fetching messages");

        return fetch(`${API_URL}/threads/${this.thread.id}/messages`)
        .then(response => response.json())
        .then(data => {
            console.log("Got messages");
            console.log(data);
            this.messages = data.data;
            return this.messages;
        })
        .catch(error => console.error('Error retrieving thread messages:', error));
    }

    trimToNewMessages(allMessages) {
        let lastProcessedIndex = -1;

        if (this.lastMessageID) {
            lastProcessedIndex = allMessages.findIndex(message => message.id === this.lastMessageID);
        }

        // console.log("last processed index: " + lastProcessedIndex);

        const newMessages = (lastProcessedIndex === -1) ? allMessages : allMessages.slice(0, lastProcessedIndex);

        // Update the last known message ID to the ID of the newest message
        if (newMessages.length > 0) {
            this.lastMessageID = newMessages[0].id;
            // console.log("new last message ID: " + this.lastMessageID);
        }

        return newMessages;
    }

}



class ChatCompletion {

    getChatCompletion(messages) {

        return fetch(`${API_URL}/chat-completion`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({messages})
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            return response.json();
        })        
        .catch(error => console.error('Error creating chat completion:', error));

    }

    getArticleRecommendations(articles, careSituation) {

        return new Promise((resolve, reject) => {     
            let concatenatedTitles = articles.map((article, index) => `${article.id}: ${article.title}`).join("\n");

            this.getChatCompletion([
                {"role": "system", "content": "The following is a list of article titles, each with an ID preceding it."},
                {"role": "system", "content": concatenatedTitles},
                {"role": "user", "content": "Return the IDs of the two articles with the titles that seem most relavant for a person described in the care situation below. Separate the titles with a comma. Do not include any text besides the titles. For example you might return 'bqLJyxhu,PCEiUdUj'. The care situation is: " + careSituation}
            ]).then(completion => {
                resolve(completion.choices[0].message.content.split(",").map(s => s.trim()));
            }).catch(error => {
                reject(error);
            });
        });
    }

}




class MailChimpClient {
    constructor() {

    }

    addSubscriber(email) {
        return fetch(`${API_URL}/add-subscriber`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email })
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(subscriberData => {
            console.log('Subscriber added to Mailchimp:', subscriberData);
            // Handle the response data here
        })
        .catch(error => {
            console.error('Error in adding subscriber to Mailchimp:', error);
            // Handle errors here
        });
    }
}






















class ChatUIController {
    constructor() {
        this.initialState = true;
        this.initializeChatUI();
        this.initializeAssistant();
        this.chatCompletionClient = new ChatCompletion();
        this.mailchimp = new MailChimpClient();
    }

    initializeChatUI() {            
        const initialSubmitButton = document.getElementById('chat-submit'); //TODO clean this up
        const submitButton = document.getElementById('chat-submit-send');
        const inputField = document.getElementById('chat-input');
        this.$container = $('#chat-container');
        this.$indicator = $('<div>', { class: 'waitlist-progress-indicator' });
        this.$upperGradient = $('.chat-upper-gradient');
        this.$lowerGradient = $('.chat-lower-gradient');

        initialSubmitButton.addEventListener('click', (event) => {
            event.preventDefault();
            this.handleSubmit()
        });
        submitButton.addEventListener('click', (event) => {
            event.preventDefault();
            this.handleSubmit()
        });
        inputField.addEventListener('keypress', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault(); // Prevents the default action of the Enter key in a form
                this.handleSubmit();
            }
        });

        this.bindGradientssToScroll();
    }

    initializeAssistant() {
        this.assistantID = 'asst_vmoSSsFi9UhgnFwj7sRi6CT1';
        this.assistant = new OpenAIAssistant(this.assistantID);

        this.assistant.createThread()
            .then(thread => {
                // this.addStatusMessage("Successfully created a new thread.");
            })
            .catch(error => {
                this.addStatusMessage("Error connecting to OpenAI: " + error);
            });
    }

    handleSubmit() {

        const inputField = document.getElementById('chat-input');
        const message = inputField.value;
        if(message == '') {
            return; //do nothing if nothing was entered
        }

        // Tell the chat UI to update to non-initial state
        if(this.initialState) {
            $('.initial-state').removeClass('initial-state');
            this.initialState = false;
        }

        if (message) {
            this.addMessagetoUI(message, 'user');

            this.sendMessageToAssistant(message);
        }

        inputField.value = ''; // Clear the input field after submission
    }

    bindGradientssToScroll() {
        this.$container.on('scroll', () => {
            var scrollTop = this.$container.scrollTop();
            var scrollHeight = this.$container.prop('scrollHeight');
            var containerHeight = this.$container.innerHeight();
            var paddingBottom = parseInt(this.$container.css('padding-bottom'), 10);

          // Adjust scrollHeight by subtracting paddingBottom
          scrollHeight -= paddingBottom;

            // Check if scrolled to top
            if (scrollTop <= 0) {
                this.$upperGradient.addClass('fade-out');
            } else {
                this.$upperGradient.removeClass('fade-out');
            }

            // Check if scrolled to bottom
            if (scrollTop + containerHeight >= scrollHeight) {
                this.$lowerGradient.addClass('fade-out');
            } else {
                this.$lowerGradient.removeClass('fade-out');
            }
        });
    }

    sendMessageToAssistant(message) {
        
        this.showProgressIndicator();
        this.assistant.sendMessage(message).then(response => {

            if(response.status == 'completed') {
                this.hideProgressIndicator();
                this.displayNewMessages(response.messages);
            } else if(response.status == 'requires_action') {
                this.processToolCalls(response.run);
            } else {
                console.log("other status!!");
                console.log(response);
            }

        }).catch(error => {
            console.error("Error in sending message:", error);
        });
    }

    sendToolOutputsToAssistant(toolOutputs) {
        this.showProgressIndicator();
        this.assistant.sendToolOutputs(toolOutputs).then(response => {
            
            if(response.status == 'completed') {
                this.hideProgressIndicator();
                this.displayNewMessages(response.messages);
            } else if(response.status == 'requires_action') {
                this.processToolCalls(response.run);
            } else {
                console.log("other status!!");
                console.log(response);
            }

        }).catch(error => {
            console.error("Error in sending tool outputs:", error);
        });
    }

    addMessagetoUI(message, sender) {
        const chatContainer = document.getElementById('chat-container');
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('chat-message');

        if (sender === 'user') {
            messageDiv.classList.add('user-message');
        } else {
            messageDiv.classList.add('agent-message');
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

    displayNewMessages(newMessages) {
        // Add new messages to the UI, in reverse order
        for (let i = newMessages.length - 1; i >= 0; i--) {
            const message = newMessages[i];
            this.addMessagetoUI(message.content[0].text.value, 'assistant');
        }

        // scroll to show the latest
        this.scrollToBottomOfChatContainer();
    }

    scrollToBottomOfChatContainer() {
        var scrollHeight = this.$container.prop('scrollHeight');
        this.$container.animate({
          scrollTop: scrollHeight
        }, 200);
    }

     showProgressIndicator() {
        // Check if the indicator already exists to avoid duplicates
        if (this.$container.find('.waitlist-progress-indicator').length === 0) {
            this.$container.append(this.$indicator);
        }

        $("#chat-submit-send").addClass("disabled");
        this.scrollToBottomOfChatContainer();
    }

    hideProgressIndicator() {
        this.$container.find('.waitlist-progress-indicator').remove();
        $("#chat-submit-send").removeClass("disabled");
    }

    processToolCalls(response) {
        console.log("Processing tool call");
        const toolCalls = response.required_action.submit_tool_outputs.tool_calls;
    
        toolCalls.forEach(call => {
            if (call.type === "function") {
                const functionName = call.function.name;
                const args = JSON.parse(call.function.arguments);
                console.log(`Processing ${functionName} with arguments: ` +  JSON.stringify(args));
    
                // Call the appropriate function based on the name
                switch (functionName) {
                    case "validate_email":
                        this.process_validateEmail(args, call.id);
                        break;
                    case "highlight_care_terms":
                        this.process_highlightCareTerms(args, call.id);
                        break;       
                    case "recommend_articles":
                        this.process_getArticleRecommendations(args, call.id);
                        break;
                    default:
                        console.warn("Unknown function: " + functionName);
                }
            }
        });
    }

    // process_ function are responsible for doing the work AND telling the run about it
    process_validateEmail(args, toolCallID) {
        const regex = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
        const email = args.email_address;

        if(!email) {
            console.log("No email received in function call");
            return;
        }

        const emailIsValid = regex.test(String(email).toLowerCase());

        if(emailIsValid) {
            this.saveEmailAddress(String(email));
        }

        const toolOutput = [{
            tool_call_id: toolCallID,
            output: (emailIsValid ? "true" : "false")
        }];

        this.sendToolOutputsToAssistant(toolOutput);
    }

    saveEmailAddress(email) {

        if(useLocalBackend) {
            console.log(`Pretending to add ${email} as a mailchimp subscriber, since we're in a dev environment`);
        }
        else {
            this.mailchimp.addSubscriber(email);
        }
    }

    process_highlightCareTerms(args, toolCallID) {
        console.log("We got care terms: ");
        console.log(args);

        // Select the last .user-message element inside #chat-container
        var lastUserMessage = $('#chat-container .user-message').last();
        var careTerms = args.care_terms;
        
        if (lastUserMessage.length > 0) { //make sure we found one

            var content = lastUserMessage.html();

            // Loop through each term and replace it in the content
            careTerms.forEach(term => {
                // Create a regular expression to find the term, escaping special characters
                var regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
                // Replace the term with a span
                content = content.replace(regex, '<span class="care-term">$&</span>');
            });
    
            // Update the last user message with the new content
            lastUserMessage.html(content);                
        }


        const toolOutput = [{
            tool_call_id: toolCallID,
            output: "done"
        }];

        this.sendToolOutputsToAssistant(toolOutput);
    }

    process_getArticleRecommendations(args, toolCallID) {
        
        this.chatCompletionClient.getArticleRecommendations(gCareArticles, args.care_situation)
        .then(ids => {
            // Execute code with the IDs here
            console.log('Recommended IDs:', ids);
            
            // Find the articles objects matching the given IDs
            const matchingArticles = gCareArticles.filter(article => ids.includes(article.id));

            // Construct the HTML string with links
            let htmlContent = 'In the meantime, here are two articles you might find helpful for your situation.<br>';
            matchingArticles.forEach(article => {
                htmlContent += `• <a class="article-link" href="${article.url}" target="_blank">${article.title}</a><br>`;
            });
            
            // Create a new div and set the HTML content
            const newDiv = document.createElement('div');
            newDiv.className = 'chat-message agent-message';
            newDiv.innerHTML = htmlContent;

            // Append the new div to the chat container
            const chatContainer = document.getElementById('chat-container');
            chatContainer.appendChild(newDiv);

            const toolOutput = [{ tool_call_id: toolCallID, output: "done"}];
            this.sendToolOutputsToAssistant(toolOutput);
        })
        .catch(error => {
            // Handle error here
            console.error('An error occurred:', error);
        });
    }
    

}



$(document).ready(function(){
    // Initialize the chat manager
    window.chatController = new ChatUIController();
});
