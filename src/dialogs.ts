function showDialog(opts: {
  title: string;
  message?: string;
  withInput?: boolean;
  defaultValue?: string;
  danger?: boolean;
  okLabel?: string;
}): Promise<string | null> {
  return new Promise((resolve) => {
    const modal = document.querySelector<HTMLDivElement>('#dialog-modal')!;
    const titleEl = document.querySelector<HTMLElement>('#dialog-title')!;
    const messageEl = document.querySelector<HTMLElement>('#dialog-message')!;
    const inputEl = document.querySelector<HTMLInputElement>('#dialog-input')!;
    const okBtn = document.querySelector<HTMLButtonElement>('#dialog-ok-btn')!;
    const cancelBtn = document.querySelector<HTMLButtonElement>('#dialog-cancel-btn')!;

    titleEl.textContent = opts.title;
    messageEl.textContent = opts.message || '';
    messageEl.style.display = opts.message ? 'block' : 'none';
    inputEl.classList.toggle('hidden', !opts.withInput);
    inputEl.value = opts.defaultValue || '';
    okBtn.textContent = opts.okLabel || (opts.danger ? 'Delete' : 'OK');
    okBtn.classList.toggle('danger-btn', !!opts.danger);

    modal.classList.remove('hidden');
    if (opts.withInput) {
      inputEl.focus();
      inputEl.select();
    } else {
      okBtn.focus();
    }

    function cleanup() {
      modal.classList.add('hidden');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      inputEl.removeEventListener('keydown', onKeydown);
    }
    function onOk() {
      cleanup();
      resolve(opts.withInput ? inputEl.value : 'ok');
    }
    function onCancel() {
      cleanup();
      resolve(null);
    }
    function onKeydown(e: KeyboardEvent) {
      if (e.key === 'Enter') onOk();
      if (e.key === 'Escape') onCancel();
    }

    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    inputEl.addEventListener('keydown', onKeydown);
  });
}

export async function customPrompt(title: string, defaultValue = ''): Promise<string | null> {
  return showDialog({ title, withInput: true, defaultValue });
}

export async function customConfirm(title: string, message?: string, danger = false): Promise<boolean> {
  const result = await showDialog({ title, message, withInput: false, danger });
  return result !== null;
}

export async function customAlert(title: string, message?: string): Promise<void> {
  await showDialog({ title, message, withInput: false, okLabel: 'OK' });
}
