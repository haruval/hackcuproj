import React, { useState, useEffect, useRef } from 'react';
import OpenAI from 'openai';

function App() {
  const [messages, setMessages] = useState([]);
  const [userInput, setUserInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [threadId, setThreadId] = useState(null);
  const [openai, setOpenai] = useState(null);
  const [assistantId, setAssistantId] = useState(null);
  const messagesEndRef = useRef(null);

  // Initialize OpenAI client
  useEffect(() => {
    // Initialize OpenAI with your API key
    // IMPORTANT: In a production app, you would not expose your API key in the client-side code.
    // Instead, you would create a backend API that handles the OpenAI interactions.
    const openaiClient = new OpenAI({
      apiKey: process.env.REACT_APP_OPENAI_API_KEY, // Store this in .env file
      dangerouslyAllowBrowser: true // This is only for development, not recommended for production
    });
    
    setOpenai(openaiClient);
    
    // Set your Assistant ID here - this is the ID of the assistant you've created in the OpenAI platform
    setAssistantId('asst_QjNSTqtCsL8J2Rs8A4UP4xNo');
    
    // Set document title
    document.title = "Lucy";
  }, []);

  // Create a new thread when the component mounts
  useEffect(() => {
    const createThread = async () => {
      if (!openai) return;
      
      try {
        const thread = await openai.beta.threads.create();
        console.log("Thread created:", thread.id);
        setThreadId(thread.id);
      } catch (error) {
        console.error("Error creating thread:", error);
      }
    };

    if (openai && !threadId) {
      createThread();
    }
  }, [openai, threadId]);

  // Auto-scroll to the bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Function to interact with the OpenAI Assistant
  const getAssistantResponse = async (userMessage) => {
    if (!openai || !threadId || !assistantId) {
      console.error("OpenAI client, thread ID, or assistant ID not initialized");
      return "Error: Chat system not initialized properly";
    }
    
    setIsLoading(true);
    
    try {
      // Add the user message to the thread
      await openai.beta.threads.messages.create(threadId, {
        role: "user",
        content: userMessage
      });
      
      // Run the assistant on the thread
      const run = await openai.beta.threads.runs.create(threadId, {
        assistant_id: assistantId
      });
      
      // Poll for the run completion
      let runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
      
      // Poll until the run completes
      while (runStatus.status !== "completed") {
        if (["failed", "cancelled", "expired"].includes(runStatus.status)) {
          throw new Error(`Run ended with status: ${runStatus.status}`);
        }
        
        // Wait for a second before polling again
        await new Promise(resolve => setTimeout(resolve, 1000));
        runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
      }
      
      // Get the messages from the thread
      const messagesList = await openai.beta.threads.messages.list(threadId);
      
      // Find the latest assistant message
      const assistantMessages = messagesList.data.filter(
        msg => msg.role === "assistant"
      );
      
      if (assistantMessages.length > 0) {
        // Get the most recent message (should be at the top of the list)
        const latestMessage = assistantMessages[0];
        // Extract the text content
        const messageContent = latestMessage.content[0].text.value;
        setIsLoading(false);
        return messageContent;
      } else {
        throw new Error("No assistant messages found");
      }
      
    } catch (error) {
      console.error("Error getting assistant response:", error);
      setIsLoading(false);
      return "Sorry, I encountered an error while processing your request.";
    }
  };

  // Handle sending messages
  const handleSend = async () => {
    if (!userInput.trim()) return;
    
    // Add user message to UI
    const userMsg = { role: 'user', content: userInput.trim() };
    setMessages(prev => [...prev, userMsg]);
    
    // Clear input
    setUserInput('');
    
    // Get assistant response
    const assistantResponse = await getAssistantResponse(userInput.trim());
    
    // Add assistant message to UI
    const assistantMsg = { role: 'assistant', content: assistantResponse };
    setMessages(prev => [...prev, assistantMsg]);
  };

  // Handle key press (Enter to send)
  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSend();
    }
  };

  return (
    <div style={{ 
      position: 'relative', 
      width: '100%', 
      height: '100vh', 
      fontFamily: '"Helvetica", "Arial", sans-serif',
      backgroundColor: '#000000', // Black background
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      overflow: 'hidden'
    }}>
      {/* Chat Box */}
      <div
        style={{
          width: '400px',
          backgroundColor: '#000000', // Black background
          padding: '20px',
          borderRadius: '12px',
          fontFamily: '"Helvetica", "Arial", sans-serif',
          fontSize: '18px',
          border: '2px solid #FFFFFF', // White border
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '80vh',
        }}
      >
        <h2 style={{ margin: '0 0 15px 0', textAlign: 'center', color: '#FFFFFF' }}>Lucy</h2>
        
        <div
          style={{
            flex: 1,
            height: '400px',
            overflowY: 'auto',
            marginBottom: '15px',
            padding: '10px',
            borderRadius: '8px',
            backgroundColor: '#000000', // Black background
            border: '1px solid #FFFFFF', // White border
          }}
        >
          {messages.length === 0 ? (
            <div style={{ color: '#AAAAAA', textAlign: 'center', marginTop: '20px' }}>
              hai!!! i can help you start your pc build :3
            </div>
          ) : (
            messages.map((msg, i) => (
              <div 
                key={i} 
                style={{ 
                  marginBottom: '12px',
                  padding: '8px',
                  borderRadius: '6px',
                  backgroundColor: msg.role === 'user' ? '#222222' : '#333333',
                  border: '1px solid #444444',
                  alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '90%',
                  wordWrap: 'break-word',
                  color: '#FFFFFF'
                }}
              >
                <strong>{msg.role === 'user' ? 'You' : 'Lucy'}:</strong> {msg.content}
              </div>
            ))
          )}
          {isLoading && (
            <div style={{ textAlign: 'left', color: '#888' }}>cooking...</div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <input
            style={{
              flex: 1,
              padding: '10px',
              borderRadius: '8px',
              border: '1px solid #FFFFFF',
              backgroundColor: '#111111',
              color: '#FFFFFF',
              fontFamily: '"Helvetica", "Arial", sans-serif',
              fontSize: '16px',
            }}
            type="text"
            placeholder="Type something..."
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={isLoading}
          />
          <button
            style={{
              padding: '10px 15px',
              borderRadius: '8px',
              border: '1px solid #FFFFFF',
              backgroundColor: '#333333',
              color: '#FFFFFF',
              fontFamily: '"Helvetica", "Arial", sans-serif',
              fontSize: '16px',
              cursor: 'pointer',
              transition: 'background-color 0.3s'
            }}
            onClick={handleSend}
            disabled={isLoading}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;