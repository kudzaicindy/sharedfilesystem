import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { Globe, Monitor, FilePenLine, Users } from 'lucide-react';
import Modal, { ModalButton } from './Modal';
import { resolveMimeType, canPreviewInBrowser } from '../../utils/fileTypes';
import {
  isOnlyOfficeConfigured,
  isOnlyOfficeFileExt,
  pickDefaultOpenChoice,
} from '../../utils/onlyOfficeAvailability';

const ModalContext = createContext(null);

export function ModalProvider({ children }) {
  const [state, setState] = useState(null);
  const inputRef = useRef(null);

  const close = useCallback((value) => {
    setState(prev => {
      prev?.resolve?.(value);
      return null;
    });
  }, []);

  const alert = useCallback((message, title = 'Notice') => {
    return new Promise(resolve => {
      setState({ type: 'alert', title, message, resolve });
    });
  }, []);

  const confirm = useCallback((message, title = 'Confirm') => {
    return new Promise(resolve => {
      setState({ type: 'confirm', title, message, resolve });
    });
  }, []);

  const prompt = useCallback((options) => {
    const { title = 'Input', message, placeholder = '', defaultValue = '' } =
      typeof options === 'string' ? { message: options } : options;
    return new Promise(resolve => {
      setState({ type: 'prompt', title, message, placeholder, defaultValue, resolve });
    });
  }, []);

  const pickFolder = useCallback((folders, title = 'Choose folder') => {
    return new Promise(resolve => {
      setState({ type: 'pickFolder', title, folders, resolve });
    });
  }, []);

  const openWith = useCallback((document) => {
    return new Promise(resolve => {
      setState({ type: 'openWith', document, resolve });
    });
  }, []);

  const handlePromptSubmit = (e) => {
    e.preventDefault();
    const value = inputRef.current?.value?.trim();
    close(value || null);
  };

  return (
    <ModalContext.Provider value={{ alert, confirm, prompt, pickFolder, openWith }}>
      {children}

      <Modal
        open={state?.type === 'alert'}
        title={state?.title}
        onClose={() => close(true)}
        footer={<ModalButton onClick={() => close(true)}>OK</ModalButton>}
      >
        <p className="text-xs text-gray-600 leading-relaxed">{state?.message}</p>
      </Modal>

      <Modal
        open={state?.type === 'confirm'}
        title={state?.title}
        onClose={() => close(false)}
        footer={
          <>
            <ModalButton variant="secondary" onClick={() => close(false)}>Cancel</ModalButton>
            <ModalButton onClick={() => close(true)}>Confirm</ModalButton>
          </>
        }
      >
        <p className="text-xs text-gray-600 leading-relaxed">{state?.message}</p>
      </Modal>

      <Modal
        open={state?.type === 'prompt'}
        title={state?.title}
        onClose={() => close(null)}
        footer={
          <>
            <ModalButton variant="secondary" onClick={() => close(null)}>Cancel</ModalButton>
            <ModalButton onClick={() => close(inputRef.current?.value?.trim() || null)}>Save</ModalButton>
          </>
        }
      >
        {state?.message && (
          <p className="text-xs text-gray-500 mb-3">{state.message}</p>
        )}
        <form onSubmit={handlePromptSubmit}>
          <input
            key={state?.defaultValue}
            ref={inputRef}
            type="text"
            defaultValue={state?.defaultValue}
            placeholder={state?.placeholder}
            autoFocus
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-maroon/30 focus:border-brand-maroon"
          />
        </form>
      </Modal>

      <Modal
        open={state?.type === 'pickFolder'}
        title={state?.title}
        onClose={() => close(null)}
        size="md"
      >
        <p className="text-xs text-gray-500 mb-3">Select a folder.</p>
        <ul className="max-h-48 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-50">
          {state?.folders?.map(folder => (
            <li key={String(folder._id)}>
              <button
                type="button"
                onClick={() => close(folder)}
                className="w-full text-left px-3 py-2 text-xs font-medium text-gray-800 hover:bg-brand-maroon-light"
              >
                {folder.name}
              </button>
            </li>
          ))}
        </ul>
      </Modal>

      {state?.type === 'openWith' && (
        <OpenWithDialog
          document={state.document}
          onClose={() => close(null)}
          onOpen={choice => close(choice)}
        />
      )}
    </ModalContext.Provider>
  );
}

function OpenWithDialog({ document, onClose, onOpen }) {
  const mimeType = resolveMimeType(document);
  const browserOk = canPreviewInBrowser(mimeType);
  const ext = document?.name?.split('.')?.pop()?.toLowerCase() || '';
  const onlyOfficeFile = isOnlyOfficeFileExt(ext);
  const onlyOfficeOk = onlyOfficeFile && isOnlyOfficeConfigured();
  const officeDesktopOk = ['doc', 'docx', 'xls', 'xlsx', 'csv', 'ppt', 'pptx'].includes(ext);
  const docxEditorOk = ext === 'docx';
  const xlsxEditorOk = ext === 'xlsx';
  const collabOk = docxEditorOk;

  const [choice, setChoice] = useState(() =>
    pickDefaultOpenChoice({ ext, browserOk, officeDesktopOk }),
  );

  useEffect(() => {
    setChoice(pickDefaultOpenChoice({ ext, browserOk, officeDesktopOk }));
  }, [document?._id, browserOk, officeDesktopOk, ext]);

  const officeLabel =
    ext === 'xls' || ext === 'xlsx' || ext === 'csv' ? 'Microsoft Excel (desktop)' :
    ext === 'ppt' || ext === 'pptx' ? 'Microsoft PowerPoint (desktop)' :
    officeDesktopOk ? 'Microsoft Word (desktop)' :
    'Microsoft 365 (desktop)';

  const options = [
    {
      id: 'collab-docx',
      icon: Users,
      label: 'Edit together (collab)',
      hint: collabOk
        ? 'Real-time co-editing for .docx (works on Vercel + Render)'
        : 'Available for .docx files',
      disabled: !collabOk,
    },
    {
      id: 'docx-editor',
      icon: FilePenLine,
      label: 'Simple .docx editor',
      hint: docxEditorOk
        ? 'In-browser Word editing with save → versions'
        : 'Available for .docx files',
      disabled: !docxEditorOk,
    },
    {
      id: 'xlsx-editor',
      icon: FilePenLine,
      label: 'Simple .xlsx editor',
      hint: xlsxEditorOk
        ? 'In-browser spreadsheet with save → versions'
        : 'Available for .xlsx files',
      disabled: !xlsxEditorOk,
    },
    {
      id: 'onlyoffice',
      icon: FilePenLine,
      label: 'Edit in Alamait (OnlyOffice)',
      hint: onlyOfficeOk
        ? 'Full Office UI — live co-edit & revision tracking (requires Document Server)'
        : onlyOfficeFile
          ? 'Set VITE_ONLYOFFICE_DS_URL to a public Document Server URL to enable'
          : 'Available for .doc / .docx / .xls / .xlsx / .ppt / .pptx',
      disabled: !onlyOfficeOk,
    },
    {
      id: 'ms365',
      icon: Monitor,
      label: 'Edit in Microsoft 365 Online',
      hint: onlyOfficeOk || officeDesktopOk
        ? 'Opens Word/Excel on the web via your Microsoft account (syncs back)'
        : 'Available for Office files',
      disabled: !onlyOfficeOk && !officeDesktopOk,
    },
    {
      id: 'office-desktop',
      icon: Monitor,
      label: officeLabel,
      hint: officeDesktopOk
        ? 'Desktop app via WebDAV — may be read-only if Windows WebClient is off'
        : 'Available for Word, Excel, and PowerPoint files',
      disabled: !officeDesktopOk,
    },
    {
      id: 'browser',
      icon: Globe,
      label: 'Browser preview',
      hint: browserOk
        ? 'View in a new browser tab (PDF, images, text)'
        : 'Not supported for this file type',
      disabled: !browserOk,
    },
  ];

  const handleOpen = () => {
    if (choice === 'browser' && !browserOk) return;
    if (choice === 'office-desktop' && !officeDesktopOk) return;
    if (choice === 'onlyoffice' && !onlyOfficeOk) return;
    onOpen(choice);
  };

  return (
    <Modal
      open
      title="Open with"
      onClose={onClose}
      size="md"
      footer={
        <>
          <ModalButton variant="secondary" onClick={onClose}>Cancel</ModalButton>
          <ModalButton onClick={handleOpen}>Open</ModalButton>
        </>
      }
    >
      <p className="text-xs text-gray-500 mb-3 truncate" title={document?.name}>
        {document?.name}
      </p>
      <ul className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
        {options.map(({ id, icon: Icon, label, hint, disabled }) => {
          const selected = choice === id;
          return (
            <li key={id}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => !disabled && setChoice(id)}
                className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors ${
                  disabled
                    ? 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
                    : selected
                      ? 'border-brand-maroon bg-brand-maroon-light/30'
                      : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'
                }`}
              >
                <span className={`mt-0.5 p-1.5 rounded-md ${selected ? 'bg-white text-brand-maroon' : 'bg-gray-100 text-gray-500'}`}>
                  <Icon size={16} strokeWidth={1.75} />
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-semibold text-gray-900">{label}</span>
                  <span className="block text-[10px] text-gray-500 mt-0.5">{hint}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}

export function useModal() {
  const ctx = useContext(ModalContext);
  if (!ctx) throw new Error('useModal must be used within ModalProvider');
  return ctx;
}
