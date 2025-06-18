import { supabase } from "./auth/supabase";
import "./styles.css";

document.addEventListener("DOMContentLoaded", async () => {
  const appContainer = document.getElementById("app-container")!;
  const authOverlay = document.getElementById("auth-overlay")!;
  const submitButton = document.getElementById(
    "login-submit",
  )! as HTMLButtonElement;
  const emailInput = document.getElementById("email-input") as HTMLInputElement;
  const messageContainer = document.getElementById("message-container")!;
  const signOutButton = document.getElementById("sign-out-button")!;
  const userEmail = document.getElementById("user-email")!;

  function showMessage(message: string, type: "success" | "error") {
    if (!messageContainer) return;
    const style =
      type === "success"
        ? "padding: 0.75rem; text-align: center; margin-top: 1rem; color: var(--primary-color); border-left: 3px solid var(--primary-color);"
        : "padding: 0.75rem; text-align: center; margin-top: 1rem; color: var(--danger-color); border-left: 3px solid var(--danger-color);";
    messageContainer.innerHTML = `<div style="${style}">${message}</div>`;
    if (type === "success") {
      setTimeout(() => (messageContainer.innerHTML = ""), 8000);
    }
  }

  function showAuthOverlay() {
    appContainer!.style.filter = "blur(5px)";
    if (authOverlay) authOverlay.style.display = "flex";
  }

  function hideAuthOverlay() {
    if (authOverlay) authOverlay.style.display = "none";
    appContainer!.style.removeProperty("filter");
  }

  function updateUserInfo(user: any) {
    if (userEmail) userEmail.textContent = user.email;
  }

  signOutButton?.addEventListener("click", async () => {
    try {
      await supabase.auth.signOut();
      showAuthOverlay();
    } catch (error) {
      console.error("Sign out error:", error);
    }
  });

  submitButton.addEventListener("click", async (event) => {
    event.preventDefault();

    const email = emailInput?.value;
    if (!email) {
      showMessage("Email required", "error");
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
        showMessage(`Error: ${error.message}`, "error");
      } else {
        showMessage("Check your email for the login link", "success");
        if (emailInput) emailInput.value = "";
      }
    } catch (error: any) {
      showMessage(`Error: ${error.message}`, "error");
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "SEND ACCESS LINK";
    }
  });

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      hideAuthOverlay();
      updateUserInfo(user);
    } else {
      showAuthOverlay();
    }

    supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) {
        hideAuthOverlay();
        updateUserInfo(session.user);
      } else if (event === "SIGNED_OUT") {
        showAuthOverlay();
      }
    });
  } catch (error) {
    console.error("Auth error:", error);
    showAuthOverlay();
  }
});
