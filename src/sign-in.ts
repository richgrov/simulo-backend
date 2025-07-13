import { supabase } from "./auth/supabase";
import { showMessage } from "./ui";
import * as projectList from "./project-list";
import * as editor from "./editor";
import { getRootElement } from "./dom-utils";

// Get elements using the root element reference
function getElements() {
  const root = getRootElement();
  return {
    appContainer: root.querySelector("#app-container")! as HTMLElement,
    authOverlay: root.querySelector("#auth-overlay")! as HTMLElement,
    submitButton: root.querySelector("#login-submit")! as HTMLButtonElement,
    emailInput: root.querySelector("#email-input")! as HTMLInputElement,
    messageContainer: root.querySelector("#message-container")! as HTMLElement,
  };
}

function showAuthOverlay() {
  const { appContainer, authOverlay } = getElements();
  appContainer.style.filter = "blur(5px)";
  authOverlay.style.display = "flex";
}

function hideAuthOverlay() {
  const { appContainer, authOverlay } = getElements();
  appContainer.style.removeProperty("filter");
  authOverlay.style.display = "none";
}

// Initialize event listener when DOM is ready
function initializeSignIn() {
  const { submitButton, emailInput, messageContainer } = getElements();
  
  submitButton.addEventListener("click", async (event: Event) => {
    event.preventDefault();

    const email = emailInput.value;
    if (!email) {
      showMessage(messageContainer, "Email required", "error");
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "SENDING...";

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });

      if (error) {
        showMessage(messageContainer, `Error: ${error.message}`, "error");
      } else {
        showMessage(messageContainer, "LOGIN LINK WAS SENT", "success");
        emailInput.value = "";
      }
    } catch (error: any) {
      showMessage(messageContainer, `Error: ${error.message}`, "error");
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "SEND ACCESS LINK";
    }
  });
}

// Initialize when the module loads
setTimeout(() => {
  try {
    initializeSignIn();
  } catch (error) {
    // Root element not ready yet, will be initialized later
    console.log("Waiting for root element...");
  }
}, 100);

supabase.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_IN" && session) {
    hideAuthOverlay();

    if (window.location.search.length <= 1) {
      projectList.init();
    } else {
      const projectId = window.location.search.substring(1);
      editor.init(projectId);
    }
  } else if (event === "SIGNED_OUT") {
    showAuthOverlay();
  }
});
