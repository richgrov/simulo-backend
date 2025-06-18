import { supabase } from "./auth/supabase";
import * as canvas from "./canvas";
import "./styles.css";

canvas.init();

function showMessage(
  element: HTMLElement,
  message: string,
  type: "success" | "error",
) {
  if (type === "error") {
    element.classList.add("negative");
  } else {
    element.classList.remove("negative");
  }
  element.classList.add("message");
  element.innerText = message;
}

document.addEventListener("DOMContentLoaded", async () => {
  const appContainer = document.getElementById("app-container")!;
  const authOverlay = document.getElementById("auth-overlay")!;
  const submitButton = document.getElementById(
    "login-submit",
  )! as HTMLButtonElement;
  const emailInput = document.getElementById("email-input") as HTMLInputElement;
  const messageContainer = document.getElementById("message-container")!;
  const signOutButton = document.getElementById("sign-out-button")!;

  function showAuthOverlay() {
    appContainer!.style.filter = "blur(5px)";
    authOverlay.style.display = "flex";
  }

  function hideAuthOverlay() {
    appContainer!.style.removeProperty("filter");
    authOverlay.style.display = "none";
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

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      hideAuthOverlay();
    } else {
      showAuthOverlay();
    }

    supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) {
        hideAuthOverlay();
      } else if (event === "SIGNED_OUT") {
        showAuthOverlay();
      }
    });
  } catch (error) {
    console.error("Auth error:", error);
    showAuthOverlay();
  }
});

const promptInput = document.querySelector(
  "#prompt-input",
)! as HTMLTextAreaElement;
const promptMessage = document.querySelector("#prompt-message")! as HTMLElement;

document
  .querySelector("#prompt-submit")!
  .addEventListener("click", async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      console.error(error);
      showMessage(promptMessage, `Error: ${error.message}`, "error");
      return;
    }

    if (!data.session) {
      console.error("No session present");
      showMessage(promptMessage, "Internal error.", "error");
      return;
    }

    try {
      const response = await fetch(import.meta.env.VITE_BACKEND + "/agent", {
        method: "POST",
        headers: {
          Authorization: `${data.session.access_token}`,
        },
        body: promptInput.value,
      });

      const output = await response.text();

      if (!response.ok) {
        showMessage(promptMessage, `API ERROR: ${output}`, "error");
      } else {
        showMessage(promptMessage, output, "success");
      }
    } catch (error) {
      console.error("Fetch error:", error);
      showMessage(
        promptMessage,
        `NETWORKING ERROR- VERIFY CONNECTION AND RETRY`,
        "error",
      );
    }
  });
