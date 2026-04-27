import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { getFile } from '../utils/fileStorage';

// ─── Exported async helper — used by other pages for unread badges ───────────
export async function getUnreadCount(landlordEmail, propertyId, roomId, tenantId, role) {
  const readCol = role === 'landlord' ? 'read_by_landlord' : 'read_by_tenant';
  const senderVal = role === 'landlord' ? 'tenant' : 'landlord';

  let q = supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('landlord_email', landlordEmail)
    .eq('property_id', propertyId)
    .eq('sender', senderVal)
    .eq(readCol, false);

  if (roomId) {
    q = q.eq('room_id', roomId);
  } else {
    q = q.is('room_id', null).eq('tenant_id', tenantId);
  }

  const { count } = await q;
  return count || 0;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Attachment renderer ──────────────────────────────────────────────────────
function AttachmentView({ msg, isMe }) {
  const isImage = msg.attachment_type?.startsWith('image/');
  const isAudio = msg.attachment_type?.startsWith('audio/');

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = msg.attachment_url;
    a.download = msg.attachment_name;
    a.target = '_blank';
    a.click();
  };

  if (isAudio) {
    return (
      <div style={{ marginTop: msg.content ? '6px' : 0, minWidth: '200px' }}>
        <audio
          controls
          src={msg.attachment_url}
          style={{
            width: '100%',
            height: '36px',
            outline: 'none',
            borderRadius: '20px',
            display: 'block',
          }}
        />
      </div>
    );
  }

  if (isImage) {
    return (
      <div style={{ marginTop: msg.content ? '6px' : 0 }} onClick={handleDownload}>
        <img
          src={msg.attachment_url}
          alt={msg.attachment_name}
          style={{ maxWidth: '220px', maxHeight: '200px', borderRadius: '10px', display: 'block', cursor: 'pointer', objectFit: 'cover' }}
        />
      </div>
    );
  }

  return (
    <button
      onClick={handleDownload}
      style={{
        marginTop: msg.content ? '6px' : 0,
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
          {msg.attachment_name}
        </p>
        <p style={{ margin: 0, fontSize: '11px', color: isMe ? 'rgba(255,255,255,0.6)' : '#aaa' }}>
          {formatFileSize(msg.attachment_size)}
        </p>
      </div>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginLeft: 'auto' }}>
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" stroke={isMe ? 'rgba(255,255,255,0.6)' : '#aaa'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function ChatConversation({ landlordEmail, propertyId, roomId, tenantId, tenantName, propertyName, currentRole, isGroup, onBack }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [landlordAvatarUrl, setLandlordAvatarUrl] = useState(null);
  const [landlordAvatarValid, setLandlordAvatarValid] = useState(false);

  // Cargar avatar del propietario (IndexedDB primero, Supabase Storage como fallback)
  useEffect(() => {
    if (!landlordEmail) return;
    getFile(`avatar_${landlordEmail}`)
      .then(local => {
        if (local) {
          setLandlordAvatarUrl(local);
          setLandlordAvatarValid(true);
        } else {
          const { data } = supabase.storage.from('avatars').getPublicUrl(`${landlordEmail}/avatar`);
          if (data?.publicUrl) setLandlordAvatarUrl(data.publicUrl + '?t=1');
        }
      })
      .catch(() => {});
  }, [landlordEmail]);

  const [text, setText] = useState('');
  const [pendingFile, setPendingFile] = useState(null); // { file, preview, fileName, fileType, fileSize }
  const [sending, setSending] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const bottomRef = useRef(null);
  const fileRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const supportsAudio = typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

  // Load messages on mount
  useEffect(() => {
    loadMessages();
  }, [landlordEmail, propertyId, roomId, tenantId]); // eslint-disable-line

  // Mark as read once messages are loaded
  useEffect(() => {
    if (!loading) markAsRead();
  }, [loading]); // eslint-disable-line

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel(`chat:${landlordEmail}:${propertyId}:${roomId || tenantId}:${isGroup ? 'group' : 'individual'}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
      }, (payload) => {
        const m = payload.new;
        if (m.property_id !== propertyId || m.landlord_email !== landlordEmail) return;
        if (isGroup && !m.is_group_message) return;
        if (!isGroup && m.is_group_message) return;
        if (!isGroup) {
          if (roomId && m.room_id !== roomId) return;
          if (!roomId && (m.tenant_id !== tenantId || m.room_id)) return;
        }
        setMessages(prev => [...prev, m]);
        markAsRead();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [landlordEmail, propertyId, roomId, tenantId, currentRole, isGroup]); // eslint-disable-line

  // Scroll to bottom on new message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function loadMessages() {
    setLoading(true);
    let q = supabase
      .from('messages')
      .select('*')
      .eq('landlord_email', landlordEmail)
      .eq('property_id', propertyId)
      .order('created_at', { ascending: true });
    if (isGroup) {
      q = q.eq('is_group_message', true);
    } else if (roomId) {
      q = q.eq('room_id', roomId).eq('is_group_message', false);
    } else {
      q = q.is('room_id', null).eq('tenant_id', tenantId).eq('is_group_message', false);
    }
    const { data } = await q;
    setMessages(data || []);
    setLoading(false);
  }

  async function markAsRead() {
    const col = currentRole === 'landlord' ? 'read_by_landlord' : 'read_by_tenant';
    let q = supabase
      .from('messages')
      .update({ [col]: true })
      .eq('landlord_email', landlordEmail)
      .eq('property_id', propertyId)
      .eq(col, false)
      .neq('sender', currentRole);
    if (isGroup) {
      q = q.eq('is_group_message', true);
    } else if (roomId) {
      q = q.eq('room_id', roomId).eq('is_group_message', false);
    } else {
      q = q.is('room_id', null).eq('tenant_id', tenantId).eq('is_group_message', false);
    }
    await q;
  }

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const preview = URL.createObjectURL(file);
    setPendingFile({ file, preview, fileName: file.name, fileType: file.type, fileSize: file.size });
    e.target.value = '';
  };

  const handleSend = async () => {
    if (!text.trim() && !pendingFile) return;
    setSending(true);
    try {
      let attachment_url = null, attachment_name = null, attachment_type = null, attachment_size = null;

      if (pendingFile) {
        const ext = pendingFile.fileName.split('.').pop();
        const path = `${landlordEmail}/${propertyId}/${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('chat-attachments')
          .upload(path, pendingFile.file, { contentType: pendingFile.fileType });
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabase.storage.from('chat-attachments').getPublicUrl(path);
        attachment_url = publicUrl;
        attachment_name = pendingFile.fileName;
        attachment_type = pendingFile.fileType;
        attachment_size = pendingFile.fileSize;
      }

      const { error } = await supabase.from('messages').insert({
        property_id: propertyId,
        room_id: isGroup ? null : (roomId || null),
        tenant_id: isGroup ? null : (roomId ? null : tenantId),
        landlord_email: landlordEmail,
        sender: currentRole,
        sender_id: currentRole === 'landlord' ? landlordEmail : tenantId,
        content: text.trim() || null,
        attachment_url,
        attachment_name,
        attachment_type,
        attachment_size,
        is_group_message: isGroup || false,
        read_by_landlord: currentRole === 'landlord',
        read_by_tenant: currentRole === 'tenant',
      });
      if (error) throw error;

      setText('');
      setPendingFile(null);
    } catch (err) {
      console.error('Error enviando mensaje:', err);
    } finally {
      setSending(false);
    }
  };

  // ─── Audio recording ──────────────────────────────────────────────────────
  const handleMicStart = async (e) => {
    e.preventDefault();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mr = new MediaRecorder(stream);
      mr.ondataavailable = (ev) => {
        if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setIsRecording(true);
    } catch (err) {
      console.error('Error accediendo al micrófono:', err);
    }
  };

  const handleMicStop = async (e) => {
    e.preventDefault();
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') return;
    setIsRecording(false);

    const mr = mediaRecorderRef.current;
    mr.onstop = async () => {
      mr.stream.getTracks().forEach(t => t.stop());
      if (audioChunksRef.current.length === 0) return;
      const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      const ts = Date.now();
      const path = `${landlordEmail}/audios/${ts}.webm`;
      const { error: uploadError } = await supabase.storage
        .from('documentos')
        .upload(path, blob, { contentType: 'audio/webm' });
      if (uploadError) { console.error('Error subiendo audio:', uploadError); return; }
      const { data: { publicUrl } } = supabase.storage.from('documentos').getPublicUrl(path);
      await supabase.from('messages').insert({
        property_id: propertyId,
        room_id: isGroup ? null : (roomId || null),
        tenant_id: isGroup ? null : (roomId ? null : tenantId),
        landlord_email: landlordEmail,
        sender: currentRole,
        sender_id: currentRole === 'landlord' ? landlordEmail : tenantId,
        content: null,
        attachment_url: publicUrl,
        attachment_type: 'audio/webm',
        attachment_name: null,
        attachment_size: null,
        is_group_message: isGroup || false,
        read_by_landlord: currentRole === 'landlord',
        read_by_tenant: currentRole === 'tenant',
      });
    };
    mr.stop();
    mediaRecorderRef.current = null;
  };

  const isMe = (sender) => sender === currentRole;
  const otherName = isGroup
    ? (currentRole === 'tenant' ? 'Chat del bloque' : 'Todos los inquilinos')
    : (currentRole === 'tenant' ? 'Propietario' : tenantName);
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

        {/* Avatar en cabecera */}
        {(() => {
          const showLandlordPhoto = !isGroup;
          const otherInitials = otherName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
          return (
            <div style={{ position: 'relative', flexShrink: 0 }}>
              {showLandlordPhoto && landlordAvatarUrl && (
                <img
                  src={landlordAvatarUrl}
                  alt=""
                  style={{ width: 38, height: 38, borderRadius: '50%', objectFit: 'cover', display: landlordAvatarValid ? 'block' : 'none' }}
                  onLoad={() => setLandlordAvatarValid(true)}
                  onError={() => setLandlordAvatarValid(false)}
                />
              )}
              {(!showLandlordPhoto || !landlordAvatarValid) && (
                <div style={{
                  width: 38, height: 38, borderRadius: '50%',
                  background: isGroup ? '#111' : '#e5e5e5',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 700, color: isGroup ? 'white' : '#555',
                }}>
                  {isGroup ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <circle cx="9" cy="7" r="4" stroke="white" strokeWidth="2"/>
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  ) : otherInitials}
                </div>
              )}
            </div>
          );
        })()}

        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontWeight: 600, fontSize: '15px', color: '#111' }}>{otherName}</p>
          <p style={{ margin: 0, fontSize: '12px', color: '#999' }}>{isGroup ? `${propertyName} · Grupo` : propertyName}</p>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {loading && (
          <p style={{ textAlign: 'center', color: '#bbb', fontSize: '14px', marginTop: '60px' }}>Cargando...</p>
        )}
        {!loading && messages.length === 0 && (
          <p style={{ textAlign: 'center', color: '#bbb', fontSize: '14px', marginTop: '60px' }}>
            Sin mensajes todavía. ¡Inicia la conversación!
          </p>
        )}
        {messages.map((msg, i) => {
          const msgDate = new Date(msg.created_at);
          const prevDate = i > 0 ? new Date(messages[i - 1].created_at) : null;
          const isNewDay = !prevDate || msgDate.toDateString() !== prevDate.toDateString();

          let dateLabel = '';
          if (isNewDay) {
            const today = new Date();
            const yesterday = new Date(today);
            yesterday.setDate(today.getDate() - 1);
            if (msgDate.toDateString() === today.toDateString()) dateLabel = 'Hoy';
            else if (msgDate.toDateString() === yesterday.toDateString()) dateLabel = 'Ayer';
            else dateLabel = msgDate.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
          }

          const isAudioMsg = msg.attachment_type?.startsWith('audio/');

          return (
            <div key={msg.id}>
              {isNewDay && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '8px 0' }}>
                  <div style={{ flex: 1, height: '1px', background: '#e5e5e5' }} />
                  <span style={{ fontSize: '11px', color: '#bbb', fontWeight: 500, whiteSpace: 'nowrap' }}>{dateLabel}</span>
                  <div style={{ flex: 1, height: '1px', background: '#e5e5e5' }} />
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, flexDirection: isMe(msg.sender) ? 'row-reverse' : 'row', marginLeft: isMe(msg.sender) ? 'auto' : 0, maxWidth: '80%' }}>
                {/* Mini avatar para mensajes entrantes */}
                {!isMe(msg.sender) && (() => {
                  const isLandlordMsg = msg.sender === 'landlord';
                  const otherInitials = otherName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
                  return (
                    <div style={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0, overflow: 'hidden', position: 'relative' }}>
                      {isLandlordMsg && landlordAvatarUrl && (
                        <img
                          src={landlordAvatarUrl}
                          alt=""
                          style={{ width: '100%', height: '100%', objectFit: 'cover', display: landlordAvatarValid ? 'block' : 'none', position: 'absolute', inset: 0 }}
                        />
                      )}
                      {(!isLandlordMsg || !landlordAvatarValid) && (
                        <div style={{
                          width: '100%', height: '100%',
                          background: '#e5e5e5',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 9, fontWeight: 700, color: '#666',
                        }}>
                          {otherInitials}
                        </div>
                      )}
                    </div>
                  );
                })()}

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: isMe(msg.sender) ? 'flex-end' : 'flex-start', maxWidth: '100%' }}>
                  <div style={{
                    background: isMe(msg.sender) ? '#111' : 'white',
                    color: isMe(msg.sender) ? 'white' : '#111',
                    borderRadius: isMe(msg.sender) ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                    padding: isAudioMsg ? '10px 12px' : (msg.attachment_url && !msg.content ? '8px' : '10px 14px'),
                    fontSize: '14px', lineHeight: '1.4',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                    wordBreak: 'break-word',
                    overflowWrap: 'anywhere',
                    minWidth: isAudioMsg ? '220px' : undefined,
                  }}>
                    {msg.content && !isAudioMsg && <span>{msg.content}</span>}
                    {msg.attachment_url && <AttachmentView msg={msg} isMe={isMe(msg.sender)} />}
                  </div>
                  <p style={{ margin: '2px 4px 0', fontSize: '10px', color: '#bbb', textAlign: isMe(msg.sender) ? 'right' : 'left' }}>
                    {msgDate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Pending file preview */}
      {pendingFile && (
        <div style={{ background: 'white', padding: '10px 16px', borderTop: '1px solid #eee', display: 'flex', alignItems: 'center', gap: '10px' }}>
          {pendingFile.fileType?.startsWith('image/') ? (
            <img src={pendingFile.preview} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover' }} />
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

      {/* Recording indicator */}
      {isRecording && (
        <div style={{
          background: 'white', padding: '8px 16px', borderTop: '1px solid #eee',
          display: 'flex', alignItems: 'center', gap: '10px',
        }}>
          <RecordingDot />
          <span style={{ fontSize: '13px', color: '#e74c3c', fontWeight: 600 }}>Grabando audio… suelta para enviar</span>
        </div>
      )}

      {/* Input */}
      <div style={{
        background: 'white', padding: '10px 16px',
        borderTop: (pendingFile || isRecording) ? 'none' : '1px solid #eee',
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

        {/* Mic button — only when text is empty and audio is supported */}
        {supportsAudio && !text.trim() && !pendingFile && (
          <button
            onMouseDown={handleMicStart}
            onMouseUp={handleMicStop}
            onMouseLeave={isRecording ? handleMicStop : undefined}
            onTouchStart={handleMicStart}
            onTouchEnd={handleMicStop}
            style={{
              width: '40px', height: '40px', borderRadius: '50%', flexShrink: 0,
              background: isRecording ? '#e74c3c' : '#e5e5e5',
              border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 0.15s',
              userSelect: 'none',
              WebkitUserSelect: 'none',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <rect x="9" y="2" width="6" height="12" rx="3" stroke={isRecording ? 'white' : '#666'} strokeWidth="2"/>
              <path d="M5 10a7 7 0 0 0 14 0" stroke={isRecording ? 'white' : '#666'} strokeWidth="2" strokeLinecap="round"/>
              <line x1="12" y1="17" x2="12" y2="21" stroke={isRecording ? 'white' : '#666'} strokeWidth="2" strokeLinecap="round"/>
              <line x1="9" y1="21" x2="15" y2="21" stroke={isRecording ? 'white' : '#666'} strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        )}

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

// ─── Pulsing red recording indicator ─────────────────────────────────────────
function RecordingDot() {
  return (
    <div style={{ position: 'relative', width: 12, height: 12, flexShrink: 0 }}>
      <div style={{
        position: 'absolute', inset: 0,
        borderRadius: '50%',
        background: '#e74c3c',
        animation: 'recordPulse 1s ease-in-out infinite',
      }} />
      <style>{`
        @keyframes recordPulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.5); opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
