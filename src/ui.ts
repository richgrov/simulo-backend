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
