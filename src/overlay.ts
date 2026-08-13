import './styles.css';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    getCurrentWebviewWindow().hide();
  }
});