import React, { useRef, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { supabase } from "./auth/supabase";
import { setRootElement } from "./dom-utils";
import "./sign-in";
import "./editor";
import "./styles.css";

// Main App wrapper that handles initialization
const AppWrapper: React.FC = () => {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (rootRef.current) {
      setRootElement(rootRef.current);
      
      // Initialize existing modules after React has mounted
      const signOutButton = rootRef.current.querySelector("#sign-out-button") as HTMLElement;
      if (signOutButton) {
        signOutButton.addEventListener("click", async () => {
          try {
            await supabase.auth.signOut();
          } catch (error) {
            console.error("Sign out error:", error);
          }
        });
      }
    }
  }, []);

  return <App rootRef={rootRef} />;
};

// Initialize React
const container = document.getElementById('root');
if (!container) {
  throw new Error('Root container not found');
}

const root = createRoot(container);
root.render(<AppWrapper />);