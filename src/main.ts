import { supabase } from "./auth/supabase";
import { escape } from "./ui";
import "./sign-in";
import "./editor";
import "./styles.css";

const signOutButton = document.getElementById("sign-out-button")!;

signOutButton.addEventListener("click", async () => {
  try {
    await supabase.auth.signOut();
  } catch (error) {
    console.error("Sign out error:", error);
  }
});
