export function showMessage(
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

  let i = 0;
  const interval = setInterval(() => {
    element.innerText = message.substring(0, i++);
    if (i > message.length) {
      clearInterval(interval);
    }
  }, 15);
}

export function escape(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
