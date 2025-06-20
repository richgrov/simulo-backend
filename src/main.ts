import { supabase } from "./auth/supabase";
import * as canvas from "./canvas";
import { showMessage } from "./ui";
import "./sign-in";
import "./styles.css";

canvas.init();

const signOutButton = document.getElementById("sign-out-button")!;

signOutButton.addEventListener("click", async () => {
  try {
    await supabase.auth.signOut();
  } catch (error) {
    console.error("Sign out error:", error);
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

      if (!response.ok) {
        const error = await response.text();
        showMessage(promptMessage, `API ERROR: ${error}`, "error");
      } else {
        const output = await response.blob();
        showMessage(promptMessage, "INITIALIZING DOWNLOAD", "success");
        const url = URL.createObjectURL(output);
        const a = document.createElement("a");
        a.href = url;
        a.download = "program.wasm";
        a.click();
        URL.revokeObjectURL(url);
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
