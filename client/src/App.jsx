import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import { 
  MessageSquare, Users, User, Plus, Send, Image, Mic, Square, Trash2, 
  Video, Phone, PhoneOff, MicOff, VideoOff, Edit, X, Compass, Award, 
  BookOpen, LogOut, CheckCircle, Mail, Key, ShieldAlert,
  Info, UserPlus, Ban, AlertTriangle, Check, ChevronDown, ChevronLeft, Search, Menu, Gamepad2
} from 'lucide-react';

import { ANIMALS_LIST } from './animals';

// Level Tiers Helper
const getLevelTier = (level) => {
  if (level >= 20) return { name: 'Diamond', class: 'level-diamond' };
  if (level >= 15) return { name: 'Platinum', class: 'level-platinum' };
  if (level >= 10) return { name: 'Gold', class: 'level-gold' };
  if (level >= 5) return { name: 'Silver', class: 'level-silver' };
  return { name: 'Bronze', class: 'level-bronze' };
};

export default function App() {
  // Authentication & Profile States
  const [token, setToken] = useState(localStorage.getItem('h70_token') || null);
  const [user, setUser] = useState(null);
  const [authScreen, setAuthScreen] = useState(localStorage.getItem('h70_token') ? null : 'login');
  
  // Auth Form Inputs
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authNickname, setAuthNickname] = useState('');
  const [authConfirmPassword, setAuthConfirmPassword] = useState('');
  const [resetToken, setResetToken] = useState(null);
  const [authError, setAuthError] = useState('');
  const [authSuccess, setAuthSuccess] = useState('');
  const [devEmailResetLink, setDevEmailResetLink] = useState(null);

  // App Layout States
  const [currentNav, setCurrentNav] = useState('chat'); // 'home', 'chat', 'people'
  const [activeTab, setActiveTab] = useState('rooms'); // 'rooms', 'dms', 'online'
  const [activeUserPopup, setActiveUserPopup] = useState(null); // clicked user for action dialog popup
  const [peopleTab, setPeopleTab] = useState('friends'); // 'friends', 'requests', 'blocked', 'add'
  const [peopleSearchInput, setPeopleSearchInput] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [dmContacts, setDmContacts] = useState([]); // userIds with DM history
  const [viewingRoomMembers, setViewingRoomMembers] = useState(false); // group members panel

  // Create Room Modal options (screenshot 2)
  const [isPrivateRoom, setIsPrivateRoom] = useState(true);
  const [isPasswordProtected, setIsPasswordProtected] = useState(false);
  const [isSubmittedToSearch, setIsSubmittedToSearch] = useState(false);
  const [roomPassword, setRoomPassword] = useState('');
  const [isReadInfoPanelOpen, setIsReadInfoPanelOpen] = useState(false);

  const [onlineUsers, setOnlineUsers] = useState([]);
  const [registeredUsers, setRegisteredUsers] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [currentChat, setCurrentChat] = useState(null); // { type: 'room'|'dm', id, name|nickname }
  const [messages, setMessages] = useState([]);
  const [msgText, setMsgText] = useState('');

  // Right sidebar drawer (clicked user profile or room settings)
  const [selectedProfileUser, setSelectedProfileUser] = useState(null);
  const [viewingRoomSettings, setViewingRoomSettings] = useState(false);
  const [isBioEditing, setIsBioEditing] = useState(false);
  const [bioInput, setBioInput] = useState('');

  // Story States
  const [storiesViewer, setStoriesViewer] = useState(null); // { userId, stories, index }
  const [isAddingStory, setIsAddingStory] = useState(false);
  const [storyType, setStoryType] = useState('text'); // 'text' or 'image'
  const [storyContent, setStoryContent] = useState('');
  const [storyFile, setStoryFile] = useState(null);
  const [isEmojiOpen, setIsEmojiOpen] = useState(false);
  const [isGifOpen, setIsGifOpen] = useState(false);
  const [isGameSelectorOpen, setIsGameSelectorOpen] = useState(false);
  const [activeToast, setActiveToast] = useState(null);
  const [roomSearchInput, setRoomSearchInput] = useState('');
  const [theme, setTheme] = useState(localStorage.getItem('h70_theme') || 'dark');
  const [typingUsers, setTypingUsers] = useState([]);
  const isTypingRef = useRef(false);
  // Voice Message States
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingIntervalRef = useRef(null);

  // Modals
  const [isCreateRoomOpen, setIsCreateRoomOpen] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [lightboxImage, setLightboxImage] = useState(null);

  // WebRTC Calling States
  // 1-on-1 DMs Calls
  const [callState, setCallState] = useState(null); // { status: 'ringing'|'incoming'|'connected', to|from, isVideo, nickname }
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);

  // Room Calls (Mesh Audio/Video Session)
  const [isInRoomCall, setIsInRoomCall] = useState(false);
  const [roomCallParticipants, setRoomCallParticipants] = useState([]); // Array of { socketId, userId, nickname, stream }
  const roomCallStreamsRef = useRef({}); // socketId -> MediaStream
  const roomCallPCsRef = useRef({}); // socketId -> RTCPeerConnection

  // Refs
  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);

  const [unreadCounts, setUnreadCounts] = useState({});
  const [roomUnreadCounts, setRoomUnreadCounts] = useState({});
  const totalUnread = Object.values(unreadCounts).reduce((sum, count) => sum + count, 0);

  const currentChatRef = useRef(currentChat);
  useEffect(() => {
    currentChatRef.current = currentChat;
  }, [currentChat]);

  useEffect(() => {
    setTypingUsers([]);
    isTypingRef.current = false;
  }, [currentChat]);

  useEffect(() => {
    if (theme === 'light') {
      document.documentElement.classList.add('light-theme');
    } else {
      document.documentElement.classList.remove('light-theme');
    }
    localStorage.setItem('h70_theme', theme);
  }, [theme]);

  useEffect(() => {
    if (activeToast) {
      const t = setTimeout(() => setActiveToast(null), 4000);
      return () => clearTimeout(t);
    }
  }, [activeToast]);

  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const roomsRef = useRef(rooms);
  useEffect(() => {
    roomsRef.current = rooms;
  }, [rooms]);

  const onlineUsersRef = useRef(onlineUsers);
  useEffect(() => {
    onlineUsersRef.current = onlineUsers;
  }, [onlineUsers]);

  const playAlertSound = () => {
    if (userRef.current?.notificationsEnabled === false) return;
    try {
      const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2568/2568-84.wav');
      audio.volume = (userRef.current?.soundLevel || 80) / 100;
      audio.play();
    } catch (e) {
      console.error('Failed to play alert sound:', e);
    }
  };

  const isPopStateRef = useRef(false);

  // Sync state with browser history (popstate / back button)
  useEffect(() => {
    // Initial state setup
    window.history.replaceState({ nav: currentNav, chatId: currentChat?.id, chatType: currentChat?.type }, '');

    const handlePopState = (event) => {
      if (event.state) {
        const { nav, chatId, chatType } = event.state;
        isPopStateRef.current = true;
        setCurrentNav(nav || 'home');
        if (chatId) {
          if (chatType === 'room') {
            const roomObj = roomsRef.current.find(r => r.id === chatId);
            if (roomObj) {
              setCurrentChat({ 
                type: 'room', 
                id: roomObj.id, 
                name: roomObj.name, 
                admins: roomObj.admins || [], 
                avatar: roomObj.avatar || null, 
                creatorId: roomObj.creatorId || null 
              });
            } else {
              setCurrentChat({ type: 'room', id: chatId, name: 'Lounge' });
            }
          } else {
            const userObj = onlineUsersRef.current.find(u => u.id === chatId);
            if (userObj) {
              setCurrentChat({ type: 'dm', id: userObj.id, nickname: userObj.nickname });
            } else {
              setCurrentChat({ type: 'dm', id: chatId, nickname: 'User' });
            }
          }
        } else {
          setCurrentChat(null);
        }
      } else {
        isPopStateRef.current = true;
        setCurrentNav('home');
        setCurrentChat(null);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Whenever nav or chat changes, push state if not popstate
  useEffect(() => {
    if (isPopStateRef.current) {
      isPopStateRef.current = false;
      return;
    }
    const state = { nav: currentNav, chatId: currentChat?.id, chatType: currentChat?.type };
    window.history.pushState(state, '');
  }, [currentNav, currentChat]);

  // Parse reset password token from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenParam = params.get('token');
    if (tokenParam) {
      setResetToken(tokenParam);
      setAuthScreen('reset');
      // Strip URL params
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // Fetch all registered users for room settings member status comparison
  const fetchAllUsers = async () => {
    try {
      const res = await fetch('/api/users');
      const data = await res.json();
      if (res.ok) {
        setRegisteredUsers(data);
      }
    } catch (err) {
      console.error('Error fetching registered users:', err);
    }
  };

  useEffect(() => {
    if (viewingRoomSettings) {
      fetchAllUsers();
    }
  }, [viewingRoomSettings]);

  // Combine online and registered offline users for status grid
  const getCombinedUsersWithStatus = () => {
    return onlineUsers;
  };

  const formatLastSeen = (timestamp) => {
    if (!timestamp) return 'recently';
    const diffMs = Date.now() - new Date(timestamp).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return new Date(timestamp).toLocaleDateString();
  };

  const getFriendshipState = (targetUser) => {
    if (!user || !targetUser) return 'none';
    const addedThem = user.friends?.includes(targetUser.id);
    const addedMe = targetUser.friends?.includes(user.id);
    if (addedThem && addedMe) return 'friends';
    if (addedThem) return 'sent';
    if (addedMe) return 'received';
    return 'none';
  };

  const checkIsMutualFriend = (recipientId) => {
    if (!user) return false;
    if (user.friends?.includes(recipientId)) return true;
    const recipient = onlineUsers.find(u => u.id === recipientId);
    if (!recipient) return false;
    const addedThem = user.friends?.includes(recipientId);
    const addedMe = recipient.friends?.includes(user.id);
    return addedThem && addedMe;
  };

  const getDMConstraintMessage = () => {
    if (!currentChat || currentChat.type === 'room' || !user) return null;
    const recipient = onlineUsers.find(u => u.id === currentChat.id);
    if (!recipient) return null;

    const blockedMe = recipient.blockedUsers && recipient.blockedUsers.includes(user.id);
    if (blockedMe) return 'You cannot message this user because they blocked you.';
    
    const iBlockedThem = user.blockedUsers && user.blockedUsers.includes(recipient.id);
    if (iBlockedThem) return 'You blocked this user. Unblock them to message.';

    const isMutual = checkIsMutualFriend(recipient.id);
    if (recipient.privacyMode === 'private' && !isMutual) {
      return 'This user\'s profile is Private. You can only message them if you are mutual friends.';
    }

    return null;
  };

  // Fetch Current User on token change
  useEffect(() => {
    if (token) {
      fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(res => {
        if (!res.ok) throw new Error('Session expired');
        return res.json();
      })
      .then(data => {
        setUser(data);
        setAuthScreen(null);
        initializeSocket(token);
      })
      .catch(() => {
        handleLogout();
      });
    } else {
      // Initialize Socket as Guest if not logged in
      initializeSocket(null);
    }
  }, [token]);

  // Handle Socket.IO connection
  const initializeSocket = (userToken) => {
    if (socketRef.current) {
      socketRef.current.disconnect();
    }

    // Connect to backend (proxied or absolute fallback)
    const socket = io();
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Connected to socket server');
      // If no token, generate a random guest name on identification
      const guestNick = localStorage.getItem('h70_guest_nickname');
      socket.emit('identify', { token: userToken, guestNickname: guestNick });
    });

    socket.on('ready', ({ user: identUser, rooms: activeRooms, unreadCounts: initialCounts, dmContacts: initialDmContacts }) => {
      // Set user if guest or confirm logged in profile details
      if (!userToken) {
        setUser(identUser);
        localStorage.setItem('h70_guest_nickname', identUser.nickname);
      } else {
        setUser(prev => ({ ...prev, ...identUser }));
      }
      setRooms(activeRooms);
      setUnreadCounts(initialCounts || {});
      if (initialDmContacts) setDmContacts(initialDmContacts);

      // Land on active channels list on start
      setCurrentNav('chat');
      setActiveTab('rooms');
      setCurrentChat(null);
    });

    // DM contacts list (users with chat history)
    socket.on('dm-contacts', (contacts) => {
      setDmContacts(contacts || []);
    });

    socket.on('online-users', (users) => {
      setOnlineUsers(users);
    });

    socket.on('new-room-created', (room) => {
      setRooms(prev => [...prev, room]);
    });

    socket.on('rooms-updated', (updatedRooms) => {
      setRooms(updatedRooms);
      setCurrentChat(prev => {
        if (prev && prev.type === 'room') {
          const updated = updatedRooms.find(r => r.id === prev.id);
          if (updated) {
            return { ...prev, name: updated.name, admins: updated.admins, avatar: updated.avatar, creatorId: updated.creatorId || null };
          }
        }
        return prev;
      });
    });

    socket.on('room-admins-updated', ({ roomId, admins }) => {
      setRooms(prev => prev.map(r => r.id === roomId ? { ...r, admins } : r));
      setCurrentChat(prev => {
        if (prev && prev.type === 'room' && prev.id === roomId) {
          return { ...prev, admins };
        }
        return prev;
      });
    });

    socket.on('room-avatar-updated', ({ roomId, avatar }) => {
      setRooms(prev => prev.map(r => r.id === roomId ? { ...r, avatar } : r));
      setCurrentChat(prev => {
        if (prev && prev.type === 'room' && prev.id === roomId) {
          return { ...prev, avatar };
        }
        return prev;
      });
    });

    socket.on('kicked-from-room', ({ roomId }) => {
      setCurrentChat(prev => {
        if (prev && prev.type === 'room' && prev.id === roomId) {
          alert('You have been kicked from this room by a Supervisor.');
          socketRef.current?.emit('join-room', 'general');
          return {
            type: 'room',
            id: 'general',
            name: 'General Lounge',
            admins: [],
            avatar: null,
            creatorId: 'system'
          };
        }
        return prev;
      });
    });

    socket.on('room-deleted', (roomId) => {
      setCurrentChat(prev => {
        if (prev && prev.type === 'room' && prev.id === roomId) {
          alert('This room has been deleted.');
          socketRef.current?.emit('join-room', 'general');
          return {
            type: 'room',
            id: 'general',
            name: 'General Lounge',
            admins: [],
            avatar: null,
            creatorId: 'system'
          };
        }
        return prev;
      });
      setRooms(prev => prev.filter(r => r.id !== roomId));
    });

    socket.on('room-history', ({ roomId, messages: history }) => {
      setMessages(history);
    });

    socket.on('room-message', (msg) => {
      const currChat = currentChatRef.current;
      if (currChat && currChat.type === 'room' && currChat.id === msg.roomId) {
        setMessages(prev => {
          if (prev.some(m => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
      } else {
        setRoomUnreadCounts(prev => ({
          ...prev,
          [msg.roomId]: (prev[msg.roomId] || 0) + 1
        }));

        // Mute Room Check
        let isMuted = false;
        try {
          const mutedList = JSON.parse(localStorage.getItem('h70_muted_rooms') || '[]');
          isMuted = mutedList.includes(msg.roomId);
        } catch (e) {}

        if (!isMuted) {
          playAlertSound();

          // Notification Toast for Joined Rooms
          let isJoined = false;
          try {
            const joinedStr = localStorage.getItem('h70_joined_rooms');
            const joinedList = joinedStr ? JSON.parse(joinedStr) : [];
            isJoined = joinedList.includes(msg.roomId);
          } catch (e) {}

          if (isJoined) {
            const room = roomsRef.current.find(r => r.id === msg.roomId);
            if (room) {
              setActiveToast({
                title: `# ${room.name}`,
                content: `${msg.senderNickname}: ${msg.type === 'text' ? msg.content : '📷 Shared media'}`
              });
            }
          }
        }
      }
    });

    socket.on('direct-message', (msg) => {
      const currChat = currentChatRef.current;
      const currUser = userRef.current;
      const chatKey = [currUser?.id, msg.senderId === currUser?.id ? msg.recipientId : msg.senderId].sort().join('-');

      if (currChat && currChat.type === 'dm' && (currChat.id === msg.senderId || currChat.id === msg.recipientId)) {
        setMessages(prev => {
          if (prev.some(m => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
        if (msg.senderId !== currUser?.id) {
          socketRef.current?.emit('mark-message-read', { chatKey });
        }
      } else {
        if (msg.senderId !== currUser?.id) {
          setUnreadCounts(prev => ({
            ...prev,
            [msg.senderId]: (prev[msg.senderId] || 0) + 1
          }));
          playAlertSound();
        }
      }
    });

    socket.on('direct-history', ({ recipientId, messages: history }) => {
      setMessages(history);
    });

    socket.on('direct-message-updated-live', ({ msgId, content }) => {
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, content } : m));
    });

    socket.on('direct-message-views-updated-live', ({ msgId, viewsRemaining, content }) => {
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, viewsRemaining, content } : m));
    });

    socket.on('direct-message-error', ({ error }) => {
      alert(error);
    });

    socket.on('call-error', ({ error }) => {
      alert(error);
      cleanupCall();
    });

    socket.on('direct-history-updated', ({ chatKey, messages: updatedMsgs }) => {
      setMessages(prev => {
        const currChat = currentChatRef.current;
        const currUser = userRef.current;
        if (currChat && currChat.type === 'dm') {
          const currentKey = [currUser?.id, currChat.id].sort().join('-');
          if (currentKey === chatKey) {
            return updatedMsgs;
          }
        }
        return prev;
      });
    });

    socket.on('user-typing-state', ({ userId, isTyping }) => {
      setTypingUsers(prev => {
        if (isTyping) {
          if (prev.includes(userId)) return prev;
          return [...prev, userId];
        } else {
          return prev.filter(id => id !== userId);
        }
      });
    });

    // Level & XP update events
    socket.on('stats-updated', ({ xp, level }) => {
      setUser(prev => {
        if (!prev) return null;
        return { ...prev, xp, level };
      });
    });

    socket.on('level-up-alert', ({ level }) => {
      // Flash level-up alert using standard Web notification or modal
      alert(`🎉 Level Up! You reached Level ${level}! Keep active to level up further.`);
    });

    socket.on('user-story-updated', ({ userId, stories }) => {
      // Update onlineUsers stories
      setOnlineUsers(prev => prev.map(u => u.id === userId ? { ...u, stories } : u));
      // Update selected profile user if viewing
      setSelectedProfileUser(prev => {
        if (prev && prev.id === userId) {
          return { ...prev, stories };
        }
        return prev;
      });
    });

    // 1-on-1 Calling events
    socket.on('call-made', async ({ offer, from, fromNickname, type }) => {
      setCallState({
        status: 'incoming',
        from,
        nickname: fromNickname,
        isVideo: type === 'video',
        offer
      });
    });

    socket.on('answer-made', async ({ answer }) => {
      if (peerConnectionRef.current) {
        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
        setCallState(prev => ({ ...prev, status: 'connected' }));
      }
    });

    socket.on('ice-candidate', async ({ candidate }) => {
      if (peerConnectionRef.current) {
        try {
          await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.error('Error adding received ice candidate', e);
        }
      }
    });

    socket.on('call-rejected', () => {
      cleanupCall();
      alert('The call was declined.');
    });

    socket.on('call-hungup', () => {
      cleanupCall();
    });

    // Room Multi-peer WebRTC events
    socket.on('room-call-participants', async ({ participants }) => {
      // A new user has entered the room call. They must initiate offers to everyone currently in the call
      for (const p of participants) {
        await initiateRoomPeerConnection(p.socketId, p.nickname, p.userId, true);
      }
    });

    socket.on('user-joined-room-call', async ({ socketId, userId, nickname }) => {
      // An existing user in the room call gets notified of the newcomer. They will listen for the newcomer's offer
      setRoomCallParticipants(prev => {
        if (prev.some(p => p.socketId === socketId)) return prev;
        return [...prev, { socketId, userId, nickname, stream: null }];
      });
    });

    socket.on('user-left-room-call', ({ socketId }) => {
      if (roomCallPCsRef.current[socketId]) {
        roomCallPCsRef.current[socketId].close();
        delete roomCallPCsRef.current[socketId];
      }
      if (roomCallStreamsRef.current[socketId]) {
        delete roomCallStreamsRef.current[socketId];
      }
      setRoomCallParticipants(prev => prev.filter(p => p.socketId !== socketId));
    });
  };

  // Scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Clean up recording interval on unmount
  useEffect(() => {
    return () => {
      if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
    };
  }, []);

  // ----------------------------------------------------
  // AUTH FLOW ACTIONS
  // ----------------------------------------------------
  const handleRegister = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthSuccess('');

    if (authPassword !== authConfirmPassword) {
      return setAuthError('Passwords do not match');
    }

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: authEmail, password: authPassword, nickname: authNickname })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Registration failed');

      localStorage.setItem('h70_token', data.token);
      setToken(data.token);
      setAuthSuccess('Registration successful!');
    } catch (err) {
      setAuthError(err.message);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthSuccess('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: authEmail, password: authPassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed');

      localStorage.setItem('h70_token', data.token);
      setToken(data.token);
      setAuthSuccess('Logged in successfully!');
    } catch (err) {
      setAuthError(err.message);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthSuccess('');
    setDevEmailResetLink(null);

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: authEmail })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to request reset link');

      setAuthSuccess(data.message);
      if (data.devLink) {
        setDevEmailResetLink(data.devLink);
      }
    } catch (err) {
      setAuthError(err.message);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthSuccess('');

    if (authPassword !== authConfirmPassword) {
      return setAuthError('Passwords do not match');
    }

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: resetToken, password: authPassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to reset password');

      setAuthSuccess('Password reset successful! You can now log in.');
      setTimeout(() => {
        setAuthScreen('login');
        setResetToken(null);
      }, 2000);
    } catch (err) {
      setAuthError(err.message);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('h70_token');
    setToken(null);
    setUser(null);
    setAuthScreen('login');
    if (socketRef.current) socketRef.current.disconnect();
    initializeSocket(null); // Connect as guest
  };

  // Auto-mark DM messages as read
  useEffect(() => {
    if (currentChat && currentChat.type === 'dm' && socketRef.current && user) {
      const chatKey = [user.id, currentChat.id].sort().join('-');
      
      setUnreadCounts(prev => {
        if (prev[currentChat.id]) {
          return { ...prev, [currentChat.id]: 0 };
        }
        return prev;
      });

      const hasUnread = messages.some(m => m.senderId !== user.id && !m.read);
      if (hasUnread) {
        socketRef.current.emit('mark-message-read', { chatKey });
      }
    }
  }, [currentChat, messages, user]);

  // Change active sidebar chat
  const handleSelectChat = (item, type) => {
    setSelectedProfileUser(null);
    setViewingRoomSettings(false);
    setMobileMenuOpen(false);
    if (type === 'room') {
      setCurrentChat({ type: 'room', id: item.id, name: item.name, admins: item.admins || [], avatar: item.avatar || null, creatorId: item.creatorId || null });
      setMessages([]);
      setRoomUnreadCounts(prev => ({ ...prev, [item.id]: 0 }));

      // Save room ID to joined rooms list in localStorage
      try {
        const joinedStr = localStorage.getItem('h70_joined_rooms');
        let joinedList = joinedStr ? JSON.parse(joinedStr) : [];
        if (!joinedList.includes(item.id)) {
          joinedList.push(item.id);
          localStorage.setItem('h70_joined_rooms', JSON.stringify(joinedList));
        }
      } catch (err) {
        console.error('Failed to save joined rooms to localStorage', err);
      }

      socketRef.current?.emit('join-room', item.id);
    } else {
      setCurrentChat({ type: 'dm', id: item.id, nickname: item.nickname });
      setMessages([]);
      setUnreadCounts(prev => ({ ...prev, [item.id]: 0 }));
      
      const chatKey = [user?.id, item.id].sort().join('-');
      socketRef.current?.emit('mark-message-read', { chatKey });

      socketRef.current?.emit('get-direct-history', { recipientId: item.id });
    }
  };

  const handleUserClick = async (userId, nickname) => {
    const onlineMatch = onlineUsers.find(u => u.id === userId);
    if (onlineMatch) {
      setActiveUserPopup(onlineMatch);
      return;
    }
    try {
      const res = await fetch(`/api/users/${userId}`);
      if (!res.ok) throw new Error('Not found');
      const data = await res.json();
      setActiveUserPopup(data);
    } catch (e) {
      setActiveUserPopup({
        id: userId,
        nickname: nickname || 'Member',
        isOnline: false,
        level: 1,
        stories: []
      });
    }
  };

  const handleDeleteStory = async (storyId) => {
    if (!window.confirm('Are you sure you want to delete this story?')) return;
    try {
      const res = await fetch(`/api/profile/story/${storyId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete story');
      
      setUser(prev => ({ ...prev, stories: data.stories }));
      setSelectedProfileUser(prev => prev && prev.id === user?.id ? { ...prev, stories: data.stories } : prev);
      
      if (storiesViewer.stories.length <= 1) {
        setStoriesViewer(null);
      } else {
        const nextStories = storiesViewer.stories.filter(s => s.id !== storyId);
        const nextIndex = Math.min(storiesViewer.index, nextStories.length - 1);
        setStoriesViewer(prev => ({
          ...prev,
          stories: nextStories,
          index: nextIndex
        }));
      }
    } catch (err) {
      alert(err.message);
    }
  };

  // Stranger Match (Random DM)
  const handleRandomChat = () => {
    const candidates = onlineUsers.filter(u => u.id !== user?.id && u.role !== 'supervisor');
    if (candidates.length === 0) {
      alert('No other active users online right now for a random match. Invite some friends!');
      return;
    }
    const randomUser = candidates[Math.floor(Math.random() * candidates.length)];
    handleSelectChat(randomUser, 'dm');
  };

  // Create room modal
  const handleCreateRoom = (e) => {
    e.preventDefault();
    if (!newRoomName.trim()) return;

    socketRef.current?.emit('create-room', { name: newRoomName.trim() });
    setNewRoomName('');
    setIsCreateRoomOpen(false);
  };

  // Send message
  const handleSendMessage = () => {
    if (!msgText.trim() || !currentChat) return;

    if (currentChat.type === 'room') {
      socketRef.current?.emit('send-room-message', {
        roomId: currentChat.id,
        type: 'text',
        content: msgText.trim()
      });
    } else {
      socketRef.current?.emit('send-direct-message', {
        recipientId: currentChat.id,
        type: 'text',
        content: msgText.trim()
      });
      if (isTypingRef.current) {
        isTypingRef.current = false;
        socketRef.current?.emit('dm-typing', { recipientId: currentChat.id, isTyping: false });
      }
    }
    setMsgText('');
  };

  const handleTypingChange = (text) => {
    setMsgText(text);
    if (currentChat && currentChat.type === 'dm') {
      const currentlyTyping = text.trim().length > 0;
      if (isTypingRef.current !== currentlyTyping) {
        isTypingRef.current = currentlyTyping;
        socketRef.current?.emit('dm-typing', { recipientId: currentChat.id, isTyping: currentlyTyping });
      }
    }
  };

  const handleStartGame = () => {
    const gameState = {
      board: Array(9).fill(null),
      turn: 'X',
      xUserId: user?.id,
      oUserId: currentChat?.id,
      status: 'active'
    };
    
    const chatKey = [user?.id, currentChat?.id].sort().join('-');
    const newMsg = {
      id: 'msg_' + Math.random().toString(36).substring(2, 9),
      senderId: user?.id,
      senderNickname: user?.nickname,
      recipientId: currentChat?.id,
      chatKey,
      type: 'game_init',
      content: JSON.stringify(gameState),
      timestamp: new Date().toISOString()
    };
    
    socketRef.current?.emit('send-direct-message', newMsg);
    setMessages(prev => [...prev, newMsg]);
  };

  const handleGameMove = (msg, cellIndex) => {
    const WINNING_LINES = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8],
      [0, 3, 6], [1, 4, 7], [2, 5, 8],
      [0, 4, 8], [2, 4, 6]
    ];
    
    const checkWinner = (board) => {
      for (let line of WINNING_LINES) {
        const [a, b, c] = line;
        if (board[a] && board[a] === board[b] && board[a] === board[c]) {
          return board[a];
        }
      }
      if (board.every(cell => cell !== null)) return 'draw';
      return null;
    };

    let gameState;
    try {
      gameState = JSON.parse(msg.content);
    } catch (e) {
      return;
    }
    
    const isXTurn = gameState.turn === 'X';
    const currentTurnUserId = isXTurn ? gameState.xUserId : gameState.oUserId;
    if (currentTurnUserId !== user?.id) {
      alert("It's not your turn!");
      return;
    }
    
    const newBoard = [...gameState.board];
    newBoard[cellIndex] = gameState.turn;
    
    const winner = checkWinner(newBoard);
    let newStatus = 'active';
    if (winner === 'draw') {
      newStatus = 'draw';
    } else if (winner) {
      newStatus = 'won';
    }
    
    const updatedState = {
      board: newBoard,
      turn: isXTurn ? 'O' : 'X',
      xUserId: gameState.xUserId,
      oUserId: gameState.oUserId,
      status: newStatus,
      winner: winner
    };
    
    const chatKey = [user?.id, currentChat?.id].sort().join('-');
    const newMsg = {
      id: 'msg_' + Math.random().toString(36).substring(2, 9),
      senderId: user?.id,
      senderNickname: user?.nickname,
      recipientId: currentChat?.id,
      chatKey,
      type: 'game_init',
      content: JSON.stringify(updatedState),
      timestamp: new Date().toISOString()
    };
    
    socketRef.current?.emit('send-direct-message', newMsg);
    setMessages(prev => [...prev, newMsg]);
  };

  const handleStartTruthOrDare = () => {
    const gameState = {
      status: 'waiting',
      selection: null,
      prompt: null,
      initiatorId: user?.id,
      targetId: currentChat?.id
    };
    
    const chatKey = [user?.id, currentChat?.id].sort().join('-');
    const newMsg = {
      id: 'msg_' + Math.random().toString(36).substring(2, 9),
      senderId: user?.id,
      senderNickname: user?.nickname,
      recipientId: currentChat?.id,
      chatKey,
      type: 'game_truth_dare',
      content: JSON.stringify(gameState),
      timestamp: new Date().toISOString()
    };
    
    socketRef.current?.emit('send-direct-message', newMsg);
    setMessages(prev => [...prev, newMsg]);
  };

  const handleTruthOrDareChoice = (msg, choice) => {
    const truths = [
      "What is your biggest secret?",
      "Who is your crush in this app?",
      "What is the most embarrassing thing you've done?",
      "Have you ever lied to your best friend?",
      "What is your most useless talent?",
      "What is the worst gift you have ever received?",
      "What is your biggest fear?",
      "What is the weirdest food combination you eat?",
      "What is the most childish thing you still do?",
      "Have you ever pretended to be sick to avoid someone?"
    ];
    const dares = [
      "Send a funny selfie right now!",
      "Type your next 5 messages using only emojis!",
      "Sing a song on voice message!",
      "Reveal your secret nickname!",
      "Send a screenshot of your home screen!",
      "Say something super nice to me!",
      "Write a short poem about me right now!",
      "Tell a funny joke right now!",
      "Change your status to something embarrassing for 1 hour!",
      "Send me your most used emoji and explain why!"
    ];

    let gameState;
    try {
      gameState = JSON.parse(msg.content);
    } catch (e) {
      return;
    }

    const list = choice === 'truth' ? truths : dares;
    const randomPrompt = list[Math.floor(Math.random() * list.length)];

    const updatedState = {
      ...gameState,
      status: 'chosen',
      selection: choice,
      prompt: randomPrompt,
      choserNickname: user?.nickname
    };

    const chatKey = [user?.id, currentChat?.id].sort().join('-');
    const newContent = JSON.stringify(updatedState);

    // Update existing message in-place (no duplicate)
    socketRef.current?.emit('update-direct-message', { msgId: msg.id, chatKey, content: newContent });
    setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, content: newContent } : m));
  };

  const handleStartSpinBottle = () => {
    const recipientNickname = currentChat?.nickname || 'Member';
    const gameState = {
      status: 'spinning',
      result: null,
      initiatorId: user?.id,
      targetId: currentChat?.id,
      initiatorNickname: user?.nickname,
      targetNickname: recipientNickname,
      currentTurn: user?.id, // Initiator spins first
      spinCount: 0
    };
    
    const chatKey = [user?.id, currentChat?.id].sort().join('-');
    const newMsg = {
      id: 'msg_' + Math.random().toString(36).substring(2, 9),
      senderId: user?.id,
      senderNickname: user?.nickname,
      recipientId: currentChat?.id,
      chatKey,
      type: 'game_spin_bottle',
      content: JSON.stringify(gameState),
      timestamp: new Date().toISOString()
    };
    
    socketRef.current?.emit('send-direct-message', newMsg);
    setMessages(prev => [...prev, newMsg]);
  };

  const handleSpinBottleClick = (msg) => {
    let gameState;
    try {
      gameState = JSON.parse(msg.content);
    } catch (e) {
      return;
    }

    // Turn-based: only the current turn holder can spin
    const currentTurn = gameState.currentTurn || gameState.initiatorId;
    if (currentTurn !== user?.id) return; // Not your turn!

    const rand = Math.random() < 0.5 ? 'initiator' : 'target';
    // After spin, give next turn to the other player
    const nextTurn = user?.id === gameState.initiatorId ? gameState.targetId : gameState.initiatorId;
    const updatedState = {
      ...gameState,
      status: 'stopped',
      result: rand,
      currentTurn: nextTurn,
      spinCount: (gameState.spinCount || 0) + 1
    };

    const chatKey = [user?.id, currentChat?.id].sort().join('-');
    const newContent = JSON.stringify(updatedState);

    // Update existing message in-place (no duplicate)
    socketRef.current?.emit('update-direct-message', { msgId: msg.id, chatKey, content: newContent });
    setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, content: newContent } : m));
  };

  // Quick-spin: let one button instantly trigger spin if active spin message exists
  const handleQuickSpin = () => {
    const spinMsg = messages.slice().reverse().find(m => m.type === 'game_spin_bottle');
    if (spinMsg) {
      handleSpinBottleClick(spinMsg);
    } else {
      handleStartSpinBottle();
    }
  };

  const handleClearChat = async (e, contactId) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to clear all chat history with this user? This cannot be undone.')) return;
    try {
      const res = await fetch('/api/messages/clear', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ recipientId: contactId })
      });
      if (res.ok) {
        if (currentChat && currentChat.type === 'dm' && currentChat.id === contactId) {
          setMessages([]);
        }
        socketRef.current?.emit('get-dm-contacts');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Image Upload trigger
  const handleImageSelect = async (e, viewOnce = false) => {
    const file = e.target.files[0];
    if (!file || !currentChat) return;

    const formData = new FormData();
    formData.append('media', file);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');

      if (currentChat.type === 'room') {
        socketRef.current?.emit('send-room-message', {
          roomId: currentChat.id,
          type: 'image',
          content: data.url
        });
      } else {
        socketRef.current?.emit('send-direct-message', {
          recipientId: currentChat.id,
          type: viewOnce ? 'image_view_once' : 'image',
          content: data.url,
          viewsRemaining: viewOnce ? 1 : null
        });
      }
    } catch (err) {
      alert('Image upload failed: ' + err.message);
    }
    e.target.value = '';
  };

  // ----------------------------------------------------
  // VOICE MESSAGE RECORDING API
  // ----------------------------------------------------
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach(track => track.stop()); // Release mic

        if (audioChunksRef.current.length === 0) return;

        const file = new File([audioBlob], 'voice-message.webm', { type: 'audio/webm' });
        const formData = new FormData();
        formData.append('media', file);

        try {
          const res = await fetch('/api/upload', {
            method: 'POST',
            body: formData
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Upload failed');

          if (currentChat.type === 'room') {
            socketRef.current?.emit('send-room-message', {
              roomId: currentChat.id,
              type: 'audio',
              content: data.url
            });
          } else {
            socketRef.current?.emit('send-direct-message', {
              recipientId: currentChat.id,
              type: 'audio',
              content: data.url
            });
          }
        } catch (err) {
          alert('Failed to send voice message: ' + err.message);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      alert('Could not access microphone: ' + err.message);
    }
  };

  const stopRecording = (shouldSend = true) => {
    if (!mediaRecorderRef.current || !isRecording) return;

    clearInterval(recordingIntervalRef.current);
    setIsRecording(false);

    if (!shouldSend) {
      audioChunksRef.current = []; // Empty segments to cancel
    }
    mediaRecorderRef.current.stop();
  };

  // Format time (seconds to mm:ss)
  const formatTime = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // ----------------------------------------------------
  // PROFILE & STORY ACTIONS
  // ----------------------------------------------------
  const handleUpdateBio = async () => {
    try {
      const res = await fetch('/api/profile/bio', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ bio: bioInput })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setUser(prev => ({ ...prev, bio: data.bio }));
      setSelectedProfileUser(prev => prev ? { ...prev, bio: data.bio } : null);
      setIsBioEditing(false);
    } catch (err) {
      alert('Failed to update bio: ' + err.message);
    }
  };

  const handlePostStory = async (e) => {
    e.preventDefault();
    let content = storyContent;

    if (storyType === 'image') {
      if (!storyFile) return alert('Please select an image');
      const formData = new FormData();
      formData.append('media', storyFile);
      try {
        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formData
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        content = data.url;
      } catch (err) {
        return alert('Story image upload failed: ' + err.message);
      }
    }

    if (!content.trim()) return;

    try {
      const res = await fetch('/api/profile/story', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ type: storyType, content })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setUser(prev => ({ ...prev, stories: data.stories }));
      setSelectedProfileUser(prev => prev ? { ...prev, stories: data.stories } : null);
      setIsAddingStory(false);
      setStoryContent('');
      setStoryFile(null);
    } catch (err) {
      alert('Failed to post story: ' + err.message);
    }
  };

  // ----------------------------------------------------
  // WebRTC 1-ON-1 CALL HANDLERS
  // ----------------------------------------------------
  const startCall = async (isVideo) => {
    if (!currentChat || currentChat.type !== 'dm') return;

    const constraints = { audio: true, video: isVideo };
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setLocalStream(stream);

      // Create Ringing state
      setCallState({
        status: 'ringing',
        to: currentChat.id,
        nickname: currentChat.nickname,
        isVideo
      });

      const peerConnection = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });
      peerConnectionRef.current = peerConnection;

      stream.getTracks().forEach(track => peerConnection.addTrack(track, stream));

      peerConnection.ontrack = (event) => {
        setRemoteStream(event.streams[0]);
      };

      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          socketRef.current?.emit('ice-candidate', {
            to: currentChat.id,
            candidate: event.candidate
          });
        }
      };

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      socketRef.current?.emit('call-user', {
        to: currentChat.id,
        offer,
        type: isVideo ? 'video' : 'audio'
      });
    } catch (err) {
      alert('Camera or Microphone access denied: ' + err.message);
    }
  };

  const acceptCall = async () => {
    if (!callState || !callState.offer) return;

    const constraints = { audio: true, video: callState.isVideo };
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setLocalStream(stream);

      const peerConnection = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });
      peerConnectionRef.current = peerConnection;

      stream.getTracks().forEach(track => peerConnection.addTrack(track, stream));

      peerConnection.ontrack = (event) => {
        setRemoteStream(event.streams[0]);
      };

      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          socketRef.current?.emit('ice-candidate', {
            to: callState.from,
            candidate: event.candidate
          });
        }
      };

      await peerConnection.setRemoteDescription(new RTCSessionDescription(callState.offer));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      socketRef.current?.emit('make-answer', {
        to: callState.from,
        answer
      });

      setCallState(prev => ({ ...prev, status: 'connected' }));
    } catch (err) {
      alert('Camera or Microphone access denied: ' + err.message);
      declineCall();
    }
  };

  const declineCall = () => {
    if (callState) {
      const target = callState.from || callState.to;
      socketRef.current?.emit('reject-call', { to: target });
    }
    cleanupCall();
  };

  const hangUpCall = () => {
    if (callState) {
      const target = callState.from || callState.to;
      socketRef.current?.emit('hangup', { to: target });
    }
    cleanupCall();
  };

  const cleanupCall = () => {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
    }
    peerConnectionRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setCallState(null);
    setIsMicMuted(false);
    setIsCameraOff(false);
  };

  // Toggle controls during active 1-on-1 calls
  const toggleMute = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMicMuted(!audioTrack.enabled);
      }
    }
  };

  const toggleCamera = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsCameraOff(!videoTrack.enabled);
      }
    }
  };

  // Bind local/remote videos to elements when streams connect
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, callState]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream, callState]);


  // ----------------------------------------------------
  // WebRTC ROOM (MESH) CALL HANDLERS
  // ----------------------------------------------------
  const toggleRoomCall = async () => {
    if (!currentChat || currentChat.type !== 'room') return;

    if (isInRoomCall) {
      leaveRoomCall();
    } else {
      joinRoomCall();
    }
  };

  const joinRoomCall = async () => {
    try {
      // Default constraint: try video call
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      setLocalStream(stream);
      setIsInRoomCall(true);

      // Notify server signaling room
      socketRef.current?.emit('join-room-call', { roomId: currentChat.id, type: 'video' });
    } catch (err) {
      // Fallback to audio-only if video fails/unavailable
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        setLocalStream(audioStream);
        setIsInRoomCall(true);
        socketRef.current?.emit('join-room-call', { roomId: currentChat.id, type: 'audio' });
      } catch (err2) {
        alert('Failed to access microphone or camera: ' + err2.message);
      }
    }
  };

  const leaveRoomCall = () => {
    if (currentChat && currentChat.type === 'room') {
      socketRef.current?.emit('leave-room-call', { roomId: currentChat.id });
    }

    // Stop tracks
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }

    // Close all connections
    Object.values(roomCallPCsRef.current).forEach(pc => pc.close());
    roomCallPCsRef.current = {};
    roomCallStreamsRef.current = {};
    
    setLocalStream(null);
    setRoomCallParticipants([]);
    setIsInRoomCall(false);
  };

  const initiateRoomPeerConnection = async (targetSocketId, nickname, userId, isInitiator) => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    roomCallPCsRef.current[targetSocketId] = pc;

    // Add local tracks
    if (localStream) {
      localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    }

    // Track stream reception
    pc.ontrack = (event) => {
      const incomingStream = event.streams[0];
      roomCallStreamsRef.current[targetSocketId] = incomingStream;

      setRoomCallParticipants(prev => {
        return prev.map(p => {
          if (p.socketId === targetSocketId) {
            return { ...p, stream: incomingStream };
          }
          return p;
        });
      });
    };

    // Candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current?.emit('ice-candidate', {
          to: activeUsersIdBySocketId(targetSocketId), // Translate back to User ID
          candidate: event.candidate
        });
      }
    };

    if (isInitiator) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socketRef.current?.emit('call-user', {
        to: userId,
        offer,
        type: 'video'
      });
    }

    setRoomCallParticipants(prev => {
      if (prev.some(p => p.socketId === targetSocketId)) return prev;
      return [...prev, { socketId: targetSocketId, userId, nickname, stream: null }];
    });
  };

  // Helper translations
  const activeUsersIdBySocketId = (socketId) => {
    for (const u of onlineUsers) {
      // Find matching user
      // Note: mapping handled simple for sandbox
    }
    return '';
  };


  // Custom Voice message audio player hook
  const AudioPlayer = ({ src }) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState('0:00');
    const audioRef = useRef(null);

    const togglePlay = () => {
      if (!audioRef.current) return;
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    };

    const handleTimeUpdate = () => {
      if (!audioRef.current) return;
      const percent = (audioRef.current.currentTime / audioRef.current.duration) * 100;
      setProgress(percent);
    };

    const handleLoadedMetadata = () => {
      if (!audioRef.current) return;
      const mins = Math.floor(audioRef.current.duration / 60);
      const secs = Math.floor(audioRef.current.duration % 60).toString().padStart(2, '0');
      setDuration(`${mins}:${secs}`);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setProgress(0);
    };

    return (
      <div className="audio-message-player">
        <audio 
          ref={audioRef} 
          src={src} 
          onTimeUpdate={handleTimeUpdate} 
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={handleEnded}
        />
        <button className="audio-btn" onClick={togglePlay}>
          {isPlaying ? '⏸' : '▶'}
        </button>
        <div className="audio-progress">
          <div className="audio-fill" style={{ width: `${progress}%` }}></div>
        </div>
        <div className="audio-time">{duration}</div>
      </div>
    );
  };

  // ----------------------------------------------------
  // RENDER INTERFACE
  // ----------------------------------------------------

  // 1. Auth Page Wrapper (Login / Register / Forgot Password / Reset Password)
  if (authScreen) {
    return (
      <div className="auth-container">

        <div className="auth-card">
          <div className="auth-header">
            <div className="auth-logo">
              <MessageSquare size={36} strokeWidth={2.5} /> H70 Chat
            </div>
            <p className="auth-subtitle">
              {authScreen === 'login' && 'Sign in to access your chatrooms'}
              {authScreen === 'register' && 'Create your account & unlock levels'}
              {authScreen === 'forgot' && 'Reset your password'}
              {authScreen === 'reset' && 'Create a new secure password'}
            </p>
          </div>

          {authError && (
            <div style={{ padding: '0.75rem', background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', borderRadius: '10px', fontSize: '0.85rem', marginBottom: '1rem', border: '1px solid rgba(239,68,68,0.2)' }}>
              {authError}
            </div>
          )}

          {authSuccess && (
            <div style={{ padding: '0.75rem', background: 'rgba(16,185,129,0.1)', color: 'var(--success)', borderRadius: '10px', fontSize: '0.85rem', marginBottom: '1rem', border: '1px solid rgba(16,185,129,0.2)' }}>
              {authSuccess}
            </div>
          )}

          {authScreen === 'login' && (
            <form onSubmit={handleLogin}>
              <div className="auth-form-group">
                <label className="auth-label">Email Address</label>
                <input 
                  type="email" 
                  className="auth-input" 
                  value={authEmail} 
                  onChange={(e) => setAuthEmail(e.target.value)} 
                  placeholder="name@example.com"
                  required 
                />
              </div>
              <div className="auth-form-group">
                <label className="auth-label">Password</label>
                <input 
                  type="password" 
                  className="auth-input" 
                  value={authPassword} 
                  onChange={(e) => setAuthPassword(e.target.value)} 
                  placeholder="••••••••"
                  required 
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: '0.8rem', marginBottom: '1rem' }}>
                <span className="auth-link" onClick={() => { setAuthScreen('forgot'); setAuthError(''); setAuthSuccess(''); }}>Forgot password?</span>
              </div>
              <button type="submit" className="auth-button">Sign In</button>
            </form>
          )}

          {authScreen === 'register' && (
            <form onSubmit={handleRegister}>
              <div className="auth-form-group">
                <label className="auth-label">Nickname</label>
                <input 
                  type="text" 
                  className="auth-input" 
                  value={authNickname} 
                  onChange={(e) => setAuthNickname(e.target.value)} 
                  placeholder="ChattyStranger"
                  required 
                />
              </div>
              <div className="auth-form-group">
                <label className="auth-label">Email Address</label>
                <input 
                  type="email" 
                  className="auth-input" 
                  value={authEmail} 
                  onChange={(e) => setAuthEmail(e.target.value)} 
                  placeholder="name@example.com"
                  required 
                />
              </div>
              <div className="auth-form-group">
                <label className="auth-label">Password</label>
                <input 
                  type="password" 
                  className="auth-input" 
                  value={authPassword} 
                  onChange={(e) => setAuthPassword(e.target.value)} 
                  placeholder="••••••••"
                  required 
                />
              </div>
              <div className="auth-form-group">
                <label className="auth-label">Confirm Password</label>
                <input 
                  type="password" 
                  className="auth-input" 
                  value={authConfirmPassword} 
                  onChange={(e) => setAuthConfirmPassword(e.target.value)} 
                  placeholder="••••••••"
                  required 
                />
              </div>
              <button type="submit" className="auth-button">Sign Up</button>
            </form>
          )}

          {authScreen === 'forgot' && (
            <form onSubmit={handleForgotPassword}>
              <div className="auth-form-group">
                <label className="auth-label">Enter registered email address</label>
                <input 
                  type="email" 
                  className="auth-input" 
                  value={authEmail} 
                  onChange={(e) => setAuthEmail(e.target.value)} 
                  placeholder="name@example.com"
                  required 
                />
              </div>
              <button type="submit" className="auth-button">Send Reset Link</button>
            </form>
          )}

          {authScreen === 'reset' && (
            <form onSubmit={handleResetPassword}>
              <div className="auth-form-group">
                <label className="auth-label">New Password</label>
                <input 
                  type="password" 
                  className="auth-input" 
                  value={authPassword} 
                  onChange={(e) => setAuthPassword(e.target.value)} 
                  placeholder="••••••••"
                  required 
                />
              </div>
              <div className="auth-form-group">
                <label className="auth-label">Confirm New Password</label>
                <input 
                  type="password" 
                  className="auth-input" 
                  value={authConfirmPassword} 
                  onChange={(e) => setAuthConfirmPassword(e.target.value)} 
                  placeholder="••••••••"
                  required 
                />
              </div>
              <button type="submit" className="auth-button">Reset Password</button>
            </form>
          )}

          <div className="auth-footer">
            {authScreen === 'login' && (
              <>Don't have an account? <span className="auth-link" onClick={() => { setAuthScreen('register'); setAuthError(''); setAuthSuccess(''); }}>Register</span></>
            )}
            {authScreen === 'register' && (
              <>Already registered? <span className="auth-link" onClick={() => { setAuthScreen('login'); setAuthError(''); setAuthSuccess(''); }}>Sign In</span></>
            )}
            {(authScreen === 'forgot' || authScreen === 'reset') && (
              <>Back to <span className="auth-link" onClick={() => { setAuthScreen('login'); setAuthError(''); setAuthSuccess(''); }}>Sign In</span></>
            )}
            <div style={{ marginTop: '1rem', opacity: 0.5 }}>
              <span className="auth-link" onClick={() => setAuthScreen(null)}>Continue as anonymous guest</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 2. Chat Dashboard layout
  return (
    <div className={`app-layout ${mobileMenuOpen ? 'mobile-menu-open' : ''} ${currentNav === 'chat' && !currentChat ? 'chat-list-view' : ''}`}>
      {/* Mobile backdrop overlay - tap to close menu */}
      {mobileMenuOpen && (
        <div 
          className="mobile-overlay-backdrop"
          onClick={() => setMobileMenuOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 997, display: 'none' }}
        />
      )}
      {/* COLUMN 1: Far Left Vertical Navigation Bar */}
      <div className="vertical-nav-bar">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
          {/* Brand Logo Icon (Purple Circle matching the Royal/Teal accents) */}
          <div className="avatar-circle" style={{ width: '40px', height: '40px', background: 'var(--bg-accent)', color: '#fff', fontSize: '1.2rem', fontWeight: 800, marginBottom: '2rem', boxShadow: '0 0 10px rgba(124,77,255,0.4)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            H
          </div>

          <button className={`vertical-nav-btn ${currentNav === 'home' ? 'active' : ''}`} onClick={() => { setCurrentNav('home'); setMobileMenuOpen(false); }} title="Discover Feed">
            <Compass size={20} />
            <span>Discover</span>
          </button>

          <button className={`vertical-nav-btn ${currentNav === 'chat' ? 'active' : ''}`} onClick={() => { setCurrentNav('chat'); setMobileMenuOpen(false); }} title="Channels & Chat" style={{ position: 'relative' }}>
            <MessageSquare size={20} />
            <span>Chat</span>
            {totalUnread > 0 && (
              <span className="nav-unread-badge" style={{ position: 'absolute', top: '2px', right: '14px', background: '#ef4444', color: '#fff', fontSize: '0.62rem', fontWeight: 'bold', padding: '1px 5px', borderRadius: '8px' }}>
                {totalUnread}
              </span>
            )}
          </button>

          <button className={`vertical-nav-btn ${currentNav === 'people' ? 'active' : ''}`} onClick={() => { setCurrentNav('people'); setMobileMenuOpen(false); }} title="Social Friends & Blocks">
            <Users size={20} />
            <span>People</span>
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
          {/* Active logged-in user profile avatar button */}
          {user && (
            <div 
              className="avatar-circle" 
              style={{ width: '38px', height: '38px', cursor: 'pointer', overflow: 'hidden', border: '2px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: '1rem', position: 'relative' }}
              onClick={() => {
                setBioInput(user.bio || '');
                setSelectedProfileUser(user);
              }}
              title="View Profile Settings"
            >
              {user.avatar ? (
                <img src={user.avatar} alt={user.nickname} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                user.nickname?.substring(0, 2).toUpperCase()
              )}
            </div>
          )}

          {token ? (
            <button className="vertical-nav-btn" onClick={handleLogout} title="Log Out" style={{ marginBottom: 0 }}>
              <LogOut size={18} />
            </button>
          ) : (
            <button className="vertical-nav-btn" onClick={() => setAuthScreen('login')} title="Register / Sign In" style={{ marginBottom: 0 }}>
              <Users size={18} />
            </button>
          )}
        </div>
      </div>

      {/* COLUMN 2: Middle List Sidebar (Guidelines, Channels list, Friends list) */}
      <div className="sidebar">
        <div className="sidebar-header" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'flex-start', alignItems: 'center', gap: '0.5rem', width: '100%' }}>
          <button 
            className="mobile-menu-btn" 
            onClick={() => setMobileMenuOpen(true)}
            style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', padding: '4px', display: 'none', alignItems: 'center', justifyContent: 'center' }}
          >
            <Menu size={22} />
          </button>
          <div className="app-brand" style={{ fontSize: '1.05rem', letterSpacing: '0.5px' }}>
            {currentNav === 'home' && 'Discover'}
            {currentNav === 'chat' && 'Active Channels'}
            {currentNav === 'people' && 'Social Roster'}
          </div>
          <button 
            className="mobile-close-btn" 
            onClick={() => setMobileMenuOpen(false)}
            style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', padding: '4px', display: 'none', alignItems: 'center', justifyContent: 'center' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* User XP progression block inside home tab */}
        {user && currentNav === 'home' && (
          <div className="sidebar-user" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.01)' }}>
            <div className="user-profile-summary">
              <div className="avatar-circle" style={{ overflow: 'hidden', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                {user.avatar ? (
                  <img src={user.avatar} alt={user.nickname} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  user.nickname?.substring(0, 2).toUpperCase()
                )}
              </div>
              <div className="user-meta-info">
                <div className="nickname-display" style={{ fontSize: '0.85rem' }}>
                  {user.nickname} {user.animal ? ' ' + user.animal.split(' ')[0] : ''}
                  <span className={`level-badge ${getLevelTier(user.level || 1).class}`}>
                    Lv {user.level || 1}
                  </span>
                </div>
                {!token && <div style={{ fontSize: '0.65rem', color: 'var(--warning)', fontWeight: 600 }}>Guest mode active</div>}
              </div>
            </div>
            {token && (
              <div className="xp-progress-container" style={{ marginTop: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                  <span>XP Progress</span>
                  <span>{user.xp || 0} / 100</span>
                </div>
                <div className="xp-bar-bg" style={{ marginTop: '4px' }}>
                  <div className="xp-bar-fill" style={{ width: `${user.xp || 0}%` }}></div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Sidebar content body depending on selected nav tab */}
        <div className="list-container" style={{ flex: 1, overflowY: 'auto' }}>
          {currentNav === 'home' && (
            <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '10px', fontSize: '0.8rem', lineHeight: 1.4, border: '1px solid rgba(255,255,255,0.02)' }}>
                <div style={{ fontWeight: 700, marginBottom: '0.4rem', color: 'var(--bg-accent-teal)', fontSize: '0.85rem' }}>🛡️ Safety Guidelines</div>
                Never share credentials, addresses, or phone details with strangers. Use anonymous nicknames for secure browsing.
              </div>
              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '10px', fontSize: '0.8rem', lineHeight: 1.4, border: '1px solid rgba(255,255,255,0.02)' }}>
                <div style={{ fontWeight: 700, marginBottom: '0.4rem', color: 'var(--bg-accent-teal)', fontSize: '0.85rem' }}>⚡ Levels Engine</div>
                Earn 5 XP points every 30 seconds of active connectivity in public rooms. Reach higher levels to unlock status badges!
              </div>
            </div>
          )}

          {currentNav === 'chat' && (
            <>
              {/* Navigation sub-tabs inside active Chat nav */}
              <div className="sidebar-tabs" style={{ background: 'rgba(0,0,0,0.15)', padding: '4px', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                <button className={`tab-btn ${activeTab === 'rooms' ? 'active' : ''}`} onClick={() => setActiveTab('rooms')} style={{ fontSize: '0.75rem', padding: '0.45rem' }}>
                  Rooms {(() => {
                    const cnt = Object.values(roomUnreadCounts).reduce((a, b) => a + b, 0);
                    return cnt > 0 ? `(${cnt})` : '';
                  })()}
                </button>
                <button className={`tab-btn ${activeTab === 'dms' ? 'active' : ''}`} onClick={() => setActiveTab('dms')} style={{ fontSize: '0.75rem', padding: '0.45rem' }}>
                  DMs {(() => {
                    const cnt = Object.values(unreadCounts).reduce((a, b) => a + b, 0);
                    return cnt > 0 ? `(${cnt})` : '';
                  })()}
                </button>
                <button className={`tab-btn ${activeTab === 'online' ? 'active' : ''}`} onClick={() => setActiveTab('online')} style={{ fontSize: '0.75rem', padding: '0.45rem' }}>
                  Active ({onlineUsers.filter(u => u.isOnline && (u.id === user?.id || user?.friends?.includes(u.id))).length})
                </button>
              </div>

              {activeTab === 'rooms' && (
                <div style={{ padding: '0.5rem 0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 0.5rem 0.5rem' }}>
                    <div className="section-title" style={{ margin: 0 }}>Rooms list</div>
                    <button
                      onClick={() => setIsCreateRoomOpen(true)}
                      style={{ background: 'var(--bg-accent)', border: 'none', color: '#fff', borderRadius: '8px', padding: '4px 10px', fontSize: '0.72rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}
                      title="Create a new lounge"
                    >
                      <Plus size={12} /> Create Space
                    </button>
                  </div>

                  {/* Room Search Bar */}
                  <div style={{ padding: '0 0.5rem 0.5rem', position: 'relative' }}>
                    <input 
                      type="text" 
                      placeholder="Search lounges..." 
                      value={roomSearchInput}
                      onChange={(e) => setRoomSearchInput(e.target.value)}
                      style={{ width: '100%', padding: '0.45rem 0.75rem', paddingRight: '2rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.15)', color: 'var(--text-primary)', fontSize: '0.8rem', outline: 'none' }}
                    />
                    <Search size={14} style={{ position: 'absolute', right: '14px', top: '10px', opacity: 0.5 }} />
                  </div>

                  {(() => {
                    let joinedList = [];
                    try {
                      joinedList = JSON.parse(localStorage.getItem('h70_joined_rooms') || '[]');
                    } catch (e) {}

                    let mutedList = [];
                    try {
                      mutedList = JSON.parse(localStorage.getItem('h70_muted_rooms') || '[]');
                    } catch (e) {}

                    return rooms
                      .filter(r => {
                        const isDefault = r.id === 'general' || r.id === 'tech' || r.id === 'gaming';
                        const isJoined = joinedList.includes(r.id);
                        const matchesSearch = r.name.toLowerCase().includes(roomSearchInput.toLowerCase());
                        return (isDefault || isJoined) && matchesSearch;
                      })
                      .map(room => {
                        const isMuted = mutedList.includes(room.id);
                        return (
                          <div 
                             key={room.id} 
                             className={`list-item ${currentChat?.type === 'room' && currentChat.id === room.id ? 'active' : ''}`}
                             onClick={() => handleSelectChat(room, 'room')}
                           >
                             {room.avatar ? (
                               <div style={{ width: '32px', height: '32px', borderRadius: '50%', overflow: 'hidden', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                                 <img src={room.avatar} alt={room.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                               </div>
                             ) : (
                               <div className="avatar-circle" style={{ width: '32px', height: '32px', fontSize: '0.8rem', background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                                 #
                               </div>
                             )}
                             <div className="list-item-info">
                              <div className="list-item-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                                  {room.name}
                                  {isMuted && <span title="Room muted" style={{ fontSize: '0.75rem', opacity: 0.65 }}>🔇</span>}
                                </span>
                                {roomUnreadCounts[room.id] > 0 && (
                                  <span className="room-unread-badge" style={{ background: 'rgba(255,255,255,0.1)', color: 'var(--text-secondary)', fontSize: '0.7rem', padding: '2px 6px', borderRadius: '10px', fontWeight: 'bold' }}>
                                    {roomUnreadCounts[room.id]}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      });
                  })()}
                </div>
              )}

              {activeTab === 'dms' && (
                <div style={{ padding: '0.5rem 0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 0.5rem 0.5rem' }}>
                    <div className="section-title" style={{ margin: 0 }}>Conversations</div>
                    {token && (
                      <button
                        onClick={() => { setCurrentNav('people'); setPeopleTab('add'); setMobileMenuOpen(false); }}
                        style={{ background: 'var(--bg-accent)', border: 'none', color: '#fff', borderRadius: '8px', padding: '4px 10px', fontSize: '0.72rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}
                        title="Add a new friend"
                      >
                        <UserPlus size={12} /> Add Friend
                      </button>
                    )}
                  </div>
                  {(() => {
                    const friendsDms = dmContacts.filter(c => user?.friends?.includes(c.id) && !c.id.startsWith('guest_'));
                    const notFriendsDms = dmContacts.filter(c => !user?.friends?.includes(c.id) && !c.id.startsWith('guest_'));
                    const guestDms = dmContacts.filter(c => c.id.startsWith('guest_'));

                    return (
                      <div style={{ maxHeight: 'calc(100vh - 180px)', overflowY: 'auto' }}>
                        {/* Friends Conversations */}
                        {friendsDms.length > 0 && (
                          <>
                            <div className="section-subtitle" style={{ padding: '0.4rem 0.5rem', fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.5px' }}>
                              👥 Friends
                            </div>
                            {friendsDms.map(u => (
                              <div 
                                key={u.id} 
                                className={`list-item ${currentChat?.type === 'dm' && currentChat.id === u.id ? 'active' : ''} ${unreadCounts[u.id] > 0 ? 'unread-highlight' : ''}`}
                                onClick={() => handleSelectChat(u, 'dm')}
                              >
                                <div className="avatar-circle" style={{ width: '32px', height: '32px', fontSize: '0.8rem', overflow: 'hidden', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
                                  {u.avatar && token ? (
                                    <img src={u.avatar} alt={u.nickname} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                  ) : (
                                    u.nickname.substring(0, 2).toUpperCase()
                                  )}
                                  <div className="online-dot" style={{ width: '6px', height: '6px', background: u.isOnline ? 'var(--success)' : '#777', boxShadow: u.isOnline ? '0 0 6px var(--success)' : 'none' }}></div>
                                </div>
                                <div className="list-item-info">
                                  <div className="list-item-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                                      {u.nickname} {token && u.animal ? ' ' + u.animal.split(' ')[0] : ''}
                                      {token && (
                                        <span className={`level-badge ${getLevelTier(u.level || 1).class}`} style={{ fontSize: '0.6rem' }}>
                                          L{u.level}
                                        </span>
                                      )}
                                    </span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                      {unreadCounts[u.id] > 0 && (
                                        <span className="unread-badge-sidebar" style={{ background: '#ef4444', color: '#fff', fontSize: '0.7rem', fontWeight: 'bold', padding: '2px 6px', borderRadius: '10px', minWidth: '18px', textAlign: 'center' }}>
                                          {unreadCounts[u.id]}
                                        </span>
                                      )}
                                      {token && (
                                        <button 
                                          onClick={(e) => handleClearChat(e, u.id)} 
                                          style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                          title="Clear chat history"
                                        >
                                          🗑️
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                  <div className="list-item-sub">
                                    {u.isOnline ? (u.bio || 'Chat with me!') : `Offline`}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </>
                        )}

                        {/* Not Friends Conversations */}
                        {notFriendsDms.length > 0 && (
                          <>
                            <div className="section-subtitle" style={{ padding: '0.4rem 0.5rem', fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.5px', marginTop: '0.5rem' }}>
                              🌐 Not Friends
                            </div>
                            {notFriendsDms.map(u => (
                              <div 
                                key={u.id} 
                                className={`list-item ${currentChat?.type === 'dm' && currentChat.id === u.id ? 'active' : ''} ${unreadCounts[u.id] > 0 ? 'unread-highlight' : ''}`}
                                onClick={() => handleSelectChat(u, 'dm')}
                              >
                                <div className="avatar-circle" style={{ width: '32px', height: '32px', fontSize: '0.8rem', overflow: 'hidden', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
                                  {u.avatar && token ? (
                                    <img src={u.avatar} alt={u.nickname} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                  ) : (
                                    u.nickname.substring(0, 2).toUpperCase()
                                  )}
                                  <div className="online-dot" style={{ width: '6px', height: '6px', background: u.isOnline ? 'var(--success)' : '#777', boxShadow: u.isOnline ? '0 0 6px var(--success)' : 'none' }}></div>
                                </div>
                                <div className="list-item-info">
                                  <div className="list-item-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                                      {u.nickname} {token && u.animal ? ' ' + u.animal.split(' ')[0] : ''}
                                      {token && (
                                        <span className={`level-badge ${getLevelTier(u.level || 1).class}`} style={{ fontSize: '0.6rem' }}>
                                          L{u.level}
                                        </span>
                                      )}
                                    </span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                      {unreadCounts[u.id] > 0 && (
                                        <span className="unread-badge-sidebar" style={{ background: '#ef4444', color: '#fff', fontSize: '0.7rem', fontWeight: 'bold', padding: '2px 6px', borderRadius: '10px', minWidth: '18px', textAlign: 'center' }}>
                                          {unreadCounts[u.id]}
                                        </span>
                                      )}
                                      {token && (
                                        <button 
                                          onClick={(e) => handleClearChat(e, u.id)} 
                                          style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                          title="Clear chat history"
                                        >
                                          🗑️
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                  <div className="list-item-sub">
                                    {u.isOnline ? (u.bio || 'Chat with me!') : `Offline`}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </>
                        )}

                        {/* Guests (Unregistered) */}
                        {guestDms.length > 0 && (
                          <>
                            <div className="section-subtitle" style={{ padding: '0.4rem 0.5rem', fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.5px', marginTop: '0.5rem' }}>
                              👤 Guests (Unregistered)
                            </div>
                            {guestDms.map(u => (
                              <div 
                                key={u.id} 
                                className={`list-item ${currentChat?.type === 'dm' && currentChat.id === u.id ? 'active' : ''} ${unreadCounts[u.id] > 0 ? 'unread-highlight' : ''}`}
                                onClick={() => handleSelectChat(u, 'dm')}
                              >
                                <div className="avatar-circle" style={{ width: '32px', height: '32px', fontSize: '0.8rem', overflow: 'hidden', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
                                  {u.avatar && token ? (
                                    <img src={u.avatar} alt={u.nickname} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                  ) : (
                                    u.nickname.substring(0, 2).toUpperCase()
                                  )}
                                  <div className="online-dot" style={{ width: '6px', height: '6px', background: u.isOnline ? 'var(--success)' : '#777', boxShadow: u.isOnline ? '0 0 6px var(--success)' : 'none' }}></div>
                                </div>
                                <div className="list-item-info">
                                  <div className="list-item-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                                      {u.nickname} {token && u.animal ? ' ' + u.animal.split(' ')[0] : ''}
                                      {token && (
                                        <span className={`level-badge ${getLevelTier(u.level || 1).class}`} style={{ fontSize: '0.6rem' }}>
                                          L{u.level}
                                        </span>
                                      )}
                                    </span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                      {unreadCounts[u.id] > 0 && (
                                        <span className="unread-badge-sidebar" style={{ background: '#ef4444', color: '#fff', fontSize: '0.7rem', fontWeight: 'bold', padding: '2px 6px', borderRadius: '10px', minWidth: '18px', textAlign: 'center' }}>
                                          {unreadCounts[u.id]}
                                        </span>
                                      )}
                                      {token && (
                                        <button 
                                          onClick={(e) => handleClearChat(e, u.id)} 
                                          style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                          title="Clear chat history"
                                        >
                                          🗑️
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                  <div className="list-item-sub">
                                    {u.isOnline ? (u.bio || 'Chat with me!') : `Offline`}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </>
                        )}

                        {dmContacts.length === 0 && (
                          <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem', lineHeight: 1.5 }}>
                            <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>💬</div>
                            No conversations yet.<br/>Start a DM by clicking on a user in a room!
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}

              {activeTab === 'online' && (
                <div style={{ padding: '0.5rem 0' }}>
                  <div className="section-title">Online list</div>
                  {onlineUsers.filter(u => u.isOnline && (u.id === user?.id || user?.friends?.includes(u.id))).map(u => (
                    <div 
                      key={u.id} 
                      className="list-item"
                      onClick={() => {
                        setActiveUserPopup(u);
                      }}
                    >
                      <div className="avatar-circle" style={{ width: '36px', height: '36px', fontSize: '0.85rem', overflow: 'hidden', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
                        {u.avatar ? (
                          <img src={u.avatar} alt={u.nickname} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          u.nickname.substring(0, 2).toUpperCase()
                        )}
                        <div className="online-dot" style={{ background: 'var(--success)', boxShadow: '0 0 6px var(--success)' }}></div>
                      </div>
                      <div className="list-item-info">
                        <div className="list-item-title">
                           {u.nickname} {u.animal ? ' ' + u.animal.split(' ')[0] : ''} {u.id === user?.id && '(You)'}
                          <span className={`level-badge ${getLevelTier(u.level || 1).class}`}>
                            Lv {u.level || 1}
                          </span>
                        </div>
                        <div className="list-item-sub">{u.bio || 'Active participant'}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {currentNav === 'people' && (
            <div style={{ padding: '0.5rem 0' }}>
              <div className="section-title">Filters</div>
              <div 
                className={`list-item ${peopleTab === 'friends' ? 'active' : ''}`}
                onClick={() => setPeopleTab('friends')}
              >
                <div className="list-item-info">
                  <div className="list-item-title">Your Friends</div>
                </div>
              </div>
              <div 
                className={`list-item ${peopleTab === 'requests' ? 'active' : ''}`}
                onClick={() => setPeopleTab('requests')}
              >
                <div className="list-item-info">
                  <div className="list-item-title">Friend Requests</div>
                </div>
              </div>
              <div 
                className={`list-item ${peopleTab === 'blocked' ? 'active' : ''}`}
                onClick={() => setPeopleTab('blocked')}
              >
                <div className="list-item-info">
                  <div className="list-item-title">Blocked People</div>
                </div>
              </div>
              <div 
                className={`list-item ${peopleTab === 'add' ? 'active' : ''}`}
                onClick={() => setPeopleTab('add')}
              >
                <div className="list-item-info">
                  <div className="list-item-title">Add Friend</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* COLUMN 3: Right main workspace pane (White Content panel overrides) */}
      <div className="main-content-pane">
        
        {/* NAV 1: DISCOVER FEED DASHBOARD */}
        {currentNav === 'home' && (() => {
          let joinedRoomsList = [];
          try {
            const joinedRoomIds = JSON.parse(localStorage.getItem('h70_joined_rooms') || '[]');
            joinedRoomsList = rooms.filter(r => joinedRoomIds.includes(r.id));
          } catch (e) {
            console.error(e);
          }
          return (
            <div className="white-dashboard">
              <div className="mobile-home-header" style={{ display: 'none', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                <button 
                  className="mobile-menu-btn" 
                  onClick={() => setMobileMenuOpen(true)}
                  style={{ background: 'transparent', border: 'none', color: '#1f2937', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}
                >
                  <Menu size={24} />
                  {totalUnread > 0 && (
                    <span className="mobile-unread-badge">{totalUnread}</span>
                  )}
                </button>
                <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#1f2937' }}>H70 Discover</h2>
              </div>
              <h1 className="white-dashboard-title">
                Hello, {user?.nickname || 'Guest'}!
              </h1>
              <div className="white-dashboard-grid">
                <div className="white-dashboard-card">
                  <h2 className="white-dashboard-card-title">Joined Lounges</h2>
                  <div className="white-dashboard-card-subtitle">Quick access to rooms you joined</div>
                  <div className="joined-rooms-scroll-list" style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem', maxHeight: '180px', overflowY: 'auto', paddingRight: '4px' }}>
                    {joinedRoomsList.length > 0 ? (
                      joinedRoomsList.map(room => (
                        <div 
                          key={room.id} 
                          onClick={() => {
                            handleSelectChat(room, 'room');
                            setCurrentNav('chat');
                          }}
                          style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0.8rem', background: '#f9fafb', borderRadius: '10px', cursor: 'pointer', border: '1px solid #e5e7eb', transition: 'all 0.2s' }}
                          className="joined-room-item-hover"
                        >
                          <div className="avatar-circle" style={{ width: '30px', height: '30px', fontSize: '0.75rem', background: 'rgba(124, 77, 255, 0.1)', color: 'var(--bg-accent)', border: '1.5px solid var(--border-color)', display: 'flex', justifyContent: 'center', alignItems: 'center', flexShrink: 0 }}>
                            {room.avatar ? <img src={room.avatar} alt={room.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '#'}
                          </div>
                          <div style={{ fontWeight: 600, color: '#111827', fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {room.name}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', padding: '1.5rem 0' }}>
                        You haven't joined any lounges yet. Discover public rooms below to start!
                      </div>
                    )}
                  </div>
                </div>

                <div className="white-dashboard-card">
                  <h2 className="white-dashboard-card-title">Public Hubs</h2>
                  <div className="white-dashboard-card-subtitle">Connect inside active chat channels</div>
                  <p className="white-dashboard-card-content">
                    Meet online members in default rooms, developer forums, or gaming zones. Start video conference mesh calls or share media items instantly.
                  </p>
                  <button className="white-dashboard-card-btn" onClick={() => { setCurrentNav('chat'); setActiveTab('rooms'); }}>
                    DISCOVER ROOMS
                  </button>
                </div>

                <div className="white-dashboard-card">
                  <h2 className="white-dashboard-card-title">Private Spaces</h2>
                  <div className="white-dashboard-card-subtitle">Host your own secured lounges</div>
                  <p className="white-dashboard-card-content">
                    Design a personal invite-only room or setup optional password protection. Customize room avatars and promote moderators.
                  </p>
                  <button className="white-dashboard-card-btn" onClick={() => setIsCreateRoomOpen(true)}>
                    CREATE SPACE
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* NAV 2: CHAT WORKSPACE */}
        {currentNav === 'chat' && (
          currentChat ? (
            <div className="chat-pane" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
              {/* Chat header panel */}
              <div className="chat-header" style={{ position: 'relative' }}>
                {/* Mobile hamburger inside chat header */}
                <button
                  className="mobile-back-btn"
                  onClick={() => setCurrentChat(null)}
                  style={{ background: 'transparent', border: 'none', color: '#111827', cursor: 'pointer', padding: '4px', display: 'none', alignItems: 'center', justifyContent: 'center', marginRight: '0.5rem', position: 'relative' }}
                >
                  <ChevronLeft size={24} />
                  {totalUnread > 0 && (
                    <span className="mobile-unread-badge" style={{ top: '-2px', right: '-2px' }}>{totalUnread}</span>
                  )}
                </button>
                <div className="chat-header-info">
                  <div className="avatar-circle" style={{ width: '40px', height: '40px', fontSize: '0.9rem', overflow: 'hidden', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    {currentChat.type === 'room' ? (
                      currentChat.avatar ? (
                        <img src={currentChat.avatar} alt={currentChat.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        '#'
                      )
                    ) : (
                      (() => {
                        const recipient = onlineUsers.find(u => u.id === currentChat.id);
                        return recipient?.avatar ? (
                          <img src={recipient.avatar} alt={currentChat.nickname} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          currentChat.nickname.substring(0, 2).toUpperCase()
                        );
                      })()
                    )}
                  </div>
                  <div>
                    <div 
                      className="chat-header-title"
                      onClick={() => {
                        if (currentChat.type === 'room') {
                          setViewingRoomSettings(!viewingRoomSettings);
                          setSelectedProfileUser(null);
                        }
                      }}
                      style={{ cursor: currentChat.type === 'room' ? 'pointer' : 'default', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                      title={currentChat.type === 'room' ? 'Click to view room members & settings' : ''}
                    >
                      {currentChat.type === 'room' ? currentChat.name : `${currentChat.nickname} ${onlineUsers.find(u => u.id === currentChat.id)?.animal ? ' ' + onlineUsers.find(u => u.id === currentChat.id).animal.split(' ')[0] : ''}`}
                      {currentChat.type === 'room' && <ChevronDown size={14} style={{ opacity: 0.7 }} />}
                    </div>
                    {currentChat.type === 'room' ? (
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '1px' }}>
                        {onlineUsers.filter(u => u.isOnline).length} online · click name for members
                      </div>
                    ) : (
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        {(() => {
                          const recipient = onlineUsers.find(u => u.id === currentChat.id);
                          if (!recipient) return 'Direct Message Session';
                          return recipient.isOnline ? 'Online' : `Offline • Left ${formatLastSeen(recipient.lastSeen)}`;
                        })()}
                      </div>
                    )}
                  </div>
                </div>

                {/* Action items for calling */}
                <div className="chat-actions">
                  {currentChat.type === 'dm' ? (
                    (() => {
                      const isMutual = checkIsMutualFriend(currentChat.id);
                      return (
                        <>
                          <button 
                            className="action-btn btn-call" 
                            onClick={() => {
                              if (!isMutual) return alert('You can only make voice/video calls if you are mutual friends.');
                              startCall(false);
                            }} 
                            style={{ opacity: isMutual ? 1 : 0.4, cursor: isMutual ? 'pointer' : 'not-allowed' }}
                            title={isMutual ? "Voice Call" : "Mutual Friends Call Only"}
                          >
                            <Phone size={18} />
                          </button>
                          <button 
                            className="action-btn btn-video" 
                            onClick={() => {
                              if (!isMutual) return alert('You can only make voice/video calls if you are mutual friends.');
                              startCall(true);
                            }} 
                            style={{ opacity: isMutual ? 1 : 0.4, cursor: isMutual ? 'pointer' : 'not-allowed' }}
                            title={isMutual ? "Video Call" : "Mutual Friends Call Only"}
                          >
                            <Video size={18} />
                          </button>
                        </>
                      );
                    })()
                  ) : (
                    // Room calls button
                    <button 
                      className={`btn ${isInRoomCall ? 'btn-secondary' : 'btn-primary'}`} 
                      onClick={toggleRoomCall}
                      style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                    >
                      {isInRoomCall ? (
                        <><PhoneOff size={14} /> Leave Call</>
                      ) : (
                        <><Phone size={14} /> Start Room Call</>
                      )}
                    </button>
                  )}
                  
                  {/* Room/User info drawer trigger */}
                  <button 
                    className="action-btn"
                    onClick={() => {
                      if (currentChat.type === 'room') {
                        setViewingRoomSettings(!viewingRoomSettings);
                        setSelectedProfileUser(null);
                      } else {
                        const onlineObj = onlineUsers.find(u => u.nickname === currentChat.nickname) || user;
                        setSelectedProfileUser(selectedProfileUser ? null : onlineObj);
                        setViewingRoomSettings(false);
                      }
                    }}
                    title={currentChat.type === 'room' ? "Room Settings & Info" : "View Profile Details"}
                  >
                    <User size={18} />
                  </button>
                </div>
              </div>

              {/* Chat messages stream */}
              <div className="messages-list">
                {messages.map((msg, i) => {
                  const isOutgoing = msg.senderId === user?.id;
                  const showAvatar = i === 0 || messages[i - 1].senderId !== msg.senderId;
                  const sender = onlineUsers.find(u => u.id === msg.senderId);
                  const displayTime = msg.timestamp || msg.createdAt || null;
                  const displayText = msg.text || (msg.content && (msg.type === 'text' || !msg.type || !['image','audio','video','image_view_once'].includes(msg.type)) ? msg.content : '') || '';
                  const isMedia = (msg.type === 'image' || msg.type === 'audio' || msg.type === 'video' || msg.type === 'image_view_once' || msg.mediaType);
                  const isViewOnce = msg.type === 'image_view_once';
                  const displayMediaType = msg.mediaType || (isMedia ? (isViewOnce ? 'image' : msg.type) : null);
                  const displayMediaUrl = msg.mediaUrl || (isMedia ? msg.content : '');

                  return (
                    <div key={msg.id || i} className={`message-wrapper ${isOutgoing ? 'outgoing' : ''}`}>
                      {!isOutgoing && showAvatar && (
                        <div 
                          className="avatar-circle" 
                          style={{ width: '32px', height: '32px', fontSize: '0.8rem', cursor: 'pointer', overflow: 'hidden', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
                          onClick={() => handleUserClick(msg.senderId, msg.senderNickname)}
                        >
                          {sender?.avatar && token ? (
                            <img src={sender.avatar} alt={msg.senderNickname} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <div style={{ fontSize: '0.8rem' }}>👤</div>
                          )}
                        </div>
                      )}
                      {!isOutgoing && !showAvatar && <div style={{ width: '32px' }}></div>}

                      <div className="message-content-wrapper">
                        {showAvatar && (
                          <div className="message-info-header">
                            <span 
                              className="message-sender-name"
                              style={{ cursor: 'pointer' }}
                              onClick={() => handleUserClick(msg.senderId, msg.senderNickname)}
                            >
                              {msg.senderNickname} {token && (msg.senderAnimal ? ' ' + msg.senderAnimal.split(' ')[0] : (sender?.animal ? ' ' + sender.animal.split(' ')[0] : ''))}
                            </span>
                            <span className="message-time">{displayTime ? new Date(displayTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                          </div>
                        )}

                        <div className="message-bubble" style={(msg.type === 'game_init' || msg.type === 'game_truth_dare' || msg.type === 'game_spin_bottle') ? { background: 'transparent', padding: 0, border: 'none', boxShadow: 'none' } : {}}>
                          {msg.type === 'game_init' ? (() => {
                            let gameState;
                            try {
                              gameState = JSON.parse(msg.content);
                            } catch (e) {
                              return <div className="message-bubble">Invalid game state</div>;
                            }
                            
                            const isMyTurn = (gameState.turn === 'X' ? gameState.xUserId : gameState.oUserId) === user?.id;
                            const isPlayer = gameState.xUserId === user?.id || gameState.oUserId === user?.id;
                            const isLastMessage = i === messages.length - 1;

                            return (
                              <div style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', padding: '1rem', borderRadius: '12px', minWidth: '220px', maxWidth: '280px', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                                  <span style={{ fontSize: '1.1rem' }}>🎮</span>
                                  <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary)' }}>Tic-Tac-Toe Duel</span>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', margin: '0.2rem 0' }}>
                                  {gameState.board.map((cell, cellIdx) => (
                                    <div 
                                      key={cellIdx}
                                      onClick={() => {
                                        if (gameState.status === 'active' && isPlayer && isMyTurn && isLastMessage && cell === null) {
                                          handleGameMove(msg, cellIdx);
                                        }
                                      }}
                                      style={{
                                        height: '48px',
                                        background: cell ? 'var(--bg-secondary)' : 'rgba(255,255,255,0.02)',
                                        border: '1px solid var(--border-color)',
                                        borderRadius: '6px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '1.4rem',
                                        fontWeight: 800,
                                        color: cell === 'X' ? 'var(--bg-accent-teal)' : 'var(--bg-accent)',
                                        cursor: (gameState.status === 'active' && isPlayer && isMyTurn && isLastMessage && cell === null) ? 'pointer' : 'default',
                                        transition: 'all 0.15s'
                                      }}
                                      className={(gameState.status === 'active' && isPlayer && isMyTurn && isLastMessage && cell === null) ? 'game-cell-hover' : ''}
                                    >
                                      {cell}
                                    </div>
                                  ))}
                                </div>
                                <div style={{ fontSize: '0.78rem', textAlign: 'center', fontWeight: 600 }}>
                                  {gameState.status === 'active' ? (
                                    isMyTurn ? (
                                      <span style={{ color: 'var(--bg-accent-teal)' }}>⚡ Your Turn ({gameState.turn})</span>
                                    ) : (
                                      <span style={{ color: 'var(--text-muted)' }}>Waiting for opponent ({gameState.turn})...</span>
                                    )
                                  ) : gameState.status === 'draw' ? (
                                    <span style={{ color: 'var(--text-secondary)' }}>🤝 Game Drawn!</span>
                                  ) : (
                                    <span style={{ color: 'var(--success)' }}>
                                      🎉 {gameState.winner === 'X' ? (gameState.xUserId === user?.id ? 'You won!' : 'Opponent won!') : (gameState.oUserId === user?.id ? 'You won!' : 'Opponent won!')}
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })() : msg.type === 'game_truth_dare' ? (() => {
                            let gameState;
                            try {
                              gameState = JSON.parse(msg.content);
                            } catch (e) {
                              return <div className="message-bubble">Invalid game state</div>;
                            }
                            const isLastMessage = i === messages.length - 1;

                            return (
                              <div style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', padding: '1rem', borderRadius: '12px', minWidth: '220px', maxWidth: '280px', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                                  <span style={{ fontSize: '1.1rem' }}>❓</span>
                                  <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary)' }}>Truth or Dare</span>
                                </div>
                                {gameState.status === 'waiting' ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center' }}>Choose Truth or Dare!</div>
                                    {isLastMessage ? (
                                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <button 
                                          className="btn btn-primary" 
                                          style={{ flex: 1, fontSize: '0.75rem', padding: '0.4rem' }} 
                                          onClick={() => handleTruthOrDareChoice(msg, 'truth')}
                                        >
                                          Truth
                                        </button>
                                        <button 
                                          className="btn btn-primary" 
                                          style={{ flex: 1, fontSize: '0.75rem', padding: '0.4rem' }} 
                                          onClick={() => handleTruthOrDareChoice(msg, 'dare')}
                                        >
                                          Dare
                                        </button>
                                      </div>
                                    ) : (
                                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', fontStyle: 'italic' }}>Game expired</div>
                                    )}
                                  </div>
                                ) : (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                      {gameState.choserNickname} picked <strong>{gameState.selection.toUpperCase()}</strong>:
                                    </div>
                                    <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.5rem', borderRadius: '6px', fontSize: '0.82rem', color: 'var(--bg-accent-teal)', fontWeight: 600, textAlign: 'center', border: '1px solid var(--border-color)' }}>
                                      "{gameState.prompt}"
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })() : msg.type === 'game_spin_bottle' ? (() => {
                            let gameState;
                            try {
                              gameState = JSON.parse(msg.content);
                            } catch (e) {
                              return <div className="message-bubble">Invalid game state</div>;
                            }
                            const currentTurn = gameState.currentTurn || gameState.initiatorId;
                            const isMyTurn = currentTurn === user?.id;
                            const currentTurnName = currentTurn === gameState.initiatorId ? gameState.initiatorNickname : gameState.targetNickname;
                            const spinCount = gameState.spinCount || 0;

                            return (
                              <div style={{ background: 'linear-gradient(135deg, #1e1b4b, #312e81)', border: '1px solid #6366f1', padding: '1rem', borderRadius: '16px', minWidth: '240px', maxWidth: '300px', display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'center', boxShadow: '0 4px 20px rgba(99,102,241,0.3)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem', width: '100%', justifyContent: 'center' }}>
                                  <span style={{ fontSize: '1.2rem' }}>🍾</span>
                                  <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#e0e7ff' }}>Spin the Bottle</span>
                                  {spinCount > 0 && <span style={{ background: '#4f46e5', borderRadius: '8px', padding: '1px 6px', fontSize: '0.7rem', color: '#c7d2fe' }}>Round {spinCount}</span>}
                                </div>
                                
                                <div 
                                  style={{ 
                                    fontSize: '3.5rem', 
                                    transition: 'transform 2s cubic-bezier(0.25, 0.1, 0.25, 1)',
                                    transform: gameState.status === 'spinning' ? 'rotate(1440deg)' : (gameState.result === 'initiator' ? 'rotate(0deg)' : 'rotate(180deg)'),
                                    margin: '0.5rem 0',
                                    filter: gameState.status === 'spinning' ? 'drop-shadow(0 0 8px #818cf8)' : 'none'
                                  }}
                                  className={gameState.status === 'spinning' ? 'bottle-spin-anim' : ''}
                                >
                                  🍾
                                </div>

                                {gameState.status === 'stopped' && (
                                  <div style={{ textAlign: 'center', fontSize: '0.85rem', color: '#c7d2fe', fontWeight: 700, padding: '0.35rem 0.75rem', background: 'rgba(99,102,241,0.3)', borderRadius: '8px', width: '100%' }}>
                                    👉 Points to: <span style={{ color: '#a5f3fc' }}>{gameState.result === 'initiator' ? gameState.initiatorNickname : gameState.targetNickname}</span>!
                                  </div>
                                )}

                                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                  {isMyTurn ? (
                                    <button 
                                      className="btn btn-primary" 
                                      style={{ width: '100%', fontSize: '0.8rem', padding: '0.5rem', background: 'linear-gradient(90deg, #6366f1, #8b5cf6)' }} 
                                      onClick={() => handleSpinBottleClick(msg)}
                                    >
                                      {gameState.status === 'stopped' ? '🔄 Spin Again (Your Turn)' : '🍾 Stop & Point'}
                                    </button>
                                  ) : (
                                    <div style={{ fontSize: '0.75rem', color: '#a5b4fc', textAlign: 'center', fontStyle: 'italic', padding: '0.35rem' }}>
                                      ⏳ Waiting for <strong>{currentTurnName}</strong> to spin...
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })() : (
                            <>
                              {displayMediaType === 'image' && (
                                isViewOnce ? (
                                  // View-once image handler
                                  msg.viewsRemaining != null && msg.viewsRemaining <= 0 ? (
                                    <div style={{ 
                                      padding: '0.75rem 1rem', 
                                      background: 'rgba(99,102,241,0.15)', 
                                      borderRadius: '8px', 
                                      fontSize: '0.8rem', 
                                      color: 'var(--text-muted)',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '0.35rem'
                                    }}>
                                      👁 Photo expired (view limit reached)
                                    </div>
                                  ) : (
                                    !isOutgoing && msg.viewsRemaining != null ? (
                                      // Recipient: show tap-to-view overlay
                                      <div 
                                        onClick={() => {
                                          const chatKey = [user?.id, currentChat?.id].sort().join('-');
                                          const newViews = (msg.viewsRemaining || 1) - 1;
                                          socketRef.current?.emit('update-direct-message-views', { msgId: msg.id, chatKey, viewsRemaining: newViews });
                                          setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, viewsRemaining: newViews, content: newViews <= 0 ? '' : m.content } : m));
                                        }}
                                        style={{ 
                                          position: 'relative', 
                                          cursor: 'pointer', 
                                          display: 'inline-block',
                                          borderRadius: '8px',
                                          overflow: 'hidden'
                                        }}
                                      >
                                        <img 
                                          src={displayMediaUrl} 
                                          alt="View-once photo" 
                                          className="message-media-preview"
                                          style={{ maxWidth: '240px', borderRadius: '8px', display: 'block', filter: 'blur(8px)', marginBottom: '0.4rem' }}
                                        />
                                        <div style={{
                                          position: 'absolute',
                                          inset: 0,
                                          display: 'flex',
                                          flexDirection: 'column',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          background: 'rgba(0,0,0,0.55)',
                                          color: '#fff',
                                          fontSize: '0.8rem',
                                          gap: '0.25rem',
                                          borderRadius: '8px'
                                        }}>
                                          <span style={{ fontSize: '1.5rem' }}>👁</span>
                                          <span>Tap to view ({msg.viewsRemaining} view{msg.viewsRemaining !== 1 ? 's' : ''} left)</span>
                                        </div>
                                      </div>
                                    ) : (
                                      // Sender: just show sent indicator
                                      <div style={{ padding: '0.5rem 0.75rem', background: 'rgba(99,102,241,0.15)', borderRadius: '8px', fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                        👁 View-once photo sent ({msg.viewsRemaining ?? 1} view{(msg.viewsRemaining ?? 1) !== 1 ? 's' : ''} left)
                                      </div>
                                    )
                                  )
                                ) : (
                                  <img 
                                    src={displayMediaUrl} 
                                    alt="Shared media" 
                                    className="message-media-preview"
                                    onClick={() => setLightboxImage(displayMediaUrl)}
                                    style={{ cursor: 'pointer', maxWidth: '240px', borderRadius: '8px', marginBottom: '0.4rem' }}
                                  />
                                )
                              )}
                              {displayMediaType === 'audio' && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: '180px', padding: '0.25rem 0' }}>
                                  <audio src={displayMediaUrl} controls style={{ height: '36px', maxWidth: '220px' }} />
                                </div>
                              )}
                              {displayText && <div style={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>{displayText}</div>}
                            </>
                          )}
                          
                          {/* Message tick receipts */}
                          {isOutgoing && currentChat.type === 'dm' && (
                            <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: '0.7rem', opacity: 0.8, marginTop: '2px' }}>
                              {msg.read ? (
                                <span style={{ color: '#60a5fa', fontWeight: 'bold' }}>✓✓</span>
                              ) : (
                                <span style={{ color: '#9ca3af' }}>✓</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Multi-peer Active Video/Audio Mesh Call Participants Grid inside the active room */}
              {currentChat.type === 'room' && isInRoomCall && (
                <div className="room-call-banner">
                  <div className="room-call-header">
                    <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Active Voice/Video Mesh Call</span>
                    <button className="btn btn-secondary" style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }} onClick={toggleRoomCall}>
                      Leave Call
                    </button>
                  </div>
                  <div className="room-call-grid">
                    {/* Render local self stream */}
                    <div className="room-call-user-card">
                      <div className="room-call-video-box">
                        <video ref={localVideoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', background: '#222' }} />
                        <div className="room-call-label">You</div>
                      </div>
                    </div>
                    {/* Render other room call streams */}
                    {roomCallParticipants.map(p => (
                      <div key={p.socketId} className="room-call-user-card">
                        <div className="room-call-video-box">
                          <video 
                            ref={el => {
                              if (el && p.stream) {
                                el.srcObject = p.stream;
                              }
                            }} 
                            autoPlay 
                            playsInline 
                            style={{ width: '100%', height: '100%', objectFit: 'cover', background: '#222' }} 
                          />
                          <div className="room-call-label">{p.nickname}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Typing indicator banner */}
              {currentChat.type === 'dm' && typingUsers.includes(currentChat.id) && (
                <div style={{ padding: '0.25rem 1rem', fontSize: '0.75rem', color: 'var(--bg-accent-teal)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <div className="typing-dot" style={{ animationDelay: '0s' }}>.</div>
                  <div className="typing-dot" style={{ animationDelay: '0.2s' }}>.</div>
                  <div className="typing-dot" style={{ animationDelay: '0.4s' }}>.</div>
                  <span style={{ marginLeft: '4px' }}>{currentChat.nickname} is typing...</span>
                </div>
              )}

              {/* Chat Input typing panel */}
              <div className="chat-input-bar">
                {(() => {
                  const isBlocked = user?.blockedUsers?.includes(currentChat.id) || 
                                    onlineUsers.find(u => u.id === currentChat.id)?.blockedUsers?.includes(user?.id);
                  const isMutual = currentChat.type === 'room' || checkIsMutualFriend(currentChat.id);
                  const recipient = onlineUsers.find(u => u.id === currentChat.id);
                  const isRecipientPrivate = recipient?.privacyMode === 'private';
                  const isDmLock = currentChat.type === 'dm' && isRecipientPrivate && !isMutual;

                  if (isBlocked) {
                    return (
                      <div style={{ width: '100%', textAlign: 'center', padding: '1rem', color: 'var(--danger)', fontSize: '0.85rem', fontWeight: 600 }}>
                        Message delivery disabled due to blocking.
                      </div>
                    );
                  }
                  if (isDmLock) {
                    return (
                      <div style={{ width: '100%', textAlign: 'center', padding: '1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                        This user's profile is Private. You must be added as a friend to message them.
                      </div>
                    );
                  }

                  return isRecording ? (
                    // Audio recording panel
                    <div className="recording-bar" style={{ width: '100%' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div className="recording-pulse"></div>
                        <span>Recording Audio... {formatTime(recordingTime)}</span>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button className="input-icon-btn" onClick={() => stopRecording(false)} style={{ color: 'var(--danger)' }} title="Discard Recording">
                          <Trash2 size={20} />
                        </button>
                        <button className="input-icon-btn btn-send" onClick={() => stopRecording(true)} title="Send Voice Recording">
                          <Send size={18} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    // Standard Chat typing panel
                    <>
                      {/* File Selector trigger */}
                      {token && (
                        <label className="input-icon-btn" title="Upload Image">
                          <Image size={20} />
                          <input 
                            type="file" 
                            accept="image/*" 
                            onChange={(e) => handleImageSelect(e, false)} 
                            style={{ display: 'none' }} 
                          />
                        </label>
                      )}

                      {/* View-once image trigger (DM only) */}
                      {token && currentChat?.type === 'dm' && (
                        <label className="input-icon-btn" title="Send View-Once Photo (disappears after 1 view)" style={{ position: 'relative' }}>
                          <span style={{ fontSize: '1rem', lineHeight: 1 }}>👁</span>
                          <input 
                            type="file" 
                            accept="image/*" 
                            onChange={(e) => handleImageSelect(e, true)} 
                            style={{ display: 'none' }} 
                          />
                        </label>
                      )}

                       {/* Micro recorder trigger */}
                      <button className="input-icon-btn" onClick={startRecording} title="Record Voice Message">
                        <Mic size={20} />
                      </button>

                      {/* Emoji trigger */}
                      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <button 
                          className="input-icon-btn" 
                          onClick={() => { setIsEmojiOpen(!isEmojiOpen); setIsGifOpen(false); setIsGameSelectorOpen(false); }} 
                          title="Insert Emoji"
                          style={{ fontSize: '1.25rem', padding: '2px' }}
                        >
                          😊
                        </button>
                        {isEmojiOpen && (
                          <div style={{ position: 'absolute', bottom: '45px', left: '0', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '6px', display: 'flex', gap: '6px', zIndex: 10, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
                            {['😂', '❤️', '👍', '🔥', '😍', '🎉', '🚀', '😭', '👏', '👀'].map(emoji => (
                              <span 
                                key={emoji} 
                                onClick={() => {
                                  setMsgText(prev => prev + emoji);
                                  setIsEmojiOpen(false);
                                }}
                                style={{ cursor: 'pointer', fontSize: '1.2rem', padding: '2px', transition: 'transform 0.1s' }}
                                className="emoji-hover-scale"
                              >
                                {emoji}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* GIF trigger */}
                      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <button 
                          className="input-icon-btn" 
                          onClick={() => { setIsGifOpen(!isGifOpen); setIsEmojiOpen(false); setIsGameSelectorOpen(false); }} 
                          title="Send GIF"
                          style={{ fontSize: '0.85rem', fontWeight: 'bold', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '8px', width: '36px', height: '36px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          GIF
                        </button>
                        {isGifOpen && (
                          <div style={{ position: 'absolute', bottom: '45px', left: '0', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '8px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', zIndex: 10, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', width: '260px', maxHeight: '200px', overflowY: 'auto' }}>
                            {[
                              { name: "Laughing", url: "https://media.giphy.com/media/3o7TKSjRrfIPjeiVyM/giphy.gif" },
                              { name: "Thumbs Up", url: "https://media.giphy.com/media/3o7absbD71SJJ43AlG/giphy.gif" },
                              { name: "Wave", url: "https://media.giphy.com/media/3o7TKUM3Y5MgKyKqJy/giphy.gif" },
                              { name: "Crying", url: "https://media.giphy.com/media/2WxWlkKWUsQ5W/giphy.gif" },
                              { name: "OMG", url: "https://media.giphy.com/media/3o7527pa7qs9kCG78A/giphy.gif" },
                              { name: "Dance", url: "https://media.giphy.com/media/l3V0lsG3Js1ZKCrII/giphy.gif" },
                              { name: "Yes!", url: "https://media.giphy.com/media/3o6UB3LJgrAjylZcoM/giphy.gif" },
                              { name: "Facepalm", url: "https://media.giphy.com/media/3og0INyMrrC67vc1cA/giphy.gif" },
                              { name: "Party", url: "https://media.giphy.com/media/l2JhORT5IFnj6ioko/giphy.gif" }
                            ].map(gif => (
                              <img 
                                key={gif.url} 
                                src={gif.url} 
                                alt={gif.name} 
                                onClick={() => {
                                  if (currentChat.type === 'room') {
                                    socketRef.current?.emit('send-room-message', { roomId: currentChat.id, type: 'image', content: gif.url });
                                  } else {
                                    socketRef.current?.emit('send-direct-message', { recipientId: currentChat.id, type: 'image', content: gif.url });
                                  }
                                  setIsGifOpen(false);
                                }}
                                style={{ width: '100%', height: '50px', objectFit: 'cover', borderRadius: '6px', cursor: 'pointer', border: '1px solid var(--border-color)' }}
                              />
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Game selector trigger */}
                      {currentChat.type === 'dm' && token && (
                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                          <button 
                            className="input-icon-btn" 
                            onClick={() => { setIsGameSelectorOpen(!isGameSelectorOpen); setIsEmojiOpen(false); setIsGifOpen(false); }} 
                            title="Play In-Chat Game"
                          >
                            <Gamepad2 size={20} />
                          </button>
                          {isGameSelectorOpen && (
                            <div style={{ position: 'absolute', bottom: '45px', left: '0', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '6px', display: 'flex', flexDirection: 'column', gap: '4px', zIndex: 10, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', width: '160px' }}>
                              <button 
                                className="btn btn-secondary" 
                                style={{ fontSize: '0.78rem', padding: '0.4rem 0.6rem', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '0.35rem' }} 
                                onClick={() => { handleStartGame(); setIsGameSelectorOpen(false); }}
                              >
                                ❌ Tic-Tac-Toe
                              </button>
                              <button 
                                className="btn btn-secondary" 
                                style={{ fontSize: '0.78rem', padding: '0.4rem 0.6rem', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '0.35rem' }} 
                                onClick={() => { handleStartTruthOrDare(); setIsGameSelectorOpen(false); }}
                              >
                                ❓ Truth or Dare
                              </button>
                              <button 
                                className="btn btn-secondary" 
                                style={{ fontSize: '0.78rem', padding: '0.4rem 0.6rem', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '0.35rem' }} 
                                onClick={() => { handleStartSpinBottle(); setIsGameSelectorOpen(false); }}
                              >
                                🍾 Spin the Bottle
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      <input 

                        type="text" 
                        className="chat-text-input" 
                        value={msgText} 
                        onChange={(e) => handleTypingChange(e.target.value)} 
                        onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                        placeholder="Type a message or share files..." 
                      />

                      {/* Quick Spin shortcut for DM */}
                      {currentChat.type === 'dm' && token && (
                        <button 
                          className="input-icon-btn" 
                          onClick={handleQuickSpin} 
                          title="Quick Spin the Bottle"
                          style={{ fontSize: '1rem', fontWeight: 600 }}
                        >
                          🍾
                        </button>
                      )}

                      <button className="input-icon-btn btn-send" onClick={handleSendMessage} title="Send Message" style={{ display: 'flex', alignItems: 'center', gap: '4px', width: 'auto', padding: '0 14px', minWidth: '44px' }}>
                        <Send size={16} />
                        <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>Send</span>
                      </button>
                    </>
                  );
                })()}
              </div>
            </div>
          ) : (
            <div className="featured-rooms-container">
              <div className="mobile-home-header" style={{ display: 'none', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                <button 
                  className="mobile-menu-btn" 
                  onClick={() => setMobileMenuOpen(true)}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}
                >
                  <Menu size={24} />
                  {totalUnread > 0 && (
                    <span className="mobile-unread-badge">{totalUnread}</span>
                  )}
                </button>
                <h2 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--text-primary)' }}>Chat Lounges</h2>
              </div>
              <h1 className="featured-rooms-title">Featured Channels</h1>
              <div className="featured-rooms-list">
                <div className="featured-rooms-card">
                  <h2 className="featured-rooms-card-title">Stranger Match (Random DM)</h2>
                  <p className="featured-rooms-card-desc">
                    Pair up with a random active user online. Safely chat, share media elements, and start video/audio calls with absolute privacy.
                  </p>
                  <div className="featured-rooms-card-footer">
                    <button className="featured-rooms-btn-action" onClick={handleRandomChat}>
                      START MATCH
                    </button>
                    <div className="featured-rooms-indicator">
                      <span className="featured-rooms-dot"></span>
                      <span>Active matching</span>
                    </div>
                  </div>
                </div>

                {rooms.length > 0 ? (
                  rooms.map(room => (
                    <div key={room.id} className="featured-rooms-card">
                      <h2 className="featured-rooms-card-title">{room.name}</h2>
                      <p className="featured-rooms-card-desc">
                        A custom created lounge by active users. Join this room to chat, exchange files, and run video mesh calls.
                      </p>
                      <div className="featured-rooms-card-footer">
                        <button className="featured-rooms-btn-action" onClick={() => handleSelectChat(room, 'room')}>
                          JOIN CHAT
                        </button>
                        <div className="featured-rooms-indicator">
                          <span className="featured-rooms-dot" style={{ backgroundColor: 'var(--success)' }}></span>
                          <span>Active Lounge</span>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="featured-rooms-card" style={{ gridColumn: 'span 2', textAlign: 'center', padding: '2rem 1rem' }}>
                    <h2 className="featured-rooms-card-title" style={{ color: 'var(--text-muted)' }}>No lounges active</h2>
                    <p className="featured-rooms-card-desc">
                      Create your own custom lounge from the Home feed or invite friends to join your personal space!
                    </p>
                  </div>
                )}
              </div>
            </div>
          )
        )}

        {/* NAV 3: PEOPLE DASHBOARD */}
        {currentNav === 'people' && (
          <div className="people-pane-container">
            <div className="people-pane-wrapper">
              <div className="mobile-home-header" style={{ display: 'none', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                <button 
                  className="mobile-menu-btn" 
                  onClick={() => setMobileMenuOpen(true)}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}
                >
                  <Menu size={24} />
                  {totalUnread > 0 && (
                    <span className="mobile-unread-badge">{totalUnread}</span>
                  )}
                </button>
                <h2 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--text-primary)' }}>People</h2>
              </div>
              <h1 className="people-pane-title">Social Roster</h1>
              
              <div className="people-pane-tabs">
                <button className={`people-pane-tab-btn ${peopleTab === 'friends' ? 'active' : ''}`} onClick={() => setPeopleTab('friends')}>
                  YOUR FRIENDS
                </button>
                <button className={`people-pane-tab-btn ${peopleTab === 'requests' ? 'active' : ''}`} onClick={() => setPeopleTab('requests')}>
                  FRIEND REQUESTS
                </button>
                <button className={`people-pane-tab-btn ${peopleTab === 'blocked' ? 'active' : ''}`} onClick={() => setPeopleTab('blocked')}>
                  BLOCKED PEOPLE
                </button>
                <button className={`people-pane-tab-btn ${peopleTab === 'add' ? 'active' : ''}`} onClick={() => setPeopleTab('add')}>
                  ADD FRIEND
                </button>
              </div>

              <div className="people-pane-content">
                {peopleTab === 'friends' && (
                  <div>
                    {onlineUsers.filter(u => user?.friends?.includes(u.id) && u.id !== user?.id).map(u => (
                      <div key={u.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', borderBottom: '1px solid #f3f4f6' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                          <div className="avatar-circle" style={{ width: '40px', height: '40px', overflow: 'hidden', border: '1px solid #e5e7eb', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                            {u.avatar ? <img src={u.avatar} alt={u.nickname} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : u.nickname.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{u.nickname} {u.animal ? ' ' + u.animal.split(' ')[0] : ''}</div>
                            <div style={{ fontSize: '0.8rem', color: u.isOnline ? 'var(--success)' : '#9ca3af' }}>
                              {u.isOnline ? 'Online' : `Offline • Left ${formatLastSeen(u.lastSeen)}`}
                            </div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button className="btn btn-primary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} onClick={() => { handleSelectChat(u, 'dm'); setCurrentNav('chat'); setActiveTab('dms'); }}>
                            Chat
                          </button>
                          <button className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', color: '#ef4444' }} onClick={async () => {
                            try {
                              const res = await fetch('/api/friends/remove', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                body: JSON.stringify({ friendId: u.id })
                              });
                              const updated = await res.json();
                              if (res.ok) setUser(updated);
                            } catch (err) { console.error(err); }
                          }}>
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                    {onlineUsers.filter(u => user?.friends?.includes(u.id) && u.id !== user?.id).length === 0 && (
                      <div style={{ textAlign: 'center', color: '#9ca3af', padding: '3rem 0' }}>
                        Your friend list is empty. Add users via the "Add Friend" search tab or click on a user's avatar.
                      </div>
                    )}
                  </div>
                )}

                {peopleTab === 'requests' && (
                  <div>
                    {onlineUsers.filter(u => u.friends?.includes(user?.id) && !user?.friends?.includes(u.id) && u.id !== user?.id).map(u => (
                      <div key={u.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', borderBottom: '1px solid #f3f4f6' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                          <div className="avatar-circle" style={{ width: '40px', height: '40px', overflow: 'hidden', border: '1px solid #e5e7eb', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                            {u.avatar ? <img src={u.avatar} alt={u.nickname} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : u.nickname.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{u.nickname} {u.animal ? ' ' + u.animal.split(' ')[0] : ''}</div>
                            <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>sent you a friend invitation!</div>
                          </div>
                        </div>
                        <button className="btn btn-primary" style={{ padding: '0.4rem 1rem', fontSize: '0.8rem' }} onClick={async () => {
                          try {
                            const res = await fetch('/api/friends/add', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                              body: JSON.stringify({ friendId: u.id })
                            });
                            const updated = await res.json();
                            if (res.ok) setUser(updated);
                          } catch (err) { console.error(err); }
                        }}>
                          Accept Request
                        </button>
                      </div>
                    ))}
                    {onlineUsers.filter(u => u.friends?.includes(user?.id) && !user?.friends?.includes(u.id) && u.id !== user?.id).length === 0 && (
                      <div style={{ textAlign: 'center', color: '#9ca3af', padding: '3rem 0' }}>
                        No pending friend invitations.
                      </div>
                    )}
                  </div>
                )}

                {peopleTab === 'blocked' && (
                  <div>
                    {onlineUsers.filter(u => user?.blockedUsers?.includes(u.id)).map(u => (
                      <div key={u.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', borderBottom: '1px solid #f3f4f6' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                          <div className="avatar-circle" style={{ width: '40px', height: '40px', overflow: 'hidden', border: '1px solid #e5e7eb', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                            {u.avatar ? <img src={u.avatar} alt={u.nickname} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : u.nickname.substring(0, 2).toUpperCase()}
                          </div>
                          <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{u.nickname} {u.animal ? ' ' + u.animal.split(' ')[0] : ''}</div>
                        </div>
                        <button className="btn btn-secondary" style={{ padding: '0.4rem 1rem', fontSize: '0.8rem' }} onClick={async () => {
                          try {
                            const res = await fetch('/api/block/toggle', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                              body: JSON.stringify({ blockId: u.id })
                            });
                            const updated = await res.json();
                            if (res.ok) setUser(updated);
                          } catch (err) { console.error(err); }
                        }}>
                          Unblock
                        </button>
                      </div>
                    ))}
                    {onlineUsers.filter(u => user?.blockedUsers?.includes(u.id)).length === 0 && (
                      <div style={{ textAlign: 'center', color: '#9ca3af', padding: '3rem 0' }}>
                        No blocked profiles.
                      </div>
                    )}
                  </div>
                )}

                {peopleTab === 'add' && (
                  <div>
                    <div className="people-pane-search-wrapper">
                      <Search size={18} style={{ color: '#9ca3af' }} />
                      <input 
                        type="text" 
                        className="people-pane-search-input" 
                        placeholder="Search users by name to add as friend..."
                        value={peopleSearchInput}
                        onChange={(e) => setPeopleSearchInput(e.target.value)}
                      />
                    </div>
                    <div>
                      {onlineUsers
                        .filter(u => u.id !== user?.id && u.nickname.toLowerCase().includes(peopleSearchInput.toLowerCase()))
                        .map(u => {
                          const state = getFriendshipState(u);
                          let isSent = state === 'friends' || state === 'sent';
                          return (
                            <div key={u.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', borderBottom: '1px solid #f3f4f6' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <div className="avatar-circle" style={{ width: '40px', height: '40px', overflow: 'hidden', border: '1px solid #e5e7eb', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                                  {u.avatar ? <img src={u.avatar} alt={u.nickname} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : u.nickname.substring(0, 2).toUpperCase()}
                                </div>
                                <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                                  {u.nickname} {u.animal ? ' ' + u.animal.split(' ')[0] : ''}
                                  {state === 'friends' && <span style={{ fontSize: '0.7rem', background: '#dcfce7', color: '#15803d', padding: '2px 6px', borderRadius: '4px', marginLeft: '6px' }}>Friend</span>}
                                </div>
                              </div>
                              
                              {!isSent ? (
                                <button className="btn btn-primary" style={{ padding: '0.4rem 1rem', fontSize: '0.8rem' }} onClick={async () => {
                                  try {
                                    const res = await fetch('/api/friends/add', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                      body: JSON.stringify({ friendId: u.id })
                                    });
                                    const updated = await res.json();
                                    if (res.ok) setUser(updated);
                                  } catch (err) { console.error(err); }
                                }}>
                                  Add Friend
                                </button>
                              ) : (
                                <button className="btn btn-secondary" style={{ padding: '0.4rem 1rem', fontSize: '0.8rem' }} onClick={async () => {
                                  try {
                                    const res = await fetch('/api/friends/remove', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                      body: JSON.stringify({ friendId: u.id })
                                    });
                                    const updated = await res.json();
                                    if (res.ok) setUser(updated);
                                  } catch (err) { console.error(err); }
                                }}>
                                  {state === 'friends' ? 'Unfriend' : 'Cancel Request'}
                                </button>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Right Drawer Panel: Room Settings & Info */}
      {viewingRoomSettings && currentChat && currentChat.type === 'room' && (
        <div className="profile-drawer">
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="input-icon-btn" onClick={() => setViewingRoomSettings(false)}>
              <X size={18} />
            </button>
          </div>

          <div className="profile-avatar-large" style={{ overflow: 'hidden', position: 'relative', borderRadius: '50%', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            {currentChat.avatar ? (
              <img src={currentChat.avatar} alt={currentChat.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              currentChat.name.substring(0, 2).toUpperCase()
            )}
          </div>

          <div className="profile-name">
            {currentChat.name}
          </div>
          <div className="profile-email" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}>
            <Users size={13} />
            {getCombinedUsersWithStatus().length} Members
          </div>

          {/* Group Avatar Upload (Admins, Owner/Creator, or default system creator rooms for testing) */}
          {(currentChat.admins?.includes(user?.id) || currentChat.creatorId === user?.id || currentChat.creatorId === 'system') && (
            <div style={{ marginBottom: '1.5rem', textAlign: 'center' }}>
              <label className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', cursor: 'pointer' }}>
                <Image size={14} /> Change Room Icon
                <input 
                  type="file" 
                  accept="image/*" 
                  onChange={async (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    const formData = new FormData();
                    formData.append('media', file);
                    try {
                      const res = await fetch('/api/upload', {
                        method: 'POST',
                        body: formData
                      });
                      const data = await res.json();
                      if (!res.ok) throw new Error(data.error || 'Upload failed');
                      
                      socketRef.current?.emit('update-room-avatar', {
                        roomId: currentChat.id,
                        avatarUrl: data.url
                      });
                    } catch (err) {
                      alert('Failed to upload room avatar: ' + err.message);
                    }
                  }} 
                  style={{ display: 'none' }} 
                />
              </label>
            </div>
          )}

          {/* Combined Users List showing Online (Green) and Offline (Red) */}
          <div className="bio-title" style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Users size={13} /> Room Members ({getCombinedUsersWithStatus().length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', maxHeight: '320px', overflowY: 'auto', paddingRight: '4px', marginBottom: '1.5rem' }}>
            {getCombinedUsersWithStatus().map(u => {
              const isRoomAdmin = currentChat.admins?.includes(u.id) || currentChat.creatorId === u.id;
              return (
                <div 
                  key={u.id} 
                  onClick={() => {
                    if (u.id !== user?.id) {
                      handleSelectChat(u, 'dm');
                      setViewingRoomSettings(false);
                    }
                  }}
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between', 
                    padding: '0.4rem 0.6rem', 
                    background: 'rgba(255,255,255,0.02)', 
                    borderRadius: '8px',
                    cursor: u.id === user?.id ? 'default' : 'pointer'
                  }}
                  title={u.id !== user?.id ? `Click to Chat / Send DM to ${u.nickname}` : ''}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                    {/* Status dot: Green for online, Red for offline */}
                    <div 
                      style={{ 
                        width: '8px', 
                        height: '8px', 
                        borderRadius: '50%', 
                        background: u.isOnline ? 'var(--success)' : 'var(--danger)',
                        boxShadow: u.isOnline ? '0 0 8px var(--success)' : 'none',
                        flexShrink: 0
                      }} 
                    />
                    <span style={{ fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {u.nickname}
                    </span>
                    {isRoomAdmin && (
                      <span className="level-badge level-gold" style={{ fontSize: '0.5rem', padding: '0.05rem 0.2rem', flexShrink: 0 }}>
                        Admin
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }} onClick={(e) => e.stopPropagation()}>
                    {/* Promotion Button (Only admins/owners can promote other non-admins) */}
                    {(currentChat.admins?.includes(user?.id) || currentChat.creatorId === user?.id || currentChat.creatorId === 'system') && !isRoomAdmin && (
                      <button 
                        className="btn btn-primary" 
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.65rem', flexShrink: 0 }}
                        onClick={() => {
                          socketRef.current?.emit('promote-to-admin', {
                            roomId: currentChat.id,
                            userId: u.id
                          });
                        }}
                      >
                        Promote
                      </button>
                    )}

                    {/* Kick Button (Supervisor backdoor only, cannot kick yourself) */}
                    {user?.role === 'supervisor' && u.id !== user?.id && (
                      <button 
                        className="btn btn-danger" 
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.65rem', flexShrink: 0 }}
                        onClick={() => {
                          if (window.confirm(`Kick ${u.nickname} from this room?`)) {
                            socketRef.current?.emit('kick-user', { roomId: currentChat.id, userId: u.id });
                          }
                        }}
                      >
                        Kick
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {getCombinedUsersWithStatus().length === 0 && (
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', padding: '1rem' }}>
                No room members found
              </div>
            )}
          </div>

          {/* Mute Room Notifications Toggle */}
          <div style={{ padding: '1rem 0', borderTop: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Mute Room Notifications</span>
            <label className="switch" style={{ position: 'relative', display: 'inline-block', width: '40px', height: '20px' }}>
              <input 
                type="checkbox" 
                checked={(() => {
                  try {
                    const mutedList = JSON.parse(localStorage.getItem('h70_muted_rooms') || '[]');
                    return mutedList.includes(currentChat.id);
                  } catch (e) {
                    return false;
                  }
                })()}
                onChange={(e) => {
                  const checked = e.target.checked;
                  let mutedList = [];
                  try {
                    mutedList = JSON.parse(localStorage.getItem('h70_muted_rooms') || '[]');
                  } catch (err) {}
                  if (checked) {
                    if (!mutedList.includes(currentChat.id)) mutedList.push(currentChat.id);
                  } else {
                    mutedList = mutedList.filter(id => id !== currentChat.id);
                  }
                  localStorage.setItem('h70_muted_rooms', JSON.stringify(mutedList));
                  // Force state refresh
                  setRooms(prev => [...prev]);
                }}
                style={{ opacity: 0, width: 0, height: 0 }}
              />
              <span className="slider round" style={{
                position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0,
                backgroundColor: (() => {
                  try {
                    const mutedList = JSON.parse(localStorage.getItem('h70_muted_rooms') || '[]');
                    return mutedList.includes(currentChat.id) ? 'var(--bg-accent-teal)' : '#333';
                  } catch (e) {
                    return '#333';
                  }
                })(),
                transition: '.3s', borderRadius: '20px'
              }}>
                <span style={{
                  position: 'absolute', content: '""', height: '14px', width: '14px', 
                  left: (() => {
                    try {
                      const mutedList = JSON.parse(localStorage.getItem('h70_muted_rooms') || '[]');
                      return mutedList.includes(currentChat.id) ? '22px' : '4px';
                    } catch (e) {
                      return '4px';
                    }
                  })(), 
                  bottom: '3px',
                  backgroundColor: 'white', transition: '.3s', borderRadius: '50%'
                }} />
              </span>
            </label>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '1rem 0', borderTop: '1px solid var(--border-color)', marginTop: 'auto' }}>
            {/* Leave Room Button (Can leave joined rooms. Creator should delete rather than leave, or they can leave too if they want) */}
            {currentChat.id !== 'general' && currentChat.id !== 'tech' && currentChat.id !== 'gaming' && (
              <button 
                className="btn btn-secondary" 
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', fontSize: '0.85rem', padding: '0.6rem' }}
                onClick={() => {
                  if (window.confirm(`Are you sure you want to leave ${currentChat.name}?`)) {
                    let joinedList = [];
                    try {
                      joinedList = JSON.parse(localStorage.getItem('h70_joined_rooms') || '[]');
                    } catch (e) {}
                    const updatedList = joinedList.filter(id => id !== currentChat.id);
                    localStorage.setItem('h70_joined_rooms', JSON.stringify(updatedList));
                    
                    socketRef.current?.emit('leave-room', currentChat.id);
                    setCurrentChat(null);
                    setViewingRoomSettings(false);
                  }
                }}
              >
                🚪 Leave Room
              </button>
            )}

            {/* Delete Room Button (Supervisor or Owner only, cannot delete default lounges) */}
            {(user?.role === 'supervisor' || currentChat.creatorId === user?.id) && currentChat.id !== 'general' && currentChat.id !== 'tech' && currentChat.id !== 'gaming' && (
              <button 
                className="btn btn-danger" 
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', fontSize: '0.85rem', padding: '0.6rem' }}
                onClick={() => {
                  if (window.confirm('Are you sure you want to delete this room? This cannot be undone.')) {
                    socketRef.current?.emit('delete-room', { roomId: currentChat.id });
                    setViewingRoomSettings(false);
                  }
                }}
              >
                <Trash2 size={16} /> Delete Room
              </button>
            )}
          </div>
        </div>
      )}

      {/* Right Drawer Panel: Profile details of selected user */}
      {selectedProfileUser && (
        <div className="profile-drawer">
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="input-icon-btn" onClick={() => setSelectedProfileUser(null)}>
              <X size={18} />
            </button>
          </div>

          <div className="profile-avatar-large" style={{ overflow: 'hidden', position: 'relative', borderRadius: '50%', border: '2px solid var(--border-color)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            {selectedProfileUser.avatar && (token || selectedProfileUser.id === user?.id) ? (
              <img src={selectedProfileUser.avatar} alt={selectedProfileUser.nickname} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={{ fontSize: '2.5rem' }}>👤</div>
            )}
          </div>

          {/* Change Profile Picture Button (Registered users only on their own profiles) */}
          {selectedProfileUser.id === user?.id && token && (
            <div style={{ marginBottom: '1.5rem', textAlign: 'center' }}>
              <label className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', cursor: 'pointer' }}>
                <Image size={14} /> Change Profile Picture
                <input 
                  type="file" 
                  accept="image/*" 
                  onChange={async (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    const formData = new FormData();
                    formData.append('media', file);
                    try {
                      const res = await fetch('/api/upload', {
                        method: 'POST',
                        body: formData
                      });
                      const data = await res.json();
                      if (!res.ok) throw new Error(data.error || 'Upload failed');
                      
                      const avatarRes = await fetch('/api/profile/avatar', {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({ avatarUrl: data.url })
                      });
                      const updatedUser = await avatarRes.json();
                      if (!avatarRes.ok) throw new Error(updatedUser.error || 'Update failed');
                      
                      setUser(prev => ({ ...prev, avatar: updatedUser.avatar }));
                      setSelectedProfileUser(prev => ({ ...prev, avatar: updatedUser.avatar }));
                    } catch (err) {
                      alert('Failed to update avatar: ' + err.message);
                    }
                  }} 
                  style={{ display: 'none' }} 
                />
              </label>
            </div>
          )}

          <div className="profile-name">
            {selectedProfileUser.nickname} {selectedProfileUser.animal ? ' ' + selectedProfileUser.animal.split(' ')[0] : ''}
          </div>
          <div className="profile-email">
            {selectedProfileUser.id.startsWith('guest_') ? 'Anonymous Guest' : 'Registered Member'}
          </div>

          <div className="profile-stats-card">
            {selectedProfileUser.animal && (token || selectedProfileUser.id === user?.id) && (
              <div className="profile-stat-row" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', marginBottom: '0.5rem' }}>
                <span className="text-secondary">Spirit Animal</span>
                <span className="font-semibold text-primary">{selectedProfileUser.animal}</span>
              </div>
            )}
            <div className="profile-stat-row">
              <span className="text-secondary">Current Level</span>
              <span className="font-semibold text-primary">
                {token || selectedProfileUser.id === user?.id ? (
                  `${selectedProfileUser.level || 1} (${getLevelTier(selectedProfileUser.level || 1).name})`
                ) : (
                  '🔒 Locked'
                )}
              </span>
            </div>
            {selectedProfileUser.id === user?.id && token && (
              <div className="profile-stat-row">
                <span className="text-secondary">Total XP</span>
                <span className="text-primary">{selectedProfileUser.xp || 0} / 100</span>
              </div>
            )}
          </div>

          {/* Stories and Bio with Privacy Check */}
          {selectedProfileUser.id !== user?.id && !token ? (
            <div className="private-profile-notice" style={{ textAlign: 'center', padding: '1.75rem 1.25rem', background: 'var(--bg-tertiary)', borderRadius: '16px', border: '1px dashed var(--border-color)', margin: '1.25rem 0' }}>
              <div style={{ fontSize: '1.75rem', marginBottom: '0.75rem' }}>🔒</div>
              <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>Account details locked</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.4rem', lineHeight: 1.4 }}>
                Register or sign in to view member avatars, biographies, level progression, and spirit animals.
              </div>
            </div>
          ) : selectedProfileUser.id !== user?.id && selectedProfileUser.privacyMode === 'private' && getFriendshipState(selectedProfileUser) !== 'friends' ? (
            <div className="private-profile-notice" style={{ textAlign: 'center', padding: '1.75rem 1.25rem', background: 'var(--bg-tertiary)', borderRadius: '16px', border: '1px dashed var(--border-color)', margin: '1.25rem 0' }}>
              <div style={{ fontSize: '1.75rem', marginBottom: '0.75rem' }}>🔒</div>
              <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>This Account is Private</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.4rem', lineHeight: 1.4 }}>
                Add them as a friend to view their biography and stories feed.
              </div>
            </div>
          ) : (
            <>
              {/* Stories list */}
              {((selectedProfileUser.stories && selectedProfileUser.stories.length > 0) || (selectedProfileUser.id === user?.id && token) || (selectedProfileUser.id !== user?.id)) && (
                <div className="bio-section">
                  <div className="bio-title">Stories Feed</div>
                  <div className="stories-list-horizontal">
                    {/* Allow current user to post a story */}
                    {selectedProfileUser.id === user?.id && token && (
                      <div className="btn-add-story" onClick={() => setIsAddingStory(true)} title="Add to Story">
                        <Plus size={20} />
                        <span style={{ fontSize: '0.6rem', marginTop: '2px', fontWeight: 600 }}>Post</span>
                      </div>
                    )}
                    
                    {/* Show list of active stories */}
                    {selectedProfileUser.stories && selectedProfileUser.stories.length > 0 ? (
                      <div 
                        className="story-circle" 
                        onClick={() => setStoriesViewer({ 
                          userId: selectedProfileUser.id, 
                          stories: selectedProfileUser.stories, 
                          index: 0 
                        })}
                      >
                        <div className="story-avatar-inner">
                          👁️ View
                        </div>
                      </div>
                    ) : (
                      selectedProfileUser.id !== user?.id && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
                          No stories posted
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}

              <div className="bio-section">
                <div className="bio-title">User Bio</div>
                {isBioEditing ? (
                  <div>
                    <textarea 
                      className="bio-textarea"
                      value={bioInput}
                      onChange={(e) => setBioInput(e.target.value)}
                      maxLength={160}
                    />
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                      <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setIsBioEditing(false)}>Cancel</button>
                      <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleUpdateBio}>Save</button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="bio-text">
                      {selectedProfileUser.bio || 'This user is mysterious and has not set a bio yet.'}
                    </div>
                    {selectedProfileUser.id === user?.id && token && (
                      <button 
                        className="btn btn-secondary" 
                        style={{ width: '100%', marginTop: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', fontSize: '0.85rem' }} 
                        onClick={() => {
                          setBioInput(user.bio || '');
                          setIsBioEditing(true);
                        }}
                      >
                        <Edit size={14} /> Edit Bio
                      </button>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Settings Panel for Current User profile card */}
          {selectedProfileUser.id === user?.id && token && (
            <div className="bio-section" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem', marginTop: '1.25rem' }}>
              <div className="bio-title">App Settings</div>
              
              {/* Theme Toggle Switch */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                <span className="text-secondary" style={{ fontSize: '0.8rem' }}>Light Theme Mode</span>
                <label className="switch" style={{ position: 'relative', display: 'inline-block', width: '40px', height: '20px' }}>
                  <input 
                    type="checkbox" 
                    checked={theme === 'light'}
                    onChange={(e) => setTheme(e.target.checked ? 'light' : 'dark')}
                    style={{ opacity: 0, width: 0, height: 0 }}
                  />
                  <span className="slider round" style={{
                    position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: theme === 'light' ? 'var(--bg-accent-teal)' : '#333',
                    transition: '.3s', borderRadius: '20px'
                  }}>
                    <span style={{
                      position: 'absolute', content: '""', height: '14px', width: '14px', left: theme === 'light' ? '22px' : '4px', bottom: '3px',
                      backgroundColor: 'white', transition: '.3s', borderRadius: '50%'
                    }} />
                  </span>
                </label>
              </div>

              {/* Spirit Animal Selector */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '1.25rem' }}>
                <span className="text-secondary" style={{ fontSize: '0.8rem' }}>Spirit Animal Species (400+ choices)</span>
                <select 
                  value={user?.animal || ''}
                  onChange={async (e) => {
                    const selectedAnimal = e.target.value;
                    try {
                      const res = await fetch('/api/profile/settings', {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({ animal: selectedAnimal })
                      });
                      const data = await res.json();
                      if (!res.ok) throw new Error(data.error || 'Failed to update spirit animal');
                      setUser(data);
                    } catch (err) {
                      alert(err.message);
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                    fontSize: '0.85rem',
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                >
                  <option value="">None Selected</option>
                  {ANIMALS_LIST.map(anim => (
                    <option key={anim} value={anim}>{anim}</option>
                  ))}
                </select>
              </div>
              
              {/* Privacy Mode Toggle */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '1.25rem' }}>
                <span className="text-secondary" style={{ fontSize: '0.8rem' }}>Profile Privacy</span>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button 
                    className={`btn ${user.privacyMode === 'public' ? 'btn-primary' : 'btn-secondary'}`} 
                    style={{ flex: 1, fontSize: '0.8rem', padding: '0.5rem' }}
                    onClick={async () => {
                      try {
                        const res = await fetch('/api/profile/settings', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                          body: JSON.stringify({ privacyMode: 'public' })
                        });
                        const updated = await res.json();
                        if (res.ok) {
                          setUser(updated);
                          setSelectedProfileUser(updated);
                        }
                      } catch (err) { console.error(err); }
                    }}
                  >
                    Public
                  </button>
                  <button 
                    className={`btn ${user.privacyMode === 'private' ? 'btn-primary' : 'btn-secondary'}`} 
                    style={{ flex: 1, fontSize: '0.8rem', padding: '0.5rem' }}
                    onClick={async () => {
                      try {
                        const res = await fetch('/api/profile/settings', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                          body: JSON.stringify({ privacyMode: 'private' })
                        });
                        const updated = await res.json();
                        if (res.ok) {
                          setUser(updated);
                          setSelectedProfileUser(updated);
                        }
                      } catch (err) { console.error(err); }
                    }}
                  >
                    Private
                  </button>
                </div>
              </div>

              {/* Notifications Toggle */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                <span className="text-secondary" style={{ fontSize: '0.8rem' }}>Receive Notifications</span>
                <label className="switch" style={{ position: 'relative', display: 'inline-block', width: '40px', height: '20px' }}>
                  <input 
                    type="checkbox" 
                    checked={user.notificationsEnabled !== false}
                    onChange={async (e) => {
                      const notificationsEnabled = e.target.checked;
                      try {
                        const res = await fetch('/api/profile/settings', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                          body: JSON.stringify({ notificationsEnabled })
                        });
                        const updated = await res.json();
                        if (res.ok) {
                          setUser(updated);
                          setSelectedProfileUser(updated);
                        }
                      } catch (err) { console.error(err); }
                    }}
                    style={{ opacity: 0, width: 0, height: 0 }}
                  />
                  <span className="slider round" style={{
                    position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: user.notificationsEnabled !== false ? 'var(--bg-accent-teal)' : '#333',
                    transition: '.3s', borderRadius: '20px'
                  }}>
                    <span style={{
                      position: 'absolute', content: '""', height: '14px', width: '14px', left: user.notificationsEnabled !== false ? '22px' : '4px', bottom: '3px',
                      backgroundColor: 'white', transition: '.3s', borderRadius: '50%'
                    }} />
                  </span>
                </label>
              </div>

              {/* Sound Level Slider */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                  <span className="text-secondary">Ringtone & Alert Sound</span>
                  <span className="text-primary">{user.soundLevel || 80}%</span>
                </div>
                <input 
                  type="range" 
                  min="0" 
                  max="100" 
                  value={user.soundLevel || 80}
                  onChange={(e) => {
                    const soundLevel = parseInt(e.target.value);
                    setUser(prev => ({ ...prev, soundLevel }));
                  }}
                  onMouseUp={async (e) => {
                    const soundLevel = parseInt(e.target.value);
                    try {
                      const res = await fetch('/api/profile/settings', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                        body: JSON.stringify({ soundLevel })
                      });
                      const updated = await res.json();
                      if (res.ok) {
                        setUser(updated);
                        setSelectedProfileUser(updated);
                      }
                    } catch (err) { console.error(err); }
                  }}
                  style={{ width: '100%', accentColor: 'var(--bg-accent-teal)', height: '5px', borderRadius: '5px', outline: 'none' }}
                />
              </div>
            </div>
          )}

          {/* DM shortcut & Mod Tools if viewing other user profile */}
          {selectedProfileUser.id !== user?.id && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: 'auto', padding: '1rem 0' }}>
              {/* Friends control */}
              {token && (() => {
                const state = getFriendshipState(selectedProfileUser);
                let btnText = 'Add Friend';
                let btnClass = 'btn-primary';
                if (state === 'friends') {
                  return (
                    <div style={{ display: 'flex', gap: '0.5rem', width: '100%' }}>
                      <button 
                        className="btn btn-secondary" 
                        disabled 
                        style={{ flex: 1, fontSize: '0.85rem', cursor: 'default', background: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid rgba(16,185,129,0.2)' }}
                      >
                        ✓ Friends
                      </button>
                      <button 
                        className="btn btn-secondary" 
                        style={{ flex: 1, fontSize: '0.85rem', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}
                        onClick={async () => {
                          if (window.confirm(`Are you sure you want to unfriend ${selectedProfileUser.nickname}?`)) {
                            try {
                              const res = await fetch('/api/friends/remove', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                body: JSON.stringify({ friendId: selectedProfileUser.id })
                              });
                              const updated = await res.json();
                              if (res.ok) setUser(updated);
                            } catch (err) { console.error(err); }
                          }
                        }}
                      >
                        Unfriend
                      </button>
                    </div>
                  );
                }

                if (state === 'sent') {
                  btnText = 'Cancel Request';
                  btnClass = 'btn-secondary';
                } else if (state === 'received') {
                  btnText = 'Accept Friend Request';
                  btnClass = 'btn-primary';
                }

                return (
                  <button 
                    className={`btn ${btnClass}`}
                    style={{ width: '100%', fontSize: '0.85rem' }}
                    onClick={async () => {
                      const url = state === 'sent' ? '/api/friends/remove' : '/api/friends/add';
                      try {
                        const res = await fetch(url, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                          body: JSON.stringify({ friendId: selectedProfileUser.id })
                        });
                        const updated = await res.json();
                        if (res.ok) {
                          setUser(updated);
                        }
                      } catch (err) { console.error(err); }
                    }}
                  >
                    {btnText}
                  </button>
                );
              })()}

              {/* Block control */}
              {token && (() => {
                const isBlocked = user?.blockedUsers?.includes(selectedProfileUser.id);
                return (
                  <button 
                    className="btn btn-secondary"
                    style={{ width: '100%', fontSize: '0.85rem', color: isBlocked ? 'var(--warning)' : 'inherit' }}
                    onClick={async () => {
                      try {
                        const res = await fetch('/api/block/toggle', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                          body: JSON.stringify({ blockId: selectedProfileUser.id })
                        });
                        const updated = await res.json();
                        if (res.ok) {
                          setUser(updated);
                        }
                      } catch (err) { console.error(err); }
                    }}
                  >
                    {isBlocked ? 'Unblock User' : 'Block User'}
                  </button>
                );
              })()}

              {/* Report control */}
              {token && (
                <button 
                  className="btn btn-secondary"
                  style={{ width: '100%', fontSize: '0.85rem', color: 'var(--danger)' }}
                  onClick={async () => {
                    const reason = window.prompt('Please enter the reason for reporting this user:');
                    if (!reason) return;
                    try {
                      const res = await fetch('/api/report', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                        body: JSON.stringify({ reportedId: selectedProfileUser.id, reason })
                      });
                      if (res.ok) {
                        alert('Thank you. Your report has been submitted to moderators.');
                      }
                    } catch (err) { console.error(err); }
                  }}
                >
                  Report User
                </button>
              )}

              {selectedProfileUser.id !== user?.id && (
                <button 
                  className="btn btn-primary" 
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                  onClick={() => {
                    handleSelectChat(selectedProfileUser, 'dm');
                    setActiveTab('dms');
                    setSelectedProfileUser(null);
                  }}
                >
                  <MessageSquare size={16} /> Send Direct Message
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ----------------------------------------------------
          MODALS & FLOATING CALLING SCREENS
      ---------------------------------------------------- */}

      {/* 1. Lightbox Image Viewer */}
      {lightboxImage && (
        <div className="modal-overlay" onClick={() => setLightboxImage(null)}>
          <img src={lightboxImage} alt="Large preview" className="lightbox-modal" />
        </div>
      )}

      {/* 2. Create Room Modal (Screenshot 2 - Pure White modal overlay) */}
      {isCreateRoomOpen && (
        <div className="white-modal-overlay" onClick={() => setIsCreateRoomOpen(false)}>
          <div className="white-modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 className="white-modal-title">Create a chat room</h3>
            <form onSubmit={handleCreateRoom}>
              {/* Text Input */}
              <div className="white-modal-input-wrapper">
                <input 
                  type="text" 
                  className="white-modal-input" 
                  value={newRoomName} 
                  onChange={(e) => setNewRoomName(e.target.value)} 
                  placeholder="Enter a name for your room"
                  maxLength={25}
                  required 
                />
              </div>

              {/* Radio options */}
              <div className="white-modal-radio-group">
                <div className="white-modal-radio-option" onClick={() => setIsPrivateRoom(true)}>
                  <div className={`white-modal-radio-circle ${isPrivateRoom ? 'selected' : ''}`}>
                    {isPrivateRoom && <div className="white-modal-radio-inner" />}
                  </div>
                  <div className="white-modal-radio-text">
                    <span className="white-modal-radio-label">Private use chat room</span>
                    <span className="white-modal-radio-desc">A personal room for friends/ meeting/ education.</span>
                  </div>
                </div>

                <div className="white-modal-radio-option" onClick={() => setIsPrivateRoom(false)}>
                  <div className={`white-modal-radio-circle ${!isPrivateRoom ? 'selected' : ''}`}>
                    {!isPrivateRoom && <div className="white-modal-radio-inner" />}
                  </div>
                  <div className="white-modal-radio-text">
                    <span className="white-modal-radio-label">Public chat room</span>
                    <span className="white-modal-radio-desc">An open room for Internet users. Submits your room to H70 Search, Google & Bing.</span>
                  </div>
                </div>
              </div>

              {/* Checkboxes */}
              <div className="white-modal-checkbox-option" onClick={() => setIsPasswordProtected(!isPasswordProtected)}>
                <div className={`white-modal-checkbox-box ${isPasswordProtected ? 'selected' : ''}`}>
                  {isPasswordProtected && <Check size={12} />}
                </div>
                <span>Password protection (optional)</span>
              </div>

              {isPasswordProtected && (
                <div className="white-modal-input-wrapper" style={{ marginTop: '-0.5rem', marginBottom: '1.25rem' }}>
                  <input 
                    type="password" 
                    className="white-modal-input" 
                    value={roomPassword}
                    onChange={(e) => setRoomPassword(e.target.value)}
                    placeholder="Enter security password"
                    required
                  />
                </div>
              )}

              <div className="white-modal-checkbox-option" onClick={() => setIsSubmittedToSearch(!isSubmittedToSearch)}>
                <div className={`white-modal-checkbox-box ${isSubmittedToSearch ? 'selected' : ''}`}>
                  {isSubmittedToSearch && <Check size={12} />}
                </div>
                <span>Submit to H70's Search (optional)</span>
              </div>

              {/* Collapsible Info Panel */}
              <div style={{ marginTop: '1.25rem', borderTop: '1px solid #e5e7eb', paddingTop: '1rem' }}>
                <div 
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700, color: 'var(--bg-accent)' }}
                  onClick={() => setIsReadInfoPanelOpen(!isReadInfoPanelOpen)}
                >
                  <span>Creating room for meeting/ webinar/ education? Read this</span>
                  <ChevronDown size={14} style={{ transform: isReadInfoPanelOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                </div>
                {isReadInfoPanelOpen && (
                  <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '0.5rem', lineHeight: 1.4 }}>
                    By starting channels in the Lounge, you agree to keep the rooms secure, refrain from posting copyrighted media, and moderate participants.
                  </div>
                )}
              </div>

              {/* Footer buttons */}
              <div className="white-modal-footer">
                <button type="button" className="white-modal-btn-cancel" onClick={() => setIsCreateRoomOpen(false)}>
                  CANCEL
                </button>
                <button type="submit" className="white-modal-btn-continue">
                  CONTINUE
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2.5 User Actions popup Modal (Screenshot 5 - Pure White option box overlay) */}
      {activeUserPopup && (
        <div className="white-modal-overlay" onClick={() => setActiveUserPopup(null)}>
          <div className="user-action-popup-content" onClick={(e) => e.stopPropagation()}>
            <button className="user-action-popup-close" onClick={() => setActiveUserPopup(null)}>
              <X size={16} />
            </button>
            <h3 className="user-action-popup-title">
              {activeUserPopup.nickname} {activeUserPopup.animal ? ' ' + activeUserPopup.animal.split(' ')[0] : ''}
            </h3>
            <div className="user-action-popup-list">
              <button className="user-action-popup-item" onClick={() => {
                setBioInput(activeUserPopup.bio || '');
                setSelectedProfileUser(activeUserPopup);
                setActiveUserPopup(null);
              }}>
                <Info size={16} style={{ color: '#4b5563' }} /> View Profile
              </button>
              
              {activeUserPopup.id !== user?.id && (
                <button className="user-action-popup-item" onClick={() => {
                  handleSelectChat(activeUserPopup, 'dm');
                  setCurrentNav('chat');
                  setActiveTab('dms');
                  setActiveUserPopup(null);
                }}>
                  <MessageSquare size={16} style={{ color: '#4b5563' }} /> Private Message
                </button>
              )}

              {token && activeUserPopup.id !== user?.id && (() => {
                const state = getFriendshipState(activeUserPopup);
                return (
                  <button className="user-action-popup-item" onClick={async () => {
                    const url = (state === 'friends' || state === 'sent') ? '/api/friends/remove' : '/api/friends/add';
                    try {
                      const res = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                        body: JSON.stringify({ friendId: activeUserPopup.id })
                      });
                      const updated = await res.json();
                      if (res.ok) {
                        setUser(updated);
                      }
                    } catch (err) { console.error(err); }
                    setActiveUserPopup(null);
                  }}>
                    <UserPlus size={16} style={{ color: '#4b5563' }} /> 
                    {state === 'friends' ? 'Remove Friend' : state === 'sent' ? 'Cancel Request' : 'Add Friend'}
                  </button>
                );
              })()}

              {token && activeUserPopup.id !== user?.id && (() => {
                const isBlocked = user?.blockedUsers?.includes(activeUserPopup.id);
                return (
                  <button className="user-action-popup-item" onClick={async () => {
                    try {
                      const res = await fetch('/api/block/toggle', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                        body: JSON.stringify({ blockId: activeUserPopup.id })
                      });
                      const updated = await res.json();
                      if (res.ok) {
                        setUser(updated);
                      }
                    } catch (err) { console.error(err); }
                    setActiveUserPopup(null);
                  }}>
                    <Ban size={16} style={{ color: '#4b5563' }} />
                    {isBlocked ? 'Unblock User' : 'Block User'}
                  </button>
                );
              })()}

              {token && activeUserPopup.id !== user?.id && (
                <button className="user-action-popup-item danger" onClick={async () => {
                  const reason = window.prompt('Please enter the reason for reporting this user:');
                  if (reason) {
                    try {
                      await fetch('/api/report', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                        body: JSON.stringify({ reportedId: activeUserPopup.id, reason })
                      });
                      alert('Thank you. Your report has been submitted to moderators.');
                    } catch (err) { console.error(err); }
                  }
                  setActiveUserPopup(null);
                }}>
                  <AlertTriangle size={16} style={{ color: '#ef4444' }} /> Report User
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 3. Add Story Modal */}
      {isAddingStory && (
        <div className="modal-overlay" onClick={() => setIsAddingStory(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">Publish Profile Story</h3>
            <form onSubmit={handlePostStory}>
              <div className="auth-form-group" style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                <label className="auth-label" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
                  <input type="radio" name="storyType" checked={storyType === 'text'} onChange={() => setStoryType('text')} />
                  Text Status
                </label>
                <label className="auth-label" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
                  <input type="radio" name="storyType" checked={storyType === 'image'} onChange={() => setStoryType('image')} />
                  Image Upload
                </label>
              </div>

              {storyType === 'text' ? (
                <div className="auth-form-group">
                  <label className="auth-label">Story text status</label>
                  <input 
                    type="text" 
                    className="auth-input" 
                    value={storyContent} 
                    onChange={(e) => setStoryContent(e.target.value)} 
                    placeholder="What is on your mind?"
                    maxLength={60}
                    required 
                  />
                </div>
              ) : (
                <div className="auth-form-group">
                  <label className="auth-label">Select Image File</label>
                  <input 
                    type="file" 
                    accept="image/*" 
                    className="auth-input"
                    onChange={(e) => setStoryFile(e.target.files[0])}
                    required 
                  />
                </div>
              )}

              <div className="modal-buttons">
                <button type="button" className="btn btn-secondary" onClick={() => setIsAddingStory(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Publish Story</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. Stories Viewer Carousel */}
      {storiesViewer && (
        <div className="modal-overlay" onClick={() => setStoriesViewer(null)}>
          <div className="stories-modal-viewer" onClick={(e) => e.stopPropagation()}>
            {/* Progress Segment */}
            <div className="story-progress-indicator-bar">
              {storiesViewer.stories.map((s, idx) => (
                <div 
                  key={s.id} 
                  className={`story-progress-segment ${idx <= storiesViewer.index ? 'completed' : ''}`}
                />
              ))}
            </div>

            {/* Story Header info */}
            <div className="story-header-user">
              <div className="story-user-info-row">
                <div className="avatar-circle" style={{ width: '32px', height: '32px', fontSize: '0.75rem' }}>
                  👁️
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>Story update</div>
                  <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.6)' }}>
                    {new Date(storiesViewer.stories[storiesViewer.index].createdAt).toLocaleTimeString()}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {storiesViewer.userId === user?.id && (
                  <button 
                    className="input-icon-btn" 
                    onClick={() => handleDeleteStory(storiesViewer.stories[storiesViewer.index].id)}
                    style={{ background: 'rgba(239,68,68,0.4)', color: 'white' }}
                    title="Delete Story"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
                <button 
                  className="input-icon-btn" 
                  onClick={() => setStoriesViewer(null)}
                  style={{ background: 'rgba(0,0,0,0.4)', color: 'white' }}
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Story contents */}
            <div className="story-content-body">
              {storiesViewer.stories[storiesViewer.index].type === 'text' ? (
                <div className="story-text-display">
                  "{storiesViewer.stories[storiesViewer.index].content}"
                </div>
              ) : (
                <img 
                  src={storiesViewer.stories[storiesViewer.index].content} 
                  className="story-image-display" 
                  alt="Story content" 
                />
              )}
            </div>

            {/* Navigation clicks */}
            <div 
              className="story-navigation-zone prev" 
              onClick={() => {
                if (storiesViewer.index > 0) {
                  setStoriesViewer(prev => ({ ...prev, index: prev.index - 1 }));
                }
              }}
            />
            <div 
              className="story-navigation-zone next" 
              onClick={() => {
                if (storiesViewer.index < storiesViewer.stories.length - 1) {
                  setStoriesViewer(prev => ({ ...prev, index: prev.index + 1 }));
                } else {
                  setStoriesViewer(null); // End of stories
                }
              }}
            />
          </div>
        </div>
      )}

      {/* 5. Incoming 1-on-1 Call Request Ringing Overlay */}
      {callState && callState.status === 'incoming' && (
        <div className="modal-overlay">
          <div className="call-modal">
            <div className="calling-user-avatar">
              {callState.nickname?.substring(0, 2).toUpperCase()}
              <div className="calling-avatar-ring"></div>
            </div>
            <h3 className="call-title">{callState.nickname}</h3>
            <p className="call-subtitle">
              Incoming H70 {callState.isVideo ? 'Video' : 'Voice'} Call...
            </p>
            <div className="call-actions-row">
              <button className="call-btn btn-decline" onClick={declineCall} title="Decline Call">
                <PhoneOff size={24} />
              </button>
              <button className="call-btn btn-accept" onClick={acceptCall} title="Accept Call">
                <Phone size={24} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Active 1-on-1 Calling Session Window (Floating panel) */}
      {callState && (callState.status === 'ringing' || callState.status === 'connected') && (
        <div className="call-session-container">
          {callState.isVideo ? (
            // Video Call Feed Panel
            <div className="video-feeds-grid">
              {callState.status === 'connected' && remoteStream ? (
                <video ref={remoteVideoRef} className="remote-video" autoPlay playsInline />
              ) : (
                <div style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', color: 'var(--text-secondary)' }}>
                  <div className="calling-avatar-ring" style={{ width: '40px', height: '40px', position: 'static' }}></div>
                  <span style={{ fontSize: '0.85rem', marginTop: '1rem' }}>Ringing {callState.nickname}...</span>
                </div>
              )}
              {/* Local self video preview */}
              <video ref={localVideoRef} className="local-video-preview" autoPlay muted playsInline />
            </div>
          ) : (
            // Voice Call Panel
            <div className="voice-call-only-panel">
              <div className="calling-user-avatar" style={{ marginBottom: '0.75rem', width: '64px', height: '64px', fontSize: '1.4rem' }}>
                {callState.nickname?.substring(0, 2).toUpperCase()}
                {callState.status === 'ringing' && <div className="calling-avatar-ring"></div>}
              </div>
              <div style={{ fontWeight: 600 }}>{callState.nickname}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                {callState.status === 'connected' ? 'Connected (Voice Call)' : 'Calling...'}
              </div>
              {/* Hidden audio components */}
              <audio ref={localVideoRef} autoPlay muted style={{ display: 'none' }} />
              <audio ref={remoteVideoRef} autoPlay style={{ display: 'none' }} />
            </div>
          )}

          {/* Active Call Controls */}
          <div className="call-control-footer">
            <button 
              className={`control-circle-btn ${isMicMuted ? 'muted' : ''}`} 
              onClick={toggleMute}
              title={isMicMuted ? 'Unmute microphone' : 'Mute microphone'}
            >
              <MicOff size={16} />
            </button>
            <button 
              className="control-circle-btn btn-hangup-control" 
              onClick={hangUpCall}
              title="Hang Up"
            >
              <PhoneOff size={16} />
            </button>
            {callState.isVideo && (
              <button 
                className={`control-circle-btn ${isCameraOff ? 'muted' : ''}`} 
                onClick={toggleCamera}
                title={isCameraOff ? 'Turn on camera' : 'Turn off camera'}
              >
                <VideoOff size={16} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* 5. Floating Toast Notification */}
      {activeToast && (
        <div 
          className="active-toast-alert"
          onClick={() => setActiveToast(null)}
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--bg-accent-teal)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
            borderRadius: '12px',
            padding: '0.85rem 1.25rem',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            gap: '0.25rem',
            cursor: 'pointer',
            maxWidth: '280px',
            animation: 'slideIn 0.3s ease-out'
          }}
        >
          <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--bg-accent-teal)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {activeToast.title}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-primary)', wordBreak: 'break-word', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {activeToast.content}
          </div>
        </div>
      )}

    </div>
  );
}
