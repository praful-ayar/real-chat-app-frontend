import { Component, NgZone, OnInit, OnDestroy, ChangeDetectorRef, ViewChild, ElementRef, HostListener } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

import { MatToolbarModule } from '@angular/material/toolbar';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatCardModule } from '@angular/material/card';
import { MatSelectModule } from '@angular/material/select';
import { MatOptionModule } from '@angular/material/core';
import { MatAutocompleteModule } from '@angular/material/autocomplete';

import { EmojiPickerComponent } from '../../../../shared/emoji-picker/emoji-picker';
import { SocketService } from '../../../../services/socket.service';
import { AuthService } from '../../../../core/services/auth.service';
import { environment } from '../../../../environments/environment';


export interface ChatMessage {
  _id?: string;
  user?: string;
  username?: string;
  email?: string;
  firstname?: string;
  lastname?: string;
  profileImage?: string;
  message?: string;
  text?: string;
  receiver?: string;
  timestamp?: Date | string | number;
  createdAt?: Date | string | number;
  // Reply functionality fields
  replyTo?: string;
  replyToText?: string;
  replyToSender?: string;
  isEdited?: boolean;
  status?: 'sent' | 'delivered' | 'seen';
  reactions?: { emoji: string, email: string }[];
}

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatToolbarModule,
    MatInputModule,
    MatButtonModule,
    MatListModule,
    MatIconModule,
    MatMenuModule,
    MatCardModule,
    MatSelectModule,
    MatOptionModule,
    MatAutocompleteModule,
    EmojiPickerComponent
  ],
  templateUrl: './chat.html',
  styleUrls: ['./chat.css']
})
export class Chat implements OnInit, OnDestroy {

  @ViewChild('scrollMe') private myScrollContainer!: ElementRef;
  @ViewChild('messageInput') messageInput!: ElementRef;
  @ViewChild('emojiToggleButton', { read: ElementRef }) emojiToggleButton!: ElementRef;
  @ViewChild('emojiPicker', { read: ElementRef }) emojiPicker!: ElementRef;
  @ViewChild('video') video!: ElementRef;
  @ViewChild('canvas') canvas!: ElementRef;
  @ViewChild('mediaInput') mediaInput!: ElementRef;
  @ViewChild('statusInput') statusInput!: ElementRef;
  @ViewChild('localVideoCall') localVideoCall!: ElementRef;
  @ViewChild('remoteVideoCall') remoteVideoCall!: ElementRef;

  stream: any;
  message = '';
  messages: ChatMessage[] = [];
  onlineUsers: string[] = [];
  currentUser: string | null = null;
  currentUserName: string | null = null;
  selectedUser: string | null = null;
  selectedUserName: string | null = null;
  selectedUserImage: string | null = null;
  unreadCounts: { [key: string]: number } = {};

  profileImage: string | null = null;
  showProfileSettings = false;
  isSavingProfile = false;
  editFirstname = '';
  editLastname = '';
  showEmojis = false;
  showCamera = false;
  typingUsers: string[] = [];
  typingTimeout: any;
  replyingToMessage: ChatMessage | null = null;
  editingMessage: ChatMessage | null = null;
  autoTranslate: boolean = false;
  isTranslating: boolean = false;
  isMobileChatView: boolean = false;
  searchQuery: string = '';
  searchTimeout: any;
  targetLanguage: string = 'English';
  availableLanguages: string[] = ['English', 'Hindi', 'Gujarati', 'Marathi', 'Bengali', 'Spanish', 'French', 'German'];

  newContactEmail: string = '';
  myContacts: any[] = [];
  searchResults: any[] = [];
  contactSearchTimeout: any;
  pendingRequests: any[] = [];
  showReactionPopup: string | null = null;
  reactingToMessageId: string | null = null;

  // Stories / Status features
  statuses: any[] = [];
  myStatus: any = null;
  showStatusViewer = false;
  currentViewingStatusUser: any = null;
  currentStatusIndex = 0;
  statusProgressTimer: any;
  statusProgress = 0;
  showViewersList = false;
  statusReplyText: string = '';

  // Video Calling features
  peerConnection: RTCPeerConnection | null = null;
  localStreamCall: MediaStream | null = null;
  remoteStreamCall: MediaStream | null = null;
  isCalling = false;
  isInCall = false;
  isRinging = false;
  incomingCallData: any = null;
  callRemoteUser: string | null = null;
  pendingIceCandidates: any[] = [];
  ringtoneAudio: HTMLAudioElement | null = null;
  dialToneAudio: HTMLAudioElement | null = null;

  constructor(
    private socket: SocketService,
    private zone: NgZone,
    private cdr: ChangeDetectorRef,
    private router: Router,
    private authService: AuthService
  ) { }

  async ngOnInit() {
    this.requestNotificationPermission();
    this.currentUser = localStorage.getItem('user');
    const fname = localStorage.getItem('firstname') || '';
    const lname = localStorage.getItem('lastname') || '';
    this.currentUserName = `${fname} ${lname}`.trim() || this.currentUser;
    this.profileImage = localStorage.getItem('profileImage');

    if (this.currentUser) {
      this.socket.join(this.currentUser);
    } else {
      console.warn('No user found in localStorage. Please log in.');
      this.router.navigate(['/']);
      return;
    }

    // Restore selected user state from local storage on refresh
    const savedSelectedUser = localStorage.getItem('selectedUserEmail');
    if (savedSelectedUser) {
      this.selectedUser = savedSelectedUser;
      const sfname = localStorage.getItem('selectedUserFirstname') || '';
      const slname = localStorage.getItem('selectedUserLastname') || '';
      this.selectedUserName = `${sfname} ${slname}`.trim() || savedSelectedUser;
      this.selectedUserImage = localStorage.getItem('selectedUserProfileImage') || null;
    }

    // Restore unread counts from local storage
    const savedUnreadCounts = localStorage.getItem('unreadCounts');
    if (savedUnreadCounts) {
      try {
        this.unreadCounts = JSON.parse(savedUnreadCounts);
      } catch (e) {
        this.unreadCounts = {}; // Reset if data is corrupt
      }
    }

    // Load contacts first
    await this.fetchMyContacts();
    await this.fetchRequests();
    // Load statuses
    await this.fetchStatuses();

    // Load messages (will automatically load private chat if restored above)
    this.loadMessages();

    this.socket.onUsers((u: any[]) => {
      this.zone.run(() => {
        this.onlineUsers = u.map(user => user.email);
        this.cdr.detectChanges();
      });
    });

    this.socket.onMessage((msg: ChatMessage) => {
      this.zone.run(() => {
        // Only show public broadcast if we are currently in Public Chat
        if (!this.selectedUser) {
          if (!this.messages.some(m => m._id === msg._id)) {
            this.messages.push(msg);
            this.cdr.detectChanges();
            this.scrollToBottom();
          }
        } else {
          if ((msg.email || msg.username || msg.user) !== this.currentUser) {
            this.unreadCounts = { ...this.unreadCounts, 'public': (this.unreadCounts['public'] || 0) + 1 };
            localStorage.setItem('unreadCounts', JSON.stringify(this.unreadCounts));
            this.cdr.detectChanges();
          }
        }
      });
    });

    this.socket.socket.on('messageStatusUpdated', (data: { messageIds: string[], status: string }) => {
      this.zone.run(() => {
        let updated = false;
        this.messages.forEach(m => {
          if (data.messageIds.includes(m._id!)) {
            m.status = data.status as any;
            updated = true;
          }
        });
        if (updated) this.cdr.detectChanges();
      });
    });

    this.socket.socket.on('privateMessage', (msg: ChatMessage) => {
      this.zone.run(() => {
        // Only show message if we are chatting with that specific user
        if (
          (msg.email === this.selectedUser && msg.receiver === this.currentUser) ||
          (msg.email === this.currentUser && msg.receiver === this.selectedUser)
        ) {
          if (!this.messages.some(m => m._id === msg._id)) {
            if (msg.email !== this.currentUser && msg._id) {
              this.socket.socket.emit("updateMessageStatus", {
                messageIds: [msg._id],
                status: 'seen',
                senderEmail: msg.email
              });
              msg.status = 'seen';
            }
            this.messages.push(msg);
            this.cdr.detectChanges();
            this.scrollToBottom();
          }
        } else {
          if (msg.receiver === this.currentUser && msg.email !== this.currentUser) {
            if (msg._id) {
              this.socket.socket.emit("updateMessageStatus", {
                messageIds: [msg._id],
                status: 'delivered',
                senderEmail: msg.email
              });
            }
            const sender = msg.email!;
            this.unreadCounts = { ...this.unreadCounts, [sender]: (this.unreadCounts[sender] || 0) + 1 };
            localStorage.setItem('unreadCounts', JSON.stringify(this.unreadCounts));
            this.cdr.detectChanges();
          }
        }
      });
    });

    this.socket.socket.on('messageDeleted', (id: string) => {
      this.zone.run(() => {
        this.messages = this.messages.filter(m => m._id !== id);
        this.cdr.detectChanges();
      });
    });

    this.socket.socket.on('messageEdited', (data: { id: string, text: string }) => {
      this.zone.run(() => {
        const msg = this.messages.find(m => m._id === data.id);
        if (msg) {
          msg.text = data.text;
          msg.message = data.text;
          msg.isEdited = true;
          this.cdr.detectChanges();
        }
      });
    });

    this.socket.socket.on('typing', (data: { sender: string, senderName: string, receiver: string | null }) => {
      this.zone.run(() => {
        if (data.receiver === this.currentUser && this.selectedUser === data.sender) {
          if (!this.typingUsers.includes(data.senderName)) this.typingUsers.push(data.senderName);
        } else if (!data.receiver && !this.selectedUser) {
          if (!this.typingUsers.includes(data.senderName)) this.typingUsers.push(data.senderName);
        }
        this.cdr.detectChanges();
        this.scrollToBottom();
      });
    });

    this.socket.socket.on('stopTyping', (data: { sender: string, senderName: string, receiver: string | null }) => {
      this.zone.run(() => {
        this.typingUsers = this.typingUsers.filter(name => name !== data.senderName);
        this.cdr.detectChanges();
      });
    });

    this.socket.socket.on('contactRequestReceived', () => {
      this.zone.run(() => {
        this.fetchRequests(); // Refresh list to get populated user details
      });
    });

    this.socket.socket.on('contactRequestAccepted', () => {
      this.zone.run(() => {
        this.fetchMyContacts();
      });
    });

    this.socket.socket.on('messageReaction', (data: { id: string, reactions: any[] }) => {
      this.zone.run(() => {
        const msg = this.messages.find(m => m._id === data.id);
        if (msg) {
          msg.reactions = data.reactions;
          this.cdr.detectChanges();
        }
      });
    });

    // Video Calling Socket Listeners
    this.socket.socket.on("incomingCall", (data: any) => {
      this.zone.run(() => {
        // Ignore if we are already in a call
        if (this.isInCall || this.isCalling) {
          this.socket.socket.emit("endCall", { to: data.from });
          return;
        }
        this.incomingCallData = data;
        this.playRingtone();
        this.socket.socket.emit("callRinging", { to: data.from });

        // Show Browser Notification for Incoming Call
        if ('Notification' in window && Notification.permission === 'granted') {
          const notif = new Notification(`Incoming Video Call`, {
            body: `${data.fromName} is calling you...`,
            requireInteraction: true
          });
          notif.onclick = () => {
            window.focus();
            notif.close();
          };
        }

        this.cdr.detectChanges();
      });
    });

    this.socket.socket.on("callRinging", () => {
      this.zone.run(() => {
        this.isRinging = true;
        this.cdr.detectChanges();
      });
    });

    this.socket.socket.on("callAccepted", (signal: any) => {
      this.zone.run(async () => {
        this.stopDialTone();
        if (this.peerConnection) {
          await this.peerConnection.setRemoteDescription(new RTCSessionDescription(signal));
          
          // Apply any buffered ICE candidates
          this.pendingIceCandidates.forEach(c => {
            this.peerConnection!.addIceCandidate(new RTCIceCandidate(c)).catch(e => console.error(e));
          });
          this.pendingIceCandidates = [];

          this.isCalling = false;
          this.isInCall = true;
          this.cdr.detectChanges();
        }
      });
    });

    this.socket.socket.on("iceCandidate", (candidate: any) => {
      this.zone.run(() => {
        if (this.peerConnection && this.peerConnection.remoteDescription) {
          this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate)).catch(e => console.error(e));
        } else {
          this.pendingIceCandidates.push(candidate); // Save it to apply after accepting
        }
      });
    });

    this.socket.socket.on("callEnded", () => {
      this.zone.run(() => { this.cleanupCall(); this.cdr.detectChanges(); });
    });
  }

  isUserOnline(email: string): boolean {
    return this.onlineUsers.includes(email);
  }

  async loadMessages() {
    try {
      let url = `${environment.apiUrl}/messages`;
      const params = new URLSearchParams();
      if (this.selectedUser) {
        params.append('sender', this.currentUser || '');
        params.append('receiver', this.selectedUser);
      }
      if (this.searchQuery && this.searchQuery.trim()) {
        params.append('search', this.searchQuery.trim());
      }
      const qs = params.toString();
      if (qs) url += `?${qs}`;

      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        this.zone.run(() => {
          this.messages = data;

          if (this.selectedUser) {
            const unseenIds = this.messages
              .filter(m => m.receiver === this.currentUser && m.email === this.selectedUser && m.status !== 'seen')
              .map(m => m._id!);

            if (unseenIds.length > 0) {
              this.socket.socket.emit('updateMessageStatus', {
                messageIds: unseenIds,
                status: 'seen',
                senderEmail: this.selectedUser
              });
              this.messages.forEach(m => {
                if (unseenIds.includes(m._id!)) m.status = 'seen';
              });
            }
          }

          this.cdr.detectChanges();
          this.scrollToBottom();
        });
      }
    } catch (error) {
      console.error('Failed to fetch messages API', error);
    }
  }

  selectUser(email: string | null, firstname?: string, lastname?: string, profileImage?: string) {
    if (email === this.currentUser) return; // Prevent chatting with self
    this.selectedUser = email;
    this.searchQuery = '';
    if (email === null) {
      this.selectedUserName = null;
      this.selectedUserImage = null;
      localStorage.removeItem('selectedUserEmail');
      localStorage.removeItem('selectedUserFirstname');
      localStorage.removeItem('selectedUserLastname');
      localStorage.removeItem('selectedUserProfileImage');
    } else {
      this.selectedUserName = `${firstname || ''} ${lastname || ''}`.trim() || email;
      this.selectedUserImage = profileImage || null;
      localStorage.setItem('selectedUserEmail', email);
      localStorage.setItem('selectedUserFirstname', firstname || '');
      localStorage.setItem('selectedUserLastname', lastname || '');
      if (profileImage) {
        localStorage.setItem('selectedUserProfileImage', profileImage);
      } else {
        localStorage.removeItem('selectedUserProfileImage');
      }
    }

    if (email === null) {
      this.unreadCounts = { ...this.unreadCounts, 'public': 0 };
    } else {
      this.unreadCounts = { ...this.unreadCounts, [email]: 0 };
    }
    localStorage.setItem('unreadCounts', JSON.stringify(this.unreadCounts));
    this.typingUsers = []
    this.loadMessages();
    this.isMobileChatView = true;
  }

  backToSidebar() {
    this.isMobileChatView = false;
  }

  onSearchChange() {
    if (this.searchTimeout) clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => {
      this.loadMessages();
    }, 400);
  }

  toggleProfileSettings() {
    this.showProfileSettings = !this.showProfileSettings;
    if (this.showProfileSettings) {
      this.editFirstname = localStorage.getItem('firstname') || '';
      this.editLastname = localStorage.getItem('lastname') || '';
    }
  }

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.zone.run(() => {
          this.profileImage = e.target.result;
          this.cdr.detectChanges();
        });
      };
      reader.readAsDataURL(file);
    }
  }

  async saveProfile() {
    if (!this.currentUser || this.isSavingProfile) return;
    this.isSavingProfile = true;
    try {
      const res = await this.authService.updateProfile({
        email: this.currentUser,
        firstname: this.editFirstname,
        lastname: this.editLastname,
        profileImage: this.profileImage
      });
      this.currentUserName = `${res.firstname} ${res.lastname}`.trim();
      localStorage.setItem('firstname', res.firstname);
      localStorage.setItem('lastname', res.lastname);
      if (res.profileImage) {
        localStorage.setItem('profileImage', res.profileImage);
        this.profileImage = res.profileImage;
      } else {
        localStorage.removeItem('profileImage');
        this.profileImage = null;
      }
      this.toggleProfileSettings();
      this.cdr.detectChanges();

      // Notify socket server to update this user's profile across all connected clients
      this.socket.socket.emit('updateProfile', this.currentUser);
    } catch (err) {
      console.error('Failed to update profile:', err);
    } finally {
      this.isSavingProfile = false;
      this.cdr.detectChanges();
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    
    // Close reaction popup if clicked outside
    if (!target.closest('.reaction-btn-trigger') && !target.closest('.reaction-popup')) {
      this.showReactionPopup = null;
    }
    
    // Close emoji picker if clicked outside of it and not clicking the toggle button
    if (this.showEmojis && !target.closest('app-emoji-picker') && !target.closest('.emoji-toggle-btn')) {
      this.showEmojis = false;
      this.cdr.detectChanges();
    }
  }

  toggleEmojis(event?: MouseEvent) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    this.showEmojis = !this.showEmojis;
    this.reactingToMessageId = null;
  }

  openReactionEmojiPicker(msgId: string | undefined, event: MouseEvent) {
    if (!msgId) return;
    event.stopPropagation();
    this.reactingToMessageId = msgId;
    this.showReactionPopup = null;
    this.showEmojis = true;
  }

  addEmoji(emoji: string) {
    if (this.reactingToMessageId) {
      this.reactToMessage(this.reactingToMessageId, emoji);
      this.reactingToMessageId = null;
      this.showEmojis = false;
    } else {
      this.message += emoji;
      this.messageInput.nativeElement.focus();
    }
  }

  toggleReactionPopup(msgId: string | undefined, event: MouseEvent) {
    if (!msgId) return;
    event.stopPropagation();
    this.showReactionPopup = this.showReactionPopup === msgId ? null : msgId;
  }

  async reactToMessage(msgId: string | undefined, emoji: string) {
    if (!msgId || !this.currentUser) return;
    this.showReactionPopup = null;
    this.cdr.detectChanges();
    try {
      const response = await fetch(`${environment.apiUrl}/messages/${msgId}/react`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ emoji, email: this.currentUser })
      });

      if (response.ok) {
        const reactionData = await response.json();
        this.zone.run(() => {
          const msg = this.messages.find(m => m._id === msgId);
          if (msg) {
            msg.reactions = reactionData.reactions;
            this.cdr.detectChanges();
          }
        });
      }
    } catch (err) { console.error('Reaction failed', err); }
  }

  startReply(message: ChatMessage) {
    this.replyingToMessage = message;
    this.cancelEdit();
    this.messageInput.nativeElement.focus();
  }

  cancelReply() {
    this.replyingToMessage = null;
  }

  startEdit(message: ChatMessage) {
    this.editingMessage = message;
    this.message = message.text || message.message || '';
    this.cancelReply();
    setTimeout(() => this.messageInput.nativeElement.focus(), 0);
  }

  cancelEdit() {
    this.editingMessage = null;
    this.message = '';
  }

  getReplySenderName(message: ChatMessage | null): string {
    if (!message) return '';
    return message.firstname || (message.email || message.user)?.split('@')[0] || 'User';
  }

  scrollToMessage(messageId: string | undefined) {
    if (!messageId) return;
    const element = document.getElementById(`msg-${messageId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Add a temporary highlight effect
      const messageBubble = element.querySelector('.message');
      if (messageBubble) {
        messageBubble.classList.add('highlight');
        setTimeout(() => messageBubble.classList.remove('highlight'), 1500);
      }
    }
  }

  onTyping() {
    if (!this.currentUser) return;

    this.socket.socket.emit('typing', {
      sender: this.currentUser,
      senderName: this.currentUserName,
      receiver: this.selectedUser
    });

    if (this.typingTimeout) clearTimeout(this.typingTimeout);

    this.typingTimeout = setTimeout(() => {
      this.socket.socket.emit('stopTyping', {
        sender: this.currentUser,
        senderName: this.currentUserName,
        receiver: this.selectedUser
      });
    }, 2000);
  }

  sendGifDirect(gifUrl: string) {
    if (this.reactingToMessageId) {
      alert("GIFs cannot be used as reactions. Please select an emoji.");
      return;
    }
    if (gifUrl && gifUrl.trim() !== '') {
      const currentMsg = this.message;
      this.message = gifUrl.trim();
      this.send();
      setTimeout(() => { this.message = currentMsg; }, 100);
    }
  }

  getMediaType(text: string | undefined): 'image' | 'video' | 'audio' | 'file' | 'text' {
    if (!text) return 'text';
    if (text.startsWith('data:image/')) return 'image';
    if (text.startsWith('data:video/')) return 'video';
    if (text.startsWith('data:audio/')) return 'audio';
    if (text.startsWith('data:application/') || text.startsWith('data:text/')) return 'file';

    const urlPattern = /^(http|https):\/\/[^ "]+$/;
    if (urlPattern.test(text)) {
      if (text.match(/\.(jpeg|jpg|gif|png|webp)$/i) != null || text.includes('media.giphy.com') || text.includes('media.tenor.com')) return 'image';
      if (text.match(/\.(mp4|webm|ogg)$/i) != null) return 'video';
      if (text.match(/\.(mp3|wav)$/i) != null) return 'audio';
      if (text.match(/\.(pdf|doc|docx|xls|xlsx|txt|zip|rar)$/i) != null) return 'file';
    }
    return 'text';
  }

  isOnlyEmoji(text: string | undefined): boolean {
    if (!text) return false;
    const trimmed = text.trim();
    if (trimmed.length === 0) return false;

    // This regex checks if the string consists ONLY of one or more emojis and whitespace.
    const emojiOnlyRegex = /^(\p{Emoji_Presentation}|\p{Extended_Pictographic}|\u200d|\ufe0f|\s)+$/u;

    // We also check that it's not just whitespace
    return emojiOnlyRegex.test(trimmed) && trimmed.replace(/\s/g, '').length > 0;
  }

  async deleteMessage(messageId: string | undefined) {
    if (!messageId) return;
    try {
      const response = await fetch(`${environment.apiUrl}/messages/${messageId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        console.error('Failed to delete message via API');
      }
    } catch (err) {
      console.error('Failed to delete message via API:', err);
    }
  }

  async send() {
    if (!this.message.trim() || !this.currentUser || this.isTranslating) return;

    let textToSend = this.message.trim();
    this.message = '';
    this.showEmojis = false;

    if (this.autoTranslate && this.getMediaType(textToSend) === 'text' && !this.isOnlyEmoji(textToSend)) {
      this.isTranslating = true;
      try {
        const transRes = await fetch(`${environment.apiUrl}/translate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: textToSend, targetLanguage: this.targetLanguage })
        });
        if (transRes.ok) {
          const transData = await transRes.json();
          if (transData.translatedText) textToSend = transData.translatedText;
        }
      } catch (err) {
        console.error("Translation error", err);
      } finally {
        this.isTranslating = false;
      }
    }

    const payload: any = {
      email: this.currentUser,
      text: textToSend,
      receiver: this.selectedUser
    };

    if (this.replyingToMessage) {
      payload.replyTo = this.replyingToMessage._id;
      payload.replyToText = this.replyingToMessage.text || this.replyingToMessage.message;
      payload.replyToSender = this.replyingToMessage.firstname || (this.replyingToMessage.email || this.replyingToMessage.user)?.split('@')[0];
    }

    if (this.typingTimeout) clearTimeout(this.typingTimeout);
    this.socket.socket.emit('stopTyping', {
      sender: this.currentUser,
      senderName: this.currentUserName,
      receiver: this.selectedUser
    });

    if (this.editingMessage) {
      try {
        await fetch(`${environment.apiUrl}/messages/${this.editingMessage._id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: textToSend })
        });
      } catch (err) {
        console.error('Failed to edit message:', err);
      }
      this.cancelEdit();
      return;
    }

    this.cancelReply();

    // Send to REST API
    try {
      const response = await fetch(`${environment.apiUrl}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const newMsg = await response.json();
        this.zone.run(() => {
          if (!this.messages.some(m => m._id === newMsg._id)) {
            this.messages.push(newMsg);
            this.cdr.detectChanges();
            this.scrollToBottom();
          }
        });
      }
    } catch (err) {
      console.error('Failed to send message via API:', err);
    }
  }

  scrollToBottom(): void {
    setTimeout(() => {
      try {
        this.myScrollContainer.nativeElement.scrollTop = this.myScrollContainer.nativeElement.scrollHeight;
      } catch (err) { }
    }, 50);
  }

  ngOnDestroy() {
    this.socket.socket.off('message');
    this.socket.socket.off('users');
    this.socket.socket.off('messageDeleted');
    this.socket.socket.off('privateMessage');
    this.socket.socket.off('typing');
    this.socket.socket.off('stopTyping');
    this.socket.socket.off('messageEdited');
    this.socket.socket.off('messageStatusUpdated');
    this.socket.socket.off('contactRequestReceived');
    this.socket.socket.off('contactRequestAccepted');
    this.socket.socket.off('messageReaction');
    this.socket.socket.off('incomingCall');
    this.socket.socket.off('callRinging');
    this.socket.socket.off('callAccepted');
    this.socket.socket.off('iceCandidate');
    this.socket.socket.off('callEnded');
  }

  logout() {
    this.authService.logout();
    localStorage.removeItem('unreadCounts');
    this.router.navigate(['/']);
  }

  onMediaSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        alert("File size exceeds 10MB limit.");
        return;
      }
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.zone.run(() => {
          const base64Data = e.target.result;
          this.sendMediaDirect(base64Data);
        });
      };
      reader.readAsDataURL(file);
    }
    if (this.mediaInput) {
      this.mediaInput.nativeElement.value = '';
    }
  }

  sendMediaDirect(base64Data: string) {
    if (base64Data && base64Data.trim() !== '') {
      const currentMsg = this.message;
      this.message = base64Data;
      this.send();
      setTimeout(() => { this.message = currentMsg; }, 100);
    }
  }

  async openCameraModal() {
    this.showCamera = true;
    this.cdr.detectChanges();
    await this.startCamera();
  }

  closeCameraModal() {
    this.stopCamera();
    this.showCamera = false;
  }

  async startCamera() {
    this.stopCamera();
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: "user"
      }
    });

    this.video.nativeElement.srcObject = this.stream;
  }

  stopCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach((t: any) => t.stop());
    }
  }

  capturePhoto() {
    const video = this.video.nativeElement;
    const canvas = this.canvas.nativeElement;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    const base64Image = canvas.toDataURL('image/jpeg', 0.8);
    this.closeCameraModal();
    this.sendImageDirect(base64Image);
  }

  sendImageDirect(base64Image: string) {
    if (base64Image && base64Image.trim() !== '') {
      const currentMsg = this.message;
      this.message = base64Image;
      this.send();
      setTimeout(() => { this.message = currentMsg; }, 100);
    }
  }

  requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }

  notifyUser(msg: ChatMessage) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    if ((msg.email || msg.username || msg.user) === this.currentUser) return;

    const isPublicMessage = !msg.receiver;
    const isViewingPublic = this.selectedUser === null;
    const isViewingSender = this.selectedUser === msg.email;

    const shouldNotify = document.hidden || (isPublicMessage ? !isViewingPublic : !isViewingSender);

    if (shouldNotify) {
      let bodyText = msg.text || msg.message || '';
      const mediaType = this.getMediaType(bodyText);
      if (mediaType !== 'text') {
        bodyText = `📎 Sent ${mediaType === 'image' ? 'an image' : 'a ' + mediaType}`;
      }

      const senderName = msg.firstname || (msg.email || msg.user || 'Someone').split('@')[0];
      const title = isPublicMessage ? `Public Chat: ${senderName}` : `Message from ${senderName}`;

      const notification = new Notification(title, {
        body: bodyText,
        icon: msg.profileImage || undefined
      });

      notification.onclick = () => {
        window.focus();
        this.zone.run(() => {
          if (isPublicMessage) {
            this.selectUser(null);
          } else if (msg.email) {
            this.selectUser(msg.email, msg.firstname, msg.lastname, msg.profileImage);
          }
        });
        notification.close();
      };
    }
  }
  async addNewContact() {
    if (!this.newContactEmail.trim()) return;
    try {
      const response = await fetch(`${environment.apiUrl}/contacts/request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ email: this.newContactEmail.trim() })
      });

      if (response.ok) {
        console.log('Request Sent');
        this.newContactEmail = '';
      } else {
        console.error('Failed to add contact');
      }
    } catch (error) {
      console.error('Add contact failed', error);
    }
  }

  clearContactSearch() {
    this.newContactEmail = '';
    this.searchResults = [];
    this.cdr.detectChanges();
  }

  onSearchContact() {
    if (this.contactSearchTimeout) clearTimeout(this.contactSearchTimeout);

    this.contactSearchTimeout = setTimeout(async () => {
      if (!this.newContactEmail.trim()) {
        this.searchResults = [];
        return;
      }
      try {
        const response = await fetch(`${environment.apiUrl}/contacts/search?q=${encodeURIComponent(this.newContactEmail.trim())}`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });
        if (response.ok) {
          const data = await response.json();
          this.zone.run(() => {
            this.searchResults = data;

            const searchOnline = data.filter((c: any) => c.isOnline).map((c: any) => c.email);
            searchOnline.forEach((email: string) => {
              if (!this.onlineUsers.includes(email)) {
                this.onlineUsers.push(email);
              }
            });

            this.cdr.detectChanges();
          });
        }
      } catch (err) {
        console.error("Failed to search contacts", err);
      }
    }, 300);
  }

  onContactSelected(event: any) {
    this.newContactEmail = event.option.value;
    this.addNewContact();
  }

  async fetchMyContacts() {
    try {
      const response = await fetch(`${environment.apiUrl}/contacts`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        this.zone.run(() => {
          this.myContacts = data;

          const initialOnline = data.filter((c: any) => c.isOnline).map((c: any) => c.email);
          initialOnline.forEach((email: string) => {
            if (!this.onlineUsers.includes(email)) {
              this.onlineUsers.push(email);
            }
          });

          this.cdr.detectChanges();
        });
      }
    } catch (error) {
      console.error('Fetch contacts failed', error);
    }
  }

  async fetchRequests() {
    try {
      const response = await fetch(`${environment.apiUrl}/contacts/requests`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (response.ok) {
        const data = await response.json();
        this.zone.run(() => {
          this.pendingRequests = data;
          this.cdr.detectChanges();
        });
      }
    } catch (error) { console.error('Fetch requests failed', error); }
  }

  async acceptRequest(requestId: string) {
    try {
      const response = await fetch(`${environment.apiUrl}/contacts/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ requestId })
      });
      if (response.ok) {
        this.zone.run(() => {
          this.pendingRequests = this.pendingRequests.filter(r => r._id !== requestId);
          this.cdr.detectChanges();
        });
        this.fetchMyContacts(); // This updates the main contact list
      }
    } catch (error) { console.error('Accept request failed', error); }
  }

  async rejectRequest(requestId: string) {
    try {
      const response = await fetch(`${environment.apiUrl}/contacts/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ requestId })
      });
      if (response.ok) {
        this.zone.run(() => {
          this.pendingRequests = this.pendingRequests.filter(r => r._id !== requestId);
          this.cdr.detectChanges();
        });
      }
    } catch (error) { console.error('Reject request failed', error); }
  }

  // ========== STORIES / STATUS LOGIC ==========
  async fetchStatuses() {
    try {
      const response = await fetch(`${environment.apiUrl}/statuses`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (response.ok) {
        const data = await response.json();
        this.zone.run(() => {
          this.myStatus = data.find((s: any) => s.userEmail === this.currentUser) || null;
          this.statuses = data.filter((s: any) => s.userEmail !== this.currentUser);
          this.cdr.detectChanges();
        });
      }
    } catch (err) { console.error('Failed to fetch statuses', err); }
  }

  onStatusSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        alert("Status size exceeds 10MB limit.");
        return;
      }
      const type = file.type.startsWith('video/') ? 'video' : 'image';
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.zone.run(() => {
          this.uploadStatus(e.target.result, type);
        });
      };
      reader.readAsDataURL(file);
    }
    if (this.statusInput) this.statusInput.nativeElement.value = '';
  }

  async uploadStatus(mediaUrl: string, type: string) {
    try {
      const response = await fetch(`${environment.apiUrl}/statuses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ media: mediaUrl, type })
      });
      if (response.ok) {
        this.fetchStatuses(); // Refresh statuses after uploading
      }
    } catch (err) { console.error('Failed to upload status', err); }
  }

  allStatusesViewed(userGroup: any) {
    if (!this.currentUser) return false;
    if (userGroup.userEmail === this.currentUser) return true;
    return userGroup.statuses.every((s: any) => s.viewers?.includes(this.currentUser));
  }

  viewStatuses(userGroup: any) {
    this.currentViewingStatusUser = userGroup;
    this.currentStatusIndex = 0;
    this.showStatusViewer = true;
    this.startStatusTimer();
  }

  startStatusTimer() {
    if (this.statusProgressTimer) clearInterval(this.statusProgressTimer);
    this.statusProgress = 0;

    const currentStatus = this.currentViewingStatusUser.statuses[this.currentStatusIndex];

    if (currentStatus && !currentStatus.viewers?.includes(this.currentUser) && currentStatus.userEmail !== this.currentUser) {
      this.markStatusViewed(currentStatus._id);
      currentStatus.viewers.push(this.currentUser);
    }

    this.resumeStatusTimer();
  }

  pauseStatusTimer() {
    if (this.statusProgressTimer) clearInterval(this.statusProgressTimer);
    const videoEl = document.getElementById('currentStatusVideo') as HTMLVideoElement;
    if (videoEl) videoEl.pause();
  }

  resumeStatusTimer() {
    const currentStatus = this.currentViewingStatusUser.statuses[this.currentStatusIndex];

    // Auto progress setup (5 seconds per image/text)
    if (currentStatus.type === 'image' || currentStatus.type === 'text') {
      const step = 100 / (5000 / 50); // 50ms intervals
      this.statusProgressTimer = setInterval(() => {
        this.statusProgress += step;
        if (this.statusProgress >= 100) {
          this.zone.run(() => this.nextStatus());
        }
        this.cdr.detectChanges();
      }, 50);
    } else if (currentStatus.type === 'video') {
      const videoEl = document.getElementById('currentStatusVideo') as HTMLVideoElement;
      if (videoEl) videoEl.play();
    }
  }

  toggleViewersList() {
    this.showViewersList = !this.showViewersList;
    if (this.showViewersList) {
      this.pauseStatusTimer();
    } else {
      this.resumeStatusTimer();
    }
  }

  onReplyFocus() {
    this.pauseStatusTimer();
  }

  onReplyBlur() {
    if (!this.statusReplyText.trim()) {
      this.resumeStatusTimer();
    }
  }

  async sendStatusReply() {
    if (!this.statusReplyText.trim() || !this.currentUser || !this.currentViewingStatusUser) return;
    
    const currentStatus = this.currentViewingStatusUser.statuses[this.currentStatusIndex];
    const receiverEmail = this.currentViewingStatusUser.userEmail;
    
    const payload: any = {
      email: this.currentUser,
      text: this.statusReplyText.trim(),
      receiver: receiverEmail,
      replyTo: currentStatus._id,
      replyToText: currentStatus.media, 
      replyToSender: 'Status'
    };

    try {
      const response = await fetch(`${environment.apiUrl}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const newMsg = await response.json();
      
      }
    } catch (err) {
      console.error('Failed to send status reply via API:', err);
    }

    this.statusReplyText = '';
    this.nextStatus(); 
  }

  async deleteCurrentStatus() {
    const currentStatus = this.currentViewingStatusUser.statuses[this.currentStatusIndex];
    if (!currentStatus) return;
    try {
      const response = await fetch(`${environment.apiUrl}/statuses/${currentStatus._id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (response.ok) {
        this.currentViewingStatusUser.statuses.splice(this.currentStatusIndex, 1);
        if (this.currentViewingStatusUser.statuses.length === 0) {
          this.closeStatusViewer();
        } else {
          if (this.currentStatusIndex >= this.currentViewingStatusUser.statuses.length) {
            this.currentStatusIndex = this.currentViewingStatusUser.statuses.length - 1;
          }
          this.startStatusTimer();
        }
        this.fetchStatuses();
      }
    } catch (e) {
      console.error('Failed to delete status', e);
    }
  }

  async markStatusViewed(statusId: string) {
    try {
      await fetch(`${environment.apiUrl}/statuses/${statusId}/view`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
    } catch (e) { }
  }

  nextStatus() {
    if (this.currentStatusIndex < this.currentViewingStatusUser.statuses.length - 1) {
      this.currentStatusIndex++;
      this.startStatusTimer();
    } else {
      this.closeStatusViewer();
    }
  }

  closeStatusViewer() {
    this.showStatusViewer = false;
    this.currentViewingStatusUser = null;
    this.showViewersList = false;
    this.statusReplyText = '';
    if (this.statusProgressTimer) clearInterval(this.statusProgressTimer);
    this.fetchStatuses(); // Re-fetch to update viewed rings
  }

  // ========== VIDEO CALLING LOGIC ==========
  async startVideoCall() {
    if (!this.selectedUser) return;
    
    const streamSuccess = await this.setupLocalStream();
    if (!streamSuccess) {
      alert("Camera or Microphone access is required to make a video call.");
      return;
    }

    this.callRemoteUser = this.selectedUser;
    this.isCalling = true;
    this.isRinging = false;
    this.playDialTone();
    this.cdr.detectChanges();
    
    this.setupPeerConnection(this.callRemoteUser, true);
  }

  async setupLocalStream(): Promise<boolean> {
    try {
      this.localStreamCall = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setTimeout(() => {
        if (this.localVideoCall && this.localVideoCall.nativeElement) {
          this.localVideoCall.nativeElement.srcObject = this.localStreamCall;
        }
      }, 100);
      return true;
    } catch (e) {
      console.error("Failed to get local stream", e);
      return false;
    }
  }

  setupPeerConnection(remoteUser: string, isInitiator: boolean) {
    // Using Google's public STUN servers for WebRTC connection
    this.peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }]
    });

    if (this.localStreamCall) {
      this.localStreamCall.getTracks().forEach(track => this.peerConnection!.addTrack(track, this.localStreamCall!));
    }

    this.peerConnection.ontrack = (event) => {
      this.zone.run(() => {
        this.remoteStreamCall = event.streams[0];
        setTimeout(() => {
          if (this.remoteVideoCall && this.remoteVideoCall.nativeElement) {
            this.remoteVideoCall.nativeElement.srcObject = this.remoteStreamCall;
          }
        }, 100);
      });
    };

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.socket.emit("iceCandidate", { to: remoteUser, candidate: event.candidate });
      }
    };

    if (isInitiator) {
      this.peerConnection.createOffer()
        .then(offer => this.peerConnection!.setLocalDescription(offer))
        .then(() => {
          this.socket.socket.emit("callUser", {
            userToCall: remoteUser,
            signalData: this.peerConnection!.localDescription,
            from: this.currentUser,
            fromName: this.currentUserName
          });
        }).catch(e => console.error(e));
    }
  }

  async acceptCall() {
    this.stopRingtone();
    this.isInCall = true;
    this.callRemoteUser = this.incomingCallData.from;
    const signal = this.incomingCallData.signal;
    this.incomingCallData = null;
    this.cdr.detectChanges();

    const streamSuccess = await this.setupLocalStream();
    if (!streamSuccess) {
      alert("Cannot answer without camera/microphone access.");
      this.endCall();
      return;
    }

    this.setupPeerConnection(this.callRemoteUser!, false);

    await this.peerConnection!.setRemoteDescription(new RTCSessionDescription(signal));
    
    // Apply buffered ICE candidates
    this.pendingIceCandidates.forEach(c => {
      this.peerConnection!.addIceCandidate(new RTCIceCandidate(c)).catch(e => console.error(e));
    });
    this.pendingIceCandidates = [];

    const answer = await this.peerConnection!.createAnswer();
    await this.peerConnection!.setLocalDescription(answer);

    this.socket.socket.emit("answerCall", { signal: this.peerConnection!.localDescription, to: this.callRemoteUser });
  }

  rejectCall() {
    this.stopRingtone();
    if (this.incomingCallData) {
      this.socket.socket.emit("endCall", { to: this.incomingCallData.from });
      this.incomingCallData = null;
    }
  }

  endCall() {
    this.stopDialTone();
    this.stopRingtone();
    if (this.callRemoteUser) this.socket.socket.emit("endCall", { to: this.callRemoteUser });
    this.cleanupCall();
  }

  cleanupCall() {
    this.stopDialTone();
    this.stopRingtone();
    this.isCalling = false;
    this.isInCall = false;
    this.isRinging = false;
    this.incomingCallData = null;
    this.callRemoteUser = null;
    this.pendingIceCandidates = [];

    if (this.localStreamCall) {
      this.localStreamCall.getTracks().forEach(track => track.stop());
      this.localStreamCall = null;
    }
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    this.remoteStreamCall = null;
  }

  playRingtone() {
      this.ringtoneAudio = new Audio('https://upload.wikimedia.org/wikipedia/commons/3/3d/Ring_classic_02.ogg');
    this.ringtoneAudio.loop = true;
    this.ringtoneAudio.play().catch(e => console.warn('Ringtone blocked by browser autoplay policy'));
  }

  stopRingtone() {
    if (this.ringtoneAudio) {
      this.ringtoneAudio.pause();
      this.ringtoneAudio.currentTime = 0;
      this.ringtoneAudio = null;
    }
  }

  playDialTone() {
  this.dialToneAudio = new Audio('https://upload.wikimedia.org/wikipedia/commons/c/cdd/UK_ringing_tone.ogg');
    this.dialToneAudio.loop = true;
    this.dialToneAudio.play().catch(e => console.warn('Dial tone blocked by browser autoplay policy'));
  }

  stopDialTone() {
    if (this.dialToneAudio) {
      this.dialToneAudio.pause();
      this.dialToneAudio.currentTime = 0;
      this.dialToneAudio = null;
    }
  }
}
