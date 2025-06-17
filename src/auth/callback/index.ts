// Auth callback handler for Supabase magic link authentication
import { supabase } from '../supabase';

// Handle the authentication callback from Supabase
async function handleAuthCallback() {
  // Parse the hash fragment from the URL
  const hash = window.location.hash.substring(1);
  const params = new URLSearchParams(hash);
  
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  const errorCode = params.get('error');
  const errorDescription = params.get('error_description');
  
  // Set up terminal text display
  const terminalText = document.getElementById('terminal-text') as HTMLElement;
  const errorMessage = document.getElementById('error-message') as HTMLElement;
  const redirectButton = document.getElementById('redirect-button') as HTMLButtonElement;
  
  // Function to show a terminal-style message sequence
  const terminalMessages = [
    'Establishing secure connection...',
    'Verifying digital signature...',
    'Authenticating credentials...',
    'Processing authorization...',
    'Access granted. Welcome to Simulo.'
  ];
  
  let currentMessageIndex = 0;
  
  function showNextMessage() {
    if (currentMessageIndex < terminalMessages.length) {
      if (terminalText) {
        terminalText.textContent = terminalMessages[currentMessageIndex];
        // Reset the animation
        terminalText.style.animation = 'none';
        void terminalText.offsetWidth; // Trigger reflow
        terminalText.style.animation = 'typing 2s steps(40, end), blink-caret 0.75s step-end infinite';
      }
      
      currentMessageIndex++;
      
      if (currentMessageIndex < terminalMessages.length) {
        setTimeout(showNextMessage, 2500);
      } else {
        // Show the redirect button when all messages are displayed
        setTimeout(() => {
          if (redirectButton) {
            redirectButton.style.display = 'block';
          }
        }, 1500);
      }
    }
  }
  
  // Function to handle authentication errors
  function handleError(message: string) {
    if (terminalText) {
      terminalText.textContent = 'Authentication error detected';
      terminalText.style.color = '#ff5e57';
    }
    
    if (errorMessage) {
      errorMessage.style.display = 'block';
      errorMessage.textContent = message;
    }
    
    if (redirectButton) {
      redirectButton.style.display = 'block';
      const buttonText = redirectButton.querySelector('.button-text');
      if (buttonText) {
        buttonText.textContent = 'TRY AGAIN';
      }
      
      redirectButton.addEventListener('click', () => {
        window.location.href = '/';
      });
    }
  }
  
  try {
    // Check if there's an access token (successful sign-in)
    if (accessToken && refreshToken) {
      // Start message animation
      showNextMessage();
      
      // Set the session in Supabase
      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken
      });
      
      if (error) {
        throw new Error(error.message);
      }
      
      // Set up redirect button click handler
      if (redirectButton) {
        redirectButton.addEventListener('click', () => {
          window.location.href = '/';
        });
      }
    } else if (errorCode) {
      // Handle authentication error
      handleError(errorDescription || 'Authentication failed');
    } else {
      // No access token or error - invalid callback
      handleError('Invalid authentication callback');
    }
  } catch (error: any) {
    handleError(error.message || 'An unexpected error occurred');
  }
}

// Initialize when the DOM is loaded
document.addEventListener('DOMContentLoaded', handleAuthCallback);

export { handleAuthCallback };