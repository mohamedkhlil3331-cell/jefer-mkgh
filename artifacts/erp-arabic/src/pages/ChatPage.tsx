import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useCreateChatConversation, useCreateChatVoiceUpload, useDeleteChatMessage,
  useEditChatMessage, useGetChatContacts, useGetChatConversations,
  useGetChatMessages, useGetOlderChatMessages, useGetChatMessageMedia, useGetChatNotificationSettings,
  useGetChatPushPublicKey, useMarkChatConversationRead, useRegisterChatPushSubscription,
  useRemoveChatPushSubscription, useSendChatMessage, useUpdateChatNotificationSettings,
  getGetChatContactsQueryKey, getGetChatConversationsQueryKey,
  getGetChatMessagesQueryKey, getGetOlderChatMessagesQueryKey, getGetChatMessageMediaQueryKey,
  getGetChatNotificationSettingsQueryKey, getGetChatPushPublicKeyQueryKey,
} from "@workspace/api-client-react";
import type { ChatConversation, ChatMessage } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import CustomerChatAccessModal from "@/components/chat/CustomerChatAccessModal";
import {
  ArrowDown, ArrowRight, Bell, BellOff, Check, CheckCheck, ChevronDown,
  CircleHelp, Headphones, MessageCircle, Mic, MicOff, MoreHorizontal, Phone,
  PhoneCall, Plus, Search, Send, Settings2, ShieldCheck, Trash2, Video, X,
} from "lucide-react";

const roleNames: Record<string, string> = {
  driver: "سائق", bulker_driver: "سائق نقليات", supervisor: "مشرف",
  warehouse: "المستودع", warehouse_manager: "مسؤول المستودع",
  finance: "المالية", accountant: "محاسب", admin: "مدير النظام",
  reviewer: "مراجع", employee: "موظف", rep: "مندوب",
  customer: "عميل", rental_trip_customer: "عميل إيجار",
};
const roleName = (role: string) => roleNames[role] ?? role;
const auth = (token: string | null) => ({ Authorization: `Bearer ${token ?? ""}` });
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(x => x[0]).join("");
const timeLabel = (date: string) => new Date(date).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" });
const dateLabel = (date: string) => new Date(date).toLocaleDateString("ar-SA", { day: "numeric", month: "short" });

function VoiceBubble({ message, token }: { message: ChatMessage; token: string | null }) {
  const media = useGetChatMessageMedia(message.id, {
    query: { queryKey: getGetChatMessageMediaQueryKey(message.id) },
    request: { headers: auth(token) },
  });
  const [src, setSrc] = useState("");
  useEffect(() => {
    if (!media.data) return;
    const url = URL.createObjectURL(media.data);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [media.data]);
  return src ? <audio controls src={src} className="h-9 max-w-[230px]" /> :
    <span className="inline-flex items-center gap-2 text-xs text-slate-500"><Headphones size={16}/>{media.isError ? "تعذر تحميل التسجيل" : "جارٍ تجهيز التسجيل…"}</span>;
}

function ChatPageContent() {
  const { user, token } = useAuth();
  const customerMode = user?.role === "customer" || user?.role === "rental_trip_customer";
  const canManageCustomerChat = user?.role === "admin" || Boolean(user?.permissions?.includes("users_manage"));
  const queryClient = useQueryClient();
  const headers = useMemo(() => auth(token), [token]);
  const canQueryChat = Boolean(token && user && !user.isGuest && user.id > 0);
  const [showNew, setShowNew] = useState(false);
  const conversationsQuery = useGetChatConversations({
    query: {
      queryKey: [...getGetChatConversationsQueryKey(), user?.id ?? null],
      enabled: canQueryChat,
      refetchInterval: canQueryChat ? 12000 : false,
    },
    request: { headers },
  });
  const contactsQuery = useGetChatContacts({
    query: {
      queryKey: [...getGetChatContactsQueryKey(), user?.id ?? null],
      enabled: showNew && canQueryChat,
    },
    request: { headers },
  });
  const [activeId, setActiveId] = useState<number | null>(() => {
    const conversation = new URLSearchParams(window.location.search).get("conversation");
    return conversation && Number.isFinite(Number(conversation)) ? Number(conversation) : null;
  });
  const [beforeId, setBeforeId] = useState(0);
  const [olderMessages, setOlderMessages] = useState<ChatMessage[]>([]);
  const loadedOlderCursor = useRef(0);
  const [search, setSearch] = useState("");
  const [contactSearch, setContactSearch] = useState("");
  const [text, setText] = useState("");
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [error, setError] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [showCustomerAccess, setShowCustomerAccess] = useState(false);
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const callIdRef = useRef<string | null>(null);
  const callStateRef = useRef<{ id: string; type: "audio" | "video"; incoming: boolean; name?: string } | null>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const pendingLocalIceRef = useRef<RTCIceCandidateInit[]>([]);
  const callAcceptedRef = useRef(false);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const newChatButtonRef = useRef<HTMLButtonElement>(null);
  const contactPickerRef = useRef<HTMLDivElement>(null);
  const activeChatUserIdRef = useRef<number | null>(user?.id ?? null);
  const [pickerPosition, setPickerPosition] = useState({ top: 12, left: 12, width: 384 });
  const [call, setCall] = useState<{ id: string; type: "audio" | "video"; incoming: boolean; name?: string } | null>(null);
  const [callStatus, setCallStatus] = useState("");

  function openContactPicker(anchor: HTMLButtonElement) {
    const rect = anchor.getBoundingClientRect();
    const width = Math.min(384, window.innerWidth - 24);
    const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
    const top = Math.max(12, Math.min(rect.bottom + 8, window.innerHeight - 460));
    setPickerPosition({ top, left, width });
    setContactSearch("");
    setShowNew(true);
  }

  const conversations = conversationsQuery.data ?? [];
  const active = conversations.find(c => c.id === activeId) ?? null;
  const messagesQuery = useGetChatMessages(activeId ?? 0, {
    query: {
      queryKey: [...getGetChatMessagesQueryKey(activeId ?? 0), user?.id ?? null],
      enabled: canQueryChat && !!activeId,
      refetchInterval: canQueryChat && activeId ? 7000 : false,
    },
    request: { headers },
  });
  const olderQuery = useGetOlderChatMessages(activeId ?? 0, beforeId, {
    query: {
      queryKey: [...getGetOlderChatMessagesQueryKey(activeId ?? 0, beforeId), user?.id ?? null],
      enabled: canQueryChat && !!(activeId && beforeId),
    },
    request: { headers },
  });
  const send = useSendChatMessage({ request: { headers } });
  const createConversation = useCreateChatConversation({ request: { headers } });
  const uploadVoice = useCreateChatVoiceUpload({ request: { headers } });
  const editMessage = useEditChatMessage({ request: { headers } });
  const deleteMessage = useDeleteChatMessage({ request: { headers } });
  const markRead = useMarkChatConversationRead({ request: { headers } });

  const invalidateMessages = useCallback((conversationId: number) => {
    queryClient.invalidateQueries({ queryKey: getGetChatMessagesQueryKey(conversationId) });
    queryClient.invalidateQueries({ queryKey: getGetChatConversationsQueryKey() });
  }, [queryClient]);

  useEffect(() => {
    const nextUserId = user?.id ?? null;
    const previousUserId = activeChatUserIdRef.current;
    if (previousUserId === nextUserId) return;
    activeChatUserIdRef.current = nextUserId;
    if (previousUserId === null && nextUserId !== null) return;
    setActiveId(null);
    setBeforeId(0);
    setOlderMessages([]);
    setSearch("");
    setContactSearch("");
    setShowNew(false);
  }, [user?.id]);

  useEffect(() => {
    if (!showNew) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (contactPickerRef.current?.contains(target) || newChatButtonRef.current?.contains(target)) return;
      setShowNew(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowNew(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [showNew]);

  useEffect(() => {
    if (!activeId || !canQueryChat) return;
    markRead.mutate({ conversationId: activeId });
  }, [activeId, canQueryChat]);
  useEffect(() => {
    setOlderMessages([]);
    setBeforeId(0);
    loadedOlderCursor.current = 0;
  }, [activeId]);
  useEffect(() => {
    if (!beforeId || !olderQuery.data || loadedOlderCursor.current === beforeId) return;
    loadedOlderCursor.current = beforeId;
    setOlderMessages(current => {
      const ids = new Set(current.map(message => message.id));
      return [...olderQuery.data!.filter(message => !ids.has(message.id)), ...current];
    });
  }, [beforeId, olderQuery.data]);
  useEffect(() => {
    if (messagesQuery.data) scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: "smooth" });
  }, [messagesQuery.data?.length, activeId]);

  // Authenticated socket: token stays in the required subprotocol, never in the URL.
  useEffect(() => {
    if (!token || !canQueryChat) return;
    const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${scheme}//${window.location.host}/api/chat/ws`, ["mkgh-chat-v1", `bearer.${token}`]);
    socketRef.current = ws;
    ws.onmessage = event => {
      let data: Record<string, any>;
      try { data = JSON.parse(event.data); } catch { return; }
      if (data.type === "error") {
        setError(typeof data.message === "string" ? data.message : "تعذر تنفيذ إجراء المكالمة.");
        finishCall(false);
      }
      if (typeof data.type === "string" && data.type.startsWith("chat:")) {
        const id = Number(data.conversation_id ?? data.message?.conversation_id ?? activeId);
        if (id) invalidateMessages(id);
      }
      if (data.type === "call:incoming") {
        callIdRef.current = String(data.call_id);
        const nextCall = { id: String(data.call_id), type: data.media_type === "video" ? "video" as const : "audio" as const, incoming: true, name: data.caller_name };
        callStateRef.current = nextCall;
        setCall(nextCall);
        setCallStatus("مكالمة واردة");
      }
      if (data.type === "call:outgoing") {
        callIdRef.current = String(data.call_id);
        const nextCall = { id: String(data.call_id), type: callStateRef.current?.type ?? "audio", incoming: false };
        callStateRef.current = nextCall;
        setCall(nextCall);
        setCallStatus("جارٍ الاتصال…");
      }
      if (data.type === "call:accepted") {
        callAcceptedRef.current = true;
        const acceptedCallId = String(data.call_id);
        for (const candidate of pendingLocalIceRef.current.splice(0)) {
          ws.send(JSON.stringify({ type: "call:signal", call_id: acceptedCallId, signal: { candidate } }));
        }
        setCallStatus("تم الاتصال");
        if (!callStateRef.current?.incoming && peerRef.current && !peerRef.current.localDescription) {
          peerRef.current.createOffer().then(offer => peerRef.current?.setLocalDescription(offer)).then(() => {
            const pc = peerRef.current;
            if (pc?.localDescription) ws.send(JSON.stringify({ type: "call:signal", call_id: data.call_id, signal: { description: pc.localDescription } }));
          }).catch(() => { setCallStatus("تعذر بدء الاتصال"); finishCall(); });
        }
      }
      if (data.type === "call:declined" || data.type === "call:ended") finishCall(false);
      if (data.type === "call:signal") void handleSignal(data);
    };
    ws.onerror = () => setError("تعذر الاتصال بخدمة المكالمات.");
    return () => { finishCall(); ws.close(); socketRef.current = null; };
  }, [token, canQueryChat, user?.role, activeId, invalidateMessages]);

  const messages = messagesQuery.data ?? [];
  const allMessages = [...olderMessages, ...messages];
  const conversationSearch = search.trim().toLocaleLowerCase();
  const contactSearchValue = contactSearch.trim().toLocaleLowerCase();
  const filteredConversations = conversations.filter(c =>
    `${c.other_user_name} ${c.other_user_role} ${roleName(c.other_user_role)} ${c.other_user_phone}`
      .toLocaleLowerCase()
      .includes(conversationSearch),
  );
  const contacts = (contactsQuery.data ?? []).filter(contact =>
    contact.id !== user?.id &&
    `${contact.name} ${contact.role} ${roleName(contact.role)} ${contact.phone}`
      .toLocaleLowerCase()
      .includes(contactSearchValue),
  );

  async function preparePeer(type: "audio" | "video") {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: type === "video" });
    localStreamRef.current = stream;
    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    peerRef.current = pc;
    stream.getTracks().forEach(track => pc.addTrack(track, stream));
    pc.ontrack = event => {
      if (remoteAudioRef.current) remoteAudioRef.current.srcObject = event.streams[0];
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = event.streams[0];
    };
    pc.onicecandidate = event => {
      if (!event.candidate) return;
      const candidate = event.candidate.toJSON();
      const callId = callIdRef.current;
      if (callId && callAcceptedRef.current) {
        socketRef.current?.send(JSON.stringify({ type: "call:signal", call_id: callId, signal: { candidate } }));
      } else {
        pendingLocalIceRef.current.push(candidate);
      }
    };
    return pc;
  }
  async function handleSignal(event: Record<string, any>) {
    const signal = event.signal;
    if (!signal) return;
    try {
      let pc = peerRef.current;
      if (!pc && callStateRef.current) pc = await preparePeer(callStateRef.current.type);
      if (!pc) return;
      if (signal.description) {
        await pc.setRemoteDescription(signal.description);
        for (const candidate of pendingIceRef.current.splice(0)) {
          await pc.addIceCandidate(candidate);
        }
        if (signal.description.type === "offer") {
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socketRef.current?.send(JSON.stringify({ type: "call:signal", call_id: event.call_id, signal: { description: pc.localDescription } }));
        }
      } else if (signal.candidate) {
        if (pc.remoteDescription) await pc.addIceCandidate(signal.candidate);
        else pendingIceRef.current.push(signal.candidate as RTCIceCandidateInit);
      }
    } catch { setCallStatus("تعذر إنشاء اتصال الوسائط"); }
  }
  function finishCall(notify = true) {
    if (notify && callIdRef.current) socketRef.current?.send(JSON.stringify({ type: "call:end", call_id: callIdRef.current }));
    peerRef.current?.close();
    peerRef.current = null;
    localStreamRef.current?.getTracks().forEach(track => track.stop());
    localStreamRef.current = null;
    pendingIceRef.current = [];
    pendingLocalIceRef.current = [];
    callAcceptedRef.current = false;
    callStateRef.current = null;
    setCall(null);
    callIdRef.current = null;
    setCallStatus("");
  }
  async function startCall(type: "audio" | "video") {
    if (!active || !socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      setError("خدمة المكالمات غير متاحة حالياً."); return;
    }
    try {
      await preparePeer(type);
      callIdRef.current = null;
      callAcceptedRef.current = false;
      pendingLocalIceRef.current = [];
      const nextCall = { id: "", type, incoming: false, name: active.other_user_name };
      callStateRef.current = nextCall;
      setCall(nextCall);
      socketRef.current.send(JSON.stringify({ type: "call:invite", conversation_id: active.id, media_type: type }));
      setCallStatus("جارٍ الاتصال…");
    } catch { setError("يرجى السماح باستخدام الميكروفون والكاميرا لبدء المكالمة."); }
  }
  async function answerCall(accept: boolean) {
    const currentCall = callStateRef.current;
    if (!currentCall) return;
    if (!accept) {
      socketRef.current?.send(JSON.stringify({ type: "call:decline", call_id: currentCall.id }));
      finishCall(false);
      return;
    }
    setCallStatus("جارٍ الانضمام…");
    callAcceptedRef.current = false;
    pendingLocalIceRef.current = [];
    try {
      await preparePeer(currentCall.type);
      socketRef.current?.send(JSON.stringify({ type: "call:accept", call_id: currentCall.id }));
    } catch {
      socketRef.current?.send(JSON.stringify({ type: "call:decline", call_id: currentCall.id }));
      setError("تعذر الوصول إلى الميكروفون أو الكاميرا.");
      finishCall(false);
    }
  }

  async function submitMessage(event: React.FormEvent) {
    event.preventDefault();
    if (!activeId || !text.trim()) return;
    const value = text.trim();
    try {
      if (editing) await editMessage.mutateAsync({ messageId: editing.id, data: { text: value } });
      else await send.mutateAsync({ conversationId: activeId, data: { type: "text", text: value } });
      setText(""); setEditing(null); invalidateMessages(activeId);
    } catch { setError("تعذر إرسال الرسالة. تحقق من الاتصال ثم حاول مجدداً."); }
  }
  async function recordVoice() {
    if (recording) {
      recorderRef.current?.stop();
      streamRef.current?.getTracks().forEach(track => track.stop());
      setRecording(false);
      return;
    }
    if (!activeId) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        try {
          const mediaType = blob.type.split(";")[0] || "audio/webm";
          const upload = await uploadVoice.mutateAsync({ conversationId: activeId!, data: { name: `voice-${Date.now()}.${mediaType.includes("ogg") ? "ogg" : mediaType.includes("mp4") ? "m4a" : "webm"}`, contentType: mediaType as "audio/webm" | "audio/ogg" | "audio/mp4" | "audio/mpeg", size: blob.size } });
          const response = await fetch(upload.upload_url, { method: "PUT", headers: { "Content-Type": mediaType }, body: blob });
          if (!response.ok) throw new Error("upload failed");
          await send.mutateAsync({ conversationId: activeId!, data: { type: "voice", upload_token: upload.upload_token } });
          invalidateMessages(activeId!);
        } catch { setError("تعذر رفع التسجيل الصوتي."); }
      };
      recorder.start();
      setRecording(true);
    } catch { setError("يرجى السماح باستخدام الميكروفون لتسجيل رسالة صوتية."); }
  }
  function removeMessage(message: ChatMessage) {
    if (!window.confirm("هل تريد حذف هذه الرسالة؟")) return;
    deleteMessage.mutate({ messageId: message.id }, { onSuccess: () => invalidateMessages(message.conversation_id), onError: () => setError("لا تسمح سياسة هذه المحادثة بحذف الرسالة.") });
  }
  function beginConversation(recipientId: number) {
    createConversation.mutate({ data: { recipient_user_id: recipientId } }, {
      onSuccess: result => {
        queryClient.invalidateQueries({ queryKey: getGetChatConversationsQueryKey() });
        setActiveId(result.id); setShowNew(false); setContactSearch("");
      },
      onError: () => setError("تعذر بدء المحادثة."),
    });
  }

  return (
    <div className="chat-shell min-h-[calc(100dvh-2rem)] overflow-hidden rounded-[26px] border border-[#dfe6e0] bg-[#fbfbf8] shadow-[0_16px_50px_rgba(28,54,61,.08)]" dir="rtl">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#e8ebe5] bg-[#fbfbf8] px-5 py-4 md:px-7">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#e3f0eb] text-[#1d756f]"><MessageCircle size={21}/></div>
          <div><h1 className="text-xl font-black tracking-tight text-[#18334a]">مساحة التواصل</h1><p className="mt-0.5 text-xs text-slate-500">{customerMode ? "تواصل مباشر مع المشرفين والمناديب المرتبطين بك" : "محادثات العمل اليومية بين فرق MKGH"}</p></div>
          <span className="hidden items-center gap-1.5 rounded-full border border-[#d8e8df] bg-[#f1f7f3] px-3 py-1.5 text-[11px] font-bold text-[#477368] sm:inline-flex"><ShieldCheck size={13}/>{customerMode ? "تواصل مع جهات محددة" : "محادثات خاصة"}</span>
        </div>
        <div className="flex items-center gap-2">
          {canManageCustomerChat && <button onClick={() => setShowCustomerAccess(true)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#e1e6df] bg-white px-3 text-sm font-semibold text-slate-600 transition hover:border-[#aac9bc] hover:text-[#1d756f]" data-testid="button-customer-chat-access"><ShieldCheck size={16}/><span className="hidden sm:inline">صلاحيات العملاء</span></button>}
          <button onClick={() => setShowSettings(true)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#e1e6df] bg-white px-3 text-sm font-semibold text-slate-600 transition hover:border-[#aac9bc] hover:text-[#1d756f]" data-testid="button-chat-settings"><Settings2 size={16}/><span className="hidden sm:inline">التفضيلات</span></button>
          <button
            ref={newChatButtonRef}
            onClick={event => showNew ? setShowNew(false) : openContactPicker(event.currentTarget)}
            aria-haspopup="listbox"
            aria-expanded={showNew}
            aria-controls="new-chat-contact-list"
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#1d756f] px-4 text-sm font-bold text-white shadow-sm transition hover:bg-[#165e59] active:scale-[.98]"
            data-testid="button-new-conversation"
          ><Plus size={17}/>محادثة جديدة</button>
        </div>
      </header>
      {error && <div role="alert" className="mx-5 mt-3 flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-800"><span>{error}</span><button onClick={() => setError("")} aria-label="إغلاق التنبيه"><X size={16}/></button></div>}
      <div className="grid min-h-[650px] grid-cols-1 md:grid-cols-[310px_minmax(0,1fr)]">
        <aside className={`${active ? "hidden md:flex" : "flex"} min-h-[650px] flex-col border-l border-[#e7eae4] bg-[#fdfdfa]`}>
          <div className="px-4 pb-3 pt-5">
            <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-extrabold text-[#18334a]">المحادثات</h2><span className="rounded-full bg-[#edf4ef] px-2 py-0.5 text-[11px] font-bold text-[#527569]">{conversations.length}</span></div>
            <div className="relative"><Search size={15} className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-400"/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="ابحث عن محادثة..." className="w-full rounded-xl border border-[#e5e9e2] bg-[#f6f7f3] py-2.5 pe-9 ps-3 text-sm outline-none transition focus:border-[#9dbfb1] focus:bg-white" data-testid="input-chat-search"/></div>
          </div>
          <div className="chat-scroll flex-1 overflow-y-auto px-2 pb-3">
            {conversationsQuery.isLoading ? <div className="space-y-2 px-2 pt-2">{[0,1,2,3].map(i => <div key={i} className="h-[68px] animate-pulse rounded-2xl bg-[#f0f2ed]"/> )}</div> :
            conversationsQuery.isError ? <div className="px-4 py-10 text-center text-sm text-slate-500"><p>تعذر تحميل المحادثات</p><button onClick={() => conversationsQuery.refetch()} className="mt-2 font-bold text-[#1d756f]">إعادة المحاولة</button></div> :
            filteredConversations.length === 0 ? <div className="px-5 py-14 text-center"><div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f0f3ee] text-slate-400"><MessageCircle size={21}/></div><p className="text-sm font-bold text-slate-600">لا توجد محادثات بعد</p><p className="mt-1 text-xs text-slate-400">{customerMode ? "ابدأ تواصلك مع مشرف أو مندوب" : "ابدأ تواصلك مع أحد الزملاء"}</p></div> :
            filteredConversations.map(conversation => <ConversationRow key={conversation.id} conversation={conversation} active={activeId === conversation.id} onClick={() => setActiveId(conversation.id)}/>)}
          </div>
          <div className="border-t border-[#e9ece6] px-4 py-3 text-[11px] leading-relaxed text-slate-400">{customerMode ? "المحادثات متاحة فقط مع جهات التواصل المسموح بها." : "محادثات خاصة للعمل، مستقلة عن الطلبات والحسابات."}</div>
        </aside>
        <section className={`${active ? "flex" : "hidden md:flex"} min-h-[650px] flex-col bg-[#f7f6f1]`}>
          {active ? <>
            <div className="flex items-center justify-between gap-3 border-b border-[#e8ebe5] bg-[#fbfbf8] px-4 py-3 md:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <button onClick={() => setActiveId(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 md:hidden" aria-label="العودة للمحادثات"><ArrowRight size={17}/></button>
                <Avatar name={active.other_user_name}/>
                 <div className="min-w-0">
                   <div className="flex min-w-0 items-center gap-2">
                     <h2 className="truncate text-sm font-extrabold text-[#18334a]">{active.other_user_name}</h2>
                     <span data-testid="text-active-contact-role" className="shrink-0 rounded-full bg-[#edf4ef] px-2 py-0.5 text-[10px] font-bold text-[#527569]">{roleName(active.other_user_role)}</span>
                   </div>
                   <p className="mt-0.5 text-xs text-slate-500"><span dir="ltr">{active.other_user_phone}</span></p>
                 </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={() => startCall("audio")} title="مكالمة صوتية" className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#e3e8e1] bg-white text-[#52756d] transition hover:bg-[#eaf3ee]" data-testid="button-audio-call"><Phone size={16}/></button>
                <button onClick={() => startCall("video")} title="مكالمة فيديو" className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#e3e8e1] bg-white text-[#52756d] transition hover:bg-[#eaf3ee]" data-testid="button-video-call"><Video size={17}/></button>
                <span className="mx-1 hidden h-6 w-px bg-[#e3e7e0] sm:block"/>
                <span className="hidden items-center gap-1 text-[10px] text-slate-400 sm:inline-flex"><ShieldCheck size={13}/>محادثة خاصة</span>
              </div>
            </div>
            <div className="chat-pattern relative flex-1 overflow-hidden">
              <div ref={scrollerRef} className="chat-scroll absolute inset-0 overflow-y-auto px-4 py-5 md:px-8">
               <div className="mx-auto mb-5 flex max-w-max items-center gap-2 rounded-full border border-[#e5e9e2] bg-white/80 px-3 py-1.5 text-[10px] font-semibold text-slate-500"><ShieldCheck size={12} className="text-[#619082]"/>{customerMode ? "هذه المحادثة مع جهة تواصل مسموح بها" : "هذه المحادثة مخصصة للتنسيق الداخلي"}</div>
                {messagesQuery.isLoading ? <div className="mx-auto max-w-xl space-y-3">{[1,2,3].map(i => <div key={i} className={`h-14 w-3/5 animate-pulse rounded-2xl bg-white/70 ${i%2 ? "ms-auto" : ""}`}/>)}</div> :
                messagesQuery.isError ? <div className="py-10 text-center text-sm text-slate-500"><p>تعذر تحميل الرسائل</p><button onClick={() => messagesQuery.refetch()} className="mt-2 font-bold text-[#1d756f]">إعادة المحاولة</button></div> :
                 allMessages.length === 0 ? <div className="mx-auto mt-16 max-w-xs text-center"><div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-[20px] bg-white text-[#6f9b8e] shadow-sm"><MessageCircle size={24}/></div><h3 className="font-bold text-[#28485a]">ابدأ الحديث</h3><p className="mt-1 text-xs leading-6 text-slate-500">{customerMode ? "أرسل استفسارك أو تحديثك إلى جهة التواصل." : "نسّق تفاصيل العمل أو أرسل تحديثاً سريعاً لزميلك."}</p></div> :
                <div className="mx-auto max-w-3xl space-y-3">
                  <button onClick={() => { if (!olderQuery.isFetching && allMessages.length) setBeforeId(allMessages[0].id); }} disabled={olderQuery.isFetching || !allMessages.length} className="mx-auto flex items-center gap-1.5 rounded-full border border-[#e2e9e1] bg-white/75 px-3 py-1.5 text-[10px] font-semibold text-slate-500 hover:bg-white disabled:opacity-50">{olderQuery.isFetching ? "جارٍ تحميل الرسائل…" : "تحميل الرسائل السابقة"}<ChevronDown size={12}/></button>
                  {olderQuery.isError && <button onClick={() => olderQuery.refetch()} className="mx-auto block text-xs font-bold text-rose-700">تعذر تحميل الرسائل السابقة — إعادة المحاولة</button>}
                  {allMessages.map(message => <MessageBubble key={message.id} message={message} mine={message.sender_id === user?.id} token={token} onEdit={() => { setEditing(message); setText(message.text ?? ""); }} onDelete={() => removeMessage(message)}/>)}
                </div>}
              </div>
              {messages.length > 5 && <button onClick={() => scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: "smooth" })} className="absolute bottom-3 end-5 flex h-8 w-8 items-center justify-center rounded-full border border-[#dfe6df] bg-white text-slate-500 shadow-sm"><ArrowDown size={15}/></button>}
            </div>
            <form onSubmit={submitMessage} className="border-t border-[#e5e9e2] bg-[#fbfbf8] p-3 md:px-5 md:py-4">
              {editing && <div className="mb-2 flex items-center justify-between rounded-lg bg-[#edf4ef] px-3 py-1.5 text-xs text-[#426f62]"><span>تعديل الرسالة</span><button type="button" onClick={() => { setEditing(null); setText(""); }} aria-label="إلغاء التعديل"><X size={14}/></button></div>}
              <div className="flex items-end gap-2 rounded-[18px] border border-[#e2e8e0] bg-white p-2 shadow-[0_3px_12px_rgba(34,68,58,.04)] transition focus-within:border-[#a4c6b6]">
                <button type="button" onClick={recordVoice} disabled={send.isPending || uploadVoice.isPending} title={recording ? "إيقاف التسجيل" : "تسجيل رسالة صوتية"} className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition ${recording ? "animate-pulse bg-rose-100 text-rose-600" : "text-[#68877d] hover:bg-[#edf5f0]"}`} data-testid="button-record-voice">{recording ? <MicOff size={18}/> : <Mic size={18}/>}</button>
                <textarea value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void submitMessage(e as any); } }} rows={1} maxLength={4000} placeholder="اكتب رسالة..." className="max-h-28 min-h-10 flex-1 resize-y bg-transparent px-1 py-2.5 text-sm leading-5 text-[#254050] outline-none placeholder:text-slate-400" data-testid="input-chat-message"/>
                <button type="submit" disabled={!text.trim() || send.isPending || editMessage.isPending} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#1d756f] text-white transition hover:bg-[#165e59] disabled:cursor-not-allowed disabled:bg-[#c8d8d1]" aria-label={editing ? "حفظ التعديل" : "إرسال الرسالة"} data-testid="button-send-message">{send.isPending || editMessage.isPending ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"/> : <Send size={16}/>}</button>
              </div>
              <div className="mt-2 flex items-center justify-between px-1 text-[10px] text-slate-400"><span>{recording ? "التسجيل جارٍ — اضغط لإيقافه" : "Enter للإرسال · Shift + Enter لسطر جديد"}</span><span>{text.length}/4000</span></div>
            </form>
          </> : <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
            <div className="relative mb-6 flex h-24 w-24 items-center justify-center rounded-[32px] border border-[#dce8df] bg-[#e8f1e9] text-[#4b8475]"><MessageCircle size={37}/><span className="absolute -bottom-1 -start-1 flex h-9 w-9 items-center justify-center rounded-2xl border-4 border-[#f7f6f1] bg-[#1d756f] text-white"><Headphones size={15}/></span></div>
            <p className="mb-2 text-[10px] font-bold tracking-[.18em] text-[#6c9283]">MKGH · تواصل داخلي</p><h2 className="text-2xl font-black tracking-tight text-[#18334a]">التنسيق يبدأ من هنا</h2><p className="mt-2 max-w-sm text-sm leading-7 text-slate-500">مساحة خاصة تجمع السائقين والمشرفين والمستودع والمالية — من دون تغيير سير الطلبات أو الحسابات.</p><button onClick={event => openContactPicker(event.currentTarget)} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#1d756f] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#165e59]"><Plus size={16}/>ابدأ محادثة</button>
            <div className="mt-10 grid w-full max-w-lg grid-cols-3 gap-3 text-center"><InfoPillar title="رسائل نصية" caption="تحديثات واضحة"/><InfoPillar title="رسائل صوتية" caption="سريعة أثناء الحركة"/><InfoPillar title="مكالمات مباشرة" caption="صوت أو فيديو"/></div>
          </div>}
        </section>
      </div>
       {showNew && <div
         ref={contactPickerRef}
         className="fixed z-[90] max-h-[calc(100dvh-1.5rem)] overflow-hidden rounded-[22px] border border-[#e2e8e1] bg-[#fcfcf9] shadow-2xl"
         style={{ top: pickerPosition.top, left: pickerPosition.left, width: pickerPosition.width }}
       >
          <div className="flex items-center justify-between border-b border-[#e8ebe5] px-5 py-4"><div><h2 className="font-extrabold text-[#18334a]">محادثة جديدة</h2><p className="mt-1 text-xs text-slate-500">{customerMode ? "اختر مشرفاً أو مندوباً مسموحاً به" : "اختر زميلاً أو عميلاً لبدء محادثة مباشرة"}</p></div><button onClick={() => setShowNew(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100" aria-label="إغلاق"><X size={18}/></button></div>
          <div className="p-4"><div className="relative mb-3"><Search size={15} className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-400"/><input value={contactSearch} onChange={e => setContactSearch(e.target.value)} autoFocus placeholder="ابحث بالاسم أو الوظيفة أو رقم الجوال..." aria-label="البحث عن شخص" aria-controls="new-chat-contact-list" className="w-full rounded-xl border border-[#e4e9e1] bg-white py-2.5 pe-9 ps-3 text-sm outline-none focus:border-[#9dbfb1]" data-testid="input-contact-search"/></div>
          <div id="new-chat-contact-list" role="listbox" aria-label="جهات التواصل" className="chat-scroll max-h-[min(340px,calc(100dvh-10rem))] overflow-y-auto">
            {!canQueryChat
              ? <div className="py-10 text-center text-sm text-slate-500">{user && !user.isGuest && user.id <= 0 ? "هذا الحساب لا يملك هوية مستخدم للمحادثات" : "سجّل الدخول لعرض جهات التواصل"}</div>
              : contactsQuery.isLoading
                ? [1, 2, 3].map(i => <div key={i} className="mb-2 h-14 animate-pulse rounded-xl bg-[#f0f2ed]"/>)
                : contactsQuery.isError && !contactsQuery.data
                  ? <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-slate-500"><span>تعذر تحميل جهات التواصل</span><button onClick={() => { void contactsQuery.refetch(); }} className="rounded-lg border border-[#dce8df] px-3 py-1.5 text-xs font-bold text-[#1d756f] hover:bg-[#eef5f0]">إعادة المحاولة</button></div>
                  : contacts.length
                    ? contacts.map(contact => <button key={contact.id} role="option" aria-selected="false" onClick={() => beginConversation(contact.id)} disabled={createConversation.isPending} className="flex w-full items-center gap-3 rounded-xl px-2.5 py-3 text-start transition hover:bg-[#eef5f0] disabled:opacity-60" data-testid={`button-start-chat-${contact.id}`}><Avatar name={contact.name}/><span className="min-w-0 flex-1"><span className="flex min-w-0 items-center gap-2"><span className="truncate text-sm font-bold text-[#234154]">{contact.name}</span><span data-testid={`text-contact-role-${contact.id}`} className="shrink-0 rounded-full bg-[#edf4ef] px-2 py-0.5 text-[10px] font-bold text-[#527569]">{roleName(contact.role)}</span></span><span className="mt-1 block text-xs text-slate-500"><span dir="ltr">{contact.phone}</span></span></span><ArrowRight size={15} className="text-slate-300"/></button>)
                    : <div className="py-10 text-center text-sm text-slate-500">لا توجد جهات تواصل مطابقة</div>}
          </div></div>
       </div>}
      {showSettings && <NotificationSettings token={token} onClose={() => setShowSettings(false)}/>}
      {showCustomerAccess && <CustomerChatAccessModal token={token} onClose={() => setShowCustomerAccess(false)}/>}
      {call && <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#112d3d]/45 p-4 backdrop-blur-sm"><div className="w-full max-w-sm rounded-[28px] border border-white/60 bg-[#fbfcf8] p-6 text-center shadow-2xl">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[22px] bg-[#e6f1eb] text-[#1d756f]">{call.type === "video" ? <Video size={25}/> : <PhoneCall size={24}/>}</div><p className="text-xs font-semibold text-[#6d9182]">{call.type === "video" ? "مكالمة فيديو" : "مكالمة صوتية"}</p><h3 className="mt-1 text-lg font-black text-[#18334a]">{call.name ?? active?.other_user_name ?? "مكالمة"}</h3><p className="mt-2 text-sm text-slate-500">{callStatus}</p>
        <video autoPlay muted playsInline ref={el => { if (el && localStreamRef.current) el.srcObject = localStreamRef.current; }} className={`${call.type === "video" ? "mt-4 block" : "hidden"} w-full rounded-2xl bg-slate-900`}/>
        <video autoPlay playsInline ref={remoteVideoRef} className={`${call.type === "video" ? "mt-2 block max-h-64 w-full rounded-2xl bg-slate-900" : "hidden"}`}/>
        <audio autoPlay ref={remoteAudioRef} className="hidden"/>
        {call.incoming ? <div className="mt-6 flex gap-3"><button onClick={() => answerCall(false)} className="flex-1 rounded-xl border border-[#e2e7e0] py-3 text-sm font-bold text-slate-600">رفض</button><button onClick={() => answerCall(true)} className="flex-1 rounded-xl bg-[#1d756f] py-3 text-sm font-bold text-white">قبول</button></div> : <button onClick={() => finishCall()} className="mt-6 w-full rounded-xl bg-rose-600 py-3 text-sm font-bold text-white transition hover:bg-rose-700">إنهاء المكالمة</button>}
      </div></div>}
    </div>
  );
}

function ConversationRow({ conversation, active, onClick }: { conversation: ChatConversation; active: boolean; onClick: () => void }) {
  const latest = conversation.last_message;
  return <button onClick={onClick} className={`mb-1 flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-start transition ${active ? "bg-[#eaf3ed] shadow-[inset_-3px_0_0_#1d756f]" : "hover:bg-[#f3f5f0]"}`} data-testid={`conversation-${conversation.id}`}>
    <Avatar name={conversation.other_user_name}/><span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><span className="flex min-w-0 items-center gap-1.5"><span className="truncate text-[13px] font-extrabold text-[#274659]">{conversation.other_user_name}</span><span data-testid={`text-conversation-role-${conversation.id}`} className="shrink-0 rounded-full bg-[#edf4ef] px-1.5 py-0.5 text-[9px] font-bold text-[#527569]">{roleName(conversation.other_user_role)}</span></span><span className="shrink-0 text-[10px] text-slate-400">{latest ? timeLabel(latest.created_at) : dateLabel(conversation.updated_at)}</span></span><span className="mt-1 flex items-center justify-between gap-2"><span className="truncate text-xs text-slate-500">{latest?.type === "voice" ? "رسالة صوتية" : latest?.text || "محادثة جديدة"}</span>{conversation.unread_count > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#1d756f] px-1 text-[10px] font-bold text-white">{conversation.unread_count}</span>}</span></span>
  </button>;
}
function Avatar({ name }: { name: string }) {
  const colors = ["bg-[#e9eee5] text-[#577767]", "bg-[#e8edf0] text-[#557485]", "bg-[#f0ebe2] text-[#947955]", "bg-[#eee9ef] text-[#7d6884]"];
  const idx = name.charCodeAt(0) % colors.length;
  return <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] text-sm font-black ${colors[idx]}`}>{initials(name)}</span>;
}
function InfoPillar({ title, caption }: { title: string; caption: string }) {
  return <div className="rounded-2xl border border-[#e5e9e2] bg-white/75 px-2 py-3"><div className="text-xs font-bold text-[#31576a]">{title}</div><div className="mt-1 text-[10px] text-slate-400">{caption}</div></div>;
}
function MessageBubble({ message, mine, token, onEdit, onDelete }: { message: ChatMessage; mine: boolean; token: string | null; onEdit: () => void; onDelete: () => void }) {
  const [menu, setMenu] = useState(false);
  return <div className={`chat-message-in flex ${mine ? "justify-start" : "justify-end"}`} data-testid={`message-${message.id}`}>
    <div className={`group relative max-w-[86%] rounded-[19px] px-3.5 py-2.5 shadow-[0_2px_8px_rgba(34,68,58,.04)] sm:max-w-[75%] ${mine ? "rounded-tr-sm border border-[#d7e8dc] bg-[#e9f4ec] text-[#25483c]" : "rounded-tl-sm border border-white bg-white text-[#294353]"}`}>
      {!mine && <div className="mb-1 text-[10px] font-extrabold text-[#729082]">{message.sender_name}</div>}
      {message.type === "voice" ? <VoiceBubble message={message} token={token}/> : <p className="whitespace-pre-wrap break-words text-[13px] leading-6">{message.text}</p>}
      <div className={`mt-1 flex items-center gap-1.5 text-[9px] ${mine ? "text-[#719184]" : "text-slate-400"}`}><span>{timeLabel(message.created_at)}</span>{message.edited_at && <span>معدّلة</span>}{mine && <CheckCheck size={12}/>}</div>
      {mine && message.type === "text" && <div className="absolute -top-2 start-1 hidden items-center gap-0.5 rounded-lg border border-[#e3e9e1] bg-white p-0.5 shadow-sm group-hover:flex group-focus-within:flex"><button onClick={onEdit} title="تعديل" className="rounded p-1 text-slate-400 hover:bg-[#edf4ef] hover:text-[#1d756f]"><MoreHorizontal size={13}/></button><button onClick={onDelete} title="حذف" className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={12}/></button></div>}
    </div>
  </div>;
}

function NotificationSettings({ token, onClose }: { token: string | null; onClose: () => void }) {
  const headers = useMemo(() => auth(token), [token]);
  const client = useQueryClient();
  const settingsQuery = useGetChatNotificationSettings({ query: { queryKey: getGetChatNotificationSettingsQueryKey() }, request: { headers } });
  const keyQuery = useGetChatPushPublicKey({ query: { queryKey: getGetChatPushPublicKeyQueryKey() }, request: { headers } });
  const update = useUpdateChatNotificationSettings({ request: { headers } });
  const register = useRegisterChatPushSubscription({ request: { headers } });
  const remove = useRemoveChatPushSubscription({ request: { headers } });
  const settings = settingsQuery.data ?? { messages_enabled: true, orders_enabled: true };
  const [notice, setNotice] = useState("");
  async function toggleBrowser(enabled: boolean) {
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) throw new Error("المتصفح لا يدعم الإشعارات.");
      if (enabled) {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") throw new Error("لم يتم منح إذن الإشعارات.");
        const sw = await navigator.serviceWorker.ready;
        const publicKey = keyQuery.data?.public_key;
        if (!publicKey) throw new Error("مفتاح الإشعارات غير متاح.");
        const subscription = await sw.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeKey(publicKey) });
        const json = subscription.toJSON();
        if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new Error("تعذر إعداد اشتراك الإشعارات.");
        await register.mutateAsync({ data: { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } } });
      } else {
        const sw = await navigator.serviceWorker.ready;
        const subscription = await sw.pushManager.getSubscription();
        if (subscription) {
          await remove.mutateAsync({ data: { endpoint: subscription.endpoint } });
          await subscription.unsubscribe();
        }
      }
      setNotice(enabled ? "تم تفعيل إشعارات المتصفح." : "تم إيقاف إشعارات المتصفح.");
    } catch (e) { setNotice((e as Error).message); }
  }
  async function change(key: "messages_enabled" | "orders_enabled", value: boolean) {
    const data = { ...settings, [key]: value };
    try {
      await update.mutateAsync({ data });
      client.setQueryData(getGetChatNotificationSettingsQueryKey(), data);
    } catch { setNotice("تعذر حفظ التفضيلات."); }
  }
  return <div className="fixed inset-0 z-[85] flex items-center justify-center bg-[#122b3b]/35 p-4 backdrop-blur-[2px]" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><div className="w-full max-w-md overflow-hidden rounded-[24px] border border-[#e2e8e1] bg-[#fcfcf9] shadow-2xl">
    <div className="flex items-center justify-between border-b border-[#e8ebe5] px-5 py-4"><div><h2 className="font-extrabold text-[#18334a]">تفضيلات الإشعارات</h2><p className="mt-1 text-xs text-slate-500">تحكم بتنبيهات المحادثات والطلبات</p></div><button onClick={onClose} aria-label="إغلاق" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={18}/></button></div>
    <div className="space-y-2 p-4">
      <PreferenceRow icon={<MessageCircle size={17}/>} title="رسائل المحادثات" description="تنبيهات الرسائل الداخلية" checked={settings.messages_enabled} disabled={settingsQuery.isLoading || update.isPending} onChange={v => void change("messages_enabled", v)}/>
      <PreferenceRow icon={<Bell size={17}/>} title="تحديثات الطلبات" description="إشعارات سير الطلبات" checked={settings.orders_enabled} disabled={settingsQuery.isLoading || update.isPending} onChange={v => void change("orders_enabled", v)}/>
      <div className="mt-4 rounded-2xl border border-[#e5e9e2] bg-white p-4"><div className="flex items-start gap-3"><div className="rounded-xl bg-[#edf4ef] p-2 text-[#588477]"><Bell size={17}/></div><div className="flex-1"><div className="text-sm font-bold text-[#29485a]">إشعارات المتصفح</div><p className="mt-1 text-xs leading-5 text-slate-500">تصل حتى عند إغلاق صفحة النظام. سيطلب المتصفح الإذن عند التفعيل فقط.</p></div><button onClick={() => void toggleBrowser(true)} disabled={register.isPending} className="rounded-lg bg-[#1d756f] px-3 py-2 text-xs font-bold text-white disabled:opacity-60">{register.isPending ? "جارٍ…" : "تفعيل"}</button></div>
        <button onClick={() => void toggleBrowser(false)} disabled={remove.isPending} className="mt-3 inline-flex items-center gap-1.5 px-1 text-xs font-semibold text-slate-500 hover:text-rose-600"><BellOff size={13}/>إيقاف على هذا الجهاز</button></div>
      {notice && <p role="status" className="rounded-lg bg-[#edf4ef] px-3 py-2 text-xs text-[#426f62]">{notice}</p>}
      <div className="flex items-start gap-2 px-1 pt-1 text-[10px] leading-5 text-slate-400"><CircleHelp size={13} className="mt-0.5 shrink-0"/>تفضيل رسائل المحادثات منفصل عن إعداد تحديثات الطلبات.</div>
    </div>
  </div></div>;
}
function PreferenceRow({ icon, title, description, checked, disabled, onChange }: { icon: React.ReactNode; title: string; description: string; checked: boolean; disabled: boolean; onChange: (v: boolean) => void }) {
  return <div className="flex items-center gap-3 rounded-2xl border border-[#e5e9e2] bg-white p-4"><div className="rounded-xl bg-[#edf4ef] p-2.5 text-[#588477]">{icon}</div><div className="flex-1"><div className="text-sm font-bold text-[#29485a]">{title}</div><p className="mt-1 text-xs text-slate-500">{description}</p></div><button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)} className={`relative h-6 w-11 rounded-full transition ${checked ? "bg-[#1d756f]" : "bg-slate-300"} disabled:opacity-50`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? "start-1" : "start-6"}`}/></button></div>;
}
function decodeKey(key: string) {
  const padding = "=".repeat((4 - key.length % 4) % 4);
  const raw = atob((key + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, character => character.charCodeAt(0));
}

export default function ChatPage() {
  return <ChatPageContent/>;
}