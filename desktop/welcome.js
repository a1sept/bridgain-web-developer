document
  .getElementById("server-form")
  .addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = document.querySelector("button");
    button.disabled = true;
    document.getElementById("error").textContent = "";
    try {
      await window.bridgainDesktop.connectServer(
        document.getElementById("server").value,
      );
    } catch (error) {
      document.getElementById("error").textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
