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
  const [buildMode, setBuildMode] = useState(false);
  const [currentPhase, setCurrentPhase] = useState(null);
  const [currentPhaseNumber, setCurrentPhaseNumber] = useState(1);
  const [helpMode, setHelpMode] = useState(false);
  const [buildComplete, setBuildComplete] = useState(false);
  const [activeRun, setActiveRun] = useState(null);
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
  }, [messages, currentPhase]);

  // Check if there's an active run on the thread
  const checkActiveRun = async () => {
    if (!threadId || !openai) return null;
    
    try {
      // List all runs on the thread
      const runs = await openai.beta.threads.runs.list(threadId);
      
      // Find any run that is not completed or failed
      const activeRuns = runs.data.filter(run => 
        !["completed", "failed", "cancelled", "expired"].includes(run.status)
      );
      
      if (activeRuns.length > 0) {
        return activeRuns[0];
      }
      
      return null;
    } catch (error) {
      console.error("Error checking active runs:", error);
      return null;
    }
  };

  // Cancel an active run if needed
  const cancelRunIfNeeded = async () => {
    // Check for any active run
    const runToCancel = await checkActiveRun();
    
    if (runToCancel) {
      console.log("Cancelling active run:", runToCancel.id);
      try {
        await openai.beta.threads.runs.cancel(threadId, runToCancel.id);
        
        // Wait a moment to ensure the cancellation takes effect
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        return true;
      } catch (error) {
        console.error("Error cancelling run:", error);
        return false;
      }
    }
    
    return true; // No run to cancel
  };

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
      // First, cancel any active run
      const cancelled = await cancelRunIfNeeded();
      if (!cancelled) {
        throw new Error("Could not cancel active run");
      }
      
      // Add instructions for the hidden table format
      let messageWithInstructions = userMessage;
      
      // Only add the instructions for the initial message or messages about PC building
      // when not in build mode or help mode
      if (!buildMode && !helpMode && 
          (messages.length === 0 || 
          userMessage.toLowerCase().includes('pc') || 
          userMessage.toLowerCase().includes('computer') ||
          userMessage.toLowerCase().includes('build') ||
          userMessage.toLowerCase().includes('part'))) {
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
      
      // Save the active run ID
      setActiveRun(run.id);
      
      // Poll for the run completion
      let runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
      
      // Poll until the run completes
      while (runStatus.status !== "completed") {
        if (["failed", "cancelled", "expired"].includes(runStatus.status)) {
          setActiveRun(null);
          throw new Error(`Run ended with status: ${runStatus.status}`);
        }
        
        // Wait for a second before polling again
        await new Promise(resolve => setTimeout(resolve, 1000));
        runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
      }
      
      // Clear the active run ID
      setActiveRun(null);
      
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
      setActiveRun(null);
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

  // Handle build button click
  const handleBuildClick = async () => {
    // Enable build mode
    setBuildMode(true);
    setHelpMode(false);
    setCurrentPhaseNumber(1);
    setBuildComplete(false);
    
    // Get the first phase of the build guide
    await getNextBuildPhase();
  };

  // Function to get the next build phase from the API
  const getNextBuildPhase = async () => {
    setIsLoading(true);
    
    try {
      // First, cancel any active run
      const cancelled = await cancelRunIfNeeded();
      if (!cancelled) {
        throw new Error("Could not cancel active run");
      }
      
      // Construct a request message for the specific phase
      const phaseRequest = `Please provide detailed instructions for Phase ${currentPhaseNumber} of building this PC with the selected components. Only provide instructions for this specific phase, not the entire build process.`;
      
      // Add user message to thread (not displayed in UI)
      await openai.beta.threads.messages.create(threadId, {
        role: "user",
        content: phaseRequest
      });
      
      // Run the assistant
      const run = await openai.beta.threads.runs.create(threadId, {
        assistant_id: assistantId
      });
      
      // Save the active run ID
      setActiveRun(run.id);
      
      // Poll for completion
      let runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
      
      while (runStatus.status !== "completed") {
        if (["failed", "cancelled", "expired"].includes(runStatus.status)) {
          setActiveRun(null);
          setIsLoading(false);
          setCurrentPhase("Error: Failed to get build instructions. Please try again.");
          return;
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
      }
      
      // Clear the active run ID
      setActiveRun(null);
      
      // Get the response
      const messagesList = await openai.beta.threads.messages.list(threadId);
      const assistantMessages = messagesList.data.filter(msg => msg.role === "assistant");
      
      if (assistantMessages.length > 0) {
        const latestMessage = assistantMessages[0];
        const response = latestMessage.content[0].text.value;
        
        // Check if we've reached the end of the build phases
        if (response.toLowerCase().includes("all phases are complete") || 
            response.toLowerCase().includes("that concludes the build process") ||
            response.toLowerCase().includes("no more phases") ||
            response.toLowerCase().includes("build is now complete")) {
          setBuildComplete(true);
        } else {
          // Extract and format the phase title and content
          let phaseTitle = `Phase ${currentPhaseNumber}`;
          let phaseContent = response;
          
          // Try to extract a better title from the response
          const titleMatch = response.match(/^\s*\*\*(.+?)\*\*\s*$/m);
          if (titleMatch) {
            phaseTitle = titleMatch[1].trim();
            phaseContent = response.replace(titleMatch[0], '').trim();
          }
          
          setCurrentPhase({
            title: phaseTitle,
            content: phaseContent
          });
        }
      } else {
        setCurrentPhase({
          title: `Phase ${currentPhaseNumber}`,
          content: "Sorry, I couldn't get instructions for this phase. Please try again."
        });
      }
      
    } catch (error) {
      console.error("Error getting next build phase:", error);
      setCurrentPhase({
        title: `Error`,
        content: "There was an error fetching the build instructions. Please try again or go back to planning."
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Handle "Next" button click
  const handleNextPhase = async () => {
    // Increment phase number
    setCurrentPhaseNumber(prevPhase => prevPhase + 1);
    
    // If we were in help mode, exit it
    if (helpMode) {
      setHelpMode(false);
    }
    
    // Request the next phase
    await getNextBuildPhase();
  };

  // Handle "I need help on this phase" button click
  const handleNeedHelp = () => {
    setHelpMode(true);
  };

  // Handle "Got it, next phase" button click
  const handleGotItNextPhase = () => {
    setHelpMode(false);
    handleNextPhase();
  };

  // Handle "Finish" button click
  const handleFinish = () => {
    setBuildMode(false);
    setHelpMode(false);
    setCurrentPhase(null);
    setBuildComplete(false);
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

  // Check if we have a complete parts list
  const isPartListComplete = () => {
    if (!pcParts || pcParts.length === 0) return false;
    
    // Check if we have all the essential components
    const requiredComponents = ['GPU', 'CPU', 'Motherboard', 'RAM', 'Storage', 'Power Supply', 'Case'];
    
    // Convert the array of objects to a set of component names for easier checking
    const selectedComponents = new Set(pcParts.map(part => 
      part.component ? part.component.toLowerCase() : ''
    ));
    
    // Check if all required components are present
    return requiredComponents.every(comp => 
      selectedComponents.has(comp.toLowerCase())
    );
  };

  // Effect to get the next phase whenever currentPhaseNumber changes on initial load
  useEffect(() => {
    if (buildMode && currentPhaseNumber > 1 && !currentPhase) {
      getNextBuildPhase();
    }
  }, [buildMode, currentPhaseNumber]);

  return (
    <div style={{ 
      position: 'relative', 
      width: '100%', 
      height: '100vh', 
      fontFamily: '"Helvetica Neue", "Arial", sans-serif',
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
        maxWidth: '1200px',
        height: '80vh',
        gap: '20px'
      }}>
        {/* Chat Box */}
        <div
          style={{
            width: buildMode ? '100%' : '60%',
            backgroundColor: '#000000',
            padding: '20px',
            borderRadius: '12px',
            fontFamily: '"Helvetica Neue", "Arial", sans-serif',
            fontSize: '18px',
            border: '2px solid #FFFFFF',
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            transition: 'width 0.5s ease-in-out'
          }}
        >
          <h2 style={{ 
            margin: '0 0 15px 0', 
            textAlign: 'center', 
            color: '#FFFFFF' 
          }}>
            {buildMode ? 'PC Build Walkthrough' : 'Lucy'}
            {buildMode && (
              <button 
                onClick={() => {
                  setBuildMode(false);
                  setHelpMode(false);
                  setCurrentPhase(null);
                  setBuildComplete(false);
                }} 
                style={{
                  marginLeft: '10px',
                  padding: '5px 10px',
                  backgroundColor: '#333333',
                  color: '#FFFFFF',
                  border: '1px solid #FFFFFF',
                  borderRadius: '5px',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                Back to Planning
              </button>
            )}
          </h2>
          
          {/* Standard chat view when not in build mode */}
          {!buildMode && (
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
                <div style={{ textAlign: 'left', color: '#888' }}>chasing yarn...</div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
          
          {/* Phase-by-phase build mode view */}
          {buildMode && (
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                marginBottom: '15px',
                padding: '20px',
                borderRadius: '8px',
                backgroundColor: '#000000',
                border: '1px solid #FFFFFF',
                display: 'flex',
                flexDirection: 'column'
              }}
            >
              {/* Show loading indicator when loading */}
              {isLoading ? (
                <div style={{ textAlign: 'center', color: '#888', marginTop: '20px' }}>
                  making biscuits...
                </div>
              ) : buildComplete ? (
                // Show completion message when build is complete
                <div style={{ textAlign: 'center', marginTop: '20px' }}>
                  <h3 style={{ marginBottom: '20px' }}>Build Complete! 🎉</h3>
                  <p>You've completed all phases of your PC build. Congratulations on building your new PC!</p>
                  <button
                    onClick={handleFinish}
                    style={{
                      marginTop: '20px',
                      padding: '15px',
                      width: '200px',
                      backgroundColor: '#FFFFFF',
                      color: '#000000',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '18px',
                      fontWeight: 'bold',
                      cursor: 'pointer'
                    }}
                  >
                    Finish
                  </button>
                </div>
              ) : (
                // Show current phase when available
                currentPhase && (
                  <div style={{ marginBottom: '20px' }}>                      
                    {/* Phase Title */}
                    <h3 style={{ 
                      fontSize: '1.4em', 
                      marginBottom: '15px', 
                      color: '#FFFFFF',
                      borderBottom: '1px solid #555',
                      paddingBottom: '10px'
                    }}>
                      {currentPhase.title}
                    </h3>
                    
                    {/* Standard phase view when not in help mode */}
                    {!helpMode && (
                      <div style={{ marginBottom: '20px' }}>
                        <ReactMarkdown components={{
                          p: ({node, ...props}) => <p style={markdownStyles.p} {...props} />,
                          ul: ({node, ...props}) => <ul style={markdownStyles.ul} {...props} />,
                          li: ({node, ...props}) => <li style={markdownStyles.li} {...props} />,
                          strong: ({node, ...props}) => <strong style={markdownStyles.strong} {...props} />,
                          h1: ({node, ...props}) => <h1 style={markdownStyles.h1} {...props} />,
                          h2: ({node, ...props}) => <h2 style={markdownStyles.h2} {...props} />,
                        }}>
                          {currentPhase.content}
                        </ReactMarkdown>
                      </div>
                    )}
                    
                    {/* Help mode conversation view */}
                    {helpMode && (
                      <div style={{ marginBottom: '20px' }}>
                        <div style={{ 
                          padding: '10px', 
                          backgroundColor: '#222', 
                          borderRadius: '5px',
                          marginBottom: '15px'
                        }}>
                          <p>Ask any questions about <strong>{currentPhase.title}</strong>:</p>
                        </div>
                        
                        {/* Display help mode messages */}
                        {messages.length > 0 && messages.slice(-5).map((msg, i) => (
                          <div 
                            key={`help-${i}`} 
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
                        ))}
                        
                        {isLoading && (
                          <div style={{ textAlign: 'left', color: '#888' }}>Lucy is typing...</div>
                        )}
                      </div>
                    )}
                    
                    {/* Phase navigation buttons */}
                    <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                      {!helpMode ? (
                        <>
                          {/* Show navigation buttons when not in help mode */}
                          <button
                            onClick={handleNeedHelp}
                            style={{
                              flex: 1,
                              padding: '15px',
                              backgroundColor: '#FFFFFF',
                              color: '#000000',
                              border: 'none',
                              borderRadius: '8px',
                              fontSize: '18px',
                              fontWeight: 'bold',
                              cursor: 'pointer'
                            }}
                          >
                            I need help on this phase
                          </button>
                          
                          <button
                            onClick={handleNextPhase}
                            disabled={isLoading}
                            style={{
                              flex: 1,
                              padding: '15px',
                              backgroundColor: '#FFFFFF',
                              color: '#000000',
                              border: 'none',
                              borderRadius: '8px',
                              fontSize: '18px',
                              fontWeight: 'bold',
                              cursor: isLoading ? 'not-allowed' : 'pointer',
                              opacity: isLoading ? 0.7 : 1
                            }}
                          >
                            Next
                          </button>
                        </>
                      ) : (
                        /* Show 'Got it, next phase' button when in help mode */
                        <button
                          onClick={handleGotItNextPhase}
                          disabled={isLoading}
                          style={{
                            width: '100%',
                            padding: '15px',
                            backgroundColor: '#FFFFFF',
                            color: '#000000',
                            border: 'none',
                            borderRadius: '8px',
                            fontSize: '18px',
                            fontWeight: 'bold',
                            cursor: isLoading ? 'not-allowed' : 'pointer',
                            opacity: isLoading ? 0.7 : 1
                          }}
                        >
                          Got it, next phase
                        </button>
                      )}
                    </div>
                  </div>
                )
              )}
              <div ref={messagesEndRef} />
            </div>
          )}

          {/* Input area - only show in regular mode or help mode */}
          {(!buildMode || (buildMode && helpMode)) && (
            <div style={{ display: 'flex', gap: '10px' }}>
              <input
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: '8px',
                  border: '1px solid #FFFFFF',
                  backgroundColor: '#111111',
                  color: '#FFFFFF',
                  fontFamily: '"Helvetica Neue", "Arial", sans-serif',
                  fontSize: '16px',
                }}
                type="text"
                placeholder={helpMode ? `Ask about ${currentPhase?.title || 'this phase'}...` : "Type something..."}
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
                  fontFamily: '"Helvetica Neue", "Arial", sans-serif',
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
          )}
        </div>
        
        {/* PC Parts Table - Only show when not in build mode */}
        {!buildMode && (
          <div
            style={{
              width: '40%',
              backgroundColor: '#000000',
              padding: '20px',
              borderRadius: '12px',
              fontFamily: '"Helvetica Neue", "Arial", sans-serif',
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
            
            {/* Build It Button - Only show when parts list is complete */}
            {isPartListComplete() && (
              <button
                onClick={handleBuildClick}
                style={{
                  width: '100%',
                  padding: '15px',
                  backgroundColor: '#FFFFFF',
                  color: '#000000',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '18px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  transition: 'all 0.3s',
                  marginTop: '10px'
                }}
                onMouseOver={(e) => e.target.style.backgroundColor = '#DDDDDD'}
                onMouseOut={(e) => e.target.style.backgroundColor = '#FFFFFF'}
              >
                I have the parts, show me how to build it!
              </button>
            )}
            
            {!isPartListComplete() && pcParts.length > 0 && (
              <div style={{
                padding: '10px',
                backgroundColor: '#333333',
                borderRadius: '8px',
                textAlign: 'center'
              }}>
                <p style={{ margin: 0 }}>Complete your parts list to begin the build!</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;