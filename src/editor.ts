import { supabase } from "./auth/supabase";
import { showMessage } from "./ui";
import * as canvas from "./canvas";

canvas.init();

const promptInput = document.querySelector(
  "#prompt-input",
)! as HTMLTextAreaElement;
const promptMessage = document.querySelector("#prompt-message")! as HTMLElement;
const editorControls = document.querySelector(
  "#editor-controls",
)! as HTMLElement;

let projectId: string;

export function init(project: string) {
  projectId = project;
  editorControls.style.removeProperty("display");
}

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
      const response = await fetch(
        import.meta.env.VITE_BACKEND + `/project/${projectId}/agent`,
        {
          method: "POST",
          headers: {
            Authorization: `${data.session.access_token}`,
          },
          body: promptInput.value,
        },
      );

      const text = await response.text();

      if (!response.ok) {
        showMessage(promptMessage, `API ERROR: ${text}`, "error");
      } else {
        showMessage(promptMessage, text, "success");
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
