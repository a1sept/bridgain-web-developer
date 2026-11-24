document.getElementById('retry').addEventListener('click', async () => {
  const button = document.getElementById('retry');
  button.disabled = true;
  document.getElementById('error').textContent = '';
  try {
    await window.bridgainDesktop.connectServer();
  } catch {
    document.getElementById('error').textContent = '연결할 수 없습니다. 잠시 후 다시 시도해주세요.';
  } finally {
    button.disabled = false;
  }
});
