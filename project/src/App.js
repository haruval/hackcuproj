import React, { useState, useEffect, useRef } from 'react';
import OpenAI from 'openai';
import ReactMarkdown from 'react-markdown';

function App() {
  const [messages, setMessages] = useState([]);
  const [userInput, setUserInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [threadId, setThreadId] = useState(null);
  const [openai, setOpenai] = useState(null);
  const [assistantId, setAssistantId] = useState(null);
  const [pcParts, setPcParts] = useState([]);
  const messagesEndRef = useRef(null);

  // Initialize OpenAI client
  useEffect(() => {
    // Initialize OpenAI with your API key
    const openaiClient = new OpenAI({
      apiKey: process.env.REACT_APP_OPENAI_API_KEY,
      dangerouslyAllowBrowser: true
    });
    
    setOpenai(openaiClient);
    
    // Set your Assistant ID here
    setAssistantId('asst_QjNSTqtCsL8J2Rs8A4UP4xNo');
    
    // Set document title
    document.title = "Lucy - PC Builder";
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

  // Function to extract parts table from the response
  const extractPartsTable = (response) => {
    // Look for content between <!-- PARTS_TABLE and -->
    const tableMatch = response.match(/<!-- PARTS_TABLE\n([\s\S]*?)\n-->/);
    
    if (!tableMatch || !tableMatch[1]) {
      console.log("No parts table found in the response");
      return null;
    }
    
    const tableMarkdown = tableMatch[1];
    
    // Parse the markdown table into a structured object
    // Split into rows, first row is header
    const rows = tableMarkdown.trim().split('\n');
    
    // Remove the separator row (second row with |---|---|---|)
    const headerRow = rows[0];
    const dataRows = rows.slice(2);
    
    // Parse header
    const headers = headerRow
      .split('|')
      .map(cell => cell.trim())
      .filter(cell => cell);
    
    // Parse data rows
    const parts = dataRows.map(row => {
      const cells = row
        .split('|')
        .map(cell => cell.trim())
        .filter(cell => cell);
      
      // Create object with properties from headers
      const part = {};
      headers.forEach((header, index) => {
        part[header.toLowerCase()] = cells[index];
      });
      
      return part;
    });
    
    return parts;
  };

  // Function to clean the response for display (remove the hidden table)
  const cleanResponseForDisplay = (response) => {
    return response.replace(/<!-- PARTS_TABLE[\s\S]*?-->/, '').trim();
  };

  // Function to interact with the OpenAI Assistant
  const getAssistantResponse = async (userMessage) => {
    if (!openai || !threadId || !assistantId) {
      console.error("OpenAI client, thread ID, or assistant ID not initialized");
      return "Error: Chat system not initialized properly";
    }
    
    setIsLoading(true);
    
    try {
      // Add instructions for the hidden table format
      let messageWithInstructions = userMessage;
      
      // Only add the instructions for the initial message or messages about PC building
      if (messages.length === 0 || 
          userMessage.toLowerCase().includes('pc') || 
          userMessage.toLowerCase().includes('computer') ||
          userMessage.toLowerCase().includes('build') ||
          userMessage.toLowerCase().includes('part')) {
        messageWithInstructions = `${userMessage}

(In your response, please include an updated parts list for the PC build in a hidden section using HTML comments. Format this section as follows:

<!-- PARTS_TABLE
| Component | Selection | Price |
|-----------|-----------|-------|
| GPU | [Selected GPU] | $XXX |
| CPU | [Selected CPU] | $XXX |
| Motherboard | [Selected Motherboard] | $XXX |
| RAM | [Selected RAM] | $XXX |
| Storage | [Selected Storage] | $XXX |
| Power Supply | [Selected PSU] | $XXX |
| Case | [Selected Case] | $XXX |
| CPU Cooler | [Selected Cooler] | $XXX |
-->

This hidden section won't be visible to the user but will be used to update the parts table in the UI.)`;
      }
      
      // Add the user message to the thread
      await openai.beta.threads.messages.create(threadId, {
        role: "user",
        content: messageWithInstructions
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
        
        // Check if there's a parts table in the response
        const parts = extractPartsTable(messageContent);
        if (parts) {
          console.log("Updated PC parts:", parts);
          setPcParts(parts);
        }
        
        // Clean the response for display
        const cleanedResponse = cleanResponseForDisplay(messageContent);
        
        setIsLoading(false);
        return cleanedResponse;
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

  // Process message content to convert Markdown-like syntax to actual Markdown
  const processMessageContent = (content) => {
    // Handle the case where the content starts with "Lucy:" or similar
    const processedContent = content.replace(/^(Lucy|Assistant):\s+/i, '');
    
    return processedContent;
  };

  // Custom CSS for markdown styling
  const markdownStyles = {
    p: {
      marginBottom: '8px',
      lineHeight: '1.5',
    },
    ul: {
      paddingLeft: '20px',
      marginBottom: '8px',
    },
    li: {
      marginBottom: '4px',
    },
    strong: {
      fontWeight: 'bold',
    },
    h1: {
      fontSize: '1.5em',
      fontWeight: 'bold',
      marginBottom: '8px',
    },
    h2: {
      fontSize: '1.3em',
      fontWeight: 'bold',
      marginBottom: '8px',
    },
  };

  // Calculate total cost of all parts
  const calculateTotal = () => {
    if (!pcParts || pcParts.length === 0) return "$0";
    
    // Extract prices and convert to numbers
    const total = pcParts.reduce((sum, part) => {
      // Extract numeric value from price string (e.g., "$799" -> 799)
      const price = part.price ? parseFloat(part.price.replace(/[^0-9.]/g, '')) : 0;
      return sum + price;
    }, 0);
    
    return `$${total.toFixed(2)}`;
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
      overflow: 'hidden',
      color: '#FFFFFF'
    }}>
      {/* Main Container */}
      <div style={{
        display: 'flex',
        width: '80%',
        maxWidth: '1000px',
        height: '80vh',
        gap: '20px'
      }}>
        {/* Chat Box */}
        <div
          style={{
            width: '60%',
            backgroundColor: '#000000',
            padding: '20px',
            borderRadius: '12px',
            fontFamily: '"Helvetica", "Arial", sans-serif',
            fontSize: '18px',
            border: '2px solid #FFFFFF',
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
          }}
        >
          <h2 style={{ margin: '0 0 15px 0', textAlign: 'center', color: '#FFFFFF' }}>Lucy</h2>
          
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              marginBottom: '15px',
              padding: '10px',
              borderRadius: '8px',
              backgroundColor: '#000000',
              border: '1px solid #FFFFFF',
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
                    maxWidth: '90%',
                    marginLeft: msg.role === 'user' ? 'auto' : '0',
                    wordWrap: 'break-word',
                    color: '#FFFFFF'
                  }}
                >
                  <strong>{msg.role === 'user' ? 'You' : 'Lucy'}:</strong>{' '}
                  {msg.role === 'assistant' ? (
                    <ReactMarkdown components={{
                      p: ({node, ...props}) => <p style={markdownStyles.p} {...props} />,
                      ul: ({node, ...props}) => <ul style={markdownStyles.ul} {...props} />,
                      li: ({node, ...props}) => <li style={markdownStyles.li} {...props} />,
                      strong: ({node, ...props}) => <strong style={markdownStyles.strong} {...props} />,
                      h1: ({node, ...props}) => <h1 style={markdownStyles.h1} {...props} />,
                      h2: ({node, ...props}) => <h2 style={markdownStyles.h2} {...props} />,
                    }}>
                      {processMessageContent(msg.content)}
                    </ReactMarkdown>
                  ) : (
                    msg.content
                  )}
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
        
        {/* PC Parts Table */}
        <div
          style={{
            width: '40%',
            backgroundColor: '#000000',
            padding: '20px',
            borderRadius: '12px',
            fontFamily: '"Helvetica", "Arial", sans-serif',
            fontSize: '16px',
            border: '2px solid #FFFFFF',
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
          }}
        >
          <h2 style={{ margin: '0 0 15px 0', textAlign: 'center', color: '#FFFFFF' }}>Your PC Build</h2>
          
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              marginBottom: '15px',
              padding: '10px',
              borderRadius: '8px',
              backgroundColor: '#000000',
              border: '1px solid #FFFFFF',
            }}
          >
            {pcParts.length === 0 ? (
              <div style={{ color: '#AAAAAA', textAlign: 'center', marginTop: '20px' }}>
                No parts selected yet. Ask Lucy to help you build a PC!
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ 
                      textAlign: 'left', 
                      padding: '8px', 
                      borderBottom: '1px solid #FFFFFF' 
                    }}>Component</th>
                    <th style={{ 
                      textAlign: 'left', 
                      padding: '8px', 
                      borderBottom: '1px solid #FFFFFF' 
                    }}>Selection</th>
                    <th style={{ 
                      textAlign: 'right', 
                      padding: '8px', 
                      borderBottom: '1px solid #FFFFFF' 
                    }}>Price</th>
                  </tr>
                </thead>
                <tbody>
                  {pcParts.map((part, index) => (
                    <tr key={index}>
                      <td style={{ 
                        padding: '8px', 
                        borderBottom: '1px solid #333333' 
                      }}>{part.component}</td>
                      <td style={{ 
                        padding: '8px', 
                        borderBottom: '1px solid #333333' 
                      }}>{part.selection}</td>
                      <td style={{ 
                        textAlign: 'right', 
                        padding: '8px', 
                        borderBottom: '1px solid #333333' 
                      }}>{part.price}</td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan="2" style={{ 
                      textAlign: 'right', 
                      padding: '8px',
                      fontWeight: 'bold',
                      borderTop: '1px solid #FFFFFF'
                    }}>Total:</td>
                    <td style={{ 
                      textAlign: 'right', 
                      padding: '8px',
                      fontWeight: 'bold',
                      borderTop: '1px solid #FFFFFF'
                    }}>{calculateTotal()}</td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>
          
          <div style={{
            padding: '10px',
            backgroundColor: '#333333',
            borderRadius: '8px',
            textAlign: 'center'
          }}>
            <p style={{ margin: 0 }}>Ask Lucy to suggest changes or upgrades to your build!</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;