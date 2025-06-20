import { supabase } from "./auth/supabase";
import { showMessage } from "./ui";
import * as projectList from "./project-list";

const appContainer = document.getElementById("app-container")!;
const authOverlay = document.getElementById("auth-overlay")!;
const submitButton = document.getElementById(
  "login-submit",
)! as HTMLButtonElement;
const emailInput = document.getElementById("email-input") as HTMLInputElement;
const messageContainer = document.getElementById("message-container")!;

function showAuthOverlay() {
  appContainer!.style.filter = "blur(5px)";
  authOverlay.style.display = "flex";
}

function hideAuthOverlay() {
  appContainer!.style.removeProperty("filter");
  authOverlay.style.display = "none";
}

submitButton.addEventListener("click", async (event) => {
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
      showMessage(
        messageContainer,
        "Check your email for the login link",
        "success",
      );
      emailInput.value = "";
    }
  } catch (error: any) {
    showMessage(messageContainer, `Error: ${error.message}`, "error");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "SEND ACCESS LINK";
  }
});

supabase.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_IN" && session) {
    hideAuthOverlay();
    projectList.init();
  } else if (event === "SIGNED_OUT") {
    showAuthOverlay();
  }
});
