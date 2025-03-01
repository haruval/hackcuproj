import React, { useState, useEffect, useRef } from 'react';

function App() {
  const [messages, setMessages] = useState([]);
  const [userInput, setUserInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  // Set document title
  useEffect(() => {
    document.title = "Chat App";
  }, []);

  // Auto-scroll to the bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Mock GPT response function (replace with actual API call in production)
  const getGptResponse = async (message) => {
    setIsLoading(true);
    
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Mock responses based on keywords in user input
    const input = message.toLowerCase();
    let response;
    
    if (input.includes('hello') || input.includes('hi')) {
      response = "hai :33";
    } else {
      response = "im figuring out how to limit the api so it doesn't cost me a ton of money let me cook";
    }
    
    setIsLoading(false);
    return response;
  };

  // Handle sending messages
  const handleSend = async () => {
    if (!userInput.trim()) return;
    
    // Add user message
    const userMsg = { role: 'user', content: userInput.trim() };
    setMessages(prev => [...prev, userMsg]);
    
    // Clear input
    setUserInput('');
    
    // Get and add bot response
    const botResponse = await getGptResponse(userInput);
    const botMsg = { role: 'bot', content: botResponse };
    setMessages(prev => [...prev, botMsg]);
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
      fontFamily: '"Times New Roman", serif',
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
          fontFamily: '"Times New Roman", serif',
          fontSize: '18px',
          border: '2px solid #FFFFFF', // White border
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '80vh',
        }}
      >
        <h2 style={{ margin: '0 0 15px 0', textAlign: 'center', color: '#FFFFFF' }}>Chat App</h2>
        
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
              Start a conversation...
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
                <strong>{msg.role === 'user' ? 'You' : 'Bot'}:</strong> {msg.content}
              </div>
            ))
          )}
          {isLoading && (
            <div style={{ textAlign: 'left', color: '#888' }}>Bot is typing...</div>
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
              fontFamily: '"Times New Roman", serif',
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
              fontFamily: '"Times New Roman", serif',
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