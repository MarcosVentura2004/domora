import { useState, useEffect, useRef } from 'react';
import { saveFile, getFile } from '../utils/fileStorage';

function getChatKey(landlordEmail, propertyId, roomId, tenantId) {
  return `chat_${landlordEmail}_${propertyId}_${roomId || tenantId}`;
}

function getReadKey(landlordEmail, propertyId, roomId, tenantId, role) {
  return `chat_read_${role}_${getChatKey(landlordEmail, propertyId, roomId, tenantId)}`;
}

export function getMessages(landlordEmail, propertyId, roomId, tenantId) {
  return JSON.parse(localStorage.getItem(getChatKey(landlordEmail, propertyId, roomId, tenantId)) || '[]');
}

export function getUnreadCount(landlordEmail, propertyId, roomId, tenantId, role) {
  const msgs = getMessages(landlordEmail, propertyId, roomId, tenantId);
  const otherRole = role === 'landlord' ? 'tenant' : 'landlord';
  const lastRead = localStorage.getItem(getReadKey(landlordEmail, propertyId, roomId, tenantId, role));
  if (!lastRead) return msgs.filter(m => m.sender === otherRole).length;
  return msgs.filter(m => m.sender === otherRole && m.timestamp > lastRead).length;
}

function markAsRead(landlordEmail, propertyId, roomId, tenantId, role) {
  localStorage.setItem(getReadKey(landlordEmail, propertyId, roomId, tenantId, role), new Date().toISOString());
}

function saveMessages(landlordEmail, propertyId, roomId, tenantId, messages) {
  localStorage.setItem(getChatKey(landlordEmail, propertyId, roomId, tenantId), JSON.stringify(messages));
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentView({ attachment, isMe }) {
  const [dataUrl, setDataUrl] = useState(null);

  useEffect(() => {
    getFile(attachment.id).then(url => setDataUrl(url)).catch(() => {});
  }, [attachment.id]);

  const isImage = attachment.fileType?.startsWith('image/');

  const handleDownload = () => {
    if (dataUrl) {
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = attachment.fileName;
      a.click();
    }
  };

  if (isImage) {
    return (
      <div style={{ marginTop: attachment.text ? '6px' : 0 }} onClick={handleDownload}>
        {dataUrl ? (
          <img
            src={dataUrl}
            alt={attachment.fileName}
            style={{ maxWidth: '220px', maxHeight: '200px', borderRadius: '10px', display: 'block', cursor: 'pointer', objectFit: 'cover' }}
          />
        ) : (
          <div style={{ width: '220px', height: '120px', borderRadius: '10px', background: 'rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: '12px', color: 'rgba(0,0,0,0.4)' }}>Cargando...</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={handleDownload}
      style={{
        marginTop: attachment.text ? '6px' : 0,
        background: isMe ? 'rgba(255,255,255,0.15)' : '#f5f5f5',
        border: 'none', borderRadius: '10px', padding: '10px 12px',
        display: 'flex', alignItems: 'center', gap: '10px',
        cursor: 'pointer', width: '100%', textAlign: 'left',
      }}
    >
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke={isMe ? 'rgba(255,255,255,0.8)' : '#888'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M14 2v6h6" stroke={isMe ? 'rgba(255,255,255,0.8)' : '#888'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      <div style={{ minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: isMe ? 'white' : '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '150px' }}>
          {attachment.fileName}
        </p>
        <p style={{ margin: 0, fontSize: '11px', color: isMe ? 'rgba(255,255,255,0.6)' : '#aaa' }}>
          {formatFileSize(attachment.fileSize)}
        </p>
      </div>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginLeft: 'auto' }}>
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" stroke={isMe ? 'rgba(255,255,255,0.6)' : '#aaa'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </button>
  );
}

export default function ChatConversation({ landlordEmail, propertyId, roomId, tenantId, tenantName, propertyName, currentRole, onBack }) {
  const [messages, setMessages] = useState(() => getMessages(landlordEmail, propertyId, roomId, tenantId));
  const [text, setText] = useState('');
  const [pendingFile, setPendingFile] = useState(null); // { id, dataUrl, fileName, fileType, fileSize }
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => {
    markAsRead(landlordEmail, propertyId, roomId, tenantId, currentRole);
  }, [landlordEmail, propertyId, roomId, tenantId, currentRole]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const dataUrl = await readFileAsDataUrl(file);
    setPendingFile({ id: Date.now(), dataUrl, fileName: file.name, fileType: file.type, fileSize: file.size });
    e.target.value = '';
  };

  const handleSend = async () => {
    if (!text.trim() && !pendingFile) return;
    setSending(true);
    try {
      let attachment = null;
      if (pendingFile) {
        const { dataUrl, ...meta } = pendingFile;
        await saveFile(meta.id, dataUrl);
        attachment = meta;
      }
      const newMsg = {
        id: Date.now(),
        sender: currentRole,
        text: text.trim(),
        timestamp: new Date().toISOString(),
        ...(attachment && { attachment }),
      };
      const updated = [...messages, newMsg];
      saveMessages(landlordEmail, propertyId, roomId, tenantId, updated);
      setMessages(updated);
      setText('');
      setPendingFile(null);
    } finally {
      setSending(false);
    }
  };

  const isMe = (sender) => sender === currentRole;
  const otherName = currentRole === 'tenant' ? 'Propietario' : tenantName;
  const canSend = (text.trim() || pendingFile) && !sending;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f5f5f5' }}>
      {/* Header */}
      <div style={{
        background: 'white', padding: '16px',
        display: 'flex', alignItems: 'center', gap: '12px',
        borderBottom: '1px solid #eee', position: 'sticky', top: 0, zIndex: 10,
      }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', lineHeight: 1, padding: '4px' }}>←</button>
        <div>
          <p style={{ margin: 0, fontWeight: 600, fontSize: '15px', color: '#111' }}>{otherName}</p>
          <p style={{ margin: 0, fontSize: '12px', color: '#999' }}>{propertyName}</p>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {messages.length === 0 && (
          <p style={{ textAlign: 'center', color: '#bbb', fontSize: '14px', marginTop: '60px' }}>
            Sin mensajes todavía. ¡Inicia la conversación!
          </p>
        )}
        {messages.map(msg => (
          <div key={msg.id} style={{ alignSelf: isMe(msg.sender) ? 'flex-end' : 'flex-start', maxWidth: '75%' }}>
            <div style={{
              background: isMe(msg.sender) ? '#111' : 'white',
              color: isMe(msg.sender) ? 'white' : '#111',
              borderRadius: isMe(msg.sender) ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
              padding: msg.attachment && !msg.text ? '8px' : '10px 14px',
              fontSize: '14px', lineHeight: '1.4',
              boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
            }}>
              {msg.text && <span>{msg.text}</span>}
              {msg.attachment && <AttachmentView attachment={msg.attachment} isMe={isMe(msg.sender)} />}
            </div>
            <p style={{ margin: '2px 4px 0', fontSize: '10px', color: '#bbb', textAlign: isMe(msg.sender) ? 'right' : 'left' }}>
              {new Date(msg.timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Pending file preview */}
      {pendingFile && (
        <div style={{ background: 'white', padding: '10px 16px', borderTop: '1px solid #eee', display: 'flex', alignItems: 'center', gap: '10px' }}>
          {pendingFile.fileType?.startsWith('image/') ? (
            <img src={pendingFile.dataUrl} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover' }} />
          ) : (
            <div style={{ width: 48, height: 48, borderRadius: 8, background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="#888" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M14 2v6h6" stroke="#888" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          )}
          <span style={{ flex: 1, fontSize: '13px', color: '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pendingFile.fileName}</span>
          <button onClick={() => setPendingFile(null)} style={{ background: 'none', border: 'none', fontSize: '18px', color: '#aaa', cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
      )}

      {/* Input */}
      <div style={{
        background: 'white', padding: '10px 16px',
        borderTop: pendingFile ? 'none' : '1px solid #eee',
        display: 'flex', gap: '8px', alignItems: 'center',
        paddingBottom: 'max(10px, env(safe-area-inset-bottom))',
      }}>
        <input ref={fileRef} type="file" accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx" style={{ display: 'none' }} onChange={handleFileSelect} />
        <button
          onClick={() => fileRef.current.click()}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', display: 'flex', alignItems: 'center', color: '#aaa', flexShrink: 0 }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder="Escribe un mensaje..."
          rows={1}
          style={{
            flex: 1, border: '1px solid #e5e5e5', borderRadius: '20px',
            padding: '10px 16px', fontSize: '14px', resize: 'none',
            outline: 'none', fontFamily: 'inherit', lineHeight: '1.4',
            maxHeight: '120px',
          }}
        />
        <button
          onClick={handleSend}
          disabled={!canSend}
          style={{
            width: '40px', height: '40px', borderRadius: '50%', flexShrink: 0,
            background: canSend ? '#111' : '#e5e5e5',
            border: 'none', cursor: canSend ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 0.2s',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M22 2L11 13" stroke={canSend ? 'white' : '#aaa'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M22 2L15 22 11 13 2 9l20-7z" stroke={canSend ? 'white' : '#aaa'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
